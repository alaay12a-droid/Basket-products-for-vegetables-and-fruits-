import { Router } from "express";
import { db, ordersTable, menuItemsTable, appSettingsTable, orderDriverAssignmentsTable, deliveryDriversTable, branchesTable, deliveryZonesTable, branchProductAvailabilityTable } from "@workspace/db";
import { eq, desc, gte, lt, count, and, ne, inArray, isNotNull, sql } from "drizzle-orm";
import { sendPushToCashiers, sendPushToToken, sendPushToDriver } from "../lib/sendPushNotification.js";
import { sendSms } from "../lib/sendSms.js";
import { z } from "zod";
import { processReferralReward } from "./referrals.js";
import { isValidExplicitChickenSizeSelection } from "../lib/explicitChickenSizes.js";
import { requireDashboardUser, resolveOptionalDashboardActor, type DashboardActor } from "./dashboard-auth.js";
import { resolveNearestBranch } from "../lib/branchResolver.js";
import {
  mapOrderBranchAssignment,
  resolveDeliveryCoordinates,
  type OrderBranchAssignment,
} from "../lib/orderBranchAssignment.js";

const router = Router();

function branchOrderFilter(actor: DashboardActor | null) {
  if (!actor || actor.role === "admin") return undefined;
  if (actor.branchIds.length === 0) return sql`false`;
  return and(isNotNull(ordersTable.branchId), inArray(ordersTable.branchId, actor.branchIds));
}

type OrderCustomization = z.infer<typeof createOrderSchema>["items"][number]["customization"];

function resolveConfiguredUnitPrice(
  menuItem: typeof menuItemsTable.$inferSelect,
  customization: OrderCustomization,
): number | null {
  let priceInHalalas = menuItem.price;
  const enabledSizes = menuItem.sizes.filter((size) => size.enabled);

  if (enabledSizes.length > 0) {
    const size = enabledSizes.find(
      (candidate) => candidate.name === customization?.size,
    );
    if (!size) return Number.NaN;
    priceInHalalas = size.price;
  } else if (customization?.size) {
    // Some chicken sizes are separate product rows. Accept the display label
    // only when it explicitly identifies this exact row and its configured
    // base-price snapshot. Never derive a sibling price mathematically.
    const hasMatchingExplicitRow = isValidExplicitChickenSizeSelection({
      itemId: menuItem.itemId,
      priceInHalalas: menuItem.price,
      size: customization.size,
      variantId: customization.variantId,
      variantPrice: customization.variantPrice,
    });
    if (!hasMatchingExplicitRow) return Number.NaN;
  }

  const availableRiceTypes = menuItem.riceTypes.filter((choice) => choice.available);
  if (customization?.riceType && availableRiceTypes.length > 0) {
    const rice = availableRiceTypes.find(
      (candidate) => candidate.name === customization.riceType,
    );
    if (!rice) return Number.NaN;
    priceInHalalas += rice?.extraPrice ?? 0;
  }

  const availableAdditions = menuItem.additions.filter((choice) => choice.available);
  if (customization?.addon && availableAdditions.length > 0) {
    const addition = availableAdditions.find(
      (candidate) => candidate.name === customization.addon,
    );
    if (!addition) return Number.NaN;
    priceInHalalas += addition?.extraPrice ?? 0;
  }

  const activeOptionGroups = menuItem.options
    .map((group) => ({
      ...group,
      choices: group.choices.filter((choice) => choice.available),
    }))
    .filter((group) => group.choices.length > 0);
  for (const group of activeOptionGroups) {
    const selected = customization?.selectedOptions?.find(
      (candidate) => candidate.groupName === group.groupName,
    );
    if (!selected) {
      if (group.required) return Number.NaN;
      continue;
    }
    const choice = group.choices.find((candidate) => candidate.name === selected.choice);
    if (!choice) return Number.NaN;
    priceInHalalas += choice.extraPrice;
  }

  for (const selected of customization?.selectedOptions ?? []) {
    if (!activeOptionGroups.some((group) => group.groupName === selected.groupName)) {
      return Number.NaN;
    }
  }

  return priceInHalalas / 100;
}

