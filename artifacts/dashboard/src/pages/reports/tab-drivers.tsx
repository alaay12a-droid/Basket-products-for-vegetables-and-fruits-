import { useState, useMemo, useEffect } from "react";
import { sar } from "./utils";
import { downloadCSV } from "./export-utils";

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// ── Saudi time helpers (same as tab-accounting) ──────────────────────────────
const TZ = 3 * 60 * 60 * 1000;
function saudiParts(d = new Date()) {
  const l = new Date(d.getTime() + TZ);
  return { y: l.getUTCFullYear(), mo: l.getUTCMonth(), day: l.getUTCDate() };
}
function saudiMidnight(y: number, mo: number, day: number) {
  return new Date(Date.UTC(y, mo, day) - TZ);
}
function toDateStr(d: Date) {
  const l = new Date(d.getTime() + TZ);
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, "0")}-${String(l.getUTCDate()).padStart(2, "0")}`;
}

type Preset = "today" | "yesterday" | "this_week" | "this_month" | "this_year" | "custom";
interface DateRange { start: Date; end: Date; fromStr: string; toStr: string; label: string }

function computeRange(preset: Preset, fromStr: string, toStr: string): DateRange {
  const { y, mo, day } = saudiParts();
  const localNow = new Date(Date.now() + TZ);
  const dow = localNow.getUTCDay();
  const days = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

  switch (preset) {
    case "today": {
      const s = saudiMidnight(y, mo, day);
      return { start: s, end: days(s, 1), fromStr: toDateStr(s), toStr: toDateStr(s), label: "اليوم" };
    }
    case "yesterday": {
      const s = saudiMidnight(y, mo, day - 1);
      return { start: s, end: days(s, 1), fromStr: toDateStr(s), toStr: toDateStr(s), label: "الأمس" };
    }
    case "this_week": {
      const s = saudiMidnight(y, mo, day - dow);
      const e = days(s, 7);
      return { start: s, end: e, fromStr: toDateStr(s), toStr: toDateStr(days(e, -1)), label: "هذا الأسبوع" };
    }
    case "this_month": {
      const s = saudiMidnight(y, mo, 1);
      const e = saudiMidnight(y, mo + 1, 1);
      return { start: s, end: e, fromStr: toDateStr(s), toStr: toDateStr(days(e, -1)), label: "هذا الشهر" };
    }
    case "this_year": {
      const s = saudiMidnight(y, 0, 1);
      const e = saudiMidnight(y + 1, 0, 1);
      return { start: s, end: e, fromStr: toDateStr(s), toStr: toDateStr(days(e, -1)), label: `عام ${y}` };
    }
    case "custom": {
      const s = fromStr ? new Date(`${fromStr}T00:00:00+03:00`) : saudiMidnight(y, mo, day);
      const e = toStr   ? new Date(`${toStr}T23:59:59+03:00`)   : days(s, 1);
      return { start: s, end: new Date(e.getTime() + 1000), fromStr, toStr, label: `${fromStr} → ${toStr}` };
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Delivery {
  orderId: number; dailyNumber: number | null; customerName: string;
  customerPhone: string; totalPrice: number; paymentMethod: string;
  deliveredAt: string | null; customerAddress: string | null;
}
interface DriverStat {
  driverId: number; driverName: string; deliveryCount: number;
  totalCollected: number; cashCollected: number; electronicCollected: number;
  deliveries: Delivery[];
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today",      label: "اليوم"       },
  { key: "yesterday",  label: "الأمس"       },
  { key: "this_week",  label: "هذا الأسبوع" },
  { key: "this_month", label: "هذا الشهر"   },
  { key: "this_year",  label: "هذا العام"   },
  { key: "custom",     label: "مخصص"        },
];

// ── Print helper ─────────────────────────────────────────────────────────────
function printDriverReport(drivers: DriverStat[], rangeLabel: string) {
  const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
  const grandTotal     = drivers.reduce((s, d) => s + d.totalCollected, 0);
  const grandCash      = drivers.reduce((s, d) => s + d.cashCollected, 0);
  const grandElectronic = drivers.reduce((s, d) => s + d.electronicCollected, 0);
  const grandCount     = drivers.reduce((s, d) => s + d.deliveryCount, 0);

  const driverRows = drivers.map((d, i) => {
    const detailRows = d.deliveries.map(del => {
      const dt = del.deliveredAt
        ? new Date(del.deliveredAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "—";
      return `<tr class="detail-row">
        <td colspan="2"></td>
        <td>${del.dailyNumber ?? "—"}</td>
        <td>${del.customerName}</td>
        <td>${del.customerPhone}</td>
        <td>${del.customerAddress ?? "—"}</td>
        <td><strong>${del.totalPrice.toFixed(2)} ر.س</strong></td>
        <td>${del.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}</td>
        <td>${dt}</td>
      </tr>`;
    }).join("");

    return `<tr class="driver-row">
      <td>${i + 1}</td>
      <td><strong>${d.driverName}</strong></td>
      <td colspan="2" style="text-align:center">${d.deliveryCount} توصيلة</td>
      <td colspan="2"></td>
      <td><strong style="color:#065f46">${d.totalCollected.toFixed(2)} ر.س</strong></td>
      <td>💵 ${d.cashCollected.toFixed(2)} · 💳 ${d.electronicCollected.toFixed(2)}</td>
      <td></td>
    </tr>
    ${detailRows}`;
  }).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>تقرير المندوبين — ${rangeLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Cairo,Arial,sans-serif;direction:rtl;padding:16px;font-size:12px;color:#111}
  h1{font-size:18px;text-align:center;margin-bottom:4px}
  .sub{text-align:center;color:#666;font-size:11px;margin-bottom:14px}
  .summary{display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap}
  .sc{border:1px solid #e5e7eb;border-radius:8px;padding:8px 16px;text-align:center}
  .sc .n{font-size:18px;font-weight:700;color:#065f46}
  .sc .l{font-size:10px;color:#666}
  table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:6px;font-size:11px;font-weight:700;border-bottom:2px solid #d1d5db;text-align:right}
  td{padding:5px 6px;border-bottom:1px solid #f0f0f0;font-size:11px;vertical-align:top}
  .driver-row{background:#eff6ff}
  .detail-row td{color:#444;background:#fafafa}
  @media print{body{padding:5mm}}
</style></head><body>
<h1>🛵 تقرير المندوبين — ${rangeLabel}</h1>
<p class="sub">منتجات السلة للخضار والفواكه · مطبوع: ${now}</p>
<div class="summary">
  <div class="sc"><div class="n">${grandCount}</div><div class="l">إجمالي التوصيلات</div></div>
  <div class="sc"><div class="n">${grandTotal.toFixed(2)} ر.س</div><div class="l">إجمالي المحصّل</div></div>
  <div class="sc"><div class="n">${grandCash.toFixed(2)} ر.س</div><div class="l">نقدي</div></div>
  <div class="sc"><div class="n">${grandElectronic.toFixed(2)} ر.س</div><div class="l">إلكتروني</div></div>
  <div class="sc"><div class="n">${drivers.length}</div><div class="l">عدد المندوبين</div></div>
</div>
<table>
<thead><tr>
  <th>#</th><th>المندوب</th><th>رقم الطلب</th><th>العميل</th>
  <th>الجوال</th><th>العنوان</th><th>المبلغ</th><th>طريقة الدفع</th><th>وقت التسليم</th>
</tr></thead>
<tbody>${driverRows}</tbody>
</table>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TabDrivers() {
  const [preset,   setPreset]   = useState<Preset>("today");
  const [fromStr,  setFromStr]  = useState("");
  const [toStr,    setToStr]    = useState("");
  const [drivers,  setDrivers]  = useState<DriverStat[]>([]);
  const [fetching, setFetching] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const range = useMemo(() => computeRange(preset, fromStr, toStr), [preset, fromStr, toStr]);

  useEffect(() => {
    setFetching(true);
    const params = new URLSearchParams({ from: range.fromStr, to: range.toStr });
    fetch(`${API}/api/drivers/report?${params}`)
      .then(r => r.json())
      .then(data => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => setDrivers([]))
      .finally(() => setFetching(false));
  }, [range.fromStr, range.toStr]);

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const grandTotal      = drivers.reduce((s, d) => s + d.totalCollected, 0);
  const grandCash       = drivers.reduce((s, d) => s + d.cashCollected, 0);
  const grandElectronic = drivers.reduce((s, d) => s + d.electronicCollected, 0);
  const grandCount      = drivers.reduce((s, d) => s + d.deliveryCount, 0);

  function exportCSV() {
    const rows: Record<string, string | number>[] = [];
    for (const d of drivers) {
      for (const del of d.deliveries) {
        rows.push({
          "المندوب":        d.driverName,
          "رقم الطلب اليومي": del.dailyNumber ?? "",
          "العميل":         del.customerName,
          "الجوال":         del.customerPhone,
          "العنوان":        del.customerAddress ?? "",
          "المبلغ (ر.س)":  del.totalPrice.toFixed(2),
          "طريقة الدفع":   del.paymentMethod === "cash" ? "نقدي" : "إلكتروني",
          "وقت التسليم":   del.deliveredAt
            ? new Date(del.deliveredAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })
            : "",
        });
      }
    }
    downloadCSV(rows, `تقرير_المندوبين_${range.label}.csv`, true);
  }

  return (
    <div className="space-y-8">

      {/* ══ DATE RANGE FILTER ═══════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <span>📅</span> اختر الفترة الزمنية
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                preset === p.key
                  ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                  : "bg-white text-teal-700 border-teal-200 hover:bg-teal-100"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[11px] font-medium text-teal-800 block mb-1">من تاريخ</label>
              <input type="date" value={fromStr} onChange={e => setFromStr(e.target.value)}
                className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-teal-800 block mb-1">إلى تاريخ</label>
              <input type="date" value={toStr} onChange={e => setToStr(e.target.value)}
                className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
          </div>
        )}
        <p className="text-xs text-teal-700 mt-3 font-medium">
          الفترة: <span className="font-bold">{range.label}</span>
        </p>
      </section>

      {/* ══ KPIs ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: "🛵", label: "إجمالي التوصيلات", value: String(grandCount),                accent: "text-teal-700",   bg: "bg-teal-50",   border: "border-teal-200"   },
          { icon: "💰", label: "إجمالي المحصّل",   value: `${grandTotal.toFixed(2)} ر.س`,     accent: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
          { icon: "💵", label: "نقدي",             value: `${grandCash.toFixed(2)} ر.س`,      accent: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200"  },
          { icon: "💳", label: "إلكتروني",         value: `${grandElectronic.toFixed(2)} ر.س`, accent: "text-blue-700",  bg: "bg-blue-50",   border: "border-blue-200"   },
          { icon: "👷", label: "المندوبون",         value: String(drivers.length),             accent: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border ${c.bg} ${c.border} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{c.icon}</span>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
            <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ══ Actions ═════════════════════════════════════════════════════════ */}
      <div className="flex gap-2 flex-wrap print:hidden">
        <button onClick={() => printDriverReport(drivers, range.label)}
          className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 bg-background hover:bg-muted transition-colors font-medium">
          🖨️ طباعة التقرير
        </button>
        <button onClick={exportCSV} disabled={drivers.length === 0}
          className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 bg-background hover:bg-muted transition-colors font-medium disabled:opacity-40">
          📊 تصدير Excel
        </button>
      </div>

      {/* ══ Drivers table ════════════════════════════════════════════════════ */}
      {fetching ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl border bg-muted/30 animate-pulse" />)}
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <span className="text-5xl">🛵</span>
          <p className="font-medium">لا توجد توصيلات في هذه الفترة</p>
        </div>
      ) : (
        <div className="space-y-4">
          {drivers.map(d => (
            <section key={d.driverId} className="rounded-2xl border bg-card overflow-hidden">
              {/* Driver header row */}
              <button
                onClick={() => toggleExpand(d.driverId)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-lg flex-shrink-0">
                    🛵
                  </div>
                  <div>
                    <p className="font-bold text-sm">{d.driverName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.deliveryCount} توصيلة
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap justify-end">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">إجمالي المحصّل</p>
                    <p className="font-bold text-emerald-700">{sar(d.totalCollected)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">نقدي</p>
                    <p className="font-semibold text-amber-700">{sar(d.cashCollected)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">إلكتروني</p>
                    <p className="font-semibold text-blue-700">{sar(d.electronicCollected)}</p>
                  </div>
                  <span className="text-muted-foreground text-sm ml-2">
                    {expanded.has(d.driverId) ? "▲" : "▼"}
                  </span>
                </div>
              </button>

              {/* Deliveries detail */}
              {expanded.has(d.driverId) && (
                <div className="border-t">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b">
                          {["رقم الطلب","العميل","الجوال","العنوان","المبلغ","الدفع","وقت التسليم"].map(h => (
                            <th key={h} className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.deliveries.map(del => (
                          <tr key={del.orderId} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="py-2 px-3 text-xs font-mono">
                              {del.dailyNumber ? `#${del.dailyNumber}` : "—"}
                            </td>
                            <td className="py-2 px-3 text-xs font-medium">{del.customerName || "—"}</td>
                            <td className="py-2 px-3 text-xs font-mono text-muted-foreground">{del.customerPhone || "—"}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground max-w-[160px] truncate">
                              {del.customerAddress || "—"}
                            </td>
                            <td className="py-2 px-3 font-bold text-emerald-700 whitespace-nowrap">
                              {del.totalPrice.toFixed(2)} ر.س
                            </td>
                            <td className="py-2 px-3 text-xs whitespace-nowrap">
                              {del.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                              {del.deliveredAt
                                ? new Date(del.deliveredAt).toLocaleString("ar-SA", {
                                    timeZone: "Asia/Riyadh", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-teal-50 font-bold text-sm border-t-2">
                          <td colSpan={4} className="py-2 px-3 text-xs">
                            المجموع: {d.deliveryCount} توصيلة
                          </td>
                          <td className="py-2 px-3 text-emerald-700">{sar(d.totalCollected)}</td>
                          <td colSpan={2} className="py-2 px-3 text-xs">
                            💵 {sar(d.cashCollected)} · 💳 {sar(d.electronicCollected)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </section>
          ))}

          {/* Grand total */}
          {drivers.length > 1 && (
            <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-4 flex flex-wrap items-center justify-between gap-4">
              <p className="font-bold text-sm text-teal-900">
                📊 الإجمالي الكلي — {drivers.length} مندوبين · {grandCount} توصيلة
              </p>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="text-center">
                  <p className="text-[11px] text-teal-700">إجمالي المحصّل</p>
                  <p className="font-bold text-emerald-700 text-lg">{sar(grandTotal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-teal-700">نقدي</p>
                  <p className="font-bold text-amber-700">{sar(grandCash)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-teal-700">إلكتروني</p>
                  <p className="font-bold text-blue-700">{sar(grandElectronic)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
