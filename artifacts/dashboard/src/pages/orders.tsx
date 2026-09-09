import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListOrdersQueryKey } from "@workspace/api-client-react";
import { apiGet, apiPost, apiPatch, apiPut, apiDel } from "@/lib/api";
import {
  RefreshCw, Bell, BellOff, Phone, MapPin, Printer, Clock, Truck,
  Package, MessageCircle, X, ChevronRight, ChevronLeft,
  User, Send, CheckCircle, ChevronDown, Search, Check,
  TrendingUp, DollarSign, CreditCard, Banknote, Store,
  AlertTriangle, Wallet, ArrowUpRight, ArrowDownRight,
  Calendar, CalendarDays, ClipboardList, PackageCheck, UserCheck, CircleDot,
  List, LayoutGrid, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrderPriceFactor } from "@/lib/format";
import { Switch } from "@/components/ui/switch";

type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "done" | "cancelled";
type OrderType = "delivery" | "pickup";
interface OrderItemCustomization {
  size?: string;
  riceType?: string;
  addon?: string;
  selectedOptions?: { groupName: string; choice: string }[];
}
interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  customization?: OrderItemCustomization;
}
interface Order {
  id: number; dailyNumber: number | null; customerName: string; customerPhone: string;
  customerAddress: string | null; items: OrderItem[]; totalPrice: number; deliveryFee: number;
  discountCode: string | null; discountAmount: number | null; orderType: OrderType;
  status: OrderStatus; paymentMethod: string; notes: string | null; createdAt: string;
}
interface Driver { id: number; name: string; phone: string; photoUrl: string | null; active: boolean; isOnline: boolean; }
interface Assignment { driverId: number; driverName: string; status: string; }
interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; createdAt: string; readAt: string | null; }
interface ActiveAssignment {
  orderId: number; driverId: number; pickedUpAt: string | null;
  driverName: string; driverPhone: string;
  dailyNumber: number | null; customerName: string;
  customerAddress: string | null; totalPrice: number; paymentMethod: string;
  locationUpdatedAt: string | null;
}
interface AllDeliveryRow { orderId: number; dailyNumber: number | null; customerName: string; customerPhone: string; totalPrice: number; paymentMethod: string; driverName: string; deliveredAt: string | null; }

type CashierView = "orders" | "pickup" | "drivers" | "finance" | "delivered";
type FilterKey = OrderStatus | "all";

const C = {
  bg: "#0B0F14",
  surface: "#111820",
  card: "#1A222C",
  border: "#262F3A",
  text: "#F0F4FA",
  sub: "#8A94A6",
  muted: "#4D5666",
  amber: "#F5A623",
  blue: "#4A9EFF",
  green: "#34D399",
  red: "#F6604F",
  violet: "#A78BFA",
};

const SAFFRON          = C.amber;
const SAFFRON_DIM      = C.amber + "22";
const CLR_READY        = C.green;
const CLR_READY_DIM    = C.green + "22";
const CLR_DELIVERING   = C.blue;
const CLR_DELIVERING_DIM = C.blue + "22";
const CLR_CANCELLED    = C.red;
const CLR_CANCELLED_DIM = C.red + "22";
const CLR_NEW          = C.violet;
const CLR_NEW_DIM      = C.violet + "22";
const BG       = C.bg;
const SURFACE  = C.surface;
const SURFACE2 = C.card;
const LINE     = C.border;
const TEXT     = C.text;
const TEXT_DIM   = C.sub;
const TEXT_FAINT = C.muted;

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: C.red, preparing: C.amber, ready: C.green,
  out_for_delivery: C.blue, done: C.muted, cancelled: C.muted,
};
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "جديد", preparing: "قيد التجهيز", ready: "جاهز",
  out_for_delivery: "قيد التوصيل", done: "تم", cancelled: "ملغى",
};
const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = { pending: "preparing", preparing: "ready" };
const STATUS_NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  pending: "بدء التجهيز", preparing: "الطلب جاهز",
};
const STATUS_CARD_COLOR: Record<OrderStatus, string> = {
  pending: C.violet, preparing: C.amber, ready: C.green,
  out_for_delivery: C.blue, done: C.sub, cancelled: C.red,
};
const STATUS_CARD_DIM: Record<OrderStatus, string> = {
  pending: C.violet + "22", preparing: C.amber + "22", ready: C.green + "22",
  out_for_delivery: C.blue + "22", done: C.sub + "22", cancelled: C.red + "22",
};
const STATUS_DISPLAY: Record<OrderStatus, string> = {
  pending: "جديد", preparing: "جاري التجهيز", ready: "جاهز للتسليم",
  out_for_delivery: "قيد التوصيل", done: "تم التسليم", cancelled: "ملغى",
};
const RAIL_ORDER = ["pending","preparing","ready","out_for_delivery","done"];
const RAIL_STEPS = [
  { label: "جديد" }, { label: "التجهيز" }, { label: "جاهز" },
  { label: "التوصيل" }, { label: "تم" },
];
const ORDER_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",              label: "الكل" },
  { key: "pending",          label: "جديد" },
  { key: "preparing",        label: "قيد التجهيز" },
  { key: "ready",            label: "جاهز" },
  { key: "out_for_delivery", label: "توصيل" },
];

const fmt2   = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
const sar    = (h: number) => `${fmt2(h / 100)} ر.س`;
const sarRaw = (h: number) => fmt2(h / 100);

function getOrderItemDisplayName(item: OrderItem): string {
  const size = item.customization?.size?.trim();
  if (!size) return item.name;

  if (size === "نصف") {
    if (item.name.includes("حبة كاملة")) return item.name.replace("حبة كاملة", "نص حبة");
    if (/(?:نص حبة|نص دجاجة|نصف دجاجة)/.test(item.name)) return item.name;
    return `${item.name} - ${item.name.includes("دجاج") ? "نص دجاجة" : "نصف"}`;
  }

  if (size === "حبة كاملة") {
    if (item.name.includes("نص حبة")) return item.name.replace("نص حبة", "حبة كاملة");
    if (item.name.includes("نص دجاجة")) return item.name.replace("نص دجاجة", "حبة كاملة");
    if (item.name.includes("نصف دجاجة")) return item.name.replace("نصف دجاجة", "حبة كاملة");
    if (item.name.includes("حبة كاملة")) return item.name;
    return `${item.name} - حبة كاملة`;
  }

  return item.name.includes(size) ? item.name : `${item.name} - ${size}`;
}

