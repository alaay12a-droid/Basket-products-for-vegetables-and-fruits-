import { useState, useMemo, useRef, useEffect } from "react";
import { RevenueAggregate, Order } from "@workspace/api-client-react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { sarShort, sar, filterToday, aggregateItems, STATUS_AR } from "./utils";
import { downloadCSV } from "./export-utils";

// ── Saudi time helpers ────────────────────────────────────────────────────────
const TZ = 3 * 60 * 60 * 1000; // UTC+3

function saudiParts(d = new Date()): { y: number; mo: number; day: number } {
  const l = new Date(d.getTime() + TZ);
  return { y: l.getUTCFullYear(), mo: l.getUTCMonth(), day: l.getUTCDate() };
}

function saudiMidnight(y: number, mo: number, day: number): Date {
  return new Date(Date.UTC(y, mo, day) - TZ);
}

type Preset = "today" | "yesterday" | "tomorrow" | "this_week" | "next_week" |
              "this_month" | "next_month" | "this_year" | "next_year" | "custom";

interface DateRange { start: Date; end: Date; label: string; }

function computeRange(preset: Preset, fromStr: string, toStr: string): DateRange {
  const { y, mo, day } = saudiParts();
  const localNow = new Date(Date.now() + TZ);
  const dow = localNow.getUTCDay(); // 0=Sun

  const days = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

  switch (preset) {
    case "today": {
      const s = saudiMidnight(y, mo, day);
      return { start: s, end: days(s, 1), label: "اليوم" };
    }
    case "yesterday": {
      const s = saudiMidnight(y, mo, day - 1);
      return { start: s, end: days(s, 1), label: "الأمس" };
    }
    case "tomorrow": {
      const s = saudiMidnight(y, mo, day + 1);
      return { start: s, end: days(s, 1), label: "غداً" };
    }
    case "this_week": {
      const s = saudiMidnight(y, mo, day - dow);
      return { start: s, end: days(s, 7), label: "هذا الأسبوع" };
    }
    case "next_week": {
      const s = saudiMidnight(y, mo, day - dow + 7);
      return { start: s, end: days(s, 7), label: "الأسبوع القادم" };
    }
    case "this_month": {
      const s = saudiMidnight(y, mo, 1);
      return { start: s, end: saudiMidnight(y, mo + 1, 1), label: "هذا الشهر" };
    }
    case "next_month": {
      const s = saudiMidnight(y, mo + 1, 1);
      return { start: s, end: saudiMidnight(y, mo + 2, 1), label: "الشهر القادم" };
    }
    case "this_year": {
      const s = saudiMidnight(y, 0, 1);
      return { start: s, end: saudiMidnight(y + 1, 0, 1), label: `عام ${y}` };
    }
    case "next_year": {
      const s = saudiMidnight(y + 1, 0, 1);
      return { start: s, end: saudiMidnight(y + 2, 0, 1), label: `عام ${y + 1}` };
    }
    case "custom": {
      const s = fromStr ? new Date(`${fromStr}T00:00:00+03:00`) : saudiMidnight(y, mo, day);
      const e = toStr   ? new Date(`${toStr}T23:59:59+03:00`)   : days(s, 1);
      return { start: s, end: new Date(e.getTime() + 1000), label: `${fromStr || "?"} → ${toStr || "?"}` };
    }
  }
}

// ── Invoice print helper ─────────────────────────────────────────────────────
type StatusFilter = "all" | "completed" | "cancelled";

const STATUS_FILTER_AR: Record<StatusFilter, string> = {
  all:       "جميع الفواتير",
  completed: "المكتملة فقط",
  cancelled: "الملغية فقط",
};

