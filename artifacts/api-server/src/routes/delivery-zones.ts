import { Router } from "express";
import { db, deliveryZonesTable, branchesTable } from "@workspace/db";
import { eq, asc, and, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDashboardUser } from "./dashboard-auth";
import { pointInPolygon, type LatLng } from "../lib/geo";

const router = Router();
const BRANCH_ELIGIBILITY_LOCK_NAMESPACE = 19870410;
const UNASSIGNED_ZONE_LOCK = 0;

router.get("/delivery-zones", requireDashboardUser, async (_req, res) => {
  const actor = res.locals.dashboardActor;
  if (actor.role !== "admin" && actor.branchIds.length === 0) {
    res.json([]);
    return;
  }
  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(actor && actor.role !== "admin"
      ? and(isNotNull(deliveryZonesTable.branchId), inArray(deliveryZonesTable.branchId, actor.branchIds))
      : undefined)
    .orderBy(asc(deliveryZonesTable.sortOrder), asc(deliveryZonesTable.id));
  res.json(zones);
});

router.get("/delivery-zones/check", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat و lng مطلوبان" });
    return;
  }

  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.enabled, true))
    .orderBy(asc(deliveryZonesTable.sortOrder), asc(deliveryZonesTable.id));

  const totalZones = await db.select().from(deliveryZonesTable);

  for (const zone of zones) {
    const poly = zone.polygon as LatLng[];
    if (pointInPolygon({ lat, lng }, poly)) {
      res.json({
        found: true,
        zone: {
          id: zone.id,
          name: zone.name,
          deliveryFee: zone.deliveryFee,
          minOrder: zone.minOrder,
        },
        hasZones: totalZones.length > 0,
      });
      return;
    }
  }

  res.json({ found: false, zone: null, hasZones: totalZones.length > 0 });
});

const zoneSchema = z.object({
  name: z.string().min(1),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
  deliveryFee: z.number().int().min(0),
  minOrder: z.number().int().min(0),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  branchId: z.number().int().positive().nullable().optional(),
});

