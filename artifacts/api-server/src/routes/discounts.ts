import { Router } from "express";
import { z } from "zod";
import { db, discountCodesTable, discountCodeUsagesTable, ordersTable } from "@workspace/db";
import { eq, and, count, desc, gte, sql } from "drizzle-orm";
import { resolveOptionalDashboardActor } from "./dashboard-auth";

const router = Router();

// ── GET /discount-codes
router.get("/discount-codes", async (req, res) => {
  // Personalized incentives are not public offers. Keep existing VIP codes
  // private as well, without migrating or changing their redemption rules.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  const actor = await resolveOptionalDashboardActor(req);
  const codes = await db.select().from(discountCodesTable).orderBy(discountCodesTable.createdAt);
  const visibleCodes = actor ? codes : codes.filter((code) => !isCustomerIncentive(code));

  const usageCounts = await db
    .select({ discountCodeId: discountCodeUsagesTable.discountCodeId, cnt: count() })
    .from(discountCodeUsagesTable)
    .groupBy(discountCodeUsagesTable.discountCodeId);

  const savingsSums = await db
    .select({
      discountCodeId: discountCodeUsagesTable.discountCodeId,
      totalSavings: sql<number>`COALESCE(SUM(${ordersTable.discountAmount}), 0)`,
    })
    .from(discountCodeUsagesTable)
    .leftJoin(ordersTable, eq(discountCodeUsagesTable.orderId, ordersTable.id))
    .groupBy(discountCodeUsagesTable.discountCodeId);

  const countMap: Record<number, number> = {};
  for (const u of usageCounts) countMap[u.discountCodeId] = Number(u.cnt);

  const savingsMap: Record<number, number> = {};
  for (const s of savingsSums) savingsMap[s.discountCodeId] = Number(s.totalSavings);

  res.json(visibleCodes.map((c) => ({ ...c, usageCount: countMap[c.id] ?? 0, totalSavings: savingsMap[c.id] ?? 0 })));
});

function isCustomerIncentive(code: { code: string; description: string | null }): boolean {
  return /^VIP-/i.test(code.code) || /^تحفيز\s+ل[أا]فضل\s+عميل/.test(code.description?.trim() ?? "");
}

// ── GET /discount-codes/:id/usages
router.get("/discount-codes/:id/usages", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id غير صحيح" }); return; }

  const period = (req.query.period as string) ?? "all";
  let sinceDate: Date | null = null;
  if (period === "7d") sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  else if (period === "30d") sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const whereClause = sinceDate
    ? and(eq(discountCodeUsagesTable.discountCodeId, id), gte(discountCodeUsagesTable.usedAt, sinceDate))
    : eq(discountCodeUsagesTable.discountCodeId, id);

  const usages = await db
    .select({
      id: discountCodeUsagesTable.id,
      phone: discountCodeUsagesTable.phone,
      orderId: discountCodeUsagesTable.orderId,
      usedAt: discountCodeUsagesTable.usedAt,
      orderTotal: ordersTable.totalPrice,
      discountAmount: ordersTable.discountAmount,
    })
    .from(discountCodeUsagesTable)
    .leftJoin(ordersTable, eq(discountCodeUsagesTable.orderId, ordersTable.id))
    .where(whereClause)
    .orderBy(desc(discountCodeUsagesTable.usedAt));

  const totalSavings = usages.reduce((sum, u) => sum + (u.discountAmount ?? 0), 0);

  const dayMap: Record<string, { count: number; savings: number }> = {};
  for (const u of usages) {
    const saudiMs = new Date(u.usedAt).getTime() + 3 * 3600 * 1000;
    const key = new Date(saudiMs).toISOString().slice(0, 10);
    if (!dayMap[key]) dayMap[key] = { count: 0, savings: 0 };
    dayMap[key].count++;
    dayMap[key].savings += u.discountAmount ?? 0;
  }
  const chartData = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, count: v.count, savings: v.savings }));

  res.json({ usages, totalSavings, chartData });
});

// ── GET /discount-codes/:id/usages.csv
router.get("/discount-codes/:id/usages.csv", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).send("id غير صحيح"); return; }

  const period = (req.query.period as string) ?? "all";
  let sinceDate: Date | null = null;
  if (period === "7d") sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  else if (period === "30d") sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [codeRow] = await db.select().from(discountCodesTable).where(eq(discountCodesTable.id, id));

  const whereClause = sinceDate
    ? and(eq(discountCodeUsagesTable.discountCodeId, id), gte(discountCodeUsagesTable.usedAt, sinceDate))
    : eq(discountCodeUsagesTable.discountCodeId, id);

  const usages = await db
    .select({
      phone: discountCodeUsagesTable.phone,
      orderId: discountCodeUsagesTable.orderId,
      usedAt: discountCodeUsagesTable.usedAt,
      orderTotal: ordersTable.totalPrice,
      discountAmount: ordersTable.discountAmount,
    })
    .from(discountCodeUsagesTable)
    .leftJoin(ordersTable, eq(discountCodeUsagesTable.orderId, ordersTable.id))
    .where(whereClause)
    .orderBy(desc(discountCodeUsagesTable.usedAt));

  const code = codeRow?.code ?? String(id);
  const filename = `discount-${code}-${period}.csv`;

  const csvEscape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ["الكود", "هاتف العميل", "رقم الطلب", "إجمالي الطلب (ر.س)", "قيمة الخصم (ر.س)", "التاريخ والوقت"].join(",");
  const rows = usages.map((u) => [
    csvEscape(code),
    csvEscape(u.phone),
    csvEscape(u.orderId ?? ""),
    csvEscape(u.orderTotal != null ? (u.orderTotal / 100).toFixed(2) : ""),
    csvEscape(u.discountAmount != null ? (u.discountAmount / 100).toFixed(2) : ""),
    csvEscape(new Date(u.usedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })),
  ].join(","));

  const csv = "\uFEFF" + [header, ...rows].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── POST /discount-codes
