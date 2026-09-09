import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq, gte, lt, and, sql, ne, inArray, isNotNull } from "drizzle-orm";
import { requireDashboardUser, type DashboardActor } from "./dashboard-auth.js";

const router = Router();

function branchOrderFilter(actor: DashboardActor) {
  if (actor.role === "admin") return undefined;
  if (actor.branchIds.length === 0) return sql`false`;
  return and(isNotNull(ordersTable.branchId), inArray(ordersTable.branchId, actor.branchIds));
}

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

function toLocalMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - TZ_OFFSET_MS);
}

function nowLocal(): Date {
  return new Date(Date.now() + TZ_OFFSET_MS);
}

// Saudi VAT 15% — prices are VAT-inclusive
const VAT_RATE = 0.15;
function calcTax(gross: number): number {
  return +(gross * VAT_RATE / (1 + VAT_RATE)).toFixed(2);
}

const aggregate = async (from: Date, to: Date, branchFilter: ReturnType<typeof branchOrderFilter>) => {
  const doneRows = await db
    .select({
      totalRevenue:    sql<number>`coalesce(sum(${ordersTable.totalPrice}), 0)`,
      deliveryRevenue: sql<number>`coalesce(sum(${ordersTable.deliveryFee}), 0)`,
      orderCount:      sql<number>`count(*)`,
      cashCount:       sql<number>`coalesce(sum(case when ${ordersTable.paymentMethod} = 'cash' then 1 else 0 end), 0)`,
      onlineCount:     sql<number>`coalesce(sum(case when ${ordersTable.paymentMethod} != 'cash' then 1 else 0 end), 0)`,
      cashRevenue:     sql<number>`coalesce(sum(case when ${ordersTable.paymentMethod} = 'cash' then ${ordersTable.totalPrice} else 0 end), 0)`,
      onlineRevenue:   sql<number>`coalesce(sum(case when ${ordersTable.paymentMethod} != 'cash' then ${ordersTable.totalPrice} else 0 end), 0)`,
    })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lt(ordersTable.createdAt, to), eq(ordersTable.status, "done"), branchFilter));

  const cancelRows = await db
    .select({
      cancelCount:   sql<number>`count(*)`,
      cancelRevenue: sql<number>`coalesce(sum(${ordersTable.totalPrice}), 0)`,
    })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lt(ordersTable.createdAt, to), eq(ordersTable.status, "cancelled"), branchFilter));

  const pendingRows = await db
    .select({ pendingCount: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, from),
        lt(ordersTable.createdAt, to),
        ne(ordersTable.status, "done"),
        ne(ordersTable.status, "cancelled"),
        branchFilter,
      )
    );

  const row = doneRows[0];
  const cancelRow = cancelRows[0];
  const pendingRow = pendingRows[0];

  const total    = Number(row.totalRevenue) / 100;
  const delivery = Number(row.deliveryRevenue) / 100;
  const items    = +(total - delivery).toFixed(2);
  const tax      = calcTax(total);
  const net      = +(total - tax).toFixed(2);

  return {
    totalRevenue:    total,
    deliveryRevenue: delivery,
    itemsRevenue:    items,
    orderCount:      Number(row.orderCount),
    taxAmount:       tax,
    netRevenue:      net,
    cancelledCount:  Number(cancelRow.cancelCount),
    cancelledValue:  Number(cancelRow.cancelRevenue) / 100,
    pendingCount:    Number(pendingRow.pendingCount),
    cashCount:       Number(row.cashCount),
    onlineCount:     Number(row.onlineCount),
    cashRevenue:     Number(row.cashRevenue) / 100,
    onlineRevenue:   Number(row.onlineRevenue) / 100,
  };
};