function hasPriceValidationError(menuItem: typeof menuItemsTable.$inferSelect, item: z.infer<typeof createOrderSchema>["items"][number]): boolean {
  const configuredUnitPrice = resolveConfiguredUnitPrice(menuItem, item.customization);
  const submittedSnapshot = item.customization?.unitPrice;
  return (configuredUnitPrice != null && Number.isNaN(configuredUnitPrice))
    || (configuredUnitPrice != null && !Number.isNaN(configuredUnitPrice) && Math.abs(configuredUnitPrice - item.price) > 0.001)
    || (submittedSnapshot != null && Math.abs(submittedSnapshot - item.price) > 0.001);
}

const createOrderSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  customerAddress: z.string().nullable().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      quantity: z.number().int().positive(),
      customization: z.object({
        size: z.string().min(1).optional(),
        riceType: z.string().min(1).optional(),
        addon: z.string().min(1).optional(),
        variantId: z.string().min(1).optional(),
        variantName: z.string().min(1).optional(),
        variantPrice: z.number().min(0).optional(),
        unitPrice: z.number().min(0).optional(),
        selectedOptions: z.array(z.object({
          groupName: z.string().min(1),
          choice: z.string().min(1),
        })).optional(),
      }).optional(),
    })
  ).min(1),
  totalPrice: z.number().positive(),
  deliveryFee: z.number().min(0).default(0),
  discountCode: z.string().nullable().optional(),
  discountAmount: z.number().min(0).nullable().optional(),
  orderType: z.enum(["delivery", "pickup"]).default("delivery"),
  paymentMethod: z.enum(["cash", "moyasar", "wallet"]).default("cash"),
  notes: z.string().nullable().optional(),
  customerPushToken: z.string().nullable().optional(),
  branchId:   z.number().int().nullable().optional(),
  branchName: z.string().nullable().optional(),
  // Kept unknown at the shared schema boundary so irrelevant coordinate fields
  // never alter pickup validation. Delivery validates them below.
  deliveryLat: z.unknown().optional(),
  deliveryLng: z.unknown().optional(),
});

