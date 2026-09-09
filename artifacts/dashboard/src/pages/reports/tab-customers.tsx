import { useState, useMemo, Fragment } from "react";
import { Order } from "@workspace/api-client-react";
import { sarShort, sar, filterToday } from "./utils";
import { downloadCSV } from "./export-utils";

// ── Saudi time helpers ────────────────────────────────────────────────────────
const TZ = 3 * 60 * 60 * 1000;
function saudiParts(d = new Date()) {
  const l = new Date(d.getTime() + TZ);
  return { y: l.getUTCFullYear(), mo: l.getUTCMonth(), day: l.getUTCDate() };
}
function saudiMidnight(y: number, mo: number, day: number) {
  return new Date(Date.UTC(y, mo, day) - TZ);
}

type CustPreset = "all" | "today" | "yesterday" | "this_week" | "this_month" | "custom";
interface CustRange { start: Date | null; end: Date | null; label: string }

function computeCustRange(preset: CustPreset, fromStr: string, toStr: string): CustRange {
  if (preset === "all") return { start: null, end: null, label: "كل الوقت" };
  const { y, mo, day } = saudiParts();
  const localNow = new Date(Date.now() + TZ);
  const dow = localNow.getUTCDay();
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
    case "this_week": {
      const s = saudiMidnight(y, mo, day - dow);
      return { start: s, end: days(s, 7), label: "هذا الأسبوع" };
    }
    case "this_month": {
      const s = saudiMidnight(y, mo, 1);
      return { start: s, end: saudiMidnight(y, mo + 1, 1), label: "هذا الشهر" };
    }
    case "custom": {
      const s = fromStr ? new Date(`${fromStr}T00:00:00+03:00`) : saudiMidnight(y, mo, day);
      const e = toStr   ? new Date(`${toStr}T23:59:59+03:00`)   : days(s, 1);
      return { start: s, end: new Date(e.getTime() + 1000), label: `${fromStr || "?"} → ${toStr || "?"}` };
    }
  }
}

const CUST_PRESETS: { key: CustPreset; label: string }[] = [
  { key: "all",        label: "كل الوقت"    },
  { key: "today",      label: "اليوم"       },
  { key: "yesterday",  label: "الأمس"       },
  { key: "this_week",  label: "هذا الأسبوع" },
  { key: "this_month", label: "هذا الشهر"   },
  { key: "custom",     label: "مخصص"        },
];

interface CustomerStat {
  phone:       string;
  name:        string;
  orderCount:  number;
  totalSpent:  number;
  lastOrder:   string;
  avgOrder:    number;
}

function buildCustomerStats(orders: Order[]): CustomerStat[] {
  const map = new Map<string, CustomerStat>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const cur = map.get(o.customerPhone) ?? {
      phone: o.customerPhone, name: o.customerName,
      orderCount: 0, totalSpent: 0, lastOrder: o.createdAt, avgOrder: 0,
    };
    cur.orderCount++;
    cur.totalSpent += o.totalPrice / 100;
    if (new Date(o.createdAt) > new Date(cur.lastOrder)) cur.lastOrder = o.createdAt;
    if (!cur.name && o.customerName) cur.name = o.customerName;
    map.set(o.customerPhone, cur);
  }
  return Array.from(map.values())
    .map(c => ({ ...c, avgOrder: c.totalSpent / c.orderCount }))
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