function printInvoices(filtered: Order[], range: DateRange, statusFilter: StatusFilter = "all") {
  const nonCancelled = filtered.filter(o => o.status !== "cancelled");
  const total = nonCancelled.reduce((a, o) => a + o.totalPrice / 100, 0);
  const tax   = +(total * 15 / 115).toFixed(2);
  const net   = +(total - tax).toFixed(2);

  const filterLabel = statusFilter !== "all" ? ` — ${STATUS_FILTER_AR[statusFilter]}` : "";

  const rows = filtered
    .map((o, i) => {
      const price = (o.totalPrice / 100).toFixed(2);
      const items = o.items.map(it => `${it.name} ×${it.quantity}`).join("، ");
      const status = STATUS_AR[o.status] ?? o.status;
      const pay = o.paymentMethod === "cash" ? "نقدي" : "إلكتروني";
      const date = new Date(o.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
      return `<tr>
        <td>${i + 1}</td>
        <td>${o.dailyNumber}</td>
        <td>${o.customerName}<br/><small style="color:#666">${o.customerPhone}</small></td>
        <td style="font-size:11px">${date}</td>
        <td style="font-size:11px">${items}</td>
        <td style="font-weight:bold">${price} ر.س</td>
        <td>${pay}</td>
        <td class="status-${o.status}">${status}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>تقرير الفواتير — ${range.label}${filterLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Cairo, Arial, sans-serif; direction: rtl; padding: 20px; font-size: 13px; color: #1a1a1a; }
  h1 { text-align: center; font-size: 20px; margin-bottom: 6px; }
  .subtitle { text-align: center; color: #666; font-size: 12px; margin-bottom: 16px; }
  .summary { display: flex; gap: 16px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap; }
  .summary-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 20px; text-align: center; min-width: 120px; }
  .summary-card .num { font-size: 20px; font-weight: 700; color: #065f46; }
  .summary-card .lbl { font-size: 11px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; padding: 8px 6px; font-size: 12px; font-weight: 700; border-bottom: 2px solid #d1d5db; }
  td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .status-done { color: #065f46; }
  .status-cancelled { color: #b91c1c; }
  .status-pending, .status-preparing, .status-ready { color: #92400e; }
  @media print { body { padding: 5mm; font-size: 11px; } h1 { font-size: 16px; } }
</style>
</head>
<body>
<h1>🧾 تقرير الفواتير — ${range.label}${filterLabel}</h1>
<p class="subtitle">مطبوع بتاريخ: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</p>
<div class="summary">
  <div class="summary-card"><div class="num">${filtered.length}</div><div class="lbl">إجمالي الفواتير</div></div>
  <div class="summary-card"><div class="num">${nonCancelled.length}</div><div class="lbl">فواتير مكتملة</div></div>
  <div class="summary-card"><div class="num">${total.toFixed(2)} ر.س</div><div class="lbl">الإجمالي</div></div>
  <div class="summary-card"><div class="num">${tax.toFixed(2)} ر.س</div><div class="lbl">ضريبة 15%</div></div>
  <div class="summary-card"><div class="num">${net.toFixed(2)} ر.س</div><div class="lbl">الصافي</div></div>
</div>
<table>
  <thead><tr>
    <th>#</th><th>رقم يومي</th><th>العميل</th><th>التاريخ والوقت</th>
    <th>الأصناف</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
}

// ── Validation helpers ────────────────────────────────────────────────────────
interface ValidationResult {
  ok: boolean; computed: number; reported: number;
  diff: number; ordersChecked: number;
}

// ── Category colors ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  "مندي":     "#C8171A",
  "مشويات":   "#E8920C",
  "مقبلات":   "#0c48ab",
  "سلطات":    "#1DBF47",
  "مشروبات":  "#7C3AED",
  "عصائر":    "#DB2777",
  "مناسبات":  "#D97706",
  "أخرى":     "#6B7280",
};

function catColor(name: string, idx: number): string {
  return CAT_COLORS[name] ?? `hsl(${(idx * 53) % 360},65%,50%)`;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  today:   RevenueAggregate | undefined;
  week:    RevenueAggregate | undefined;
  month:   RevenueAggregate | undefined;
  year:    RevenueAggregate | undefined;
  orders:  Order[];
  loading: boolean;
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today",      label: "اليوم"          },
  { key: "yesterday",  label: "الأمس"          },
  { key: "tomorrow",   label: "غداً"           },
  { key: "this_week",  label: "هذا الأسبوع"    },
  { key: "next_week",  label: "الأسبوع القادم" },
  { key: "this_month", label: "هذا الشهر"      },
  { key: "next_month", label: "الشهر القادم"   },
  { key: "this_year",  label: "هذا العام"      },
  { key: "next_year",  label: "العام القادم"   },
  { key: "custom",     label: "مخصص"           },
];

export function TabAccounting({ today, week, month, year, orders, loading }: Props) {
  const [preset,       setPreset]       = useState<Preset>("today");
  const [fromStr,      setFromStr]      = useState("");
  const [toStr,        setToStr]        = useState("");
  const [cashInput,    setCashInput]    = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Category map from menu API
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    fetch(`${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""}/api/menu`)
      .then(r => r.json())
      .then((items: { id: string; name: string; category: string }[]) => {
        const m = new Map<string, string>();
        items.forEach(it => m.set(it.id, it.category));
        setCategoryMap(m);
      })
      .catch(() => {});
  }, []);

  const range = useMemo(() => computeRange(preset, fromStr, toStr), [preset, fromStr, toStr]);

  // All orders in the date range (used for KPIs)
  const filtered = useMemo(() =>
    orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= range.start && d < range.end;
    }),
    [orders, range]
  );

  // Table rows after status filter
  const tableRows = useMemo(() => {
    if (statusFilter === "completed") return filtered.filter(o => o.status !== "cancelled");
    if (statusFilter === "cancelled") return filtered.filter(o => o.status === "cancelled");
    return filtered;
  }, [filtered, statusFilter]);

  const kpis = useMemo(() => {
    const nonCancelled = filtered.filter(o => o.status !== "cancelled");
    const total    = nonCancelled.reduce((a, o) => a + o.totalPrice / 100, 0);
    const cash     = nonCancelled.filter(o => o.paymentMethod === "cash").reduce((a, o) => a + o.totalPrice / 100, 0);
    const online   = nonCancelled.filter(o => o.paymentMethod !== "cash").reduce((a, o) => a + o.totalPrice / 100, 0);
    const tax      = +(total * 15 / 115).toFixed(2);
    const net      = +(total - tax).toFixed(2);
    const disc     = nonCancelled.reduce((a, o) => a + (o.discountAmount ?? 0) / 100, 0);
    const delivery = nonCancelled.reduce((a, o) => a + ((o as any).deliveryFee ?? 0) / 100, 0);
    const cancelled = filtered.filter(o => o.status === "cancelled").length;
    return { count: filtered.length, nonCancelled: nonCancelled.length, total: +total.toFixed(2), cash: +cash.toFixed(2), online: +online.toFixed(2), tax, net, disc: +disc.toFixed(2), cancelled, delivery: +delivery.toFixed(2) };
  }, [filtered]);

  // Items sold in the period
  const periodItems = useMemo(() => aggregateItems(filtered), [filtered]);

  // Category sales for the period
  const categorySales = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    filtered.filter(o => o.status !== "cancelled").forEach(o => {
      o.items.forEach((item: any) => {
        const cat = categoryMap.get(item.id) ?? "أخرى";
        const cur = map.get(cat) ?? { qty: 0, total: 0 };
        cur.qty   += item.quantity;
        cur.total += (item.price ?? 0) * item.quantity;
        map.set(cat, cur);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, v]) => ({ name, qty: v.qty, total: +v.total.toFixed(2) }));
  }, [filtered, categoryMap]);

  // Payment methods breakdown
  const paymentBreakdown = useMemo(() => {
    const nc = filtered.filter(o => o.status !== "cancelled");
    const cash   = nc.filter(o => o.paymentMethod === "cash");
    const online = nc.filter(o => o.paymentMethod !== "cash");
    const totalAmt = nc.reduce((a, o) => a + o.totalPrice / 100, 0);
    return [
      {
        key: "cash", label: "نقدي", icon: "💵",
        count: cash.length,
        total: +cash.reduce((a, o) => a + o.totalPrice / 100, 0).toFixed(2),
        pct: totalAmt > 0 ? (cash.reduce((a, o) => a + o.totalPrice / 100, 0) / totalAmt * 100) : 0,
        bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "#F59E0B",
      },
      {
        key: "online", label: "إلكتروني", icon: "💳",
        count: online.length,
        total: +online.reduce((a, o) => a + o.totalPrice / 100, 0).toFixed(2),
        pct: totalAmt > 0 ? (online.reduce((a, o) => a + o.totalPrice / 100, 0) / totalAmt * 100) : 0,
        bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", bar: "#3B82F6",
      },
    ];
  }, [filtered]);

  // Hourly chart (for the selected period)
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      total: 0,
      count: 0,
    }));
    filtered.filter(o => o.status !== "cancelled").forEach(o => {
      const saudiHour = (new Date(o.createdAt).getUTCHours() + 3) % 24;
      hours[saudiHour].total += o.totalPrice / 100;
      hours[saudiHour].count += 1;
    });
    return hours.filter((_, i) => i >= 6);
  }, [filtered]);

  // Daily chart (last 30 days from all orders)
  const dailyFromOrders = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter(o => o.status !== "cancelled").forEach(o => {
      const local = new Date(new Date(o.createdAt).getTime() + TZ);
      const key = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + o.totalPrice / 100);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, total]) => ({ date: date.slice(5), total: Math.round(total) }));
  }, [orders]);

  // ── Day-closing validation ─────────────────────────────────────────────────
  const validation = useMemo<ValidationResult>(() => {
    const todayOrders = filterToday(orders);
    const done = todayOrders.filter(o => o.status === "done");
    const computed = done.reduce((a, o) => a + o.totalPrice / 100, 0);
    const reported = today?.totalRevenue ?? 0;
    const diff     = +(Math.abs(computed - reported)).toFixed(2);
    return { ok: diff < 0.5, computed: +computed.toFixed(2), reported, diff, ordersChecked: done.length };
  }, [orders, today]);

  const expectedCash = today?.cashRevenue ?? 0;
  const actualCash   = parseFloat(cashInput) || 0;
  const cashDiff     = +(actualCash - expectedCash).toFixed(2);
  const hasCashInput = cashInput.trim() !== "" && !isNaN(parseFloat(cashInput));

  // Export helpers
  function exportItemsCSV() {
    downloadCSV(
      periodItems.map((item, idx) => ({
        "الترتيب": idx + 1,
        "اسم الصنف": item.name,
        "الكمية المباعة": item.qty,
        "سعر الوحدة (ر.س)": item.unitPrice.toFixed(2),
        "إجمالي المبيعات (ر.س)": item.total.toFixed(2),
      })),
      `أصناف_${range.label}.csv`,
      true,
    );
  }

  function exportSummaryCSV() {
    downloadCSV(
      [
        { "البيان": "إجمالي المبيعات",    "القيمة (ر.س)": kpis.total.toFixed(2) },
        { "البيان": "صافي الإيرادات",     "القيمة (ر.س)": kpis.net.toFixed(2)   },
        { "البيان": "ضريبة 15%",          "القيمة (ر.س)": kpis.tax.toFixed(2)   },
        { "البيان": "إجمالي الخصومات",    "القيمة (ر.س)": kpis.disc.toFixed(2)  },
        { "البيان": "رسوم التوصيل",        "القيمة (ر.س)": kpis.delivery.toFixed(2) },
        { "البيان": "مبيعات نقدي",        "القيمة (ر.س)": kpis.cash.toFixed(2)  },
        { "البيان": "مبيعات إلكتروني",    "القيمة (ر.س)": kpis.online.toFixed(2)},
        { "البيان": "عدد الفواتير",        "القيمة (ر.س)": kpis.count            },
      ],
      `ملخص_محاسبي_${range.label}.csv`,
      true,
    );
  }

  function printAccountingReport() {
    const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
    const itemRows = periodItems.slice(0, 30).map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.name}</td>
        <td>${item.qty}</td>
        <td>${item.unitPrice.toFixed(2)} ر.س</td>
        <td>${item.total.toFixed(2)} ر.س</td>
      </tr>`).join("");
    const catRows = categorySales.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${c.name}</td>
        <td>${c.qty}</td>
        <td>${c.total.toFixed(2)} ر.س</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>تقرير المحاسبة — ${range.label}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Cairo,Arial,sans-serif;direction:rtl;padding:16px;font-size:12px;color:#111}
  h1{font-size:18px;text-align:center;margin-bottom:4px}
  .sub{text-align:center;color:#666;font-size:11px;margin-bottom:14px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;text-align:center}
  .kpi .n{font-size:16px;font-weight:700;color:#065f46}
  .kpi .l{font-size:10px;color:#666;margin-top:2px}
  h2{font-size:13px;font-weight:700;margin:12px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th{background:#f3f4f6;padding:6px;font-size:11px;font-weight:700;border-bottom:2px solid #d1d5db;text-align:right}
  td{padding:5px 6px;border-bottom:1px solid #f0f0f0;font-size:11px}
  @media print{body{padding:5mm}}
</style></head><body>
<h1>📊 تقرير المحاسبة — ${range.label}</h1>
<p class="sub">منتجات السلة للخضار والفواكه · مطبوع: ${now}</p>
<div class="kpis">
  <div class="kpi"><div class="n">${kpis.total.toFixed(2)} ر.س</div><div class="l">إجمالي المبيعات</div></div>
  <div class="kpi"><div class="n">${kpis.net.toFixed(2)} ر.س</div><div class="l">صافي الإيرادات</div></div>
  <div class="kpi"><div class="n">${kpis.tax.toFixed(2)} ر.س</div><div class="l">ضريبة 15%</div></div>
  <div class="kpi"><div class="n">${kpis.count}</div><div class="l">عدد الفواتير</div></div>
  <div class="kpi"><div class="n">${kpis.disc.toFixed(2)} ر.س</div><div class="l">إجمالي الخصومات</div></div>
  <div class="kpi"><div class="n">${kpis.delivery.toFixed(2)} ر.س</div><div class="l">رسوم التوصيل</div></div>
  <div class="kpi"><div class="n">${kpis.cash.toFixed(2)} ر.س</div><div class="l">مبيعات نقدي</div></div>
  <div class="kpi"><div class="n">${kpis.online.toFixed(2)} ر.س</div><div class="l">مبيعات إلكتروني</div></div>
</div>
<h2>📦 الأصناف الأكثر مبيعاً</h2>
<table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
<tbody>${itemRows}</tbody></table>
<h2>🗂️ مبيعات الفئات</h2>
<table><thead><tr><th>#</th><th>الفئة</th><th>الكمية</th><th>الإيرادات</th></tr></thead>
<tbody>${catRows}</tbody></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  }

  if (loading) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-40 rounded-2xl border bg-muted/30 animate-pulse" />)}</div>;
  }

  const totalSalesCat = categorySales.reduce((a, c) => a + c.total, 0);
  const avgOrder = kpis.nonCancelled > 0 ? kpis.total / kpis.nonCancelled : 0;

  return (
    <div className="space-y-8">

      {/* ══ DATE RANGE FILTER ══════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 print:p-3">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <span>📅</span> اختر الفترة الزمنية للتقرير
        </h3>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                preset === p.key
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100"
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {preset === "custom" && (
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label className="text-[11px] font-medium text-indigo-800 block mb-1">من تاريخ</label>
              <input type="date" value={fromStr} onChange={e => setFromStr(e.target.value)}
                className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-indigo-800 block mb-1">إلى تاريخ</label>
              <input type="date" value={toStr} onChange={e => setToStr(e.target.value)}
                className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3 mt-2">
          <p className="text-sm font-bold text-indigo-900">
            📊 {range.label}
            <span className="mr-2 font-normal text-indigo-600 text-xs">
              ({new Date(range.start).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}
              {" — "}
              {new Date(range.end.getTime() - 1000).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })})
            </span>
          </p>
          {/* Export / Print buttons */}
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <button
              onClick={exportSummaryCSV}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 border border-emerald-600 transition-colors shadow-sm">
              📊 Excel ملخص
            </button>
            <button
              onClick={exportItemsCSV}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 border border-violet-600 transition-colors shadow-sm">
              📦 Excel أصناف
            </button>
            <button
              onClick={printAccountingReport}
              className="flex items-center gap-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 border border-slate-700 transition-colors shadow-sm">
              🖨️ طباعة / PDF
            </button>
          </div>
        </div>
      </section>

      {/* ══ 7-CARD KPI STRIP ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          {
            icon: "💰", label: "إجمالي مبيعات اليوم",
            value: sarShort(today?.totalRevenue ?? 0),
            accent: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200",
          },
          {
            icon: "📆", label: "إجمالي مبيعات الشهر",
            value: sarShort(month?.totalRevenue ?? 0),
            accent: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
          },
          {
            icon: "🧾", label: "عدد طلبات الفترة",
            value: String(kpis.nonCancelled),
            accent: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200",
          },
          {
            icon: "📊", label: "متوسط قيمة الطلب",
            value: sarShort(avgOrder),
            accent: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200",
          },
          {
            icon: "🎟️", label: "إجمالي الخصومات",
            value: sarShort(kpis.disc),
            accent: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200",
          },
          {
            icon: "🚚", label: "رسوم التوصيل",
            value: sarShort(kpis.delivery),
            accent: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200",
          },
          {
            icon: "📈", label: "صافي الإيرادات",
            value: sarShort(kpis.net),
            accent: "text-green-700", bg: "bg-green-50", border: "border-green-200",
          },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border ${c.bg} ${c.border} p-4 print:p-3`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-lg">{c.icon}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{c.label}</p>
            </div>
            <p className={`text-lg font-bold ${c.accent} leading-none`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ══ CHARTS ROW ════════════════════════════════════════════════════════ */}
      <div className="grid gap-5 md:grid-cols-3 print:hidden">
        {/* Hourly sales */}
        <div className="md:col-span-2 rounded-2xl border bg-card p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <span>⏰</span> المبيعات حسب ساعات الفترة
          </h3>
          {hourlyData.every(h => h.total === 0) ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد مبيعات في هذه الفترة</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.07} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v > 999 ? (v / 1000).toFixed(1) + "K" : v} />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString("ar-SA")} ر.س`]}
                  contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                <Bar dataKey="total" name="المبيعات" radius={[4, 4, 0, 0]} maxBarSize={22}>
                  {hourlyData.map((h, i) => (
                    <Cell key={i} fill={h.total > 0 ? "#0c48ab" : "#e2e8f0"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment pie */}
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <span>💳</span> طرق الدفع — {range.label}
          </h3>
          {kpis.nonCancelled === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا بيانات</div>
          ) : (
            <div>
              <PieChart width={160} height={140}>
                <Pie
                  data={paymentBreakdown}
                  dataKey="total"
                  cx="50%" cy="50%"
                  outerRadius={65} innerRadius={32}
                  paddingAngle={3}
                >
                  {paymentBreakdown.map(p => <Cell key={p.key} fill={p.bar} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [sarShort(v)]} contentStyle={{ borderRadius: 10, fontSize: 11 }} />
              </PieChart>
              <div className="mt-2 space-y-2">
                {paymentBreakdown.map(p => (
                  <div key={p.key} className={`rounded-xl border ${p.bg} ${p.border} px-3 py-2.5`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${p.text}`}>{p.icon} {p.label}</span>
                      <span className={`text-xs font-bold ${p.text}`}>{p.pct.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{p.count} فاتورة</span>
                      <span className="font-semibold">{sar(p.total)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-black/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: p.bar }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ DAILY SALES CHART (last 30 days) ══════════════════════════════════ */}
      <div className="grid gap-5 md:grid-cols-2 print:hidden">
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <span>📈</span> المبيعات اليومية (آخر 30 يوم)
          </h3>
          {dailyFromOrders.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dailyFromOrders} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gAcct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0c48ab" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0c48ab" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.07} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v > 999 ? (v / 1000).toFixed(1) + "K" : v} />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString("ar-SA")} ر.س`]}
                  contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                <Area type="monotone" dataKey="total" stroke="#0c48ab" strokeWidth={2}
                  fill="url(#gAcct)" dot={false} name="المبيعات" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top items bar chart for period */}
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <span>🏆</span> أفضل الأصناف — {range.label}
          </h3>
          {periodItems.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">لا بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={periodItems.slice(0, 8)} layout="vertical" margin={{ right: 12, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => [v, "قطعة"]}
                  contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                <Bar dataKey="qty" name="qty" radius={[0, 6, 6, 0]} maxBarSize={16}>
                  {periodItems.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={`hsl(${220 + i * 12},65%,${58 - i * 2}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ══ ITEMS SOLD TABLE ══════════════════════════════════════════════════ */}
      <section className="rounded-2xl border bg-card p-5 print:p-3">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span>📦</span> الأصناف المباعة — {range.label}
            <span className="text-xs font-normal text-muted-foreground mr-1">
              ({periodItems.length} صنف · {periodItems.reduce((a, i) => a + i.qty, 0)} قطعة)
            </span>
          </h3>
          <button onClick={exportItemsCSV}
            className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors font-medium print:hidden">
            📊 تصدير Excel
          </button>
        </div>

        {periodItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <span className="text-4xl">📭</span>
            <p className="text-sm">لا توجد مبيعات في هذه الفترة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-[10px]">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["#", "اسم الصنف", "الكمية المباعة", "سعر الوحدة", "إجمالي المبيعات", "المساهمة"].map(h => (
                    <th key={h} className="py-2.5 px-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodItems.map((item, idx) => {
                  const periodTotal = periodItems.reduce((a, i) => a + i.total, 0);
                  const pct = periodTotal > 0 ? (item.total / periodTotal * 100) : 0;
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center h-5 min-w-[22px] rounded-full font-bold text-[10px] ${
                          idx === 0 ? "bg-amber-100 text-amber-800" :
                          idx === 1 ? "bg-slate-100 text-slate-600" :
                          idx === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium">{item.name}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center justify-center h-6 min-w-[28px] rounded-full bg-amber-100 text-amber-800 font-bold text-xs px-2">
                          {item.qty}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">
                        {sar(item.unitPrice / 100)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-700 whitespace-nowrap">
                        {sar(item.total)}
                      </td>
                      <td className="py-2.5 px-3 min-w-[100px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-muted bg-muted/20">
                  <td colSpan={2} className="py-2.5 px-3 text-xs font-bold">
                    المجموع: {periodItems.length} صنف
                  </td>
                  <td className="py-2.5 px-3 font-bold text-amber-700">
                    {periodItems.reduce((a, i) => a + i.qty, 0)} قطعة
                  </td>
                  <td />
                  <td className="py-2.5 px-3 font-bold text-emerald-700 text-base">
                    {sar(periodItems.reduce((a, i) => a + i.total, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ══ CATEGORY SUMMARY ══════════════════════════════════════════════════ */}
      <section className="rounded-2xl border bg-card p-5 print:p-3">
        <h3 className="font-bold text-sm mb-5 flex items-center gap-2">
          <span>🗂️</span> ملخص مبيعات الفئات — {range.label}
        </h3>
        {categorySales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm">لا توجد مبيعات</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categorySales.map((cat, idx) => {
              const pct = totalSalesCat > 0 ? (cat.total / totalSalesCat * 100) : 0;
              const color = catColor(cat.name, idx);
              return (
                <div key={cat.name} className="rounded-xl border bg-background p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ background: color }} />
                      <span className="font-bold text-sm">{cat.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{cat.qty} قطعة</span>
                    <span className="font-bold text-foreground">{sar(cat.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══ PAYMENT METHODS REPORT ════════════════════════════════════════════ */}
      <section className="rounded-2xl border bg-card p-5 print:p-3">
        <h3 className="font-bold text-sm mb-5 flex items-center gap-2">
          <span>💳</span> تقرير طرق الدفع — {range.label}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {paymentBreakdown.map(p => (
            <div key={p.key} className={`rounded-xl border ${p.bg} ${p.border} p-5`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{p.icon}</span>
                <div>
                  <p className={`font-bold text-base ${p.text}`}>{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.pct.toFixed(1)}% من إجمالي المبيعات</p>
                </div>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between border-b border-black/5 pb-2">
                  <span className="text-muted-foreground text-xs">عدد العمليات</span>
                  <span className="font-bold">{p.count} فاتورة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">إجمالي المبالغ</span>
                  <span className={`font-bold text-base ${p.text}`}>{sar(p.total)}</span>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-black/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: p.bar }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4">
          * التمييز بين مدى / Apple Pay / STC Pay يتطلب ربطاً مع بوابة الدفع الإلكتروني — حالياً يُجمَع تحت "إلكتروني"
        </p>
      </section>

      {/* ══ KPI SUMMARY FOR PERIOD (original) ════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: "🧾", label: "إجمالي الفواتير",     value: String(kpis.count),          accent: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200"   },
          { icon: "💰", label: "إجمالي المبيعات",     value: sarShort(kpis.total),        accent: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
          { icon: "📈", label: "صافي الإيرادات",      value: sarShort(kpis.net),          accent: "text-green-700",   bg: "bg-green-50",   border: "border-green-200"   },
          { icon: "🏛️", label: "ضريبة 15%",           value: sarShort(kpis.tax),          accent: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200"  },
          { icon: "💵", label: "مبيعات نقدي",          value: sarShort(kpis.cash),         accent: "text-cyan-700",    bg: "bg-cyan-50",    border: "border-cyan-200"    },
          { icon: "💳", label: "مبيعات إلكتروني",     value: sarShort(kpis.online),       accent: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200"  },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border ${c.bg} ${c.border} p-4`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-lg">{c.icon}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{c.label}</p>
            </div>
            <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ══ INVOICES TABLE ════════════════════════════════════════════════════ */}
      <section ref={invoiceRef} className="rounded-2xl border bg-card p-5 print:p-3">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span>🧾</span>
            فواتير {range.label}
          </h3>
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            {(["all", "completed", "cancelled"] as StatusFilter[]).map(f => {
              const count = f === "all" ? filtered.length
                          : f === "completed" ? filtered.filter(o => o.status !== "cancelled").length
                          : filtered.filter(o => o.status === "cancelled").length;
              const active = statusFilter === f;
              const colors =
                f === "completed" ? active ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              : f === "cancelled" ? active ? "bg-red-600 text-white border-red-600 shadow-sm"         : "bg-white text-red-700 border-red-200 hover:bg-red-50"
              :                     active ? "bg-slate-700 text-white border-slate-700 shadow-sm"      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50";
              return (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-all ${colors}`}>
                  {f === "all" ? "📋 الكل" : f === "completed" ? "✅ المكتملة" : "❌ الملغية"}
                  <span className="mr-1 opacity-75">({count})</span>
                </button>
              );
            })}
            <button
              onClick={() => printInvoices(tableRows, range, statusFilter)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-1.5 border border-indigo-600 transition-colors shadow-sm">
              🖨️ طباعة ({tableRows.length})
            </button>
          </div>
        </div>

        {tableRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <span className="text-4xl">📭</span>
            <p className="text-sm">لا توجد فواتير في هذه الفترة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-[10px]">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["#", "رقم يومي", "العميل", "الوقت", "الأصناف", "الإجمالي", "الدفع", "الحالة"].map(h => (
                    <th key={h} className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((o, i) => {
                  const isCancelled = o.status === "cancelled";
                  return (
                    <tr key={o.id} className={`border-b last:border-0 ${isCancelled ? "opacity-50 bg-red-50/30" : "hover:bg-muted/20"}`}>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3 font-bold text-primary">{o.dailyNumber}</td>
                      <td className="py-2 px-3">
                        <p className="font-medium text-sm">{o.customerName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{o.customerPhone}</p>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px]">
                        <span className="line-clamp-2">
                          {o.items.map(it => `${it.name} ×${it.quantity}`).join("، ")}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold text-emerald-700 whitespace-nowrap">
                        {sar(o.totalPrice / 100)}
                        {(o.discountAmount ?? 0) > 0 && (
                          <span className="block text-[10px] text-red-500 font-normal">
                            خصم: {sar((o.discountAmount ?? 0) / 100)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          o.paymentMethod === "cash"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}>
                          {o.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                          o.status === "done"       ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          o.status === "cancelled"  ? "bg-red-50 text-red-600 border-red-200" :
                          o.status === "preparing"  ? "bg-blue-50 text-blue-700 border-blue-200" :
                          o.status === "ready"      ? "bg-green-50 text-green-700 border-green-200" :
                                                      "bg-yellow-50 text-yellow-700 border-yellow-200"
                        }`}>
                          {STATUS_AR[o.status] ?? o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-muted bg-muted/20">
                  <td colSpan={5} className="py-2.5 px-3 text-xs font-bold text-right">
                    {statusFilter === "cancelled"
                      ? `${tableRows.length} فاتورة ملغاة`
                      : statusFilter === "completed"
                        ? `${tableRows.length} فاتورة مكتملة`
                        : `${kpis.nonCancelled} مكتملة · ${kpis.cancelled} ملغاة`}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-emerald-700 whitespace-nowrap text-base">
                    {sar(tableRows.filter(o => o.status !== "cancelled").reduce((a, o) => a + o.totalPrice / 100, 0))}
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-xs text-muted-foreground">
                    {statusFilter !== "cancelled" && <>نقدي: {sarShort(tableRows.filter(o => o.status !== "cancelled" && o.paymentMethod === "cash").reduce((a, o) => a + o.totalPrice / 100, 0))} · إلكتروني: {sarShort(tableRows.filter(o => o.status !== "cancelled" && o.paymentMethod !== "cash").reduce((a, o) => a + o.totalPrice / 100, 0))}</>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ══ REVENUE BREAKDOWN (fixed periods) ════════════════════════════════ */}
      <div className="grid gap-5 md:grid-cols-2">
        {[
          { label: "اليوم",       data: today, color: "border-emerald-200 bg-emerald-50" },
          { label: "هذا الأسبوع", data: week,  color: "border-blue-200 bg-blue-50"      },
          { label: "هذا الشهر",   data: month, color: "border-indigo-200 bg-indigo-50"  },
          { label: "هذا العام",   data: year,  color: "border-violet-200 bg-violet-50"  },
        ].map(({ label, data, color }) => (
          <section key={label} className={`rounded-2xl border ${color} p-5 print:p-3`}>
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
              <span>📊</span> ملخص الإيرادات — {label}
            </h3>
            <div className="space-y-2.5 text-sm">
              {[
                { label: "إجمالي الفواتير",          val: sarShort(data?.totalRevenue   ?? 0), strong: true  },
                { label: "إيرادات التوصيل",          val: sarShort(data?.deliveryRevenue ?? 0)               },
                { label: "إيرادات الأصناف",          val: sarShort(data?.itemsRevenue    ?? 0)               },
                { label: "ضريبة القيمة المضافة 15%", val: sarShort(data?.taxAmount       ?? 0)               },
                { label: "صافي الإيرادات*",          val: sarShort(data?.netRevenue      ?? 0), strong: true  },
                { label: "مبيعات نقدي",              val: sarShort(data?.cashRevenue     ?? 0)               },
                { label: "مبيعات إلكتروني",          val: sarShort(data?.onlineRevenue   ?? 0)               },
                { label: "قيمة الملغاة",             val: sarShort(data?.cancelledValue  ?? 0), warn: true    },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between border-b border-black/5 pb-2 last:border-0">
                  <span className={`text-xs ${row.warn ? "text-red-600" : "text-muted-foreground"}`}>{row.label}</span>
                  <span className={`font-medium text-xs ${row.strong ? "font-bold text-base" : ""} ${row.warn ? "text-red-600" : ""}`}>
                    {row.val}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              * صافي الإيرادات = الإجمالي − ضريبة 15%
            </p>
          </section>
        ))}
      </div>

      {/* ══ DAY CLOSING VALIDATION ════════════════════════════════════════════ */}
      <section className={`rounded-2xl border p-5 print:p-3 ${validation.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <span>{validation.ok ? "✅" : "⚠️"}</span>
          مطابقة إغلاق اليومية
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">المحسوب من الفواتير</p>
            <p className="text-xl font-bold">{sar(validation.computed)}</p>
            <p className="text-[10px] text-muted-foreground">{validation.ordersChecked} فاتورة مكتملة</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">المُبلَّغ في نظام الإيرادات</p>
            <p className="text-xl font-bold">{sar(validation.reported)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">الفرق</p>
            <p className={`text-xl font-bold ${validation.ok ? "text-emerald-700" : "text-red-600"}`}>
              {sar(validation.diff)}
            </p>
          </div>
        </div>
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${validation.ok
          ? "bg-emerald-100 text-emerald-800"
          : "bg-red-100 text-red-700"
        }`}>
          {validation.ok
            ? "✅ الحسابات متطابقة — لا يوجد فرق في الأرقام"
            : `⚠️ تحذير: يوجد فرق ${sar(validation.diff)} بين مجموع الفواتير وتقرير الإيرادات`
          }
        </div>
      </section>

      {/* ══ CASH RECONCILIATION ═══════════════════════════════════════════════ */}
      <section className="rounded-2xl border bg-card p-5 print:p-3">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <span>💵</span> مطابقة الصندوق النقدي اليوم
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/30 border p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الكاش المتوقع (من الطلبات)</span>
                <span className="font-bold text-emerald-700">{sar(expectedCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">عدد فواتير نقدي</span>
                <span className="font-medium">{today?.cashCount ?? 0}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                أدخل الكاش الفعلي في الصندوق (ر.س)
              </label>
              <input type="number" step="0.01" value={cashInput}
                onChange={e => setCashInput(e.target.value)}
                placeholder="مثال: 1250.50"
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="flex flex-col justify-center">
            {hasCashInput ? (
              <div className={`rounded-2xl border p-5 text-center ${cashDiff === 0 ? "border-emerald-200 bg-emerald-50" : cashDiff > 0 ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
                <p className="text-xs text-muted-foreground mb-2">نتيجة المطابقة</p>
                <p className={`text-3xl font-bold mb-2 ${cashDiff === 0 ? "text-emerald-700" : cashDiff > 0 ? "text-blue-700" : "text-red-600"}`}>
                  {cashDiff >= 0 ? "+" : ""}{sar(cashDiff)}
                </p>
                <p className={`text-sm font-semibold ${cashDiff === 0 ? "text-emerald-700" : cashDiff > 0 ? "text-blue-700" : "text-red-600"}`}>
                  {cashDiff === 0 ? "✅ الصندوق مطابق تماماً"
                    : cashDiff > 0 ? "📈 زيادة في الصندوق"
                    : "📉 عجز في الصندوق"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  الفعلي: {sar(actualCash)} · المتوقع: {sar(expectedCash)}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-muted-foreground/30 p-8 text-center text-muted-foreground">
                <p className="text-3xl mb-2">💵</p>
                <p className="text-sm">أدخل الكاش الفعلي لحساب الفرق</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ UNAVAILABLE ═══════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 print:hidden">
        <h3 className="font-bold text-sm mb-3 text-gray-600 flex items-center gap-2">
          <span>🚫</span> بيانات محاسبية غير متوفرة في قاعدة البيانات الحالية
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: "💸", label: "إجمالي المصروفات",  note: "يتطلب إضافة جدول expenses للنظام" },
            { icon: "📊", label: "صافي الربح الحقيقي", note: "يتطلب تكلفة كل صنف (COGS)"        },
            { icon: "↩️", label: "المرتجعات",          note: "لا يوجد جدول returns"              },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 opacity-60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{item.icon}</span>
                <span className="font-semibold text-sm text-gray-500">{item.label}</span>
              </div>
              <p className="text-xs text-gray-400">{item.note}</p>
              <p className="text-lg font-bold text-gray-300 mt-2">— غير متوفر</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