router.post("/discount-codes", async (req, res) => {
  const parsed = z.object({
    code: z.string().min(1).max(32).toUpperCase(),
    type: z.enum(["fixed", "percentage"]),
    value: z.number().int().min(0),
    minOrder: z.number().int().min(0).default(0),
    description: z.string().default(""),
    active: z.boolean().default(true),
    expiresAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const { expiresAt: expiresAtStr, ...restData } = parsed.data;
    if (expiresAtStr != null && new Date(expiresAtStr) <= new Date()) {
      res.status(400).json({ error: "وقت انتهاء الصلاحية يجب أن يكون في المستقبل" });
      return;
    }
    const insertData = {
      ...restData,
      expiresAt: expiresAtStr != null ? new Date(expiresAtStr) : (expiresAtStr as null | undefined),
    };
    const [row] = await db.insert(discountCodesTable).values(insertData).returning();
    res.status(201).json({ ...row, usageCount: 0 });
  } catch (e: any) {
    const pgCode = e?.code ?? e?.cause?.code ?? e?.cause?.cause?.code;
    if (pgCode === "23505") { res.status(409).json({ error: "الكود موجود مسبقاً" }); return; }
    throw e;
  }
});

// ── PATCH /discount-codes/:id
router.patch("/discount-codes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id غير صحيح" }); return; }

  const parsed = z.object({
    code: z.string().min(1).max(32).toUpperCase().optional(),
    type: z.enum(["fixed", "percentage"]).optional(),
    value: z.number().int().min(0).optional(),
    minOrder: z.number().int().min(0).optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { expiresAt: expiresAtStr2, ...restUpdate } = parsed.data;
  if (expiresAtStr2 != null && new Date(expiresAtStr2) <= new Date()) {
    res.status(400).json({ error: "وقت انتهاء الصلاحية يجب أن يكون في المستقبل" });
    return;
  }
  const updateData = {
    ...restUpdate,
    ...(expiresAtStr2 !== undefined
      ? { expiresAt: expiresAtStr2 != null ? new Date(expiresAtStr2) : null }
      : {}),
  };
  const [row] = await db.update(discountCodesTable).set(updateData).where(eq(discountCodesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "لم يُوجد الكود" }); return; }
  res.json(row);
});

// ── DELETE /discount-codes/:id
router.delete("/discount-codes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id غير صحيح" }); return; }
  await db.delete(discountCodesTable).where(eq(discountCodesTable.id, id));
  res.json({ ok: true });
});

// ── Shared cleanup logic (also called by the scheduled job in index.ts)
export async function cleanupExpiredDiscountCodes(): Promise<number> {
  const deleted = await db
    .delete(discountCodesTable)
    .where(sql`${discountCodesTable.expiresAt} IS NOT NULL AND ${discountCodesTable.expiresAt} < NOW()`)
    .returning({ id: discountCodesTable.id });
  return deleted.length;
}

// ── POST /discount-codes/cleanup — delete all codes whose expiresAt has passed
router.post("/discount-codes/cleanup", async (_req, res) => {
  const count = await cleanupExpiredDiscountCodes();
  res.json({ deleted: count });
});

// ── POST /discount-codes/validate  (used by checkout — public)
router.post("/discount-codes/validate", async (req, res) => {
  const parsed = z.object({
    code: z.string().min(1),
    orderTotal: z.number().min(0),
    phone: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }

  const code = parsed.data.code.trim().toUpperCase();
  const [found] = await db.select().from(discountCodesTable)
    .where(eq(discountCodesTable.code, code));

  if (!found || !found.active) { res.status(404).json({ error: "الكود غير صحيح أو غير فعّال" }); return; }
  if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
    res.status(410).json({ error: "انتهت صلاحية هذا الكود" });
    return;
  }
  if (parsed.data.orderTotal < found.minOrder) {
    res.status(422).json({ error: `الحد الأدنى للطلب لاستخدام هذا الكود هو ${found.minOrder} ر.س` });
    return;
  }

  // Check total usage limit (maxUses)
  if (found.maxUses != null) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(discountCodeUsagesTable)
      .where(eq(discountCodeUsagesTable.discountCodeId, found.id));
    if (Number(total) >= found.maxUses) {
      res.status(410).json({ error: "تم استنفاد الكود — شكراً لمشاركتك" });
      return;
    }
  }

  // Check single-use per phone
  if (parsed.data.phone) {
    const phone = parsed.data.phone.trim();
    const [usage] = await db.select().from(discountCodeUsagesTable)
      .where(and(
        eq(discountCodeUsagesTable.discountCodeId, found.id),
        eq(discountCodeUsagesTable.phone, phone),
      ));
    if (usage) {
      res.status(409).json({ error: "لقد استخدمت هذا الكود مسبقاً" });
      return;
    }
  }

  res.json({
    id: found.id,
    code: found.code,
    type: found.type,
    value: found.value,
    minOrder: found.minOrder,
    description: found.description,
  });
});

// ── POST /discount-codes/use  (record usage after order placed)
router.post("/discount-codes/use", async (req, res) => {
  const parsed = z.object({
    codeId: z.number().int(),
    phone: z.string().min(1),
    orderId: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }

  try {
    await db.insert(discountCodeUsagesTable).values({
      discountCodeId: parsed.data.codeId,
      phone: parsed.data.phone.trim(),
      orderId: parsed.data.orderId ?? null,
    });
    res.json({ ok: true });
  } catch (e: any) {
    // Ignore duplicate (already used) — order already placed, just don't double-record
    res.json({ ok: true });
  }
});

export default router;
