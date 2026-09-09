import { Router } from "express";
import { db, branchesTable, deliveryZonesTable, ordersTable } from "@workspace/db";
import { asc, inArray, and, eq, isNotNull } from "drizzle-orm";
import {
  resolveNearestBranch,
  validateResolveCoordinates,
} from "../lib/branchResolver";
import { requireDashboardUser } from "./dashboard-auth";

const router = Router();

router.get("/branches/resolve-preview", requireDashboardUser, async (req, res) => {
  const validated = validateResolveCoordinates(req.query.lat, req.query.lng);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const actor = res.locals.dashboardActor;
  if (actor.role !== "admin" && actor.branchIds.length === 0) {
    res.json(resolveNearestBranch(validated.point, [], []));
    return;
  }

  const branchFilter = actor.role === "admin" ? undefined : inArray(branchesTable.id, actor.branchIds);
  const [branches, zones, activeOrders] = await Promise.all([
    db.select({
      id: branchesTable.id,
      name: branchesTable.name,
      active: branchesTable.active,
      deliveryEnabled: branchesTable.deliveryEnabled,
      lat: branchesTable.lat,
      lng: branchesTable.lng,
      weeklyOperatingHours: branchesTable.weeklyOperatingHours,
      deliveryCapacity: branchesTable.deliveryCapacity,
    }).from(branchesTable).where(branchFilter),
    db.select({
      id: deliveryZonesTable.id,
      branchId: deliveryZonesTable.branchId,
      enabled: deliveryZonesTable.enabled,
      sortOrder: deliveryZonesTable.sortOrder,
      polygon: deliveryZonesTable.polygon,
    }).from(deliveryZonesTable)
      .where(actor.role === "admin" ? undefined : inArray(deliveryZonesTable.branchId, actor.branchIds))
      .orderBy(asc(deliveryZonesTable.sortOrder), asc(deliveryZonesTable.id)),
    db.select({ branchId: ordersTable.branchId }).from(ordersTable).where(and(
      eq(ordersTable.orderType, "delivery"),
      inArray(ordersTable.status, ["pending", "preparing", "ready", "out_for_delivery"] as const),
      isNotNull(ordersTable.branchId),
    )),
  ]);
  const counts = new Map<number, number>();
  for (const order of activeOrders) if (order.branchId !== null) counts.set(order.branchId, (counts.get(order.branchId) ?? 0) + 1);
  res.json(resolveNearestBranch(validated.point, branches.map((branch) => ({
    ...branch, activeDeliveryOrderCount: counts.get(branch.id) ?? 0,
  })), zones));
});

export default router;