function printReceipt(order: Order) {
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  const pf            = getOrderPriceFactor(order);
  const itemsSubtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0) * pf;
  const deliveryFee   = (order.deliveryFee ?? 0) / 100;
  const totalPaid     = order.totalPrice / 100;
  const discount      = Math.max(0, itemsSubtotal + deliveryFee - totalPaid);
  const escapeTableText = (value: string | number) =>
    String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character);
  const itemsRows = order.items.map((item) => {
    const displayName = getOrderItemDisplayName(item);
    const modifierMatch = displayName.match(/^(.*?)\s+\(([^()]*)\)$/);
    const itemName = modifierMatch?.[1] ?? displayName;
    const modifiers = modifierMatch?.[2] ?? "";
    const unitPrice = item.price * pf;
    const lineTotal = unitPrice * item.quantity;
    return `<tr>
      <td class="item-name-cell">
        <span>${escapeTableText(itemName)}</span>
        ${modifiers ? `<small class="item-modifiers">${escapeTableText(modifiers)}</small>` : ""}
      </td>
      <td class="numeric-cell">${fmt2(unitPrice)} ر.س</td>
      <td class="numeric-cell">${item.quantity}</td>
      <td class="numeric-cell">${fmt2(lineTotal)} ر.س</td>
    </tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>إيصال #${order.dailyNumber ?? order.id}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;background:#fff;color:#111;direction:rtl;padding:10mm;}
h1{text-align:center;font-size:18px;font-weight:800;color:#8B4513;margin-bottom:4px}.sub{text-align:center;font-size:11px;color:#888;margin-bottom:16px}
.daily{text-align:center;font-size:18px;font-weight:800;margin:8px 0;color:#8B4513}
.items-table{width:100%;table-layout:fixed;border:1px solid #697176;border-collapse:collapse;border-spacing:0;font-size:11.5px;direction:rtl}
.items-table col.item-name-col{width:48%}.items-table col.unit-price-col{width:20%}.items-table col.quantity-col{width:12%}.items-table col.total-col{width:20%}
.items-table th,.items-table td{border:1px solid #697176;padding:7px 4px;vertical-align:middle;word-break:normal;overflow-wrap:normal}
.items-table thead th{background:#263238;color:#fff;font-size:10.5px;font-weight:800;padding:8px 2px;text-align:center;line-height:1.25;white-space:nowrap;word-break:keep-all;overflow-wrap:normal}
.unit-price-heading span{display:block;white-space:nowrap}
.items-table tbody tr{height:40px}.items-table tbody tr:nth-child(even){background:#fafafa}
.numeric-cell{text-align:center;direction:ltr;white-space:nowrap}.item-name-cell{text-align:right;line-height:1.35;overflow:hidden;word-break:normal;overflow-wrap:normal}.item-name-cell>span{display:-webkit-box;max-height:2.7em;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:normal;overflow-wrap:normal}
.item-modifiers{display:block;margin-top:2px;color:#666;font-size:9.5px;font-weight:400;line-height:1.3;white-space:normal;word-break:normal;overflow-wrap:normal}
hr{border:none;border-top:1px dashed #bbb;margin:8px 0}
.total{font-size:16px;font-weight:800;text-align:left}@media print{body{padding:5mm}.items-table{width:100%;max-width:100%;margin-inline:0}.items-table col.item-name-col{width:25mm}.items-table col.unit-price-col{width:14mm}.items-table col.quantity-col{width:10mm}.items-table col.total-col{width:13mm}}</style></head><body>
<h1>شركة منتجات السلة للخضار والفواكه</h1>
<div class="sub">تبوك — حي الصفا — شارع إبراهيم الخليل</div>
<div class="sub">الرقم الضريبي: 312385645800003</div>
<div class="sub">فاتورة ضريبية مبسطة<br/>Simplified Tax Invoice</div>
<div class="daily">طلب اليوم #${order.dailyNumber ?? order.id}</div>
<hr/>
<p style="font-size:13px;margin-bottom:3px"><strong>الاسم:</strong> ${order.customerName}</p>
${order.customerPhone ? `<p style="font-size:13px;margin-bottom:3px" dir="ltr"><strong>الجوال:</strong> ${order.customerPhone}</p>` : ""}
${order.customerAddress ? `<p style="font-size:13px;margin-bottom:6px"><strong>العنوان:</strong> ${order.customerAddress.startsWith("https://") ? "موقع GPS" : order.customerAddress}</p>` : ""}
<p style="font-size:13px;margin-bottom:3px"><strong>التاريخ:</strong> ${dateStr} ${timeStr}</p>
<p style="font-size:13px;margin-bottom:6px"><strong>الدفع:</strong> ${order.paymentMethod === "cash" ? "نقدي" : "إلكتروني"}</p>
<hr/>
<table class="items-table">
<colgroup><col class="item-name-col"/><col class="unit-price-col"/><col class="quantity-col"/><col class="total-col"/></colgroup>
<thead><tr><th>اسم الصنف</th><th class="unit-price-heading"><span>سعر</span><span>القطعة</span></th><th>العدد</th><th>المجموع</th></tr></thead>
<tbody>${itemsRows}</tbody>
</table>
<hr/>
${itemsSubtotal > 0 ? `<p style="font-size:12px;color:#555;text-align:left">${fmt2(itemsSubtotal)} ر.س المجموع</p>` : ""}
${deliveryFee > 0 ? `<p style="font-size:12px;color:#555;text-align:left">${fmt2(deliveryFee)} ر.س رسوم التوصيل</p>` : ""}
${discount > 0.005 ? `<p style="font-size:12px;color:#C8171A;text-align:left">- ${fmt2(discount)} ر.س خصم</p>` : ""}
<p class="total">${fmt2(totalPaid)} ر.س — الإجمالي</p>
${order.notes ? `<p style="margin-top:8px;font-size:12px;color:#555"><strong>ملاحظات:</strong> ${order.notes}</p>` : ""}
<p style="text-align:center;margin-top:14px;font-size:11px;color:#888">شكراً لاختيارك منتجات السلة للخضار والفواكه 🥬</p>
<div style="text-align:center;margin-top:16px;">
<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`منتجات السلة للخضار والفواكه - طلب رقم ${order.dailyNumber ?? order.id} - ${fmt2(totalPaid)} ر.س`)}" width="100" height="100" alt="QR"/>
<p style="font-size:10px;color:#aaa;margin-top:4px;">طلب #${order.dailyNumber ?? order.id}</p>
</div>
<script>window.onload=function(){window.print();}</script></body></html>`;
  const win = window.open("", "_blank", "width=500,height=700");
  if (win) { win.document.write(html); win.document.close(); }
}

function printBulk(orders: Order[]) {
  if (orders.length === 0) return;
  const pages = orders.map(o => {
    const time = new Date(o.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    const pf = getOrderPriceFactor(o);
    const itemsRows = o.items.map(i => `<tr><td style="padding:3px 6px">${getOrderItemDisplayName(i)} × ${i.quantity}</td><td style="padding:3px 6px;text-align:left">${fmt2(i.price*i.quantity*pf)} ر.س</td></tr>`).join("");
    return `<div style="page-break-after:always;padding:8mm;font-family:Cairo,sans-serif;direction:rtl">
<h2 style="text-align:center;color:#8B4513;font-size:16px;margin-bottom:2px">شركة منتجات السلة للخضار والفواكه</h2>
<p style="text-align:center;font-size:10px;color:#888;margin-bottom:2px">الرقم الضريبي: 312385645800003</p>
<p style="text-align:center;font-size:10px;color:#888;margin-bottom:2px">تبوك — حي الصفا — شارع إبراهيم الخليل</p>
<p style="text-align:center;font-size:10px;font-weight:700;margin-bottom:6px">فاتورة ضريبية مبسطة<br/>Simplified Tax Invoice</p>
<p style="text-align:center;font-size:14px;font-weight:700;margin-bottom:8px">طلب اليوم #${o.dailyNumber ?? o.id} — ${o.customerName}</p>
<p style="font-size:12px;color:#666;margin-bottom:6px">${time} · ${o.paymentMethod === "cash" ? "نقدي" : "إلكتروني"}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">${itemsRows}
<tr><td colspan="2" style="border-top:1px dashed #ccc;padding-top:6px;font-weight:700;font-size:15px">${fmt2(o.totalPrice/100)} ر.س</td></tr>
</table>
<div style="text-align:center;margin-top:12px;">
<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`منتجات السلة للخضار والفواكه - طلب رقم ${o.dailyNumber ?? o.id} - ${fmt2(o.totalPrice/100)} ر.س`)}" width="80" height="80" alt="QR"/>
<p style="font-size:9px;color:#aaa;margin-top:2px;">طلب #${o.dailyNumber ?? o.id}</p>
</div>
</div>`;
  }).join("");
  const win = window.open("", "_blank", "width=600,height=800");
  if (win) {
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet"></head><body>${pages}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    win.document.close();
  }
}

function TimerRing({ createdAt, size = 44 }: { createdAt: string; size?: number }) {
  const TARGET_MINS = 30;
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000;
  const remaining = Math.max(0, TARGET_MINS - elapsed);
  const frac = Math.min(1, remaining / TARGET_MINS);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * frac;
  const color = remaining > 15 ? C.green : remaining > 5 ? C.amber : C.red;
  const mins = Math.ceil(remaining);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={3.5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3.5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ fill: color, fontSize: size * 0.24, fontWeight: "700",
          transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`,
          fontFamily: "Tajawal, sans-serif" }}>
        {mins > 99 ? "∞" : mins}
      </text>
    </svg>
  );
}

function Badge({ children, color, soft }: { children: React.ReactNode; color: string; soft?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      background: soft ? color + "22" : color,
      color: soft ? color : "#0B0F14",
      border: `1px solid ${color}55`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function IconBtn({ icon: Icon, label, tone, small, onClick, disabled }: {
  icon: React.ElementType; label?: string; tone: "good"|"bad"|"info"|"default";
  small?: boolean; onClick: () => void; disabled?: boolean;
}) {
  const toneMap: Record<string, [string, string]> = {
    good:    [C.green,  C.green  + "18"],
    bad:     [C.red,    C.red    + "18"],
    info:    [C.blue,   C.blue   + "18"],
    default: [C.sub,    C.border],
  };
  const [clr, bg] = toneMap[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        padding: small ? "6px 10px" : "8px 14px",
        borderRadius: 10, border: `1px solid ${clr}55`,
        background: bg, color: clr,
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        flex: label ? 1 : undefined,
        opacity: disabled ? 0.5 : 1,
        transition: "opacity .15s",
      }}
    >
      <Icon size={13} strokeWidth={2.5} />
      {label && <span>{label}</span>}
    </button>
  );
}

function ProgressRail({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "8px 0 14px" }}>تم إلغاء هذا الطلب</div>;
  }
  const idx = RAIL_ORDER.indexOf(status);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", margin: "4px 0 14px", padding: "0 2px" }}>
      {RAIL_STEPS.map((step, i) => {
        const done    = i < idx;
        const current = i === idx;
        const active  = done || current;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && (
              <div style={{ position: "absolute", top: 7, right: "50%", width: "100%", height: 2, backgroundColor: done ? C.amber : C.border, zIndex: 0 }} />
            )}
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              backgroundColor: active ? C.amber : C.border,
              border: `2px solid ${C.bg}`,
              zIndex: 1, position: "relative",
              ...(current ? { boxShadow: `0 0 0 4px ${C.amber}33` } : {}),
            }} />
            <div style={{ fontSize: 10, color: active ? C.sub : C.muted, marginTop: 6, textAlign: "center" }}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Orders() {
  const queryClient = useQueryClient();

  const [cashierView, setCashierView] = useState<CashierView>("orders");
  const [orders, setOrders]           = useState<Order[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetching, setFetching]       = useState(false);
  const [filter, setFilter]           = useState<FilterKey>("all");
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const knownIds  = useRef<Set<number>>(new Set());
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirst   = useRef(true);

  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm]       = useState("");
  const [sortNewest, setSortNewest]       = useState(true);
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [deliveredView, setDeliveredView] = useState<"grid" | "list">("grid");
  const [deliveredSearch, setDeliveredSearch] = useState("");
  const [deliveredFromDate, setDeliveredFromDate] = useState("");
  const [deliveredToDate, setDeliveredToDate] = useState("");

  const [drivers, setDrivers]               = useState<Driver[]>([]);
  const [driversEnabled, setDriversEnabled] = useState(false);
  const [assignments, setAssignments]       = useState<Record<number, Assignment>>({});
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);

  const [activeAssignments, setActiveAssignments] = useState<ActiveAssignment[]>([]);
  const [activeLoading, setActiveLoading]         = useState(false);
  const [deliveringOrderId, setDeliveringOrderId] = useState<number | null>(null);

  const [drvSelectedDate, setDrvSelectedDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [drvWeekOffset, setDrvWeekOffset]     = useState(0);
  const [allDeliveries, setAllDeliveries]     = useState<AllDeliveryRow[]>([]);
  const [allDeliveriesLoading, setAllDeliveriesLoading] = useState(false);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());

  const [pickupFromHour, setPickupFromHour] = useState("00");
  const [pickupToHour,   setPickupToHour]   = useState("23");
  const [pickupFromMin,  setPickupFromMin]  = useState("00");
  const [pickupToMin,    setPickupToMin]    = useState("59");

  const [chatOrder, setChatOrder]     = useState<Order | null>(null);
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [unreadByOrder, setUnreadByOrder] = useState<Record<number, number>>({});
  const chatPollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [clock, setClock] = useState("");

  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("cashier_sound") !== "0"; } catch { return true; }
  });
  const [autoAssign, setAutoAssign]     = useState(() => { try { return localStorage.getItem("cashier_auto_assign") === "true"; } catch { return false; } });
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setFetching(true);
    try {
      const data = await apiGet<Order[]>("/orders");
      if (!isFirst.current) {
        const newPending = data.filter(o => o.status === "pending" && !knownIds.current.has(o.id));
        if (newPending.length > 0) {
          setHasNewOrder(true);
          setTimeout(() => setHasNewOrder(false), 5000);
          document.title = `(${data.filter(o => o.status === "pending").length}) طلب جديد 🔔 | الطلبات`;
          if (soundEnabled && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => setAudioBlocked(true));
          }
        }
      } else {
        const p = data.filter(o => o.status === "pending").length;
        if (p > 0) document.title = `(${p}) طلب جديد 🔔 | الطلبات`;
      }
      data.forEach(o => knownIds.current.add(o.id));
      isFirst.current = false;
      setOrders(data);
      queryClient.setQueryData(getListOrdersQueryKey(), data);
    } catch { /* silent */ }
    finally { setLoading(false); setFetching(false); }
  }, [queryClient]);

  const fetchDriversData = useCallback(async () => {
    try {
      const [drvList, drvEn] = await Promise.all([
        apiGet<Driver[]>("/drivers"),
        apiGet<{ enabled: boolean }>("/settings/drivers-enabled"),
      ]);
      setDrivers(drvList.filter(d => d.active));
      setDriversEnabled(drvEn.enabled);
    } catch {}
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const map = await apiGet<Record<number, Assignment>>("/orders/assignments");
      setAssignments(map);
    } catch {}
  }, []);

  const loadActiveAssignments = useCallback(async () => {
    setActiveLoading(true);
    try {
      const data = await apiGet<ActiveAssignment[]>("/drivers/active-assignments");
      setActiveAssignments(data);
    } catch {} finally { setActiveLoading(false); }
  }, []);

  const loadAllDeliveries = useCallback(async (date: Date) => {
    setAllDeliveriesLoading(true);
    try {
      const dateStr = date.toISOString().slice(0, 10);
      const data = await apiGet<AllDeliveryRow[]>(`/drivers/all-deliveries?date=${dateStr}`);
      setAllDeliveries(data);
    } catch {} finally { setAllDeliveriesLoading(false); }
  }, []);

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const convos = await apiGet<{ orderId: number; unread: number }[]>("/messages/conversations");
      const counts: Record<number, number> = {};
      for (const c of convos) if (c.unread > 0) counts[c.orderId] = c.unread;
      setUnreadByOrder(counts);
    } catch {}
  }, []);

  const assignDriver = useCallback(async (orderId: number, driverId: number) => {
    try {
      await apiPost(`/orders/${orderId}/assign-driver`, { driverId });
      const map = await apiGet<Record<number, Assignment>>("/orders/assignments");
      setAssignments(map);
      setOrders(prev => prev.map(o =>
        o.id === orderId && o.status !== "done" && o.status !== "cancelled"
          ? { ...o, status: "out_for_delivery" as OrderStatus }
          : o
      ));
      setAssigningOrder(null);
    } catch (error) {
      await fetchDriversData();
      alert(error instanceof Error ? error.message : "تعذّر تعيين المندوب");
    }
  }, [fetchDriversData]);

  const unassignDriver = useCallback(async (orderId: number) => {
    try {
      await apiDel(`/orders/${orderId}/assign-driver`);
      setAssignments(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    } catch {}
  }, []);

  const handleUpdateStatus = useCallback(async (order: Order, newStatus: OrderStatus) => {
    try {
      const updated = await apiPatch<Order>(`/orders/${order.id}/status`, { status: newStatus });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    } catch { alert("تعذر تحديث الحالة"); }
  }, [queryClient]);

  const handleAcceptAndAutoAssign = useCallback(async (order: Order) => {
    try {
      const updated = await apiPatch<Order>(`/orders/${order.id}/status`, { status: "preparing" });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    } catch { alert("تعذر تحديث الحالة"); return; }
    if (!autoAssign || order.orderType !== "delivery") return;
    setAutoAssigning(true);
    try {
      const result = await apiPost<{ ok: boolean; driverName?: string; error?: string }>(
        `/orders/${order.id}/auto-assign-driver`, {}
      );
      if (result.ok) {
        fetchAssignments();
        // Immediately reflect out_for_delivery in local state — don't wait for next poll
        setOrders(prev => prev.map(o =>
          o.id === order.id && o.status !== "done" && o.status !== "cancelled"
            ? { ...o, status: "out_for_delivery" as OrderStatus }
            : o
        ));
      } else {
        alert(result.error ?? "لا يوجد مندوب متاح حاليًا للتعيين التلقائي.");
      }
    } catch {
      alert("لا يوجد مندوب متاح حاليًا للتعيين التلقائي.");
    } finally {
      setAutoAssigning(false);
    }
  }, [autoAssign, queryClient, fetchAssignments]);

  const handleCancelOrder = useCallback(async (order: Order) => {
    if (!window.confirm(`إلغاء طلب #${order.dailyNumber} — ${order.customerName}؟`)) return;
    try {
      const updated = await apiPatch<Order>(`/orders/${order.id}/status`, { status: "cancelled" });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    } catch { alert("تعذر إلغاء الطلب"); }
  }, [queryClient]);

  const confirmDelivery = useCallback(async (orderId: number) => {
    setDeliveringOrderId(orderId);
    try {
      await apiPut(`/orders/${orderId}/driver-status`, { status: "delivered" });
      setActiveAssignments(prev => prev.filter(a => a.orderId !== orderId));
      await loadAllDeliveries(drvSelectedDate);
    } catch { alert("تعذّر تأكيد التسليم"); }
    setDeliveringOrderId(null);
  }, [drvSelectedDate, loadAllDeliveries]);

  const openChat = useCallback(async (order: Order) => {
    setChatOrder(order);
    setChatLoading(true);
    setChatMsgs([]);
    try {
      const msgs = await apiGet<ChatMsg[]>(`/messages/order/${order.id}`);
      setChatMsgs(msgs);
      await apiPatch(`/messages/order/${order.id}/read`, { fromCashier: true });
      setUnreadByOrder(prev => { const n = { ...prev }; delete n[order.id]; return n; });
    } catch {} finally { setChatLoading(false); }
  }, []);

  const sendChatMessage = useCallback(async () => {
    if (!chatOrder || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const msg = await apiPost<ChatMsg>(`/messages/order/${chatOrder.id}`, { text, fromCashier: true });
      setChatMsgs(prev => [...prev, msg]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch { setChatInput(text); } finally { setChatSending(false); }
  }, [chatOrder, chatInput]);

  useEffect(() => {
    fetchOrders();
    fetchDriversData();
    fetchAssignments();
    fetchUnreadCounts();
    pollRef.current = setInterval(() => {
      fetchOrders(true);
      fetchDriversData();
      fetchAssignments();
      fetchUnreadCounts();
    }, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.title = "منتجات السلة للخضار والفواكه";
    };
  }, [fetchOrders, fetchDriversData, fetchAssignments, fetchUnreadCounts]);

  useEffect(() => {
    if (cashierView !== "drivers") return;
    loadActiveAssignments();
    loadAllDeliveries(drvSelectedDate);
    const t = setInterval(() => { loadActiveAssignments(); loadAllDeliveries(drvSelectedDate); }, 10000);
    return () => clearInterval(t);
  }, [cashierView, loadActiveAssignments, loadAllDeliveries, drvSelectedDate]);

  useEffect(() => {
    if (!chatOrder) {
      if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; }
      return;
    }
    chatPollRef.current = setInterval(async () => {
      try {
        const msgs = await apiGet<ChatMsg[]>(`/messages/order/${chatOrder.id}`);
        setChatMsgs(msgs);
        await apiPatch(`/messages/order/${chatOrder.id}/read`, { fromCashier: true });
      } catch {}
    }, 5000);
    return () => { if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; } };
  }, [chatOrder]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const audio = new Audio("/dashboard/sounds/notification.wav");
    audio.preload = "auto";
    audioRef.current = audio;
    const unlock = () => {
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; setAudioBlocked(false); }).catch(() => {});
    };
    document.addEventListener("click", unlock, { once: true });
    return () => { document.removeEventListener("click", unlock); };
  }, []);

  const toggleCard   = (id: number) => setExpandedCards(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalUnread   = Object.values(unreadByOrder).reduce((s, n) => s + n, 0);
  const pendingCount  = orders.filter(o => o.status === "pending" && o.orderType !== "pickup").length;
  const pickupOrders  = orders.filter(o => o.orderType === "pickup");
  const pickupPending = pickupOrders.filter(o => !["done","cancelled"].includes(o.status)).length;

  const visibleOrders = (() => {
    let result = filter === "all"
      ? orders.filter(o => !["done","cancelled"].includes(o.status) && o.orderType !== "pickup")
      : orders.filter(o => o.status === filter && o.orderType !== "pickup");
    if (searchTerm.trim()) {
      const q = searchTerm.trim();
      result = result.filter(o =>
        o.customerName.includes(q) ||
        o.customerPhone.includes(q) ||
        String(o.dailyNumber ?? o.id).includes(q)
      );
    }
    return [...result].sort((a, b) =>
      sortNewest
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  })();

  function getOrderTypeMeta(order: Order) {
    if (order.orderType === "pickup")   return { icon: Store, label: "استلام من الفرع", color: C.blue };
    if (order.orderType === "delivery") return { icon: Truck, label: "توصيل",           color: C.amber };
    return { icon: Package, label: "طلب عادي", color: C.violet };
  }

  function OrderCard({ order }: { order: Order }) {
    const isExpanded  = expandedCards.has(order.id);
    const isSelected  = selectedIds.has(order.id);
    const isPickup    = order.orderType === "pickup";
    const isDelivery  = order.orderType === "delivery";
    const aRow        = assignments[order.id];
    const hasAssigned    = order.status === "ready" && aRow?.status === "assigned";
    const driverPickedUp = aRow?.status === "picked_up";
    const isGPS      = order.customerAddress?.startsWith("https://");
    const time       = new Date(order.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    const unread     = unreadByOrder[order.id] ?? 0;
    const nextStatus = STATUS_NEXT[order.status];
    const nextLabel  = STATUS_NEXT_LABEL[order.status];
    const cardColor  = STATUS_CARD_COLOR[order.status];
    const typeMeta   = getOrderTypeMeta(order);
    const TypeIcon   = typeMeta.icon;
    const fee        = (order.deliveryFee ?? 0) / 100;

    return (
      <div style={{
        background: C.card,
        borderRadius: 16,
        border: `1px solid ${order.status === "pending" ? cardColor + "55" : C.border}`,
        boxShadow: order.status === "pending" ? `0 0 0 1px ${cardColor}20` : "none",
        overflow: "hidden",
        opacity: order.status === "cancelled" ? 0.6 : 1,
        transition: "transform .15s, box-shadow .15s",
      }}>
        <div
          onClick={() => selectMode ? toggleSelect(order.id) : toggleCard(order.id)}
          style={{ padding: "14px 14px 10px", cursor: "pointer" }}
        >
          {/* ── Top row: TimerRing + order info ── */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
            <TimerRing createdAt={order.createdAt} size={62} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Order # + type + status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ background: typeMeta.color + "20", color: typeMeta.color, width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <TypeIcon size={12} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>#{order.dailyNumber ?? order.id}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: typeMeta.color, lineHeight: 1 }}>{typeMeta.label}</div>
                  </div>
                </div>
                <Badge color={cardColor} soft>{STATUS_DISPLAY[order.status]}</Badge>
              </div>
              {/* Customer name */}
              {selectMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isSelected ? C.amber : C.card, border: `1.5px solid ${isSelected ? C.amber : C.border}` }}>
                    {isSelected && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0B0F14" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{order.customerName}</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                  <User size={12} style={{ color: C.muted, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customerName}</span>
                </div>
              )}
              {/* Phone + time */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.sub }}>
                <Phone size={11} />
                <span dir="ltr">{order.customerPhone}</span>
                <span style={{ marginRight: "auto", fontSize: 11, color: C.muted }}>{time}</span>
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, textAlign: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{fmt2(order.totalPrice / 100)} <span style={{ fontSize: 10, fontWeight: 500, color: C.muted }}>ر.س</span></div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>الإجمالي</div>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{fee > 0 ? `${fmt2(fee)} ر.س` : "—"}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>رسوم التوصيل</div>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{order.paymentMethod === "cash" ? "نقدي" : "إلكتروني"}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>الدفع</div>
            </div>
          </div>
        </div>

        {/* ── Quick Accept/Reject for pending orders ── */}
        {order.status === "pending" && !isExpanded && (
          <div style={{ padding: "0 12px 12px", display: "flex", gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); handleAcceptAndAutoAssign(order); }}
              disabled={autoAssigning}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 8px", background: C.green + "22", border: `1.5px solid ${C.green}55`, borderRadius: 10, color: C.green, fontFamily: "inherit", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: autoAssigning ? 0.6 : 1 }}
            >
              <Check size={16} strokeWidth={2.5} />
              قبول
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleCancelOrder(order); }}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 8px", background: C.red + "22", border: `1.5px solid ${C.red}55`, borderRadius: 10, color: C.red, fontFamily: "inherit", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
            >
              <X size={16} strokeWidth={2.5} />
              رفض
            </button>
          </div>
        )}

        {aRow && !isExpanded && order.status !== "pending" && (
          <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CLR_DELIVERING_DIM, color: C.blue, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 8 }}>
              <User size={12} />
              المندوب: {aRow.driverName}
            </div>
            {!driverPickedUp && !["done","cancelled"].includes(order.status) && (
              <button
                onClick={e => { e.stopPropagation(); setAssigningOrder(order); }}
                style={{ background: "none", border: `1px solid ${C.blue}55`, borderRadius: 6, padding: "3px 8px", color: C.blue, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                تغيير
              </button>
            )}
          </div>
        )}

        {isExpanded && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              <ProgressRail status={order.status} />

              <div style={{ background: C.surface, borderRadius: 10, padding: "10px 12px" }}>
                {(() => {
                  const pf = getOrderPriceFactor(order);
                  const SKEL = (k: number) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                      <div style={{ width: 54, height: 12, borderRadius: 4, background: C.border, opacity: 0.7 }} />
                      <div style={{ width: 115, height: 12, borderRadius: 4, background: C.border, opacity: 0.7 }} />
                    </div>
                  );
                  if (!order.items?.length) return [1, 2].map(SKEL);
                  return order.items.map((item, i) => {
                    const linePrice = item.price * item.quantity * pf;
                    if (!item.name || item.name === '-' || item.name === '—' || linePrice <= 0) return SKEL(i);
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                        <span style={{ color: C.sub }}>{fmt2(linePrice)} ر.س</span>
                        <span style={{ color: C.text }}>{getOrderItemDisplayName(item)} × {item.quantity}</span>
                      </div>
                    );
                  });
                })()}
                {order.discountCode && order.discountAmount != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", borderTop: `1px solid ${C.border}`, marginTop: 6 }}>
                    <span style={{ color: C.red }}>- {fmt2(order.discountAmount / 100)} ر.س</span>
                    <span style={{ color: C.red }}>🏷️ {order.discountCode}</span>
                  </div>
                )}
              </div>

              {[
                order.customerAddress && { label: "العنوان", val: isGPS ? null : order.customerAddress, href: isGPS ? order.customerAddress : null },
                order.notes && { label: "ملاحظة", val: order.notes, href: null },
              ].filter(Boolean).map((row: any, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", fontSize: 13, gap: 8 }}>
                  <span style={{ color: C.muted, flexShrink: 0 }}>{row.label}</span>
                  {row.href ? (
                    <a href={row.href} target="_blank" rel="noreferrer" style={{ color: C.green, textDecoration: "none" }}>📍 موقع على الخريطة</a>
                  ) : (
                    <span style={{ color: C.sub, textAlign: "right" }}>{row.val}</span>
                  )}
                </div>
              ))}

              {aRow && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: CLR_DELIVERING_DIM, color: C.blue, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 8 }}>
                  <User size={12} />
                  المندوب: {aRow.driverName}
                  {driverPickedUp && <span style={{ fontSize: 11, opacity: 0.8 }}>— في الطريق</span>}
                  {!driverPickedUp && aRow.status === "assigned" && <span style={{ fontSize: 11, opacity: 0.8 }}>— بانتظار الاستلام</span>}
                  {!driverPickedUp && !["done","cancelled"].includes(order.status) && (
                    <button
                      onClick={() => setAssigningOrder(order)}
                      style={{ marginRight: "auto", background: "none", border: `1px solid ${C.blue}55`, borderRadius: 6, padding: "2px 8px", color: C.blue, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      تغيير
                    </button>
                  )}
                </div>
              )}

              {(nextStatus || order.status === "ready" || order.status === "out_for_delivery") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {nextStatus && nextLabel && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleUpdateStatus(order, nextStatus)}
                        style={{ flex: 1, background: STATUS_CARD_COLOR[nextStatus] + "22", border: `1px solid ${STATUS_CARD_COLOR[nextStatus]}55`, borderRadius: 10, padding: "11px", color: STATUS_CARD_COLOR[nextStatus], fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {nextLabel}
                      </button>
                      {order.status === "pending" && (
                        <button
                          onClick={() => handleCancelOrder(order)}
                          title="إلغاء الطلب"
                          style={{ background: "#F7A9A914", border: "1px solid #F7A9A940", borderRadius: 10, padding: "11px 14px", color: "#F7A9A9", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                        >
                          <X size={14} />
                          إلغاء
                        </button>
                      )}
                    </div>
                  )}
                  {order.status === "ready" && isPickup && (
                    <button
                      onClick={() => handleUpdateStatus(order, "done")}
                      style={{ background: CLR_DELIVERING_DIM, border: `1px solid ${CLR_DELIVERING}55`, borderRadius: 10, padding: "11px", color: C.blue, fontWeight: 700, fontSize: 13.5, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
                    >
                      🏪 تم تسليم الطلب للعميل
                    </button>
                  )}
                  {order.status === "ready" && isDelivery && (
                    aRow ? (
                      <div style={{ background: CLR_READY_DIM, borderRadius: 10, padding: "10px 12px", border: `1px solid ${CLR_READY}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <button onClick={() => unassignDriver(order.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                          <X size={14} style={{ color: C.sub }} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div>
                            <div style={{ color: CLR_READY, fontWeight: 700, fontSize: 13 }}>{aRow.driverName}</div>
                            <div style={{ color: `${CLR_READY}AA`, fontSize: 11 }}>معيّن — جارٍ نقل الطلب</div>
                          </div>
                          <span style={{ fontSize: 16 }}>🛵</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssigningOrder(order)}
                        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px", color: CLR_READY, fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
                      >
                        🛵 تعيين مندوب للتوصيل
                      </button>
                    )
                  )}
                  {order.status === "out_for_delivery" && (
                    <button
                      onClick={() => handleUpdateStatus(order, "done")}
                      style={{ background: CLR_READY_DIM, border: `1.5px solid ${CLR_READY}55`, borderRadius: 10, padding: "12px", color: CLR_READY, fontWeight: 700, fontSize: 13.5, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
                    >
                      ✅ تأكيد التسليم للعميل
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => openChat(order)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.amber + "18", border: `1px solid ${C.amber}35`, color: C.amber, borderRadius: 10, padding: 10, fontSize: 12.5, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", position: "relative" }}
                >
                  <MessageCircle size={15} />
                  مراسلة
                  {unread > 0 && (
                    <span style={{ position: "absolute", top: 3, right: 3, backgroundColor: C.red, borderRadius: "50%", minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 800 }}>{unread}</span>
                  )}
                </button>
                <button
                  onClick={() => printReceipt(order)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.surface, border: `1px solid ${C.border}`, color: C.sub, borderRadius: 10, padding: 10, fontSize: 12.5, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}
                >
                  <Printer size={15} />
                  طباعة
                </button>
                {isDelivery && !["done","cancelled"].includes(order.status) && !driverPickedUp && (
                  <button
                    onClick={() => handleCancelOrder(order)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.surface, border: `1px solid ${C.border}`, color: "#F7A9A9", borderRadius: 10, padding: 10, fontSize: 12.5, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}
                  >
                    <X size={15} />
                    إلغاء
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function PickupView() {
    const kanbanStages: { status: OrderStatus; label: string; icon: React.ElementType; color: string; next: OrderStatus | null; nextLabel: string }[] = [
      { status: "pending",   label: "بانتظار التجهيز", icon: Clock,        color: C.violet, next: "preparing", nextLabel: "بدء التجهيز" },
      { status: "preparing", label: "قيد التجهيز",     icon: Package,      color: C.amber,  next: "ready",     nextLabel: "جاهز الآن" },
      { status: "ready",     label: "جاهز للاستلام",  icon: PackageCheck, color: C.green,  next: "done",      nextLabel: "تم التسليم" },
      { status: "done",      label: "تم الاستلام",    icon: UserCheck,    color: C.blue,   next: null,        nextLabel: "" },
    ];
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayPickup   = pickupOrders.filter(o => new Date(o.createdAt) >= todayStart);
    const todayDone     = todayPickup.filter(o => o.status === "done");
    const todayTotal    = todayDone.reduce((s, o) => s + o.totalPrice / 100, 0);

    return (
      <div dir="rtl" style={{ padding: "14px 14px 100px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { value: fmt2(todayTotal), label: "ر.س إجمالي اليوم", color: C.green },
            { value: String(todayDone.length), label: "طلب مكتمل", color: C.blue },
            { value: String(pickupPending), label: "بانتظار التسليم", color: C.amber },
          ].map((s, i) => (
            <div key={i} style={{ background: s.color + "18", borderRadius: 14, padding: 12, border: `1px solid ${s.color}33`, textAlign: "center" }}>
              <div style={{ color: s.color, fontWeight: 800, fontSize: 20 }}>{s.value}</div>
              <div style={{ color: s.color, fontWeight: 600, fontSize: 11, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {kanbanStages.map(stage => {
            const StageIcon = stage.icon;
            const items = pickupOrders.filter(o => o.status === stage.status);
            return (
              <div key={stage.status} style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <StageIcon size={14} style={{ color: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{stage.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginRight: "auto" }}>{items.length}</span>
                </div>
                {items.map(o => (
                  <div key={o.id} style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 12, color: C.text }}>#{o.dailyNumber ?? o.id}</span>
                      {stage.status !== "done" && <TimerRing createdAt={o.createdAt} size={34} />}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{o.customerName}</div>
                    <div dir="ltr" style={{ fontSize: 11, color: C.sub, marginBottom: 2, textAlign: "right" }}>{o.customerPhone}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: stage.color, marginBottom: 8 }}>{fmt2(o.totalPrice / 100)} ر.س</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn icon={Printer} label="" tone="default" small onClick={() => printReceipt(o)} />
                      {stage.next && (
                        <IconBtn
                          icon={Check}
                          label={stage.nextLabel}
                          tone="good"
                          small
                          onClick={() => handleUpdateStatus(o, stage.next!)}
                        />
                      )}
                      {stage.status === "pending" && (
                        <IconBtn icon={X} label="" tone="bad" small onClick={() => handleCancelOrder(o)} />
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "16px 0" }}>لا شيء هنا</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function DeliveredView() {
    const allDeliveredOrders = orders.filter(o => o.status === "done");
    const normalizeSearchValue = (value: string) => value
      .trim()
      .toLocaleLowerCase()
      .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
    const normalizedSearch = normalizeSearchValue(deliveredSearch);
    const invalidDateRange = Boolean(deliveredFromDate && deliveredToDate && deliveredFromDate > deliveredToDate);
    const orderDateKey = (createdAt: string) => {
      const date = new Date(createdAt);
      if (Number.isNaN(date.getTime())) return "";
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${date.getFullYear()}-${month}-${day}`;
    };
    const deliveredOrders = allDeliveredOrders
      .filter(order => {
        const orderNumber = normalizeSearchValue(String(order.dailyNumber ?? order.id));
        const matchesSearch = !normalizedSearch ||
          orderNumber.includes(normalizedSearch) ||
          normalizeSearchValue(order.customerName).includes(normalizedSearch);
        const dateKey = orderDateKey(order.createdAt);
        const matchesDate = !invalidDateRange &&
          (!deliveredFromDate || dateKey >= deliveredFromDate) &&
          (!deliveredToDate || dateKey <= deliveredToDate);
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const hasDeliveredFilters = Boolean(deliveredSearch.trim() || deliveredFromDate || deliveredToDate);
    const inputStyle: React.CSSProperties = {
      width: "100%", height: 40, boxSizing: "border-box",
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
      color: C.text, padding: "0 12px", fontFamily: "inherit", fontSize: 12.5, outline: "none",
    };
    const formatOrderDate = (createdAt: string) => {
      const date = new Date(createdAt);
      return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });
    };
    const formatOrderTime = (createdAt: string) => {
      const date = new Date(createdAt);
      return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    };
    const clearDeliveredFilters = () => {
      setDeliveredSearch("");
      setDeliveredFromDate("");
      setDeliveredToDate("");
    };

    return (
      <div dir="rtl" style={{ padding: "14px 14px 100px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>الفواتير المسلّمة</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>الطلبات التي تم تسليمها للعميل</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge color={C.green} soft>
              {hasDeliveredFilters ? `${deliveredOrders.length} من ${allDeliveredOrders.length}` : deliveredOrders.length} فاتورة
            </Badge>
            <div role="group" aria-label="طريقة عرض الفواتير" style={{ display: "flex", padding: 3, gap: 3, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <button
                type="button"
                aria-pressed={deliveredView === "list"}
                onClick={() => setDeliveredView("list")}
                title="عرض تفصيلي"
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", borderRadius: 7, padding: "7px 9px", background: deliveredView === "list" ? C.amber + "22" : "transparent", color: deliveredView === "list" ? C.amber : C.muted, fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
              >
                <List size={15} />
                تفصيلية
              </button>
              <button
                type="button"
                aria-pressed={deliveredView === "grid"}
                onClick={() => setDeliveredView("grid")}
                title="عرض شبكي"
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", borderRadius: 7, padding: "7px 9px", background: deliveredView === "grid" ? C.amber + "22" : "transparent", color: deliveredView === "grid" ? C.amber : C.muted, fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
              >
                <LayoutGrid size={15} />
                شبكة
              </button>
            </div>
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.sub, fontSize: 12, fontWeight: 700 }}>
              <SlidersHorizontal size={15} style={{ color: C.amber }} />
              تصفية الفواتير
            </div>
            {hasDeliveredFilters && (
              <button
                type="button"
                onClick={clearDeliveredFilters}
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: C.amber, fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
              >
                <X size={14} />
                مسح الفلاتر
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: C.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 5 }}>بحث برقم الطلب أو اسم العميل</span>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                <input
                  type="text"
                  value={deliveredSearch}
                  onChange={event => setDeliveredSearch(event.target.value)}
                  placeholder="مثال: 125 أو محمد"
                  aria-label="بحث برقم الطلب أو اسم العميل"
                  style={{ ...inputStyle, paddingRight: 36 }}
                />
              </div>
            </label>
            <label style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: C.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 5 }}>تحديد تاريخ</span>
              <div style={{ position: "relative" }}>
                <CalendarDays size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                <input
                  type="date"
                  value={deliveredFromDate}
                  onChange={event => setDeliveredFromDate(event.target.value)}
                  onClick={event => event.currentTarget.showPicker?.()}
                  aria-label="تاريخ محدد أو بداية النطاق"
                  style={{ ...inputStyle, paddingRight: 36, colorScheme: "dark" }}
                />
              </div>
            </label>
            <label style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: C.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 5 }}>إلى تاريخ (اختياري)</span>
              <div style={{ position: "relative" }}>
                <CalendarDays size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                <input
                  type="date"
                  value={deliveredToDate}
                  onChange={event => setDeliveredToDate(event.target.value)}
                  onClick={event => event.currentTarget.showPicker?.()}
                  aria-label="نهاية نطاق التاريخ"
                  style={{ ...inputStyle, paddingRight: 36, colorScheme: "dark" }}
                />
              </div>
            </label>
          </div>
          <div style={{ color: invalidDateRange ? C.red : C.muted, fontSize: 10.5, marginTop: 8 }}>
            {invalidDateRange ? "تاريخ البداية يجب أن يكون قبل تاريخ النهاية" : "اختر تاريخًا واحدًا للتصفية، أو حدّد تاريخ البداية والنهاية لنطاق كامل"}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
            <div style={{ fontSize: 30 }}>⏳</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>جارٍ تحميل الفواتير...</div>
          </div>
        ) : deliveredOrders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
            <CheckCircle size={40} style={{ opacity: 0.35, display: "block", margin: "0 auto 12px", color: C.green }} />
            <div style={{ fontSize: 14 }}>{hasDeliveredFilters ? "لا توجد فواتير مطابقة للفلاتر" : "لا توجد فواتير مسلّمة"}</div>
            {hasDeliveredFilters && (
              <button type="button" onClick={clearDeliveredFilters} style={{ marginTop: 12, background: C.amber + "18", border: `1px solid ${C.amber}44`, color: C.amber, borderRadius: 9, padding: "8px 13px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                عرض جميع الفواتير
              </button>
            )}
          </div>
        ) : deliveredView === "list" ? (
          <div style={{ display: "grid", gap: 10 }}>
            {deliveredOrders.map(order => {
              const typeMeta = getOrderTypeMeta(order);
              const TypeIcon = typeMeta.icon;
              const isGPS = order.customerAddress?.startsWith("https://");
              return (
                <div key={order.id} style={{ display: "flex", alignItems: "stretch", gap: 14, flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ flex: "1 1 130px", minWidth: 125 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, background: typeMeta.color + "20", color: typeMeta.color }}>
                        <TypeIcon size={14} />
                      </div>
                      <div>
                        <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>#{order.dailyNumber ?? order.id}</div>
                        <div style={{ color: typeMeta.color, fontSize: 10.5, fontWeight: 700 }}>{typeMeta.label}</div>
                      </div>
                    </div>
                    <Badge color={C.green} soft><CheckCircle size={11} style={{ marginLeft: 4 }} /> تم التسليم</Badge>
                  </div>

                  <div style={{ flex: "1.3 1 180px", minWidth: 170 }}>
                    <div style={{ color: C.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>العميل</div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 800 }}>{order.customerName}</div>
                    {order.customerPhone && <div style={{ color: C.sub, fontSize: 11.5, marginTop: 4, direction: "ltr", textAlign: "right" }}>{order.customerPhone}</div>}
                    {order.customerAddress && (
                      isGPS
                        ? <a href={order.customerAddress} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.green, textDecoration: "none", fontSize: 11, marginTop: 5 }}><MapPin size={12} /> موقع العميل</a>
                        : <div style={{ color: C.sub, fontSize: 11, marginTop: 5, lineHeight: 1.5 }}>{order.customerAddress}</div>
                    )}
                  </div>

                  <div style={{ flex: "2 1 240px", minWidth: 220 }}>
                    <div style={{ color: C.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>تفاصيل الطلب</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {order.items.map(item => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: C.sub, fontSize: 11.5 }}>
                          <span style={{ color: C.text }}>{getOrderItemDisplayName(item)}</span>
                          <span style={{ color: C.amber, fontWeight: 700, whiteSpace: "nowrap" }}>× {item.quantity}</span>
                        </div>
                      ))}
                    </div>
                    {order.notes && <div style={{ color: C.muted, fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>ملاحظة: {order.notes}</div>}
                  </div>

                  <div style={{ flex: "1 1 155px", minWidth: 145 }}>
                    <div style={{ color: C.muted, fontSize: 10.5, fontWeight: 700, marginBottom: 6 }}>التاريخ والدفع</div>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{formatOrderDate(order.createdAt)}</div>
                    <div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{formatOrderTime(order.createdAt)}</div>
                    <div style={{ color: order.paymentMethod === "cash" ? C.green : C.blue, fontSize: 11.5, fontWeight: 700, marginTop: 7 }}>{order.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}</div>
                    <div style={{ color: C.amber, fontSize: 15, fontWeight: 800, marginTop: 7 }}>{sar(order.totalPrice)}</div>
                    {order.deliveryFee > 0 && <div style={{ color: C.muted, fontSize: 10.5, marginTop: 2 }}>رسوم التوصيل: {sar(order.deliveryFee)}</div>}
                    {order.discountCode && <div style={{ color: C.violet, fontSize: 10.5, marginTop: 2 }}>خصم: {order.discountCode}</div>}
                  </div>

                  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", marginRight: "auto" }}>
                    <button
                      type="button"
                      onClick={() => printReceipt(order)}
                      title="طباعة الفاتورة"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.surface, border: `1px solid ${C.border}`, color: C.sub, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      <Printer size={15} />
                      طباعة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, alignItems: "start" }}>
            {deliveredOrders.map(order => <OrderCard key={order.id} order={order} />)}
          </div>
        )}
      </div>
    );
  }

  function DriversView() {
    const DAY_ABBR = ["ح","ن","ث","ر","خ","ج","س"];
    const today0 = new Date(); today0.setHours(0,0,0,0);
    const weekDays: Date[] = (() => {
      const anchor = new Date(today0);
      anchor.setDate(today0.getDate() - today0.getDay() + drvWeekOffset * 7);
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(anchor); d.setDate(anchor.getDate() + i); return d; });
    })();
    const isToday    = (d: Date) => d.toDateString() === today0.toDateString();
    const isSelected = (d: Date) => d.toDateString() === drvSelectedDate.toDateString();
    const isFuture   = (d: Date) => d > today0;
    const monthLabel = weekDays[3].toLocaleDateString("ar-SA", { month: "long", year: "numeric" });
    const totalCollected = allDeliveries.reduce((s, r) => s + r.totalPrice, 0);
    const cashCollected  = allDeliveries.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);
    const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "--:--";

    const assignedOrders = orders.filter(o => { const a = assignments[o.id]; return a && a.status === "assigned"; });
    const pendingByDriver = new Map<string, { driverName: string; rows: Order[] }>();
    for (const o of assignedOrders) {
      const a = assignments[o.id];
      const key = a.driverName;
      if (!pendingByDriver.has(key)) pendingByDriver.set(key, { driverName: a.driverName, rows: [] });
      pendingByDriver.get(key)!.rows.push(o);
    }

    const driverMap = new Map<string, AllDeliveryRow[]>();
    for (const r of allDeliveries) {
      const key = r.driverName || "غير محدد";
      if (!driverMap.has(key)) driverMap.set(key, []);
      driverMap.get(key)!.push(r);
    }

    return (
      <div dir="rtl" style={{ paddingBottom: 100 }}>
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 6px" }}>
            <button onClick={() => setDrvWeekOffset(p => p + 1)} disabled={drvWeekOffset >= 0} style={{ background: "none", border: "none", cursor: drvWeekOffset >= 0 ? "default" : "pointer", opacity: drvWeekOffset >= 0 ? 0.25 : 1, padding: 6 }}>
              <ChevronRight size={18} style={{ color: C.sub }} />
            </button>
            <span style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{monthLabel}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => { setDrvWeekOffset(0); const d = new Date(); d.setHours(0,0,0,0); setDrvSelectedDate(d); loadAllDeliveries(d); setExpandedDrivers(new Set()); }} style={{ background: CLR_READY_DIM, borderRadius: 8, padding: "4px 10px", border: `1px solid ${CLR_READY}44`, cursor: "pointer", color: CLR_READY, fontWeight: 700, fontSize: 11 }}>اليوم</button>
              <button onClick={() => setDrvWeekOffset(p => p - 1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                <ChevronLeft size={18} style={{ color: C.sub }} />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "row-reverse", padding: "0 8px" }}>
            {weekDays.map((_, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <span style={{ color: C.muted, fontWeight: 600, fontSize: 10 }}>{DAY_ABBR[i]}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "row-reverse", padding: "4px 8px 8px" }}>
            {weekDays.map((d, i) => {
              const sel = isSelected(d);
              const tod = isToday(d);
              const fut = isFuture(d);
              return (
                <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => { if (fut) return; setDrvSelectedDate(d); loadAllDeliveries(d); setExpandedDrivers(new Set()); }}
                    style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: fut ? "default" : "pointer", opacity: fut ? 0.35 : 1, background: sel ? C.amber : tod ? C.amber + "22" : "transparent", color: sel ? "#0B0F14" : tod ? C.amber : C.text, fontWeight: sel || tod ? 800 : 500, fontSize: 13 }}
                  >
                    {d.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {allDeliveries.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { value: fmt2(totalCollected / 100) + " ر.س", label: "إجمالي التحصيل", color: C.green },
                { value: fmt2(cashCollected / 100) + " ر.س", label: "نقدي", color: C.amber },
              ].map((s, i) => (
                <div key={i} style={{ background: s.color + "18", borderRadius: 12, padding: 12, border: `1px solid ${s.color}33`, textAlign: "center" }}>
                  <div style={{ color: s.color, fontWeight: 800, fontSize: 18 }}>{s.value}</div>
                  <div style={{ color: s.color, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {pendingByDriver.size > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: C.amber }} />
                <span style={{ color: C.amber, fontWeight: 700, fontSize: 13 }}>⏳ بانتظار استلام المندوب ({pendingByDriver.size})</span>
              </div>
              {Array.from(pendingByDriver.entries()).map(([name, grp]) => (
                <div key={name} style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.amber}44`, overflow: "hidden" }}>
                  <div style={{ background: C.amber + "18", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: C.text }}>{name[0]}</div>
                    <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>🛵 {name}</span>
                    <span style={{ marginRight: "auto", color: C.amber, fontWeight: 700, fontSize: 12 }}>{grp.rows.length} طلب</span>
                  </div>
                  <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {grp.rows.map(o => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ background: C.amber + "22", padding: "2px 7px", borderRadius: 7, color: C.amber, fontWeight: 800, fontSize: 12 }}>#{o.dailyNumber ?? o.id}</span>
                          <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{o.customerName}</span>
                        </div>
                        <span style={{ color: C.green, fontWeight: 800, fontSize: 13 }}>{sar(o.totalPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeAssignments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: C.green }} />
                <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>🚗 بانتظار التسليم ({activeAssignments.length})</span>
                <div style={{ flex: 1 }} />
                <button onClick={loadActiveAssignments} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                  <RefreshCw size={12} style={{ color: C.green }} />
                </button>
              </div>
              {activeAssignments.map(a => {
                const gpsLost = !a.locationUpdatedAt || (Date.now() - new Date(a.locationUpdatedAt).getTime() > 30000);
                return (
                  <div key={a.orderId} style={{ background: C.surface, borderRadius: 14, border: `1px solid ${gpsLost ? C.amber + "44" : C.green + "44"}`, overflow: "hidden" }}>
                    {gpsLost && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.amber + "18", padding: "6px 12px", borderBottom: `1px solid ${C.amber}33` }}>
                        <span style={{ fontSize: 13 }}>⚠️</span>
                        <span style={{ color: C.amber, fontWeight: 700, fontSize: 12 }}>انقطع إشارة GPS للمندوب</span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", padding: 12, gap: 10 }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                          <span style={{ background: C.amber + "22", padding: "2px 7px", borderRadius: 7, color: C.amber, fontWeight: 800, fontSize: 12 }}>#{a.dailyNumber ?? a.orderId}</span>
                          <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{a.customerName}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: "row-reverse" }}>
                          <span style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>{sar(a.totalPrice)}</span>
                          <span style={{ color: a.paymentMethod === "cash" ? C.green : C.blue, fontSize: 12, fontWeight: 600 }}>{a.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}</span>
                        </div>
                        {a.customerAddress && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexDirection: "row-reverse" }}>
                            <MapPin size={12} style={{ color: C.muted }} />
                            {a.customerAddress.startsWith("https://") ? (
                              <a href={a.customerAddress} target="_blank" rel="noreferrer" style={{ color: C.green, fontSize: 12, textDecoration: "none" }}>📍 موقع على الخريطة</a>
                            ) : (
                              <span style={{ color: C.sub, fontSize: 12 }}>{a.customerAddress}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: CLR_READY_DIM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🛵</div>
                        <span style={{ color: C.green, fontWeight: 700, fontSize: 12, textAlign: "center" }}>{a.driverName}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", borderTop: `1px solid ${C.green}22` }}>
                      <a href={`tel:${a.driverPhone}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", color: C.blue, fontWeight: 700, fontSize: 12, textDecoration: "none", borderRight: `1px solid ${C.green}22` }}>
                        <Phone size={14} style={{ color: C.blue }} /> اتصل بالمندوب
                      </a>
                      <button
                        onClick={() => confirmDelivery(a.orderId)}
                        disabled={deliveringOrderId === a.orderId}
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", color: C.green, fontWeight: 700, fontSize: 12, background: "none", border: "none", cursor: "pointer" }}
                      >
                        <CheckCircle size={14} style={{ color: C.green }} />
                        {deliveringOrderId === a.orderId ? "..." : "تأكيد التسليم"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allDeliveriesLoading ? (
              <div style={{ textAlign: "center", padding: 20, color: C.sub }}>⏳ جارٍ التحميل...</div>
            ) : allDeliveries.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: C.muted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                <div>لا توجد توصيلات في هذا اليوم</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: C.blue }} />
                  <span style={{ color: C.blue, fontWeight: 700, fontSize: 13 }}>📋 سجل التوصيلات ({allDeliveries.length})</span>
                </div>
                {Array.from(driverMap.entries()).map(([name, rows]) => {
                  const total    = rows.reduce((s, r) => s + r.totalPrice, 0);
                  const expanded = expandedDrivers.has(name);
                  return (
                    <div key={name} style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.green}44`, overflow: "hidden" }}>
                      <button onClick={() => setExpandedDrivers(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; })} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, background: "none", border: "none", cursor: "pointer" }}>
                        <ChevronDown size={16} style={{ color: C.sub, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>{total.toFixed(2)} ر.س</div>
                            <div style={{ color: C.muted, fontSize: 11 }}>{rows.length} توصيلة</div>
                          </div>
                          <span style={{ color: C.green, fontWeight: 800, fontSize: 15 }}>🛵 {name}</span>
                        </div>
                      </button>
                      {expanded && (
                        <div style={{ borderTop: `1px solid ${C.green}33` }}>
                          {rows.map((r, i) => (
                            <div key={i} style={{ padding: "10px 14px", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: C.muted, fontSize: 11 }}>{fmtTime(r.deliveredAt)}</span>
                                <span style={{ color: r.paymentMethod === "cash" ? C.green : C.blue, fontSize: 12, fontWeight: 600 }}>{r.paymentMethod === "cash" ? "💵" : "💳"}</span>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{r.customerName}</div>
                                <div style={{ color: C.green, fontWeight: 800, fontSize: 14 }}>{r.totalPrice.toFixed(2)} ر.س</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  function FinancialSummary() {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayOrders   = orders.filter(o => new Date(o.createdAt) >= todayStart);
    const completed     = todayOrders.filter(o => o.status === "done");
    const cancelled     = todayOrders.filter(o => o.status === "cancelled");
    const totalSales    = completed.reduce((s, o) => s + o.totalPrice / 100, 0);
    const cashSales     = completed.filter(o => o.paymentMethod === "cash").reduce((s, o) => s + o.totalPrice / 100, 0);
    const elecSales     = completed.filter(o => o.paymentMethod !== "cash").reduce((s, o) => s + o.totalPrice / 100, 0);
    const avgOrder      = completed.length ? totalSales / completed.length : 0;
    const totalDiscount = completed.reduce((s, o) => s + (o.discountAmount ?? 0) / 100, 0);
    const deliveryFees  = completed.reduce((s, o) => s + (o.deliveryFee ?? 0) / 100, 0);
    const pickupSales   = completed.filter(o => o.orderType === "pickup").reduce((s, o) => s + o.totalPrice / 100, 0);
    const deliverySales = completed.filter(o => o.orderType === "delivery").reduce((s, o) => s + o.totalPrice / 100, 0);

    function StatCard({ label, value, icon: Icon, color, trend }: { label: string; value: string; icon: React.ElementType; color: string; trend?: number }) {
      return (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ background: color + "1a", color, width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={15} strokeWidth={2.5} />
            </div>
            {trend != null && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: trend >= 0 ? C.green : C.red }}>
                {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{label}</div>
        </div>
      );
    }

    return (
      <div dir="rtl" style={{ padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>نظرة عامة على اليوم</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard label="مبيعات اليوم"       value={`${fmt2(totalSales)} ر.س`}    icon={TrendingUp}   color={C.amber} />
            <StatCard label="صافي الإيراد"        value={`${fmt2(totalSales - totalDiscount)} ر.س`} icon={DollarSign} color={C.green} />
            <StatCard label="مبيعات التوصيل"      value={`${fmt2(deliverySales)} ر.س`} icon={Truck}        color={C.blue} />
            <StatCard label="مبيعات الاستلام"     value={`${fmt2(pickupSales)} ر.س`}   icon={Store}        color={C.violet} />
            <StatCard label="متوسط قيمة الطلب"   value={`${fmt2(avgOrder)} ر.س`}      icon={Package}      color={C.amber} />
            <StatCard label="طلبات ملغاة اليوم"  value={String(cancelled.length)}     icon={AlertTriangle} color={C.red} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 12 }}>طرق الدفع</div>
            {[
              { label: "نقدي",       val: cashSales, icon: Banknote,   color: C.green },
              { label: "إلكتروني",   val: elecSales, icon: CreditCard, color: C.blue },
            ].map(({ label, val, icon: Icon, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: C.sub }}>
                  <Icon size={14} style={{ color }} /> {label}
                </div>
                <span style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{fmt2(val)} ر.س</span>
              </div>
            ))}
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 12 }}>الرسوم والخصومات</div>
            {[
              { label: "رسوم التوصيل",    val: deliveryFees,  pos: true },
              { label: "الخصومات",         val: totalDiscount, pos: false },
            ].map(({ label, val, pos }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>{label}</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: pos ? C.text : C.red }}>
                  {!pos && val > 0 ? "-" : ""}{fmt2(val)} ر.س
                </span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>الطلبات المكتملة</span>
              <Badge color={C.green} soft>{completed.length}</Badge>
            </div>
          </div>
        </div>

        {drivers.length > 0 && allDeliveries.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>أرصدة المناديب النقدية</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: C.surface, padding: "10px 14px" }}>
                {["السائق", "النقد المحصّل", "الطلبات", "الرصيد المستحق"].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{h}</div>
                ))}
              </div>
              {(() => {
                const driverStats = new Map<string, { cash: number; count: number }>();
                for (const r of allDeliveries) {
                  const k = r.driverName || "غير محدد";
                  if (!driverStats.has(k)) driverStats.set(k, { cash: 0, count: 0 });
                  const s = driverStats.get(k)!;
                  if (r.paymentMethod === "cash") s.cash += r.totalPrice;
                  s.count++;
                }
                return Array.from(driverStats.entries()).map(([name, s], i) => (
                  <div key={name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{name}</span>
                    <span style={{ fontSize: 12, color: C.sub }}>{fmt2(s.cash / 100)} ر.س</span>
                    <span style={{ fontSize: 12, color: C.sub }}>{s.count}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.amber }}>{fmt2(s.cash / 100)} ر.س</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  const tabDef = [
    { key: "orders"  as CashierView, label: "الطلبات الواردة", icon: <ClipboardList size={17}/>, badge: pendingCount },
    { key: "pickup"  as CashierView, label: "تسليم الفرع",     icon: <Package size={17}/>,       badge: pickupPending },
    { key: "drivers" as CashierView, label: "المناديب",          icon: <Truck size={17}/>,         badge: activeAssignments.length },
    { key: "finance" as CashierView, label: "المالية",           icon: <TrendingUp size={17}/>,    badge: 0 },
    { key: "delivered" as CashierView, label: "الفواتير المسلّمة", icon: <CheckCircle size={17}/>, badge: orders.filter(o => o.status === "done").length },
  ];

  return (
    <div dir="rtl" style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Tajawal', 'Cairo', system-ui, sans-serif" }}>

      <div style={{ position: "sticky", top: 0, zIndex: 30, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.amber}, #C9761E)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cairo, sans-serif", fontWeight: 800, color: "#0B0F14", fontSize: 17, flexShrink: 0 }}>ر</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>مركز عمليات الطلبات</div>
              <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
                <CircleDot size={8} fill={C.green} style={{ color: C.green }} className={cn(fetching && "animate-pulse")} />
                متصل الآن
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, fontVariantNumeric: "tabular-nums", letterSpacing: 1 }} dir="ltr">{clock}</div>
            {hasNewOrder && (
              <div className="animate-bounce" style={{ display: "flex", alignItems: "center", gap: 5, background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 9999 }}>
                <Bell size={11} /> طلب جديد!
              </div>
            )}
            <button
              title={soundEnabled ? "إيقاف صوت التنبيه" : "تفعيل صوت التنبيه"}
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                setAudioBlocked(false);
                try { localStorage.setItem("cashier_sound", next ? "1" : "0"); } catch {}
                if (next && audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play().catch(() => {});
                }
              }}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${soundEnabled ? C.amber + "66" : C.border}`, background: soundEnabled ? C.amber + "18" : C.surface, color: soundEnabled ? C.amber : C.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .2s" }}
            >
              {soundEnabled ? <Bell size={15} /> : <BellOff size={15} />}
            </button>
            <button
              onClick={() => fetchOrders()}
              disabled={fetching}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.sub, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <RefreshCw size={15} className={cn(fetching && "animate-spin")} />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none", borderTop: `1px solid ${C.border}` }}>
          {tabDef.map(tab => {
            const active = cashierView === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setCashierView(tab.key); if (tab.key === "drivers") { loadActiveAssignments(); loadAllDeliveries(drvSelectedDate); } }}
                style={{
                  flex: 1, minWidth: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  padding: "10px 8px", border: "none", background: "transparent",
                  borderBottom: `2px solid ${active ? C.amber : "transparent"}`,
                  color: active ? C.text : C.muted,
                  fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  transition: "color .15s, border-color .15s",
                  position: "relative",
                }}
              >
                {tab.badge > 0 && (
                  <span style={{ position: "absolute", top: 6, right: "50%", transform: "translateX(8px)", background: C.red, borderRadius: "50%", minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 800, padding: "0 3px" }}>
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
                <span style={{ color: active ? C.amber : C.muted }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {cashierView === "orders" && (
          <div style={{ padding: "10px 14px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ color: C.muted, position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ابحث برقم الطلب أو اسم العميل أو الجوال"
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 38px 10px 12px", color: C.text, fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
              {ORDER_FILTERS.map(f => {
                const cnt = f.key === "all"
                  ? orders.filter(o => !["done","cancelled"].includes(o.status)).length
                  : orders.filter(o => o.status === f.key).length;
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700, background: active ? C.amber : C.card, border: `1px solid ${active ? C.amber + "aa" : C.border}`, color: active ? "#0B0F14" : C.sub, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
                  >
                    {f.label}
                    {cnt > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: active ? "#0B0F1466" : C.surface, color: active ? "#0B0F14" : C.muted }}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: autoAssign ? C.amber + "14" : C.card, border: `1px solid ${autoAssign ? C.amber + "55" : C.border}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ color: autoAssign ? C.amber : C.text, fontWeight: 700, fontSize: 13 }}>🛵 التعيين التلقائي للمندوب</span>
                <span style={{ color: C.muted, fontSize: 11 }}>{autoAssign ? "يعيّن أقرب مندوب متاح عند قبول الطلب" : "التعيين يدوي — كما هو الآن"}</span>
              </div>
              <Switch checked={autoAssign} onCheckedChange={v => { setAutoAssign(v); try { localStorage.setItem("cashier_auto_assign", String(v)); } catch {} }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                onClick={() => setSortNewest(p => !p)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, color: C.sub, fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 9, cursor: "pointer" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5h10M11 9h7M11 13h4"/><path d="m3 8 3-3 3 3M6 5v14"/></svg>
                {sortNewest ? "الأحدث أولاً" : "الأقدم أولاً"}
              </button>
              <button
                onClick={() => { setSelectMode(p => !p); if (selectMode) setSelectedIds(new Set()); }}
                style={{ display: "flex", alignItems: "center", gap: 6, color: selectMode ? C.amber : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", userSelect: "none", background: "none", border: "none", fontFamily: "inherit" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                تحديد للطباعة
              </button>
            </div>
          </div>
        )}
      </div>

      {cashierView === "orders" && hasNewOrder && (
        <div style={{ background: C.red, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>طلب جديد وصل!</span>
          <span style={{ fontSize: 18 }}>🔔</span>
        </div>
      )}

      {cashierView === "orders" && (
        <div style={{ padding: "12px 14px 120px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, alignItems: "start" }}>
          {loading ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 36 }}>⏳</div>
              <div style={{ color: C.sub, marginTop: 8, fontSize: 14 }}>جارٍ التحميل...</div>
            </div>
          ) : visibleOrders.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: C.muted }}>
              <Package size={40} style={{ opacity: 0.3, display: "block", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 14 }}>لا توجد طلبات مطابقة</div>
            </div>
          ) : (
            visibleOrders.map(order => <OrderCard key={order.id} order={order} />)
          )}
          {!loading && (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", color: C.muted, fontSize: 12, marginTop: 4 }}>
              {visibleOrders.length} طلب{filter !== "all" ? ` · من إجمالي ${orders.length}` : ""}
            </p>
          )}
        </div>
      )}

       {cashierView === "pickup"  && <PickupView />}
      {cashierView === "drivers" && <DriversView />}
      {cashierView === "finance" && <FinancialSummary />}
       {cashierView === "delivered" && <DeliveredView />}

      {selectMode && selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 40, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 16px 40px rgba(0,0,0,.5)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            تم تحديد <span style={{ color: C.amber, fontWeight: 800 }}>{selectedIds.size}</span> طلب
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.sub, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 9, cursor: "pointer" }}>إلغاء</button>
            <button
              onClick={() => { printBulk(orders.filter(o => selectedIds.has(o.id))); setSelectedIds(new Set()); setSelectMode(false); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: C.amber + "22", border: `1px solid ${C.amber}55`, color: C.amber, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 9, cursor: "pointer" }}
            >
              <Printer size={14} /> طباعة المحدد
            </button>
          </div>
        </div>
      )}

      {assigningOrder && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setAssigningOrder(null)}
        >
          <div
            style={{ backgroundColor: C.surface, borderRadius: 20, width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: "0 24px 60px rgba(0,0,0,.6)" }}
            dir="rtl"
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
              <button onClick={() => setAssigningOrder(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={22} style={{ color: C.sub }} />
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>🛵 تعيين مندوب</div>
                <div style={{ color: C.sub, fontSize: 12 }}>طلب #{assigningOrder.dailyNumber ?? assigningOrder.id} — {assigningOrder.customerName}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {drivers.filter(d => d.isOnline).length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🛵</div>
                  <div>لا يوجد مناديب متصلون</div>
                </div>
              ) : drivers.filter(d => d.isOnline).map(d => {
                const activeCount = activeAssignments.filter(a => a.driverId === d.id).length;
                const isAvailable = activeCount === 0;
                return (
                  <button
                    key={d.id}
                    onClick={() => assignDriver(assigningOrder.id, d.id)}
                    style={{ background: C.card, borderRadius: 14, padding: "12px 14px", border: `1px solid ${isAvailable ? C.green + "44" : C.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%", fontFamily: "inherit", textAlign: "right" }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1 }}>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{d.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{d.phone}</div>
                      {activeCount > 0 && (
                        <div style={{ color: C.amber, fontSize: 11, marginTop: 2 }}>{activeCount} طلب نشط</div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: isAvailable ? C.green + "22" : C.amber + "22", border: `1.5px solid ${isAvailable ? C.green + "55" : C.amber + "55"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🛵</div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isAvailable ? C.green : C.amber }}>{isAvailable ? "متاح" : "مشغول"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {chatOrder && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${C.border}` }} dir="rtl">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
              <button onClick={() => setChatOrder(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={22} style={{ color: C.sub }} />
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>💬 مراسلة العميل</div>
                <div style={{ color: C.sub, fontSize: 12 }}>طلب #{chatOrder.dailyNumber ?? chatOrder.id} — {chatOrder.customerName}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {chatLoading ? (
                <div style={{ textAlign: "center", color: C.sub }}>⏳</div>
              ) : chatMsgs.length === 0 ? (
                <div style={{ textAlign: "center", color: C.muted, marginTop: 24 }}>لا توجد رسائل بعد</div>
              ) : chatMsgs.map(msg => (
                <div key={msg.id} style={{ display: "flex", justifyContent: msg.fromCashier ? "flex-start" : "flex-end" }}>
                  <div style={{ maxWidth: "80%", background: msg.fromCashier ? C.card : C.green + "22", borderRadius: 14, padding: "10px 14px", border: msg.fromCashier ? `1px solid ${C.border}` : `1px solid ${C.green}33` }}>
                    <div style={{ fontSize: 14, color: C.text }}>{msg.text}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textAlign: msg.fromCashier ? "right" : "left" }}>
                      {new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                      {msg.fromCashier && <span style={{ marginRight: 4 }}>{msg.readAt ? "✓✓" : "✓"}</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={sendChatMessage}
                disabled={chatSending || !chatInput.trim()}
                style={{ width: 40, height: 40, borderRadius: 10, background: chatInput.trim() ? C.amber + "22" : C.card, border: `1px solid ${chatInput.trim() ? C.amber + "55" : C.border}`, color: chatInput.trim() ? C.amber : C.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: chatInput.trim() ? "pointer" : "default", flexShrink: 0 }}
              >
                <Send size={16} />
              </button>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
                placeholder="اكتب رسالة..."
                style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontFamily: "inherit", fontSize: 14, outline: "none" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