router.post("/orders", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  let branchAssignment: OrderBranchAssignment;
  let deliveryPoint: { lat: number; lng: number } | null = null;

  if (data.orderType === "delivery") {
    const coordinates = resolveDeliveryCoordinates(data);
    if (!coordinates.ok) {
      res.status(400).json({
        error: "إحداثيات موقع التوصيل غير صحيحة. يرجى تحديد الموقع على الخريطة.",
        code: "INVALID_DELIVERY_COORDINATES",
      });
      return;
    }

    deliveryPoint = coordinates.point;
    // Final selection happens with the order insert in one transaction below.
    branchAssignment = mapOrderBranchAssignment("pickup", data, null);
  } else {
    branchAssignment = mapOrderBranchAssignment(data.orderType, data, null);
  }

  // Configured variants are authoritative. Reject stale/tampered cart snapshots
  // instead of silently charging a different amount than the customer saw.
  for (const item of data.orderType === "pickup" ? data.items : []) {
    const [menuItem] = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.itemId, item.id));
    if (!menuItem) continue;

    if (hasPriceValidationError(menuItem, item)) {
      res.status(409).json({
        error: "تم تحديث سعر أو خيارات أحد الأصناف. حدّث السلة ثم حاول مرة أخرى.",
        code: "PRICE_CHANGED",
        itemId: item.id,
      });
      return;
    }
  }

  const itemsSubtotal = data.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const expectedTotal =
    itemsSubtotal + data.deliveryFee - (data.discountAmount ?? 0);
  if (Math.abs(expectedTotal - data.totalPrice) > 0.001) {
    res.status(409).json({
      error: "إجمالي الطلب لا يطابق أسعار الأصناف الحالية. حدّث السلة ثم حاول مرة أخرى.",
      code: "PRICE_CHANGED",
    });
    return;
  }

  // ── Rate-limit: reject if same phone placed an order within the last 10 seconds ──
  const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
  const [recentOrder] = await db
    .select({ id: ordersTable.id, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(and(eq(ordersTable.customerPhone, data.customerPhone), gte(ordersTable.createdAt, tenSecondsAgo)))
    .limit(1);
  if (recentOrder) {
    const secondsLeft = Math.ceil((recentOrder.createdAt.getTime() + 10 * 1000 - Date.now()) / 1000);
    res.status(429).json({
      error: `طلبك السابق قيد الانتظار — انتظر ${secondsLeft} ثانية`,
      retryAfter: secondsLeft,
    });
    return;
  }

  // Calculate today's order sequence number (resets at midnight, Saudi time UTC+3)
  const nowUtc = new Date();
  const offsetMs = 3 * 60 * 60 * 1000; // UTC+3
  const nowLocal = new Date(nowUtc.getTime() + offsetMs);
  const todayStart = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()) - offsetMs);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [{ value: todayCount }] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, todayStart), lt(ordersTable.createdAt, tomorrowStart)));

  const dailyNumber = Number(todayCount) + 1;

  // ── Minimum order amount check ─────────────────────────────────────────────
  const [minOrderSetting] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "appearance_minOrderAmount"));
  const minOrderSAR = parseFloat(minOrderSetting?.value ?? "0") || 0;
  if (minOrderSAR > 0 && data.totalPrice < minOrderSAR) {
    res.status(422).json({
      error: `الحد الأدنى للطلب هو ${minOrderSAR} ر.س`,
      minOrderAmount: minOrderSAR,
    });
    return;
  }

  // Variants of one product can be separate cart lines, so stock must be checked
  // and decremented using their combined quantity.
  const requestedByItemId = new Map<string, { quantity: number; name: string }>();
  for (const item of data.items) {
    const existing = requestedByItemId.get(item.id);
    requestedByItemId.set(item.id, {
      quantity: (existing?.quantity ?? 0) + item.quantity,
      name: existing?.name ?? item.name,
    });
  }

  // ── Validate stock before inserting ────────────────────────────────────────
  const globalProductAvailability: Record<string, boolean> = {};
  for (const [itemId, requested] of data.orderType === "pickup" ? requestedByItemId : []) {
    const [menuItem] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.itemId, itemId));
    globalProductAvailability[itemId] = menuItem?.available === true;
    if (menuItem && menuItem.stock !== null) {
      if (menuItem.stock < requested.quantity) {
        res.status(409).json({
          error: menuItem.stock === 0
            ? `نفد المخزون: ${requested.name}`
            : `الكمية المتاحة من "${requested.name}" هي ${menuItem.stock} فقط`,
          itemId,
          available: menuItem.stock,
        });
        return;
      }
    }
  }

  const orderValues: typeof ordersTable.$inferInsert = {
    dailyNumber,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerAddress: data.customerAddress ?? null,
    items: data.items,
    totalPrice: Math.round(data.totalPrice * 100),
    deliveryFee: Math.round((data.deliveryFee ?? 0) * 100),
    discountCode: data.discountCode ?? null,
    discountAmount: data.discountAmount != null ? Math.round(data.discountAmount * 100) : null,
    orderType: data.orderType,
    paymentMethod: data.paymentMethod === "wallet" ? "cash" : data.paymentMethod,
    notes: data.notes ?? null,
    status: "pending",
    customerPushToken: data.customerPushToken ?? null,
  };
  let order: typeof ordersTable.$inferSelect;
  if (data.orderType === "delivery" && deliveryPoint) {
    const transactionResult = await db.transaction(async (tx) => {
      const [baseBranches, baseZones] = await Promise.all([tx.select({
        id: branchesTable.id, name: branchesTable.name, active: branchesTable.active,
        deliveryEnabled: branchesTable.deliveryEnabled, lat: branchesTable.lat, lng: branchesTable.lng,
      }).from(branchesTable), tx.select({
        id: deliveryZonesTable.id, branchId: deliveryZonesTable.branchId, enabled: deliveryZonesTable.enabled,
        sortOrder: deliveryZonesTable.sortOrder, polygon: deliveryZonesTable.polygon,
      }).from(deliveryZonesTable)]);
      // This base pass finds only active, delivery-enabled, coordinate-bearing,
      // zone-matching candidates.  It intentionally ignores mutable eligibility
      // settings until their per-branch lock has been acquired.
      const lockableIds = resolveNearestBranch(deliveryPoint!, baseBranches.map((branch) => ({
        ...branch, weeklyOperatingHours: null, deliveryCapacity: null,
      })), baseZones).eligibleBranches.map((branch) => branch.id).sort((a, b) => a - b);
      for (const branchId of lockableIds) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(19870410, ${branchId})`);
      }
      const itemIds = [...requestedByItemId.keys()].sort();
      // Lock menu rows before re-reading them.  The subsequent Drizzle query
      // observes the locked authoritative configuration and stock snapshots.
      if (itemIds.length > 0) {
        const itemIdSql = sql.join(itemIds.map((itemId) => sql`${itemId}`), sql`, `);
        const lockResult = await tx.execute(sql`SELECT item_id FROM menu_items WHERE item_id IN (${itemIdSql}) ORDER BY item_id FOR UPDATE`);
        const lockedIds = new Set((lockResult.rows as Array<{ item_id: string }>).map((row) => row.item_id));
        if (itemIds.some((itemId) => !lockedIds.has(itemId))) {
          return { order: null, resolution: null, error: { code: "MISSING_ITEM" } };
        }
      }
      const [branches, zones, menuItems, overrides, activeOrders] = await Promise.all([
        tx.select({
          id: branchesTable.id, name: branchesTable.name, active: branchesTable.active,
          deliveryEnabled: branchesTable.deliveryEnabled, lat: branchesTable.lat, lng: branchesTable.lng,
          weeklyOperatingHours: branchesTable.weeklyOperatingHours, deliveryCapacity: branchesTable.deliveryCapacity,
        }).from(branchesTable).where(
          lockableIds.length > 0 ? inArray(branchesTable.id, lockableIds) : sql`false`,
        ),
        tx.select({ id: deliveryZonesTable.id, branchId: deliveryZonesTable.branchId, enabled: deliveryZonesTable.enabled, sortOrder: deliveryZonesTable.sortOrder, polygon: deliveryZonesTable.polygon })
          .from(deliveryZonesTable)
          .where(lockableIds.length > 0 ? inArray(deliveryZonesTable.branchId, lockableIds) : sql`false`),
        tx.select().from(menuItemsTable).where(inArray(menuItemsTable.itemId, itemIds)),
        tx.select({ branchId: branchProductAvailabilityTable.branchId, itemId: branchProductAvailabilityTable.itemId, available: branchProductAvailabilityTable.available })
          .from(branchProductAvailabilityTable).where(inArray(branchProductAvailabilityTable.itemId, itemIds)),
        tx.select({ branchId: ordersTable.branchId }).from(ordersTable).where(and(
          eq(ordersTable.orderType, "delivery"),
          inArray(ordersTable.status, ["pending", "preparing", "ready", "out_for_delivery"] as const),
          isNotNull(ordersTable.branchId),
        )),
      ]);
      const lockedMenuItems = new Map(menuItems.map((menuItem) => [menuItem.itemId, menuItem]));
      const transactionalGlobalAvailability: Record<string, boolean> = {};
      for (const item of data.items) {
        const menuItem = lockedMenuItems.get(item.id);
        transactionalGlobalAvailability[item.id] = menuItem?.available === true;
        if (menuItem && hasPriceValidationError(menuItem, item)) {
          return { order: null, resolution: null, error: { code: "PRICE_CHANGED", itemId: item.id } };
        }
      }
      for (const [itemId, requested] of requestedByItemId) {
        const menuItem = lockedMenuItems.get(itemId);
        if (menuItem?.stock !== null && menuItem !== undefined && menuItem.stock < requested.quantity) {
          return { order: null, resolution: null, error: { code: "STOCK", itemId, available: menuItem.stock, name: requested.name } };
        }
      }
      const overridesByBranch = new Map<number, Record<string, boolean>>();
      for (const override of overrides) {
        const current = overridesByBranch.get(override.branchId) ?? {};
        current[override.itemId] = override.available;
        overridesByBranch.set(override.branchId, current);
      }
      const activeCounts = new Map<number, number>();
      for (const activeOrder of activeOrders) {
        if (activeOrder.branchId !== null) activeCounts.set(activeOrder.branchId, (activeCounts.get(activeOrder.branchId) ?? 0) + 1);
      }
      const resolution = resolveNearestBranch(deliveryPoint!, branches.map((branch) => ({
        ...branch, productAvailability: overridesByBranch.get(branch.id),
        globalProductAvailability: transactionalGlobalAvailability, activeDeliveryOrderCount: activeCounts.get(branch.id) ?? 0,
      })), zones);
      if (resolution.selectedBranchId === null || resolution.selectedBranchName === null || resolution.matchingZoneId === null || resolution.distanceKm === null) {
        return { order: null, resolution, error: null };
      }
      const assignment = mapOrderBranchAssignment("delivery", data, { point: deliveryPoint!, resolution });
      const [inserted] = await tx.insert(ordersTable).values({ ...orderValues, ...assignment }).returning();
      for (const [itemId, requested] of requestedByItemId) {
        const menuItem = lockedMenuItems.get(itemId)!;
        if (menuItem.stock !== null) {
          const newStock = menuItem.stock - requested.quantity;
          await tx.update(menuItemsTable).set({ stock: newStock, available: newStock > 0 }).where(eq(menuItemsTable.itemId, itemId));
        }
      }
      return { order: inserted, resolution, error: null };
    });
    if (!transactionResult.order) {
      if (transactionResult.error?.code === "PRICE_CHANGED") {
        res.status(409).json({ error: "تم تحديث سعر أو خيارات أحد الأصناف. حدّث السلة ثم حاول مرة أخرى.", code: "PRICE_CHANGED", itemId: transactionResult.error.itemId });
        return;
      }
      if (transactionResult.error?.code === "STOCK") {
        res.status(409).json({
          error: transactionResult.error.available === 0 ? `نفد المخزون: ${transactionResult.error.name}` : `الكمية المتاحة من "${transactionResult.error.name}" هي ${transactionResult.error.available} فقط`,
          itemId: transactionResult.error.itemId, available: transactionResult.error.available,
        });
        return;
      }
      if (transactionResult.error?.code === "MISSING_ITEM") {
        res.status(422).json({ error: "لا يوجد فرع مؤهل للتوصيل إلى هذا الموقع.", code: "NO_ELIGIBLE_BRANCH", resolverOutcome: "outside_delivery_zones" });
        return;
      }
      res.status(422).json({ error: "لا يوجد فرع مؤهل للتوصيل إلى هذا الموقع.", code: "NO_ELIGIBLE_BRANCH", resolverOutcome: transactionResult.resolution?.outcome ?? "outside_delivery_zones" });
      return;
    }
    order = transactionResult.order;
  } else {
    [order] = await db.insert(ordersTable).values({ ...orderValues, ...branchAssignment }).returning();
  }

  for (const [itemId, requested] of data.orderType === "pickup" ? requestedByItemId : []) {
    const [menuItem] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.itemId, itemId));
    if (menuItem && menuItem.stock !== null) {
      const newStock = Math.max(0, menuItem.stock - requested.quantity);
      await db.update(menuItemsTable)
        .set({ stock: newStock, available: newStock > 0 })
        .where(eq(menuItemsTable.itemId, itemId));
    }
  }

  req.log.info(
    {
      orderId: order.id,
      dailyNumber,
      hasPushToken: !!data.customerPushToken,
      pushTokenPrefix: data.customerPushToken ? data.customerPushToken.slice(0, 35) : null,
    },
    "New order created",
  );
  res.status(201).json(order);

  // Process referral reward for the referred customer (fire and forget)
  processReferralReward(data.customerPhone, order.id, data.customerName)
    .catch((e) => req.log.warn({ err: e }, "Referral reward processing failed"));

  // Send push notification to all registered cashier devices (fire and forget)
  const itemsSummary = data.items.map((i) => `${i.quantity}× ${i.name}`).join("، ");
  sendPushToCashiers({
    title: `🔔 طلب جديد #${dailyNumber}`,
    body: `${data.customerName} — ${itemsSummary}`,
    sound: "default",
    data: { orderId: String(order.id) },
  });
});

