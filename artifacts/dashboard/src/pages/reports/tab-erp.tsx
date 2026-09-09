import { useState, useMemo } from "react";
import { Order } from "@workspace/api-client-react";

// ── Category mapping ──────────────────────────────────────────────────────────
const ITEM_CATEGORY: Record<string, string> = {
  c1:"chicken",c2:"chicken",c3:"chicken",c4:"chicken",c5:"chicken",
  c6:"chicken",c7:"chicken",c8:"chicken",
  ma1:"chicken",ma2:"chicken",ma3:"chicken",ma4:"chicken",
  m1:"meat",m2:"meat",m3:"meat",m4:"meat",h1:"meat",h2:"meat",
  s1:"sides",s2:"sides",s5:"sides",
  sa1:"salads",sa2:"salads",sa3:"salads",
  d1:"desserts",d2:"desserts",d3:"desserts",d4:"desserts",
  dr1:"drinks",dr2:"drinks",dr3:"drinks",dr4:"drinks",dr5:"drinks",
  dr6:"drinks",dr7:"drinks",dr8:"drinks",dr9:"drinks",dr10:"drinks",
  dr11:"drinks",dr12:"drinks",dr13:"drinks",dr14:"drinks",dr15:"drinks",
  e2:"extras",e3:"extras",e4:"extras",e5:"extras",e6:"extras",
  e7:"extras",e8:"extras",e9:"extras",e10:"extras",e11:"extras",e12:"extras",
};

const CATEGORY_AR: Record<string, string> = {
  chicken:"دجاج", meat:"لحوم", sides:"أطباق جانبية",
  salads:"سلطات", desserts:"حلويات", drinks:"مشروبات",
  extras:"إضافات", unknown:"أخرى",
};

const CATEGORY_ORDER = ["chicken","meat","sides","salads","desserts","drinks","extras","unknown"];

// ── Saudi time helpers ────────────────────────────────────────────────────────
const TZ_OFFSET = 3 * 60 * 60 * 1000; // UTC+3

function toSaudiDateStr(d: Date): string {
  const local = new Date(d.getTime() + TZ_OFFSET);
  return local.toISOString().slice(0, 10);
}

function todayStr(): string { return toSaudiDateStr(new Date()); }

// ── Number helpers ────────────────────────────────────────────────────────────
function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt0(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Preset type ───────────────────────────────────────────────────────────────
type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "this_year" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today",      label: "اليوم"       },
  { key: "yesterday",  label: "الأمس"       },
  { key: "this_week",  label: "هذا الأسبوع" },
  { key: "this_month", label: "هذا الشهر"   },
  { key: "this_year",  label: "هذا العام"   },
  { key: "custom",     label: "مخصص"        },
];

function presetToDates(preset: DatePreset): { from: string; to: string } | null {
  if (preset === "custom") return null;
  const now     = new Date();
  const TZ      = 3 * 60 * 60 * 1000;
  const local   = new Date(now.getTime() + TZ);
  const y = local.getUTCFullYear(), mo = local.getUTCMonth(), day = local.getUTCDate();
  const dow = local.getUTCDay();

  function fmt(d: Date) {
    const l = new Date(d.getTime() + TZ);
    return `${l.getUTCFullYear()}-${String(l.getUTCMonth()+1).padStart(2,"0")}-${String(l.getUTCDate()).padStart(2,"0")}`;
  }
  function midnight(yy: number, mm: number, dd: number) {
    return new Date(Date.UTC(yy, mm, dd) - TZ);
  }

  switch (preset) {
    case "today":      { const s = midnight(y,mo,day);      return { from: fmt(s), to: fmt(s) }; }
    case "yesterday":  { const s = midnight(y,mo,day-1);    return { from: fmt(s), to: fmt(s) }; }
    case "this_week":  { const s = midnight(y,mo,day-dow);  const e = midnight(y,mo,day-dow+6); return { from: fmt(s), to: fmt(e) }; }
    case "this_month": { const s = midnight(y,mo,1);        const e = midnight(y,mo+1,1); const eDay = new Date(e.getTime()-86400000); return { from: fmt(s), to: fmt(eDay) }; }
    case "this_year":  { const s = midnight(y,0,1);         const e = new Date(midnight(y+1,0,1).getTime()-86400000); return { from: fmt(s), to: fmt(e) }; }
    default: return null;
  }
}