router.post("/delivery-zones", requireDashboardUser, async (req, res) => {
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() });
    return;
  }
  const { name, polygon, deliveryFee, minOrder, enabled, sortOrder, branchId } = parsed.data;
  const actor = res.locals.dashboardActor;
  if (actor.role !== "admin" && (branchId == null || !actor.branchIds.includes(branchId))) {
    res.status(403).json({ error: "غير مصرح لهذا الفرع" }); return;
  }
  const outcome = await db.transaction(async (tx) => {
    const lockKey = branchId ?? UNASSIGNED_ZONE_LOCK;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BRANCH_ELIGIBILITY_LOCK_NAMESPACE}, ${lockKey})`);
    if (branchId != null) {
      const [branch] = await tx.select({ id: branchesTable.id }).from(branchesTable)
        .where(eq(branchesTable.id, branchId)).limit(1);
      if (!branch) return { kind: "branch_not_found" } as const;
    }
    const [inserted] = await tx.insert(deliveryZonesTable)
      .values({ name, polygon, deliveryFee, minOrder, enabled, sortOrder, branchId: branchId ?? null })
      .returning();
    return { kind: "ok", zone: inserted } as const;
  });
  if (outcome.kind === "branch_not_found") {
    res.status(400).json({ error: "الفرع غير موجود" });
    return;
  }
  res.status(201).json(outcome.zone);
});

router.put("/delivery-zones/:id", requireDashboardUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }

  const patchSchema = zoneSchema.partial();
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const actor = res.locals.dashboardActor;
  let outcome:
    | { kind: "ok"; zone: typeof deliveryZonesTable.$inferSelect }
    | { kind: "not_found" }
    | { kind: "forbidden" }
    | { kind: "branch_not_found" }
    | { kind: "retry" }
    = { kind: "retry" };
  for (let attempt = 0; attempt < 3 && outcome.kind === "retry"; attempt += 1) {
    outcome = await db.transaction(async (tx) => {
      const [initial] = await tx.select({ branchId: deliveryZonesTable.branchId })
        .from(deliveryZonesTable).where(eq(deliveryZonesTable.id, id)).limit(1);
      if (!initial) return { kind: "not_found" } as const;
      const destination = parsed.data.branchId;
      const ownerships = destination === undefined ? [initial.branchId] : [initial.branchId, destination];
      const lockIds = [...new Set(ownerships.map((branchId) => branchId ?? UNASSIGNED_ZONE_LOCK))].sort((a, b) => a - b);
      for (const branchId of lockIds) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${BRANCH_ELIGIBILITY_LOCK_NAMESPACE}, ${branchId})`);
      }
      const [stable] = await tx.select({ branchId: deliveryZonesTable.branchId })
        .from(deliveryZonesTable).where(eq(deliveryZonesTable.id, id)).limit(1);
      if (!stable) return { kind: "not_found" } as const;
      if (stable.branchId !== initial.branchId) return { kind: "retry" } as const;
      if (actor.role !== "admin" && (stable.branchId == null || !actor.branchIds.includes(stable.branchId))) {
        return { kind: "forbidden" } as const;
      }
      if (actor.role !== "admin" && (destination === null || (destination !== undefined && !actor.branchIds.includes(destination)))) {
        return { kind: "forbidden" } as const;
      }
      if (destination != null) {
        const [branch] = await tx.select({ id: branchesTable.id }).from(branchesTable)
          .where(eq(branchesTable.id, destination)).limit(1);
        if (!branch) return { kind: "branch_not_found" } as const;
      }
      const [updated] = await tx.update(deliveryZonesTable).set(parsed.data)
        .where(eq(deliveryZonesTable.id, id)).returning();
      return updated ? { kind: "ok", zone: updated } as const : { kind: "not_found" } as const;
    });
  }
  if (outcome.kind === "forbidden") { res.status(403).json({ error: "غير مصرح لهذا الفرع" }); return; }
  if (outcome.kind === "branch_not_found") { res.status(400).json({ error: "الفرع غير موجود" }); return; }
  if (outcome.kind === "not_found") { res.status(404).json({ error: "المنطقة غير موجودة" }); return; }
  if (outcome.kind === "retry") { res.status(409).json({ error: "تم تحديث المنطقة، حاول مرة أخرى" }); return; }
  res.json(outcome.zone);
});

router.delete("/delivery-zones/:id", requireDashboardUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  const actor = res.locals.dashboardActor;
  let outcome: { kind: "ok" | "not_found" | "forbidden" | "retry" } = { kind: "retry" };
  for (let attempt = 0; attempt < 3 && outcome.kind === "retry"; attempt += 1) {
    outcome = await db.transaction(async (tx) => {
      const [initial] = await tx.select({ branchId: deliveryZonesTable.branchId })
        .from(deliveryZonesTable).where(eq(deliveryZonesTable.id, id)).limit(1);
      if (!initial) return { kind: "not_found" } as const;
      const lockKey = initial.branchId ?? UNASSIGNED_ZONE_LOCK;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BRANCH_ELIGIBILITY_LOCK_NAMESPACE}, ${lockKey})`);
      const [stable] = await tx.select({ branchId: deliveryZonesTable.branchId })
        .from(deliveryZonesTable).where(eq(deliveryZonesTable.id, id)).limit(1);
      if (!stable) return { kind: "not_found" } as const;
      if (stable.branchId !== initial.branchId) return { kind: "retry" } as const;
      if (actor.role !== "admin" && (stable.branchId == null || !actor.branchIds.includes(stable.branchId))) {
        return { kind: "forbidden" } as const;
      }
      await tx.delete(deliveryZonesTable).where(eq(deliveryZonesTable.id, id));
      return { kind: "ok" } as const;
    });
  }
  if (outcome.kind === "forbidden") { res.status(403).json({ error: "غير مصرح لهذا الفرع" }); return; }
  if (outcome.kind === "not_found") { res.status(404).json({ error: "المنطقة غير موجودة" }); return; }
  if (outcome.kind === "retry") { res.status(409).json({ error: "تم تحديث المنطقة، حاول مرة أخرى" }); return; }
  res.json({ ok: true });
});

export default router;