// ── GET /orders/assignments  (batch — all active assignments) ─────────────────
router.get("/orders/assignments", requireDashboardUser, async (_req, res) => {
  const branchFilter = branchOrderFilter(res.locals.dashboardActor as DashboardActor);
  const rows = await db
    .select({ assignment: orderDriverAssignmentsTable, driver: deliveryDriversTable })
    .from(orderDriverAssignmentsTable)
    .leftJoin(deliveryDriversTable, eq(orderDriverAssignmentsTable.driverId, deliveryDriversTable.id))
    .innerJoin(ordersTable, eq(orderDriverAssignmentsTable.orderId, ordersTable.id))
    .where(and(ne(orderDriverAssignmentsTable.status, "delivered"), branchFilter));

  const result: Record<number, { driverId: number; driverName: string; status: string }> = {};
  for (const r of rows) {
    result[r.assignment.orderId] = {
      driverId: r.assignment.driverId,
      driverName: r.driver?.name ?? "مندوب",
      status: r.assignment.status,
    };
  }
  res.json(result);
});

router.get("/orders/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  const actor = await resolveOptionalDashboardActor(req);
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, id), branchOrderFilter(actor)));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  res.json(order);
});

router.get("/orders", requireDashboardUser, async (_req, res) => {
  const branchFilter = branchOrderFilter(res.locals.dashboardActor as DashboardActor);
  const orders = await db
    .select()
    .from(ordersTable)
    .where(branchFilter)
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);
  res.json(orders);
});

