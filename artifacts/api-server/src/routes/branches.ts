import { Router } from "express";
import { db, branchesTable, branchProductAvailabilityTable, menuItemsTable, deliveryZonesTable } from "@workspace/db";
import { eq, desc, inArray, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDashboardAdmin, resolveOptionalDashboardActor } from "./dashboard-auth";
import { validateWeeklyOperatingHours } from "../lib/branchResolver";

const router = Router();

const branchSchema = z.object({
  name:    z.string().min(1),
  address: z.string().nullable().optional(),
  phone:   z.string().nullable().optional(),
  mapsUrl: z.string().nullable().optional(),
  active:  z.boolean().optional(),
  lat:     z.number().min(-90).max(90).nullable().optional(),
  lng:     z.number().min(-180).max(180).nullable().optional(),
  deliveryEnabled: z.boolean().optional(),
  pickupEnabled: z.boolean().optional(),
  weeklyOperatingHours: z.unknown().nullable().optional(),
  deliveryCapacity: z.number().int().positive().nullable().optional(),
});

function validateBranchPayload(payload: Partial<z.infer<typeof branchSchema>>): string | null {
  if (payload.weeklyOperatingHours !== undefined) {
    const result = validateWeeklyOperatingHours(payload.weeklyOperatingHours);
    if (!result.ok) return result.error;
  }
  return null;
}

// ── GET /branches ─────────────────────────────────────────────────────────────
router.get("/branches", async (req, res) => {
  const actor = await resolveOptionalDashboardActor(req);
  const branches = await db
    .select()
    .from(branchesTable)
    .where(actor && actor.role !== "admin" ? inArray(branchesTable.id, actor.branchIds) : undefined)
    .orderBy(desc(branchesTable.createdAt));
  res.json(branches);
});

// ── POST /branches ────────────────────────────────────────────────────────────
router.post("/branches", requireDashboardAdmin, async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  const hoursError = validateBranchPayload(parsed.data);
  if (hoursError) { res.status(400).json({ error: hoursError }); return; }
  const [branch] = await db
    .insert(branchesTable)
    .values({
      name:    parsed.data.name,
      address: parsed.data.address ?? null,
      phone:   parsed.data.phone   ?? null,
      mapsUrl: parsed.data.mapsUrl ?? null,
      active:  parsed.data.active  ?? true,
      lat:     parsed.data.lat     ?? null,
      lng:     parsed.data.lng     ?? null,
      deliveryEnabled: parsed.data.deliveryEnabled ?? true,
      pickupEnabled: parsed.data.pickupEnabled ?? true,
      weeklyOperatingHours: parsed.data.weeklyOperatingHours ?? null,
      deliveryCapacity: parsed.data.deliveryCapacity ?? null,
    })
    .returning();
  res.json(branch);
});

// ── PUT /branches/:id ─────────────────────────────────────────────────────────
router.put("/branches/:id", requireDashboardAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  const parsed = branchSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  const hoursError = validateBranchPayload(parsed.data);
  if (hoursError) { res.status(400).json({ error: hoursError }); return; }
  const branch = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19870410, ${id})`);
    const [updated] = await tx.update(branchesTable)
    .set({
      ...(parsed.data.name    !== undefined ? { name:    parsed.data.name }    : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
      ...(parsed.data.phone   !== undefined ? { phone:   parsed.data.phone }   : {}),
      ...(parsed.data.mapsUrl !== undefined ? { mapsUrl: parsed.data.mapsUrl } : {}),
      ...(parsed.data.active  !== undefined ? { active:  parsed.data.active }  : {}),
      ...(parsed.data.lat     !== undefined ? { lat:     parsed.data.lat }     : {}),
      ...(parsed.data.lng     !== undefined ? { lng:     parsed.data.lng }     : {}),
      ...(parsed.data.deliveryEnabled !== undefined ? { deliveryEnabled: parsed.data.deliveryEnabled } : {}),
      ...(parsed.data.pickupEnabled !== undefined ? { pickupEnabled: parsed.data.pickupEnabled } : {}),
      ...(parsed.data.weeklyOperatingHours !== undefined ? { weeklyOperatingHours: parsed.data.weeklyOperatingHours } : {}),
      ...(parsed.data.deliveryCapacity !== undefined ? { deliveryCapacity: parsed.data.deliveryCapacity } : {}),
    })
    .where(eq(branchesTable.id, id))
      .returning();
    return updated;
  });
  if (!branch) { res.status(404).json({ error: "فرع غير موجود" }); return; }
  res.json(branch);
});

const availabilitySchema = z.object({ itemId: z.string().min(1), available: z.boolean().nullable() });

router.get("/branches/:id/product-availability", requireDashboardAdmin, async (req, res) => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || branchId <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  const [branch] = await db.select({ id: branchesTable.id }).from(branchesTable).where(eq(branchesTable.id, branchId));
  if (!branch) { res.status(404).json({ error: "فرع غير موجود" }); return; }
  const rows = await db.select({
    itemId: menuItemsTable.itemId, name: menuItemsTable.name, globalAvailable: menuItemsTable.available,
    override: branchProductAvailabilityTable.available,
  }).from(menuItemsTable).leftJoin(branchProductAvailabilityTable, and(
    eq(branchProductAvailabilityTable.itemId, menuItemsTable.itemId), eq(branchProductAvailabilityTable.branchId, branchId),
  ));
  res.json(rows.map((row) => ({ ...row, override: row.override ?? null, effective: row.globalAvailable && row.override !== false })));
});

router.put("/branches/:id/product-availability", requireDashboardAdmin, async (req, res) => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || branchId <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  const [branchRows, itemRows] = await Promise.all([
    db.select({ id: branchesTable.id }).from(branchesTable).where(eq(branchesTable.id, branchId)),
    db.select({ itemId: menuItemsTable.itemId }).from(menuItemsTable).where(eq(menuItemsTable.itemId, parsed.data.itemId)),
  ]);
  const branch = branchRows[0];
  const item = itemRows[0];
  if (!branch) { res.status(404).json({ error: "فرع غير موجود" }); return; }
  if (!item) { res.status(404).json({ error: "الصنف غير موجود" }); return; }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19870410, ${branchId})`);
    if (parsed.data.available === null) {
      await tx.delete(branchProductAvailabilityTable).where(and(eq(branchProductAvailabilityTable.branchId, branchId), eq(branchProductAvailabilityTable.itemId, parsed.data.itemId)));
    } else {
      await tx.insert(branchProductAvailabilityTable).values({ branchId, itemId: parsed.data.itemId, available: parsed.data.available })
        .onConflictDoUpdate({ target: [branchProductAvailabilityTable.branchId, branchProductAvailabilityTable.itemId], set: { available: parsed.data.available } });
    }
  });
  res.json({ ok: true });
});

// ── DELETE /branches/:id ──────────────────────────────────────────────────────
router.delete("/branches/:id", requireDashboardAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19870410, ${id})`);
    await tx.delete(deliveryZonesTable).where(eq(deliveryZonesTable.branchId, id));
    await tx.delete(branchesTable).where(eq(branchesTable.id, id));
  });
  res.json({ ok: true });
});

export default router;