// ── Top-customer discount reward ─────────────────────────────────────────────
function TopCustomerReward({ customer }: { customer: CustomerStat }) {
  const [open,    setOpen]    = useState(false);
  const [type,    setType]    = useState<"fixed"|"percentage">("fixed");
  const [value,   setValue]   = useState("20");
  const [minOrder,setMinOrder] = useState("100");
  const [maxUses, setMaxUses] = useState("1");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  function generateCode(): string {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `VIP-${suffix}`;
  }

  async function handleCreate() {
    setLoading(true); setError(null); setResult(null);
    const code = generateCode();
    try {
      const res = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""}/api/discount-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          type,
          value:    parseInt(value)    || 0,
          minOrder: parseInt(minOrder) || 0,
          maxUses:  parseInt(maxUses)  || 1,
          description: `تحفيز لأفضل عميل — ${customer.phone}`,
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "حدث خطأ"); }
      else         { setResult(data.code); }
    } catch { setError("تعذّر الاتصال بالخادم"); }
    finally { setLoading(false); }
  }

  function copyCode() {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function toWhatsAppPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("966")) return digits;
    if (digits.startsWith("0"))   return "966" + digits.slice(1);
    return "966" + digits;
  }

  function openWhatsApp() {
    if (!result) return;
    const phone = toWhatsAppPhone(customer.phone);
    const discountText = type === "fixed"
      ? `خصم ${value} ر.س على طلبك القادم (الحد الأدنى ${minOrder} ر.س)`
      : `خصم ${value}% على طلبك القادم (الحد الأدنى ${minOrder} ر.س)`;
    const msg = encodeURIComponent(
      `🎁 هدية من سلة الخضار\n\n` +
      `عزيزنا العميل المميز، شكراً لك على ولائك! 🏆\n` +
      `إليك كود خصم خاص:\n\n` +
      `🎟️ *${result}*\n\n` +
      `${discountText}\n` +
      `يُستخدم مرة واحدة فقط.\n\n` +
      `سلة الخضار 🥬`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-yellow-50 p-5 print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-amber-400 flex items-center justify-center text-2xl shadow-sm">🏆</div>
          <div>
            <p className="font-bold text-sm text-amber-900">العميل الأكثر شراءً</p>
            <p className="text-xs text-amber-700 font-mono mt-0.5">{customer.phone}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-amber-800">
              <span>{customer.orderCount} طلب</span>
              <span>·</span>
              <span className="font-bold">{sar(customer.totalSpent)}</span>
            </div>
          </div>
        </div>
        {!result && (
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-400 hover:bg-amber-500 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            🎟️ {open ? "إلغاء" : "منح كود خصم"}
          </button>
        )}
      </div>

      {/* Form */}
      {open && !result && (
        <div className="mt-4 pt-4 border-t border-amber-200 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Type */}
            <div>
              <label className="text-[11px] font-medium text-amber-800 block mb-1">نوع الخصم</label>
              <select value={type} onChange={e => setType(e.target.value as "fixed"|"percentage")}
                className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-amber-300">
                <option value="fixed">مبلغ ثابت (ر.س)</option>
                <option value="percentage">نسبة مئوية (%)</option>
              </select>
            </div>
            {/* Value */}
            <div>
              <label className="text-[11px] font-medium text-amber-800 block mb-1">
                {type === "fixed" ? "قيمة الخصم (ر.س)" : "نسبة الخصم (%)"}
              </label>
              <input type="number" min="1" value={value} onChange={e => setValue(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            {/* Min order */}
            <div>
              <label className="text-[11px] font-medium text-amber-800 block mb-1">الحد الأدنى للطلب (ر.س)</label>
              <input type="number" min="0" value={minOrder} onChange={e => setMinOrder(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            {/* Max uses */}
            <div>
              <label className="text-[11px] font-medium text-amber-800 block mb-1">عدد مرات الاستخدام</label>
              <input type="number" min="1" value={maxUses} onChange={e => setMaxUses(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {error}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || !value}
            className="w-full sm:w-auto rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-sm px-6 py-2.5 transition-colors"
          >
            {loading ? "جاري الإنشاء…" : "✨ إنشاء الكود"}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 pt-4 border-t border-amber-200 space-y-3">
          <p className="text-xs font-medium text-amber-800">✅ تم إنشاء كود الخصم بنجاح!</p>

          {/* Code display */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-xl border-2 border-amber-400 bg-white px-5 py-3">
              <span className="font-mono font-bold text-xl tracking-widest text-amber-700">{result}</span>
            </div>
            <button onClick={copyCode}
              className="rounded-xl border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold text-sm px-4 py-3 transition-colors">
              {copied ? "✅ تم النسخ!" : "📋 نسخ الكود"}
            </button>
          </div>

          <p className="text-[11px] text-amber-600">
            {type === "fixed" ? `خصم ${value} ر.س` : `خصم ${value}%`}
            {` · الحد الأدنى ${minOrder} ر.س · يُستخدم ${maxUses} مرة`}
          </p>

          {/* WhatsApp button */}
          <button
            onClick={openWhatsApp}
            className="flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-sm px-5 py-3 transition-colors shadow-sm w-full sm:w-auto justify-center"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.12 1.523 5.854L.057 23.25a.75.75 0 0 0 .916.919l5.516-1.453A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.652-.52-5.163-1.427l-.37-.22-3.828 1.008 1.028-3.736-.242-.387A10 10 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            إرسال عبر واتساب لـ {customer.phone}
          </button>
          <p className="text-[10px] text-amber-500">
            سيفتح واتساب مع رسالة جاهزة تحتوي الكود — أرسلها بضغطة واحدة
          </p>
        </div>
      )}
    </div>
  );
}

interface Props { orders: Order[]; loading: boolean; }

export function TabCustomers({ orders, loading }: Props) {
  const [preset,   setPreset]   = useState<CustPreset>("all");
  const [fromStr,  setFromStr]  = useState("");
  const [toStr,    setToStr]    = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const range = useMemo(() => computeCustRange(preset, fromStr, toStr), [preset, fromStr, toStr]);

  const filteredOrders = useMemo(() => {
    if (!range.start || !range.end) return orders;
    return orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= range.start! && d < range.end!;
    });
  }, [orders, range]);

  const filteredCustomers = useMemo(() => buildCustomerStats(filteredOrders), [filteredOrders]);
  const allCustomers      = useMemo(() => buildCustomerStats(orders), [orders]);
  const todayOrders       = useMemo(() => filterToday(orders), [orders]);
  const todayCustomers    = useMemo(() => buildCustomerStats(todayOrders), [todayOrders]);

  const displayCustomers = filteredCustomers;
  const returning = displayCustomers.filter(c => c.orderCount > 1).length;
  const newCust   = displayCustomers.filter(c => c.orderCount === 1).length;

  // Orders per customer (for detail view)
  const ordersByPhone = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of filteredOrders) {
      if (o.status === "cancelled") continue;
      const list = map.get(o.customerPhone) ?? [];
      list.push(o);
      map.set(o.customerPhone, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return map;
  }, [filteredOrders]);

  function toggleExpand(phone: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  }

  function exportCustomers() {
    downloadCSV(
      displayCustomers.map((c, idx) => ({
        "الترتيب": idx + 1,
        "الجوال": maskPhone(c.phone),
        "عدد الطلبات": c.orderCount,
        "إجمالي الإنفاق (ر.س)": c.totalSpent.toFixed(2),
        "متوسط الطلب (ر.س)": c.avgOrder.toFixed(2),
        "آخر طلب": new Date(c.lastOrder).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }),
      })),
      `عملاء_تفصيل_${range.label}.csv`,
      true,
    );
  }

  function printCustomerReport() {
    const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
    const rows = displayCustomers.slice(0, 50).map((c, i) => {
      const cOrders = ordersByPhone.get(c.phone) ?? [];
      const detailRows = cOrders.slice(0, 5).map(o => {
        const items = o.items.map(it => `${it.name} ×${it.quantity}`).join("، ");
        const dt = new Date(o.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" });
        return `<tr style="background:#fafafa;font-size:10px">
          <td colspan="2"></td>
          <td>${o.dailyNumber ?? "—"}</td>
          <td style="font-size:10px">${items}</td>
          <td>${(o.totalPrice / 100).toFixed(2)} ر.س</td>
          <td>${o.paymentMethod === "cash" ? "نقدي" : "إلكتروني"}</td>
          <td>${dt}</td>
        </tr>`;
      }).join("");
      return `<tr style="background:#eff6ff">
        <td>${i + 1}</td>
        <td>${maskPhone(c.phone)}</td>
        <td colspan="2"><strong>${c.orderCount} طلب</strong></td>
        <td><strong>${c.totalSpent.toFixed(2)} ر.س</strong></td>
        <td>${c.avgOrder.toFixed(2)} ر.س</td>
        <td>${new Date(c.lastOrder).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</td>
      </tr>${detailRows}`;
    }).join("");

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>تقرير العملاء تفصيل — ${range.label}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Cairo,Arial,sans-serif;direction:rtl;padding:16px;font-size:12px;color:#111}
  h1{font-size:18px;text-align:center;margin-bottom:4px}
  .sub{text-align:center;color:#666;font-size:11px;margin-bottom:14px}
  .summary{display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap}
  .sc{border:1px solid #e5e7eb;border-radius:8px;padding:8px 16px;text-align:center}
  .sc .n{font-size:18px;font-weight:700;color:#065f46}.sc .l{font-size:10px;color:#666}
  table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:6px;font-size:11px;font-weight:700;border-bottom:2px solid #d1d5db;text-align:right}
  td{padding:5px 6px;border-bottom:1px solid #f0f0f0;font-size:11px;vertical-align:top}
  @media print{body{padding:5mm}}
</style></head><body>
<h1>👥 تقرير العملاء تفصيل — ${range.label}</h1>
<p class="sub">سلة الخضار · مطبوع: ${now}</p>
<div class="summary">
  <div class="sc"><div class="n">${displayCustomers.length}</div><div class="l">عدد العملاء</div></div>
  <div class="sc"><div class="n">${returning}</div><div class="l">متكررون</div></div>
  <div class="sc"><div class="n">${newCust}</div><div class="l">جدد</div></div>
  <div class="sc"><div class="n">${displayCustomers.reduce((s, c) => s + c.totalSpent, 0).toFixed(2)} ر.س</div><div class="l">إجمالي الإنفاق</div></div>
</div>
<table>
<thead><tr><th>#</th><th>الجوال</th><th>رقم الطلب</th><th>الأصناف / التفاصيل</th><th>المبلغ</th><th>الدفع</th><th>التاريخ</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  }

  if (loading) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-40 rounded-2xl border bg-muted/30 animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-8">

      {/* ══ DATE RANGE FILTER ════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <span>📅</span> اختر الفترة الزمنية
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {CUST_PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                preset === p.key
                  ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                  : "bg-white text-purple-700 border-purple-200 hover:bg-purple-100"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[11px] font-medium text-purple-800 block mb-1">من تاريخ</label>
              <input type="date" value={fromStr} onChange={e => setFromStr(e.target.value)}
                className="rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-purple-800 block mb-1">إلى تاريخ</label>
              <input type="date" value={toStr} onChange={e => setToStr(e.target.value)}
                className="rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
            </div>
          </div>
        )}
        <p className="text-xs text-purple-700 mt-3 font-medium">
          الفترة: <span className="font-bold">{range.label}</span>
          {" · "}عدد الطلبات: <span className="font-bold">{filteredOrders.filter(o => o.status !== "cancelled").length}</span>
        </p>
      </section>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: "👥", label: "عدد العملاء",       value: String(displayCustomers.length),  accent: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"    },
          { icon: "🔄", label: "عملاء متكررون",      value: String(returning),                accent: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
          { icon: "🆕", label: "عملاء جدد",          value: String(newCust),                  accent: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200"  },
          { icon: "📅", label: "عملاء اليوم (كلي)",  value: String(todayCustomers.length),    accent: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border ${c.bg} ${c.border} p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{c.icon}</span>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
            <p className={`text-3xl font-bold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Top customer reward */}
      {allCustomers.length > 0 && (
        <TopCustomerReward customer={allCustomers[0]} />
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap print:hidden">
        <button onClick={printCustomerReport}
          className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 bg-background hover:bg-muted transition-colors font-medium">
          🖨️ طباعة التقرير
        </button>
        <button onClick={exportCustomers}
          className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors font-medium">
          📊 تصدير Excel
        </button>
      </div>

      {/* Detailed customers table */}
      <section className="rounded-2xl border bg-card p-5 print:p-3">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <span>🏆</span> العملاء تفصيل — {range.label}
          <span className="text-xs font-normal text-muted-foreground mr-1">
            ({displayCustomers.length} عميل)
          </span>
        </h3>
        {displayCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm">لا توجد بيانات في هذه الفترة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground w-8">#</th>
                  {["الجوال","الطلبات","إجمالي الإنفاق","متوسط الطلب","آخر طلب",""].map(h => (
                    <th key={h} className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayCustomers.map((c, idx) => {
                  const cOrders = ordersByPhone.get(c.phone) ?? [];
                  const isOpen  = expanded.has(c.phone);
                  return (
                    <Fragment key={c.phone}>
                      <tr className="border-b hover:bg-muted/10">
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                            idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-gray-300 text-gray-700" : idx === 2 ? "bg-orange-300 text-white" : "bg-muted text-muted-foreground"
                          }`}>{idx + 1}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs">{maskPhone(c.phone)}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1">
                            <span className="font-bold text-primary">{c.orderCount}</span>
                            {c.orderCount > 3 && <span className="text-[10px] text-emerald-600 font-semibold">متكرر</span>}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-700">{sar(c.totalSpent)}</td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">{sarShort(c.avgOrder)}</td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">
                          {new Date(c.lastOrder).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" })}
                        </td>
                        <td className="py-2.5 px-3">
                          {cOrders.length > 0 && (
                            <button
                              onClick={() => toggleExpand(c.phone)}
                              className="text-xs border rounded-lg px-2 py-1 hover:bg-muted transition-colors font-medium text-muted-foreground whitespace-nowrap"
                            >
                              {isOpen ? "▲ إخفاء" : "▼ تفصيل"}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expandable order rows */}
                      {isOpen && cOrders.map(o => (
                        <tr key={o.id} className="bg-purple-50/50 border-b border-purple-100 text-xs">
                          <td className="py-1.5 px-3"></td>
                          <td className="py-1.5 px-3 font-mono text-muted-foreground">
                            #{o.dailyNumber ?? o.id}
                          </td>
                          <td className="py-1.5 px-3" colSpan={2}>
                            <span className="text-muted-foreground">
                              {o.items.slice(0, 3).map(it => `${it.name} ×${it.quantity}`).join("، ")}
                              {o.items.length > 3 && ` +${o.items.length - 3}`}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-semibold text-emerald-700 whitespace-nowrap">
                            {(o.totalPrice / 100).toFixed(2)} ر.س
                          </td>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                            {o.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}
                          </td>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                            {new Date(o.createdAt).toLocaleString("ar-SA", {
                              timeZone: "Asia/Riyadh", month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Privacy note */}
      <p className="text-[11px] text-muted-foreground text-center print:hidden">
        🔒 أرقام الجوال مُخفية جزئياً للخصوصية
      </p>
    </div>
  );
}

function CustomerTable({ customers, showRank }: { customers: CustomerStat[]; showRank?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm print:text-[10px]">
        <thead>
          <tr className="border-b bg-muted/30">
            {showRank && <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">#</th>}
            {["الجوال","الطلبات","إجمالي الإنفاق","متوسط الطلب","آخر طلب"].map(h => (
              <th key={h} className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((c, idx) => (
            <tr key={c.phone} className="border-b last:border-0 hover:bg-muted/20">
              {showRank && (
                <td className="py-2.5 px-3">
                  <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                    idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-gray-300 text-gray-700" : idx === 2 ? "bg-orange-300 text-white" : "bg-muted text-muted-foreground"
                  }`}>{idx+1}</span>
                </td>
              )}
              <td className="py-2.5 px-3 font-mono text-xs">{maskPhone(c.phone)}</td>
              <td className="py-2.5 px-3">
                <span className="inline-flex items-center gap-1">
                  <span className="font-bold text-primary">{c.orderCount}</span>
                  {c.orderCount > 3 && <span className="text-[10px] text-emerald-600 font-semibold">متكرر</span>}
                </span>
              </td>
              <td className="py-2.5 px-3 font-bold text-emerald-700">{sar(c.totalSpent)}</td>
              <td className="py-2.5 px-3 text-xs text-muted-foreground">{sarShort(c.avgOrder)}</td>
              <td className="py-2.5 px-3 text-xs text-muted-foreground">
                {new Date(c.lastOrder).toLocaleDateString("ar-SA", {timeZone:"Asia/Riyadh", month:"short", day:"numeric"})}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