const RESTAURANT_NAME = "سلة الخضار";

function buildCustomerStatusMessage(status: string, dailyNumber: number, isDelivery: boolean): { title: string; body: string } | null {
  switch (status) {
    case "preparing":
      return {
        title: "🍳 جاري تحضير طلبك",
        body: `طلبك رقم #${dailyNumber} من ${RESTAURANT_NAME} قيد التحضير الآن — سيكون جاهز قريباً!`,
      };
    case "ready":
      return isDelivery
        ? {
            title: "✅ طلبك جاهز!",
            body: `طلبك جاهز للاستلام من المندوب — سيستلمه المندوب قريباً 🛵`,
          }
        : {
            title: "✅ طلبك جاهز!",
            body: `طلبك رقم #${dailyNumber} من ${RESTAURANT_NAME} أصبح جاهزاً، تفضّل بالاستلام 🎉`,
          };
    case "done":
      // pickup orders only (delivery orders notified via driver "delivered" event)
      return {
        title: "🙏 شكراً لك",
        body: `تم استلام طلبك رقم #${dailyNumber} — نتمنى تكون استمتعت بوجبتك!`,
      };
    case "cancelled":
      return {
        title: "❌ تم إلغاء طلبك",
        body: `نأسف، تم إلغاء طلبك رقم #${dailyNumber} من قِبل ${RESTAURANT_NAME}. للاستفسار تواصل معنا مباشرة.`,
      };
    default:
      return null;
  }
}