router.get("/revenue", requireDashboardUser, async (_req, res) => {
  const branchFilter = branchOrderFilter(res.locals.dashboardActor as DashboardActor);
  const nl = nowLocal();
  const y = nl.getUTCFullYear();
  const m = nl.getUTCMonth();
  const d = nl.getUTCDate();

  const todayStart     = toLocalMidnight(y, m, d);
  const tomorrowStart  = toLocalMidnight(y, m, d + 1);
  const weekStart      = toLocalMidnight(y, m, d - 6);
  const monthStart     = toLocalMidnight(y, m, 1);
  const nextMonthStart = toLocalMidnight(y, m + 1, 1);
  const yearStart      = toLocalMidnight(y, 0, 1);
  const nextYearStart  = toLocalMidnight(y + 1, 0, 1);

  // ── Daily breakdown (last 30 days) ──
  const dailyBreakdown: {
    date: string; total: number; delivery: number; items: number; orders: number;
    tax: number; net: number; cancelledCount: number; cancelledValue: number;
    cashCount: number; onlineCount: number;
  }[] = [];

  for (let i = 29; i >= 0; i--) {
    const dayLocal = new Date(nl.getTime() - i * 86400000);
    const dy = dayLocal.getUTCFullYear();
    const dm = dayLocal.getUTCMonth();
    const dd = dayLocal.getUTCDate();
    const from = toLocalMidnight(dy, dm, dd);
    const to   = toLocalMidnight(dy, dm, dd + 1);
    const r = await aggregate(from, to, branchFilter);
    const label = `${String(dd).padStart(2, "0")}/${String(dm + 1).padStart(2, "0")}`;
    dailyBreakdown.push({
      date: label, total: r.totalRevenue, delivery: r.deliveryRevenue, items: r.itemsRevenue,
      orders: r.orderCount, tax: r.taxAmount, net: r.netRevenue,
      cancelledCount: r.cancelledCount, cancelledValue: r.cancelledValue,
      cashCount: r.cashCount, onlineCount: r.onlineCount,
    });
  }

  // ── Monthly breakdown (current year) ──
  const arabicMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const monthlyBreakdown: {
    month: string; total: number; delivery: number; items: number; orders: number;
    tax: number; net: number; cancelledCount: number; cancelledValue: number;
    cashCount: number; onlineCount: number;
  }[] = [];

  for (let mi = 0; mi < 12; mi++) {
    const from = toLocalMidnight(y, mi, 1);
    const to   = toLocalMidnight(y, mi + 1, 1);
    const r = await aggregate(from, to, branchFilter);
    monthlyBreakdown.push({
      month: arabicMonths[mi], total: r.totalRevenue, delivery: r.deliveryRevenue, items: r.itemsRevenue,
      orders: r.orderCount, tax: r.taxAmount, net: r.netRevenue,
      cancelledCount: r.cancelledCount, cancelledValue: r.cancelledValue,
      cashCount: r.cashCount, onlineCount: r.onlineCount,
    });
  }

  // ── Top selling items (this year, done orders) ──
  const topItemsRaw = await db
    .select({ items: ordersTable.items })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, yearStart), lt(ordersTable.createdAt, nextYearStart), eq(ordersTable.status, "done"), branchFilter));

  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const row of topItemsRaw) {
    const items = row.items as Array<{ id: string; name: string; price: number; quantity: number }>;
    for (const it of items) {
      const existing = itemMap.get(it.id) ?? { name: it.name, qty: 0, revenue: 0 };
      existing.qty += it.quantity;
      existing.revenue += it.price * it.quantity;
      itemMap.set(it.id, existing);
    }
  }
  const topItems = [...itemMap.entries()]
    .map(([id, v]) => ({ id, name: v.name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  const [today, week, month, year] = await Promise.all([
    aggregate(todayStart, tomorrowStart, branchFilter),
    aggregate(weekStart, tomorrowStart, branchFilter),
    aggregate(monthStart, nextMonthStart, branchFilter),
    aggregate(yearStart, nextYearStart, branchFilter),
  ]);

  res.json({ today, week, month, year, dailyBreakdown, monthlyBreakdown, topItems });
});

// ── GET /revenue/live — last-hour, last-30min, today extras ──────────────────
router.get("/revenue/live", requireDashboardUser, async (_req, res) => {
  const branchFilter = branchOrderFilter(res.locals.dashboardActor as DashboardActor);
  const now = new Date();
  const oneHourAgo    = new Date(now.getTime() - 60 * 60 * 1000);
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const nl = nowLocal();
  const y = nl.getUTCFullYear(), m = nl.getUTCMonth(), d = nl.getUTCDate();
  const todayStart    = toLocalMidnight(y, m, d);
  const tomorrowStart = toLocalMidnight(y, m, d + 1);

  const [lastHour, last30min] = await Promise.all([
    aggregate(oneHourAgo, now, branchFilter),
    aggregate(thirtyMinsAgo, now, branchFilter),
  ]);

  // unique customers today (non-cancelled)
  const phones = await db
    .select({ phone: ordersTable.customerPhone })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, todayStart), lt(ordersTable.createdAt, tomorrowStart), ne(ordersTable.status, "cancelled"), branchFilter));
  const uniqueCustomerCount = new Set(phones.map(r => r.phone)).size;

  // total items sold today (done orders)
  const doneItemRows = await db
    .select({ items: ordersTable.items })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, todayStart), lt(ordersTable.createdAt, tomorrowStart), eq(ordersTable.status, "done"), branchFilter));
  let totalItemsSold = 0;
  for (const row of doneItemRows) {
    for (const it of (row.items as Array<{ quantity: number }>)) totalItemsSold += it.quantity;
  }

  // total discounts applied today
  const discountRows = await db
    .select({ total: sql<number>`coalesce(sum(${ordersTable.discountAmount}), 0)` })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, todayStart), lt(ordersTable.createdAt, tomorrowStart), ne(ordersTable.status, "cancelled"), branchFilter));
  const totalDiscounts = Number(discountRows[0]?.total ?? 0) / 100;

  res.json({ lastHour, last30min, uniqueCustomerCount, totalItemsSold, totalDiscounts });
});

router.get("/revenue/range", requireDashboardUser, async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  if (!from || !to) { res.status(400).json({ error: "from and to required (YYYY-MM-DD)" }); return; }
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) { res.status(400).json({ error: "invalid date format" }); return; }
  const fromDate = toLocalMidnight(fy, fm - 1, fd);
  const toDate   = toLocalMidnight(ty, tm - 1, td + 1);
  const branchFilter = branchOrderFilter(res.locals.dashboardActor as DashboardActor);
  const data = await aggregate(fromDate, toDate, branchFilter);
  res.json(data);
});

export default router;
