import { Router } from "express";
import { db, messagesTable, ordersTable, orderDriverAssignmentsTable } from "@workspace/db";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { sendPushToCashiers, sendPushToDriver, sendPushToToken } from "../lib/sendPushNotification.js";

const router = Router();

const sendSchema = z.object({
  text: z.string().min(1).max(1000),
  fromCashier: z.boolean().default(false),
});

const driverReplySchema = z.object({
  text: z.string().min(1).max(1000),
});

// GET /messages/conversations — all convos with unread count (cashier panel)
router.get("/messages/conversations", async (req, res) => {
  try {
    // Only cashier messages (no driverId) go to the cashier panel
    const rows = await db
      .select({
        orderId:      messagesTable.orderId,
        lastText:     messagesTable.text,
        fromCashier:  messagesTable.fromCashier,
        lastAt:       messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(isNull(messagesTable.driverId))
      .orderBy(desc(messagesTable.createdAt));

    const map = new Map<number, {
      orderId: number;
      lastText: string;
      fromCashier: boolean;
      lastAt: Date;
      unread: number;
    }>();

    for (const r of rows) {
      if (!map.has(r.orderId)) {
        map.set(r.orderId, { orderId: r.orderId, lastText: r.lastText, fromCashier: r.fromCashier, lastAt: r.lastAt, unread: 0 });
      }
    }

    const unreadCounts = new Map<number, number>();
    const unreadRows = await db
      .select({ orderId: messagesTable.orderId, cnt: sql<number>`count(*)` })
      .from(messagesTable)
      .where(and(eq(messagesTable.fromCashier, false), isNull(messagesTable.readAt), isNull(messagesTable.driverId)))
      .groupBy(messagesTable.orderId);

    for (const u of unreadRows) unreadCounts.set(u.orderId, Number(u.cnt));

    const orderIds = [...map.keys()];
    const orders = orderIds.length
      ? await db.select({ id: ordersTable.id, dailyNumber: ordersTable.dailyNumber, customerName: ordersTable.customerName, status: ordersTable.status })
          .from(ordersTable)
          .where(sql`${ordersTable.id} = ANY(ARRAY[${sql.join(orderIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
      : [];

    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const result = [...map.values()]
      .map((c) => ({
        ...c,
        unread: unreadCounts.get(c.orderId) ?? 0,
        order: orderMap.get(c.orderId) ?? null,
      }))
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "فشل تحميل المحادثات" });
  }
});

// GET /messages/unread-customer — unread cashier→customer messages per order (for customer badge)
router.get("/messages/unread-customer", async (req, res) => {
  try {
    const rows = await db
      .select({ orderId: messagesTable.orderId, cnt: sql<number>`count(*)` })
      .from(messagesTable)
      .where(and(eq(messagesTable.fromCashier, true), isNull(messagesTable.readAt)))
      .groupBy(messagesTable.orderId);
    const result: Record<number, number> = {};
    for (const r of rows) result[r.orderId] = Number(r.cnt);
    res.json(result);
  } catch {
    res.status(500).json({ error: "فشل" });
  }
});

// GET /messages/order/:orderId — messages for one order
router.get("/messages/order/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "orderId غير صحيح" }); return; }
  try {
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.orderId, orderId))
      .orderBy(messagesTable.createdAt);
    res.json(msgs);
  } catch {
    res.status(500).json({ error: "فشل تحميل الرسائل" });
  }
});

// GET /messages/driver/:driverId/conversations — conversations for a specific driver
router.get("/messages/driver/:driverId/conversations", async (req, res) => {
  const driverId = parseInt(req.params.driverId);
  if (isNaN(driverId)) { res.status(400).json({ error: "driverId غير صحيح" }); return; }
  try {
    const rows = await db
      .select({
        orderId:     messagesTable.orderId,
        lastText:    messagesTable.text,
        fromCashier: messagesTable.fromCashier,
        lastAt:      messagesTable.createdAt,
        readAt:      messagesTable.readAt,
      })
      .from(messagesTable)
      .where(eq(messagesTable.driverId, driverId))
      .orderBy(desc(messagesTable.createdAt));

    const map = new Map<number, {
      orderId: number; lastText: string; fromDriver: boolean; lastAt: Date; unread: number;
    }>();

    for (const r of rows) {
      if (!map.has(r.orderId)) {
        map.set(r.orderId, {
          orderId: r.orderId,
          lastText: r.lastText,
          fromDriver: r.fromCashier,
          lastAt: r.lastAt,
          unread: 0,
        });
      }
      // count unread customer messages (fromCashier=false means from customer, unread by driver)
      if (!r.fromCashier && !r.readAt) {
        const entry = map.get(r.orderId)!;
        entry.unread += 1;
      }
    }

    const orderIds = [...map.keys()];
    const orders = orderIds.length
      ? await db.select({ id: ordersTable.id, dailyNumber: ordersTable.dailyNumber, customerName: ordersTable.customerName, customerPhone: ordersTable.customerPhone })
          .from(ordersTable)
          .where(sql`${ordersTable.id} = ANY(ARRAY[${sql.join(orderIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
      : [];

    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const result = [...map.values()]
      .map((c) => ({ ...c, order: orderMap.get(c.orderId) ?? null }))
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

    res.json(result);
  } catch {
    res.status(500).json({ error: "فشل تحميل محادثات المندوب" });
  }
});

// GET /messages/driver/:driverId/order/:orderId — messages for one order (driver view)
router.get("/messages/driver/:driverId/order/:orderId", async (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const orderId  = parseInt(req.params.orderId);
  if (isNaN(driverId) || isNaN(orderId)) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  try {
    // Mark customer messages as read by driver
    await db
      .update(messagesTable)
      .set({ readAt: new Date() })
      .where(and(
        eq(messagesTable.orderId, orderId),
        eq(messagesTable.driverId, driverId),
        eq(messagesTable.fromCashier, false),
        isNull(messagesTable.readAt)
      ));

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.orderId, orderId), eq(messagesTable.driverId, driverId)))
      .orderBy(messagesTable.createdAt);
    res.json(msgs);
  } catch {
    res.status(500).json({ error: "فشل تحميل الرسائل" });
  }
});

// POST /messages/driver/:driverId/order/:orderId — driver replies to customer
router.post("/messages/driver/:driverId/order/:orderId", async (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const orderId  = parseInt(req.params.orderId);
  if (isNaN(driverId) || isNaN(orderId)) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  const parsed = driverReplySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  try {
    const [msg] = await db.insert(messagesTable).values({
      orderId,
      text: parsed.data.text,
      fromCashier: true,
      driverId,
    }).returning();
    res.json(msg);

    // Notify customer
    const [order] = await db
      .select({ customerPushToken: ordersTable.customerPushToken, dailyNumber: ordersTable.dailyNumber })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (order?.customerPushToken) {
      sendPushToToken(order.customerPushToken, {
        title: "💬 رسالة من المندوب",
        body: parsed.data.text.length > 80 ? parsed.data.text.slice(0, 77) + "…" : parsed.data.text,
        sound: "default",
        data: { orderId: String(orderId), type: "message" },
        channelId: "order-status",
      }).catch(() => {});
    }
  } catch {
    res.status(500).json({ error: "فشل إرسال الرسالة" });
  }
});

// POST /messages/order/:orderId — send a message (customer → driver or cashier)
router.post("/messages/order/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "orderId غير صحيح" }); return; }
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  try {
    // Check if the order has an assigned driver
    const [assignment] = await db
      .select({ driverId: orderDriverAssignmentsTable.driverId })
      .from(orderDriverAssignmentsTable)
      .where(eq(orderDriverAssignmentsTable.orderId, orderId));

    const driverId = (!parsed.data.fromCashier && assignment?.driverId) ? assignment.driverId : null;

    const [msg] = await db.insert(messagesTable).values({
      orderId,
      text: parsed.data.text,
      fromCashier: parsed.data.fromCashier,
      driverId: driverId ?? undefined,
    }).returning();
    res.json(msg);

    if (parsed.data.fromCashier) {
      // Cashier → customer: push to customer
      const [order] = await db
        .select({ customerPushToken: ordersTable.customerPushToken, dailyNumber: ordersTable.dailyNumber })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId));
      if (order?.customerPushToken) {
        sendPushToToken(order.customerPushToken, {
          title: "💬 رسالة من الكاشير",
          body: parsed.data.text.length > 80 ? parsed.data.text.slice(0, 77) + "…" : parsed.data.text,
          sound: "default",
          data: { orderId: String(orderId), type: "message" },
          channelId: "order-status",
        }).catch(() => {});
      }
    } else if (driverId) {
      // Customer → driver: push to driver
      sendPushToDriver(driverId, {
        title: "💬 رسالة جديدة",
        body: parsed.data.text.length > 80 ? parsed.data.text.slice(0, 77) + "…" : parsed.data.text,
        sound: "default",
        data: { orderId: String(orderId), type: "message" },
        channelId: "messages",
      }).catch(() => {});
    } else {
      // Customer → cashier (no driver assigned): push to all cashier devices
      const [order] = await db
        .select({ dailyNumber: ordersTable.dailyNumber, customerName: ordersTable.customerName })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId));
      sendPushToCashiers({
        title: `💬 رسالة من عميل — طلب #${order?.dailyNumber ?? orderId}`,
        body: `${order?.customerName ?? ""}: ${parsed.data.text.length > 60 ? parsed.data.text.slice(0, 57) + "…" : parsed.data.text}`,
        sound: "default",
        data: { orderId: String(orderId), type: "message" },
      }).catch(() => {});
    }
  } catch {
    res.status(500).json({ error: "فشل إرسال الرسالة" });
  }
});

// PATCH /messages/order/:orderId/read — mark messages as read
router.patch("/messages/order/:orderId/read", async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "orderId غير صحيح" }); return; }
  const { fromCashier } = req.body;
  try {
    await db
      .update(messagesTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messagesTable.orderId, orderId),
          eq(messagesTable.fromCashier, !fromCashier),
          isNull(messagesTable.readAt)
        )
      );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "فشل التحديث" });
  }
});

export default router;