router.patch("/orders/:id/status", requireDashboardUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرّف غير صحيح" });
    return;
  }
  const { status } = req.body as { status: string };
  const validStatuses = ["pending", "preparing", "ready", "done", "cancelled"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "حالة غير صحيحة" });
    return;
  }
  const branchFilter = branchOrderFilter(res.locals.dashboardActor as DashboardActor);
  const statusResult = await db.transaction(async (tx) => {
    let [current] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, id), branchFilter)).limit(1);
    if (!current) return { order: null, capacityFull: false };
    if (current.orderType === "delivery" && current.branchId !== null) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(19870410, ${current.branchId})`);
      [current] = await tx.select().from(ordersTable).where(and(eq(ordersTable.id, id), branchOrderFilter(res.locals.dashboardActor as DashboardActor))).limit(1);
      if (!current) return { order: null, capacityFull: false };
    }
    const terminalStatuses = new Set(["done", "cancelled"]);
    const activeStatuses = new Set(["pending", "preparing", "ready"]);
    if (current.orderType === "delivery" && current.branchId !== null
      && terminalStatuses.has(current.status) && activeStatuses.has(status)) {
      const [branch] = await tx.select({ deliveryCapacity: branchesTable.deliveryCapacity })
        .from(branchesTable).where(eq(branchesTable.id, current.branchId)).limit(1);
      if (branch?.deliveryCapacity != null) {
        const [{ value }] = await tx.select({ value: count() }).from(ordersTable).where(and(
          eq(ordersTable.orderType, "delivery"),
          eq(ordersTable.branchId, current.branchId),
          inArray(ordersTable.status, ["pending", "preparing", "ready", "out_for_delivery"] as const),
          ne(ordersTable.id, current.id),
        ));
        if (Number(value) >= branch.deliveryCapacity) return { order: null, capacityFull: true };
      }
    }
    const [updated] = await tx.update(ordersTable)
      .set({ status: status as "pending" | "preparing" | "ready" | "done" | "cancelled" })
      .where(and(eq(ordersTable.id, id), branchOrderFilter(res.locals.dashboardActor as DashboardActor)))
      .returning();
    return { order: updated ?? null, capacityFull: false };
  });
  if (statusResult.capacityFull) {
    res.status(409).json({ error: "الفرع وصل إلى الحد الأقصى لطلبات التوصيل النشطة.", code: "BRANCH_DELIVERY_CAPACITY_REACHED" });
    return;
  }
  const order = statusResult.order;
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  res.json(order);

  // Send push notification to customer if they have a token
  const isDelivery = order.orderType === "delivery";
  const customerMsg = buildCustomerStatusMessage(status, order.dailyNumber, isDelivery);
  if (order.customerPushToken && customerMsg) {
    // For "done": skip if order has a driver assignment (delivery order) —
    // the driver's "delivered" event sends the notification instead
    let shouldSend = true;
    if (status === "done") {
      const [driverRow] = await db
        .select({ id: orderDriverAssignmentsTable.orderId })
        .from(orderDriverAssignmentsTable)
        .where(eq(orderDriverAssignmentsTable.orderId, order.id))
        .limit(1);
      if (driverRow) shouldSend = false;
    }
    if (shouldSend) {
      sendPushToToken(order.customerPushToken, {
        title: customerMsg.title,
        body: customerMsg.body,
        sound: "default",
        data: { orderId: String(order.id), status },
        channelId: "order-status",
      }).catch((err) => req.log.warn({ err, orderId: order.id }, "Customer status push failed"));
    }
  }

  // Notify assigned driver when order is cancelled
  if (status === "cancelled") {
    const [driverAsgn] = await db
      .select({ driverId: orderDriverAssignmentsTable.driverId })
      .from(orderDriverAssignmentsTable)
      .where(and(
        eq(orderDriverAssignmentsTable.orderId, order.id),
        ne(orderDriverAssignmentsTable.status, "delivered"),
      ))
      .limit(1);
    if (driverAsgn) {
      sendPushToDriver(driverAsgn.driverId, {
        title: "❌ تم إلغاء الطلب",
        body: `تم إلغاء طلب #${order.dailyNumber} من قِبل المطعم — لا داعي للتوجه إليه`,
        sound: "default",
        data: { orderId: String(order.id), type: "order_cancelled" },
        channelId: "orders",
      }).catch(() => {});
    }
  }

  // Send SMS to customer on cancellation (works for web users who have no push token)
  if (status === "cancelled" && order.customerPhone) {
    sendSms(
      order.customerPhone,
      `عزيزنا ${order.customerName}، نأسف لإبلاغك بأنه تم إلغاء طلبك رقم #${order.dailyNumber} من سلة الخضار. للاستفسار تواصل معنا مباشرة. شكراً لتفهمك 🙏`
    ).catch(() => {});
  }
});

// ── GET /settings/customer-cancel — check if customers can cancel
router.get("/settings/customer-cancel", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "allow_customer_cancel"));
  res.json({ allowed: rows[0]?.value === "true" });
});

// ── PUT /settings/customer-cancel — admin toggles the setting
router.put("/settings/customer-cancel", async (req, res) => {
  const { allowed } = req.body as { allowed: boolean };
  await db
    .insert(appSettingsTable)
    .values({ key: "allow_customer_cancel", value: String(allowed) })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(allowed), updatedAt: new Date() } });
  res.json({ ok: true });
});

// ── PATCH /orders/:id/cancel — customer requests cancellation
router.patch("/orders/:id/cancel", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }

  // Check if customer cancellation is allowed
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "allow_customer_cancel"));
  if (rows[0]?.value !== "true") {
    res.status(403).json({ error: "إلغاء الطلب غير مسموح حالياً، تواصل مع الكاشير" });
    return;
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (existing.status !== "pending") {
    res.status(400).json({ error: "لا يمكن إلغاء الطلب بعد بدء التحضير" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(eq(ordersTable.id, id))
    .returning();

  res.json(order);
});

export default router;