// ── Row types ─────────────────────────────────────────────────────────────────
interface ItemRow {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
  revenue: number; // price × qty (VAT inclusive)
  tax: number;     // revenue × 15/115
  discount: number;
  serviceCharge: number;
  net: number;     // revenue − tax
}

interface InvoiceRow {
  orderId: number;
  ref: string;
  date: string;
  time: string;
  customer: string;
  paymentMethod: string;
  itemCount: number;
  revenue: number;
  discount: number;
  tax: number;
  net: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { orders: Order[]; loading: boolean; }

// ── Report subtypes ───────────────────────────────────────────────────────────
type ReportSubtype = "groups" | "items" | "date";
type ViewMode = "summary" | "detail";

const SUBTYPES: { id: ReportSubtype; label: string }[] = [
  { id: "groups", label: "مجموعات الوجبات" },
  { id: "items",  label: "الوجبات" },
  { id: "date",   label: "تاريخ" },
];

const PAGE_SIZES = [10, 25, 50, 100];

// ─────────────────────────────────────────────────────────────────────────────
export function TabErp({ orders, loading }: Props) {
  const [dateFrom,     setDateFrom]     = useState(todayStr());
  const [dateTo,       setDateTo]       = useState(todayStr());
  const [timeFrom,     setTimeFrom]     = useState("00:00");
  const [timeTo,       setTimeTo]       = useState("23:59");
  const [payment,      setPayment]      = useState<"all"|"cash"|"moyasar">("all");
  const [subtype,      setSubtype]      = useState<ReportSubtype>("groups");
  const [viewMode,     setViewMode]     = useState<ViewMode>("summary");
  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(25);
  const [activePreset, setActivePreset] = useState<DatePreset>("today");
  const [applied,      setApplied]      = useState({ dateFrom: todayStr(), dateTo: todayStr(), timeFrom: "00:00", timeTo: "23:59", payment: "all" as "all"|"cash"|"moyasar" });

  function applyFilters(overrides?: { dateFrom?: string; dateTo?: string; timeFrom?: string; timeTo?: string }) {
    setApplied({
      dateFrom:  overrides?.dateFrom  ?? dateFrom,
      dateTo:    overrides?.dateTo    ?? dateTo,
      timeFrom:  overrides?.timeFrom  ?? timeFrom,
      timeTo:    overrides?.timeTo    ?? timeTo,
      payment,
    });
    setPage(1);
  }

  function selectPreset(preset: DatePreset) {
    setActivePreset(preset);
    if (preset === "custom") return; // keep current date inputs, wait for user
    const dates = presetToDates(preset);
    if (!dates) return;
    setDateFrom(dates.from);
    setDateTo(dates.to);
    setTimeFrom("00:00");
    setTimeTo("23:59");
    // auto-apply immediately
    setApplied({ dateFrom: dates.from, dateTo: dates.to, timeFrom: "00:00", timeTo: "23:59", payment });
    setPage(1);
  }

  function handlePrint() {
    const periodLabel =
      applied.dateFrom === applied.dateTo
        ? `${applied.dateFrom}  ${applied.timeFrom} – ${applied.timeTo}`
        : `${applied.dateFrom} ${applied.timeFrom}  إلى  ${applied.dateTo} ${applied.timeTo}`;

    const payLabel =
      applied.payment === "cash" ? "نقداً" :
      applied.payment === "moyasar" ? "إلكتروني" : "الكل";

    const subtypeLabel =
      subtype === "groups" ? "مجموعات الوجبات" :
      subtype === "items"  ? "الوجبات" : "تاريخ";

    const viewLabel = viewMode === "summary" ? "إجمالي حسب الوجبة" : "تفصيل حسب الفاتورة";

    /* ── Build table HTML ── */
    let tableHtml = "";

    if (viewMode === "summary") {
      // Group items by category (all items, no pagination)
      const catMap = new Map<string, ItemRow[]>();
      for (const r of flatItems) {
        const arr = catMap.get(r.category) ?? [];
        arr.push(r);
        catMap.set(r.category, arr);
      }
      const cats = [
        ...CATEGORY_ORDER.filter(c => catMap.has(c)),
        ...Array.from(catMap.keys()).filter(c => !CATEGORY_ORDER.includes(c)),
      ];

      tableHtml = `
        <table>
          <thead>
            <tr class="header-row">
              <th>اسم الصنف</th>
              <th>المجموعة</th>
              <th>السعر</th>
              <th>الكمية</th>
              <th>الإجمالي</th>
              <th>الضريبة 15%</th>
              <th>الخصم</th>
              <th>الصافي</th>
            </tr>
          </thead>
          <tbody>
            ${cats.map(cat => {
              const rows = catMap.get(cat)!;
              const label  = CATEGORY_AR[cat] || cat;
              return `
                <tr class="group-row">
                  <td colspan="8"><strong>${label}</strong></td>
                </tr>
                ${rows.map(r => `
                  <tr class="item-row">
                    <td class="indent">${r.name}</td>
                    <td>${label}</td>
                    <td>${fmt2(r.unitPrice)}</td>
                    <td>${r.qty}</td>
                    <td>${fmt2(r.revenue)}</td>
                    <td>${fmt2(r.tax)}</td>
                    <td>0.00</td>
                    <td>${fmt2(r.net)}</td>
                  </tr>
                `).join("")}
              `;
            }).join("")}
            <tr class="totals-row">
              <td colspan="2"><strong>الإجمالي الكلي</strong></td>
              <td></td>
              <td><strong>${fmt0(totals.qty)}</strong></td>
              <td><strong>${fmt2(totals.revenue)}</strong></td>
              <td><strong>${fmt2(totals.tax)}</strong></td>
              <td><strong>${fmt2(totals.discount)}</strong></td>
              <td><strong>${fmt2(totals.net)}</strong></td>
            </tr>
          </tbody>
        </table>`;
    } else {
      tableHtml = `
        <table>
          <thead>
            <tr class="header-row">
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الوقت</th>
              <th>العميل</th>
              <th>طريقة الدفع</th>
              <th>الأصناف</th>
              <th>الإجمالي</th>
              <th>الخصم</th>
              <th>الضريبة 15%</th>
              <th>الصافي</th>
            </tr>
          </thead>
          <tbody>
            <tr class="totals-row">
              <td colspan="6"><strong>الإجمالي الكلي (${fmt0(filteredInvoices.length)} فاتورة)</strong></td>
              <td><strong>${fmt2(invTotals.revenue)}</strong></td>
              <td><strong>${fmt2(invTotals.discount)}</strong></td>
              <td><strong>${fmt2(invTotals.tax)}</strong></td>
              <td><strong>${fmt2(invTotals.net)}</strong></td>
            </tr>
            ${filteredInvoices.map(r => `
              <tr>
                <td>#${r.ref}</td>
                <td>${r.date}</td>
                <td>${r.time}</td>
                <td>${r.customer}</td>
                <td>${r.paymentMethod}</td>
                <td>${r.itemCount}</td>
                <td>${fmt2(r.revenue)}</td>
                <td>${r.discount > 0 ? fmt2(r.discount) : "—"}</td>
                <td>${fmt2(r.tax)}</td>
                <td>${fmt2(r.net)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>`;
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>تقرير المبيعات</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; direction: rtl; }
    .page { padding: 16mm 12mm; }
    /* Header */
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #C8171A; padding-bottom: 8px; margin-bottom: 10px; }
    .restaurant-name { font-size: 16px; font-weight: 800; color: #C8171A; }
    .restaurant-sub  { font-size: 10px; color: #555; margin-top: 2px; }
    .report-meta { text-align: left; font-size: 10px; color: #444; }
    .report-meta strong { color: #111; }
    /* Info bar */
    .info-bar { display: flex; flex-wrap: wrap; gap: 16px; background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 10.5px; }
    .info-item { display: flex; gap: 4px; }
    .info-label { color: #777; }
    .info-value { font-weight: 700; color: #111; }
    /* Table */
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th, td { padding: 5px 8px; text-align: right; border: 1px solid #ddd; white-space: nowrap; }
    .header-row th { background: #1a2e1a; color: #E8920C; font-weight: 700; font-size: 10px; }
    .totals-row td { background: #fff8e1; font-weight: 700; color: #7a5c00; }
    .group-row td { background: #f5f5f5; font-weight: 600; }
    .item-row td { background: #fff; }
    .indent { padding-right: 20px !important; }
    tr:nth-child(even):not(.totals-row):not(.group-row) { background: #fafafa; }
    /* Footer */
    .footer { margin-top: 12px; border-top: 1px solid #ddd; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9.5px; color: #777; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="restaurant-name">سلة الخضار</div>
      <div class="restaurant-sub">للمذاق فن وأصول — تبوك، حي الروضة</div>
    </div>
    <div class="report-meta">
      <div><strong>تقرير المبيعات</strong> — ${subtypeLabel}</div>
      <div>${viewLabel}</div>
      <div>طباعة: ${new Date().toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"})}</div>
    </div>
  </div>
  <div class="info-bar">
    <div class="info-item"><span class="info-label">الفترة:</span><span class="info-value">${periodLabel}</span></div>
    <div class="info-item"><span class="info-label">طريقة الدفع:</span><span class="info-value">${payLabel}</span></div>
    <div class="info-item"><span class="info-label">عدد الفواتير:</span><span class="info-value">${fmt0(filtered.length)}</span></div>
    <div class="info-item"><span class="info-label">إجمالي الصافي:</span><span class="info-value">${viewMode==="summary" ? fmt2(totals.net) : fmt2(invTotals.net)} ر.س</span></div>
  </div>
  ${tableHtml}
  <div class="footer">
    <span>سلة الخضار</span>
    <span>تقرير آلي — جميع المبالغ بالريال السعودي</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // ── Filter orders ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const fromMs = new Date(`${applied.dateFrom}T${applied.timeFrom}:00+03:00`).getTime();
    const toMs   = new Date(`${applied.dateTo}T${applied.timeTo}:00+03:00`).getTime() + 60_000;
    return orders.filter(o => {
      if (o.status === "cancelled") return false;
      const t = new Date(o.createdAt).getTime();
      if (t < fromMs || t > toMs) return false;
      if (applied.payment !== "all" && o.paymentMethod !== applied.payment) return false;
      return true;
    });
  }, [orders, applied]);

  // ── Build item rows ────────────────────────────────────────────────────────
  const itemRows = useMemo<ItemRow[]>(() => {
    const map = new Map<string, ItemRow>();
    for (const order of filtered) {
      for (const item of order.items) {
        const rev    = item.price * item.quantity;
        const tax    = rev * 15 / 115;
        const cur    = map.get(item.id);
        if (cur) {
          cur.qty      += item.quantity;
          cur.revenue  += rev;
          cur.tax      += tax;
          cur.net      += rev - tax;
        } else {
          map.set(item.id, {
            id: item.id,
            name: item.name,
            category: ITEM_CATEGORY[item.id] ?? "unknown",
            unitPrice: item.price,
            qty: item.quantity,
            revenue: rev,
            tax,
            discount: 0,
            serviceCharge: 0,
            net: rev - tax,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  // ── Build invoice rows ─────────────────────────────────────────────────────
  const invoiceRows = useMemo<InvoiceRow[]>(() => {
    return filtered.map(o => {
      const rev      = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const disc     = o.discountAmount ?? 0;
      const afterDisc = rev - disc;
      const tax      = afterDisc * 15 / 115;
      const net      = afterDisc - tax;
      const d        = new Date(o.createdAt);
      const local    = new Date(d.getTime() + TZ_OFFSET);
      return {
        orderId: o.id,
        ref: String(o.id).padStart(6, "0"),
        date: local.toISOString().slice(0,10),
        time: local.toISOString().slice(11,16),
        customer: o.customerName,
        paymentMethod: o.paymentMethod === "cash" ? "نقداً" : "إلكتروني",
        itemCount: o.items.length,
        revenue: rev,
        discount: disc,
        tax,
        net,
      };
    }).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [filtered]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    qty:     itemRows.reduce((s, r) => s + r.qty, 0),
    revenue: itemRows.reduce((s, r) => s + r.revenue, 0),
    tax:     itemRows.reduce((s, r) => s + r.tax, 0),
    net:     itemRows.reduce((s, r) => s + r.net, 0),
    discount:itemRows.reduce((s, r) => s + r.discount, 0),
  }), [itemRows]);

  // ── Grouped items for summary view ─────────────────────────────────────────
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const rows = q ? itemRows.filter(r => r.name.includes(q) || CATEGORY_AR[r.category]?.includes(q)) : itemRows;
    const map = new Map<string, ItemRow[]>();
    for (const r of rows) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ cat: c, rows: map.get(c)! }));
  }, [itemRows, search]);

  // ── Flat paginated item list (for summary pagination) ──────────────────────
  const flatItems = useMemo(() => grouped.flatMap(g => g.rows), [grouped]);
  const totalPages = Math.max(1, Math.ceil(flatItems.length / pageSize));
  const pagedItems = flatItems.slice((page-1)*pageSize, page*pageSize);
  const pagedCategories = useMemo(() => {
    const q = search.toLowerCase();
    const rows = q ? itemRows.filter(r => r.name.includes(q) || CATEGORY_AR[r.category]?.includes(q)) : itemRows;
    const pageIds = new Set(pagedItems.map(r => r.id));
    const map = new Map<string, ItemRow[]>();
    for (const r of rows) {
      if (!pageIds.has(r.id)) continue;
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ cat: c, rows: map.get(c)! }));
  }, [pagedItems, itemRows, search]);

  // ── Invoice pagination ─────────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase();
    return q ? invoiceRows.filter(r => r.customer.includes(q) || r.ref.toLowerCase().includes(q) || r.paymentMethod.includes(q)) : invoiceRows;
  }, [invoiceRows, search]);
  const invTotalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const pagedInvoices = filteredInvoices.slice((page-1)*pageSize, page*pageSize);

  const invTotals = useMemo(() => ({
    revenue:  filteredInvoices.reduce((s,r) => s+r.revenue, 0),
    discount: filteredInvoices.reduce((s,r) => s+r.discount, 0),
    tax:      filteredInvoices.reduce((s,r) => s+r.tax, 0),
    net:      filteredInvoices.reduce((s,r) => s+r.net, 0),
  }), [filteredInvoices]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg border bg-muted/30 animate-pulse" />)}
      </div>
    );
  }

  // ── Rendered ───────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="space-y-4">

      {/* ── Filter Panel ──────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm">

        {/* ── Preset buttons ── */}
        <div className="p-4 border-b">
          <p className="text-xs font-semibold text-muted-foreground mb-3">📅 اختر الفترة الزمنية</p>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map(p => (
              <button key={p.key} onClick={() => selectPreset(p.key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                  activePreset === p.key
                    ? "bg-[#1a2e1a] text-[#E8920C] border-[#1a2e1a] shadow-sm"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Custom date/time inputs (shown only for مخصص) ── */}
        {activePreset === "custom" && (
          <div className="p-4 border-b bg-muted/20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Date from */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">من تاريخ</label>
                <div className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 bg-background focus-within:ring-1 focus-within:ring-primary/30">
                  <span className="text-muted-foreground text-sm">📅</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none" />
                </div>
              </div>
              {/* Date to */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">إلى تاريخ</label>
                <div className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 bg-background focus-within:ring-1 focus-within:ring-primary/30">
                  <span className="text-muted-foreground text-sm">📅</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none" />
                </div>
              </div>
              {/* Time from */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">من وقت</label>
                <div className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 bg-background focus-within:ring-1 focus-within:ring-primary/30">
                  <span className="text-muted-foreground text-sm">🕐</span>
                  <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none" />
                </div>
              </div>
              {/* Time to */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">إلى وقت</label>
                <div className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 bg-background focus-within:ring-1 focus-within:ring-primary/30">
                  <span className="text-muted-foreground text-sm">🕐</span>
                  <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none" />
                </div>
              </div>
            </div>
            <button onClick={() => applyFilters()}
              className="px-6 py-2 rounded-md bg-[#C8171A] text-white text-sm font-bold hover:bg-[#a81215] transition-colors shadow-sm">
              ✅ عرض النتائج
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-3">
          {/* Payment type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">طريقة الدفع</label>
            <div className="flex rounded-md border overflow-hidden text-xs font-medium">
              {([["all","الكل"],["cash","نقداً"],["moyasar","إلكتروني"]] as [string,string][]).map(([v,l]) => (
                <button key={v} onClick={() => { setPayment(v as typeof payment); if (activePreset !== "custom") { setApplied(a => ({ ...a, payment: v as typeof payment })); setPage(1); } }}
                  className={`flex-1 py-2 transition-colors ${payment===v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Active period label */}
          <div className="flex flex-col justify-end">
            <p className="text-xs text-muted-foreground">
              الفترة المطبّقة:{" "}
              <span className="font-bold text-foreground">
                {applied.dateFrom === applied.dateTo
                  ? `${applied.dateFrom}  ${applied.timeFrom} – ${applied.timeTo}`
                  : `${applied.dateFrom} → ${applied.dateTo}`}
              </span>
            </p>
          </div>
        </div>

        {/* ── Report subtypes ──────────────────────────────────────────── */}
        <div className="border-t px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">نوع التقرير :</p>
          <div className="flex flex-wrap gap-2">
            {SUBTYPES.map(s => (
              <button key={s.id} onClick={() => { setSubtype(s.id); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                  subtype === s.id
                    ? "bg-[#1a2e1a] text-[#E8920C] border-[#1a2e1a] shadow-sm"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}>
                {s.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground self-center mr-2">
              ({filtered.length} فاتورة · {fmt0(totals.qty)} صنف)
            </span>
          </div>
        </div>
      </div>

      {/* ── View mode + Search ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => { setViewMode("summary"); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              viewMode==="summary"
                ? "bg-[#C8171A] text-white border-[#C8171A] shadow"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}>
            إجمالي حسب الوجبة
          </button>
          <button onClick={() => { setViewMode("detail"); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              viewMode==="detail"
                ? "bg-[#C8171A] text-white border-[#C8171A] shadow"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}>
            تفصيل حسب الفاتورة
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border rounded-md px-3 py-1.5 bg-card w-48 focus-within:ring-1 focus-within:ring-primary/30">
            <span className="text-muted-foreground text-sm">🔍</span>
            <input placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="flex-1 text-sm bg-transparent outline-none" />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            )}
          </div>
          <button onClick={() => {
            const rows = viewMode==="summary" ? flatItems : filteredInvoices;
            if (!rows.length) return;
            const csv = viewMode==="summary"
              ? [["اسم الصنف","المجموعة","السعر","الكمية","الإجمالي","الضريبة 15%","الخصم","الصافي"],
                 ...flatItems.map(r => [r.name, CATEGORY_AR[r.category]||r.category, fmt2(r.unitPrice), r.qty, fmt2(r.revenue), fmt2(r.tax), fmt2(r.discount), fmt2(r.net)])]
              : [["رقم الفاتورة","التاريخ","الوقت","العميل","طريقة الدفع","الأصناف","الإجمالي","الخصم","الضريبة","الصافي"],
                 ...filteredInvoices.map(r => [r.ref, r.date, r.time, r.customer, r.paymentMethod, r.itemCount, fmt2(r.revenue), fmt2(r.discount), fmt2(r.tax), fmt2(r.net)])];
            const content = "\uFEFF" + csv.map(row => row.join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
            a.download = `تقرير_${viewMode==="summary"?"مجموعات":"فواتير"}_${applied.dateFrom}.csv`;
            a.click();
          }} className="flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 bg-card hover:bg-muted transition-colors font-medium">
            📊 تصدير CSV
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 bg-card hover:bg-muted transition-colors font-medium">
            🖨️ طباعة
          </button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">

        {/* Drag zone (decorative, ERP style) */}
        <div className="flex items-center justify-center py-2 border-b bg-muted/20 text-xs text-muted-foreground select-none">
          <span className="opacity-60">⠿ اسحب رأس العمود هنا لتجميع البيانات حسبه</span>
        </div>

        <div className="overflow-x-auto">

          {/* ── SUMMARY VIEW ─────────────────────────────────────────── */}
          {viewMode === "summary" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
                  <th className="py-2.5 px-4 text-right min-w-[180px]">
                    <span className="flex items-center gap-1">اسم الصنف <span className="text-[10px] opacity-50">▼</span></span>
                  </th>
                  <th className="py-2.5 px-4 text-right">المجموعة</th>
                  <th className="py-2.5 px-4 text-right">
                    <span className="flex items-center gap-1">السعر <span className="text-[10px] opacity-50">▼</span></span>
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    <span className="flex items-center gap-1">الكمية <span className="text-[10px] opacity-50">▼</span></span>
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    الإجمالي
                  </th>
                  <th className="py-2.5 px-4 text-right">الضريبة 15%</th>
                  <th className="py-2.5 px-4 text-right">الخصم</th>
                  <th className="py-2.5 px-4 text-right font-bold">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {pagedCategories.length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">لا توجد بيانات</td></tr>
                )}

                {pagedCategories.map(({ cat, rows }) => {
                  const label    = CATEGORY_AR[cat] || cat;
                  return [
                    /* Group header row */
                    <tr key={`g-${cat}`}
                      className="border-b bg-muted/30">
                      <td colSpan={8} className="py-2 px-4 font-bold text-sm">{label}</td>
                    </tr>,
                    /* Item rows */
                    ...rows.map(r => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                        <td className="py-2 px-4 text-sm pr-8">{r.name}</td>
                        <td className="py-2 px-4 text-sm">{label}</td>
                        <td className="py-2 px-4 text-sm tabular-nums">{fmt2(r.unitPrice)}</td>
                        <td className="py-2 px-4">
                          <span className="inline-flex items-center justify-center h-5 min-w-[24px] rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-xs">
                            {r.qty}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-sm tabular-nums">{fmt2(r.revenue)}</td>
                        <td className="py-2 px-4 text-sm tabular-nums text-muted-foreground">{fmt2(r.tax)}</td>
                        <td className="py-2 px-4 text-sm tabular-nums text-muted-foreground">0.00</td>
                        <td className="py-2 px-4 text-sm tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmt2(r.net)}</td>
                      </tr>
                    ))
                  ];
                })}

                {pagedCategories.length > 0 && (
                  <tr className="border-b bg-amber-50/60 dark:bg-amber-950/20 font-bold text-sm">
                    <td colSpan={2} className="py-2 px-4 text-amber-800 dark:text-amber-400">الإجمالي الكلي</td>
                    <td className="py-2 px-4"></td>
                    <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt0(totals.qty)}</td>
                    <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt2(totals.revenue)}</td>
                    <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt2(totals.tax)}</td>
                    <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt2(totals.discount)}</td>
                    <td className="py-2 px-4 text-emerald-700 dark:text-emerald-400">{fmt2(totals.net)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── DETAIL VIEW ─────────────────────────────────────────── */}
          {viewMode === "detail" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
                  <th className="py-2.5 px-4 text-right">رقم الفاتورة</th>
                  <th className="py-2.5 px-4 text-right">التاريخ</th>
                  <th className="py-2.5 px-4 text-right">الوقت</th>
                  <th className="py-2.5 px-4 text-right">العميل</th>
                  <th className="py-2.5 px-4 text-right">طريقة الدفع</th>
                  <th className="py-2.5 px-4 text-right">الأصناف</th>
                  <th className="py-2.5 px-4 text-right">الإجمالي</th>
                  <th className="py-2.5 px-4 text-right">الخصم</th>
                  <th className="py-2.5 px-4 text-right">الضريبة 15%</th>
                  <th className="py-2.5 px-4 text-right font-bold">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {/* Totals row */}
                <tr className="border-b bg-amber-50/60 dark:bg-amber-950/20 font-bold text-sm">
                  <td className="py-2 px-4 text-amber-800 dark:text-amber-400" colSpan={6}>الإجمالي الكلي ({fmt0(filteredInvoices.length)} فاتورة)</td>
                  <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt2(invTotals.revenue)}</td>
                  <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt2(invTotals.discount)}</td>
                  <td className="py-2 px-4 text-amber-800 dark:text-amber-400">{fmt2(invTotals.tax)}</td>
                  <td className="py-2 px-4 text-emerald-700 dark:text-emerald-400">{fmt2(invTotals.net)}</td>
                </tr>

                {pagedInvoices.length === 0 && (
                  <tr><td colSpan={10} className="py-12 text-center text-muted-foreground text-sm">لا توجد فواتير</td></tr>
                )}

                {pagedInvoices.map(r => (
                  <tr key={r.orderId} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="py-2 px-4 font-mono text-xs font-bold text-primary">#{r.ref}</td>
                    <td className="py-2 px-4 text-xs tabular-nums">{r.date}</td>
                    <td className="py-2 px-4 text-xs tabular-nums text-muted-foreground">{r.time}</td>
                    <td className="py-2 px-4 text-sm">{r.customer}</td>
                    <td className="py-2 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        r.paymentMethod === "نقداً"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                          : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                      }`}>{r.paymentMethod}</span>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className="inline-flex items-center justify-center h-5 min-w-[24px] rounded-full bg-muted text-muted-foreground font-bold text-xs">{r.itemCount}</span>
                    </td>
                    <td className="py-2 px-4 tabular-nums text-sm">{fmt2(r.revenue)}</td>
                    <td className="py-2 px-4 tabular-nums text-sm text-muted-foreground">{r.discount > 0 ? fmt2(r.discount) : "—"}</td>
                    <td className="py-2 px-4 tabular-nums text-sm text-muted-foreground">{fmt2(r.tax)}</td>
                    <td className="py-2 px-4 tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">{fmt2(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>عدد الصفوف:</span>
            <select value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1); }}
              className="border rounded px-2 py-1 bg-background text-foreground text-xs">
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>
              {viewMode==="summary"
                ? `${fmt0(flatItems.length)} صنف`
                : `${fmt0(filteredInvoices.length)} فاتورة`}
              {" · صفحة "}
              {page} من {viewMode==="summary" ? totalPages : invTotalPages}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <NavBtn onClick={() => setPage(1)} disabled={page===1} label="|‹"/>
            <NavBtn onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} label="‹"/>
            {Array.from({length: Math.min(5, viewMode==="summary"?totalPages:invTotalPages)}, (_, i) => {
              const tp = viewMode==="summary" ? totalPages : invTotalPages;
              let start = Math.max(1, page - 2);
              if (start + 4 > tp) start = Math.max(1, tp - 4);
              const p2 = start + i;
              if (p2 > tp) return null;
              return (
                <button key={p2} onClick={() => setPage(p2)}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                    p2===page ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}>{p2}</button>
              );
            })}
            <NavBtn onClick={() => setPage(p => Math.min(viewMode==="summary"?totalPages:invTotalPages, p+1))} disabled={page===(viewMode==="summary"?totalPages:invTotalPages)} label="›"/>
            <NavBtn onClick={() => setPage(viewMode==="summary"?totalPages:invTotalPages)} disabled={page===(viewMode==="summary"?totalPages:invTotalPages)} label="›|"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavBtn({ onClick, disabled, label }: { onClick: ()=>void; disabled: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-7 h-7 rounded text-xs font-mono transition-colors disabled:opacity-30 hover:bg-muted disabled:cursor-not-allowed">
      {label}
    </button>
  );
}
