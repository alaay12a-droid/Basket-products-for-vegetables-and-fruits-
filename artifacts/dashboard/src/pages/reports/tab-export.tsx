import { RevenueAggregate } from "@workspace/api-client-react";
import { Order } from "@workspace/api-client-react";
import { aggregateItems, filterToday, sarShort } from "./utils";
import { downloadCSV } from "./export-utils";

interface Props {
  today:  RevenueAggregate | undefined;
  year:   RevenueAggregate | undefined;
  orders: Order[];
}

export function TabExport({ today, year, orders }: Props) {
  const todayOrders = filterToday(orders);
  const todayItems  = aggregateItems(todayOrders);

  const now       = new Date();
  const dateStr   = now.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", year:"numeric", month:"2-digit", day:"2-digit" });
  const timeStr   = now.toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour:"2-digit", minute:"2-digit" });
  const filename  = `تقرير_سلة_الخضار_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  function exportDailySummaryCSV() {
    downloadCSV([
      { "البيان": "التاريخ",                "القيمة": dateStr },
      { "البيان": "وقت التصدير",            "القيمة": timeStr },
      { "البيان": "إجمالي مبيعات اليوم",   "القيمة": today?.totalRevenue ?? 0 },
      { "البيان": "عدد الفواتير",           "القيمة": today?.orderCount ?? 0 },
      { "البيان": "إيرادات التوصيل",        "القيمة": today?.deliveryRevenue ?? 0 },
      { "البيان": "ضريبة القيمة المضافة",   "القيمة": today?.taxAmount ?? 0 },
      { "البيان": "صافي الإيرادات",         "القيمة": today?.netRevenue ?? 0 },
      { "البيان": "مبيعات نقدي",            "القيمة": today?.cashRevenue ?? 0 },
      { "البيان": "مبيعات إلكتروني",        "القيمة": today?.onlineRevenue ?? 0 },
      { "البيان": "طلبات ملغاة",            "القيمة": today?.cancelledCount ?? 0 },
      { "البيان": "قيمة الملغاة",           "القيمة": today?.cancelledValue ?? 0 },
    ], `${filename}_ملخص_اليوم.csv`, true);
  }

  function exportOrdersCSV() {
    if (!todayOrders.length) return;
    downloadCSV(
      todayOrders.map(o => ({
        "رقم الطلب":     o.dailyNumber,
        "الوقت":         new Date(o.createdAt).toLocaleTimeString("ar-SA", {timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"}),
        "الجوال":        o.customerPhone,
        "المبلغ (ر.س)": (o.totalPrice / 100).toFixed(2),
        "التوصيل (ر.س)": (o.deliveryFee / 100).toFixed(2),
        "طريقة الدفع":  o.paymentMethod === "cash" ? "نقدي" : "إلكتروني",
        "الحالة":        o.status === "done" ? "مكتمل" : o.status === "cancelled" ? "ملغي" : "معلق",
        "الكود":         o.discountCode ?? "",
        "الخصم":         o.discountAmount ? (o.discountAmount / 100).toFixed(2) : "0",
      })),
      `${filename}_فواتير_اليوم.csv`,
      true,
    );
  }

  function exportItemsCSV() {
    if (!todayItems.length) return;
    downloadCSV(
      todayItems.map((item, idx) => ({
        "#": idx + 1,
        "الصنف":              item.name,
        "الكمية":             item.qty,
        "سعر الوحدة (ر.س)":  item.unitPrice,
        "الإجمالي (ر.س)":    item.total,
      })),
      `${filename}_أصناف_اليوم.csv`,
      true,
    );
  }

  function exportYearlySummaryCSV() {
    downloadCSV([
      { "البيان": "السنة",                       "القيمة": now.getFullYear() },
      { "البيان": "إجمالي مبيعات العام",         "القيمة": year?.totalRevenue ?? 0 },
      { "البيان": "إجمالي الفواتير",             "القيمة": year?.orderCount ?? 0 },
      { "البيان": "صافي الإيرادات",              "القيمة": year?.netRevenue ?? 0 },
      { "البيان": "ضريبة القيمة المضافة",        "القيمة": year?.taxAmount ?? 0 },
      { "البيان": "إيرادات التوصيل",             "القيمة": year?.deliveryRevenue ?? 0 },
      { "البيان": "مبيعات نقدي",                 "القيمة": year?.cashRevenue ?? 0 },
      { "البيان": "مبيعات إلكتروني",             "القيمة": year?.onlineRevenue ?? 0 },
    ], `${filename}_ملخص_العام.csv`, true);
  }

  type ExportButton = {
    icon: string; label: string; desc: string; color: string; action: () => void; disabled?: boolean;
  };

  const buttons: ExportButton[] = [
    {
      icon: "🖨️", label: "طباعة التقرير (A4 / PDF)",
      desc: "يطبع التقرير الكامل بتنسيق احترافي مناسب للطباعة والحفظ كـ PDF",
      color: "border-blue-200 bg-blue-50 hover:bg-blue-100",
      action: () => window.print(),
    },
    {
      icon: "📊", label: "تصدير ملخص اليوم — Excel",
      desc: "جدول بسيط بجميع مؤشرات اليوم يفتح مباشرة في Excel",
      color: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100",
      action: exportDailySummaryCSV,
    },
    {
      icon: "🧾", label: "تصدير فواتير اليوم — Excel",
      desc: `${todayOrders.length} فاتورة بكامل التفاصيل`,
      color: "border-amber-200 bg-amber-50 hover:bg-amber-100",
      action: exportOrdersCSV,
      disabled: todayOrders.length === 0,
    },
    {
      icon: "📦", label: "تصدير أصناف اليوم — Excel",
      desc: `${todayItems.length} صنف مع الكميات والإيرادات`,
      color: "border-violet-200 bg-violet-50 hover:bg-violet-100",
      action: exportItemsCSV,
      disabled: todayItems.length === 0,
    },
    {
      icon: "📅", label: "تصدير ملخص العام — Excel",
      desc: "إجمالي مبيعات وإيرادات هذا العام",
      color: "border-indigo-200 bg-indigo-50 hover:bg-indigo-100",
      action: exportYearlySummaryCSV,
    },
  ];

  return (
    <div className="space-y-8 print:hidden">
      <div className="rounded-2xl border bg-muted/20 p-5">
        <p className="text-xs text-muted-foreground mb-1">التقرير يشمل بيانات حتى</p>
        <p className="text-xl font-bold">{dateStr} الساعة {timeStr}</p>
        <p className="text-sm text-muted-foreground mt-1">المتجر: منتجات السلة للخضار والفواكه — تبوك</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {buttons.map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            disabled={btn.disabled}
            className={`rounded-2xl border ${btn.color} p-5 text-right transition-all disabled:opacity-40 disabled:cursor-not-allowed group`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl group-hover:scale-110 transition-transform">{btn.icon}</span>
              <div className="flex-1">
                <p className="font-bold text-sm mb-1">{btn.label}</p>
                <p className="text-xs text-muted-foreground">{btn.desc}</p>
                {btn.disabled && <p className="text-xs text-muted-foreground mt-1">لا توجد بيانات اليوم</p>}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-semibold mb-2">💡 تصدير CSV — تعليمات Excel:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>افتح Excel وانقر على "ملف" ← "فتح"</li>
          <li>اختر الملف المُحمَّل بامتداد .csv</li>
          <li>في معالج الاستيراد: اختر "محدد" ← "فاصلة"</li>
          <li>اختر ترميز UTF-8 للدعم الكامل للغة العربية</li>
        </ol>
      </div>
    </div>
  );
}
