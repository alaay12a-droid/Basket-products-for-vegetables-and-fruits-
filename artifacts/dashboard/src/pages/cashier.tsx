import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiPut, apiDel } from "@/lib/api";
import { formatCurrency, getOrderPriceFactor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, MessageCircle, Bell, Package, Settings, Users,
  ChevronLeft, ChevronRight, MapPin, Phone, Printer, Truck,
  CheckCircle, X, UserPlus, MessageSquare, Loader2, RotateCcw,
  ClipboardList, Navigation, Calendar,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type OrderStatus = "pending" | "preparing" | "ready" | "done" | "cancelled";

interface OrderItem { id: string; name: string; price: number; quantity: number; }
interface Order {
  id: number; dailyNumber: number | null; customerName: string;
  customerPhone: string; customerAddress: string | null;
  items: OrderItem[]; totalPrice: number; deliveryFee: number | null;
  discountCode: string | null; discountAmount: number | null;
  status: OrderStatus; paymentMethod: string; notes: string | null;
  createdAt: string;
}

interface Driver { id: number; name: string; phone: string; active: boolean; isOnline: boolean; }
interface ActiveAssignment {
  orderId: number; driverId: number; pickedUpAt: string | null;
  driverName: string; driverPhone: string; dailyNumber: number | null;
  customerName: string; customerAddress: string | null;
  totalPrice: number; paymentMethod: string; locationUpdatedAt: string | null;
  status?: string;
}
interface AllDeliveryRow {
  orderId: number; dailyNumber: number | null; customerName: string;
  totalPrice: number; paymentMethod: string; driverName: string | null;
  deliveredAt: string | null;
}
interface DrvSummary {
  driver: { id: number; name: string; phone: string };
  ordersCount: number; totalCollected: number; cashCollected: number;
  electronicCollected: number; cancelledCount: number;
  orders: { orderId: number; dailyNumber: number | null; customerName: string; totalPrice: number; paymentMethod: string; deliveredAt: string | null; cancelled: boolean }[];
}
interface DrvStatement {
  today: { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number };
  thisMonth: { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number };
  thisYear: { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number };
  allTime: { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number };
}
interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; createdAt: string; }
interface ApiMenuItem { id: string; name: string; category: string; price: number; isAvailable: boolean; stock: number | null; imageUrl?: string; }
interface DriverForm { id?: number; name: string; phone: string; pin: string; active: boolean; }

type CashierView = "orders" | "pickup" | "drivers";
type FilterKey = OrderStatus | "all";

const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: "جديد",       color: "text-red-500",    bg: "bg-red-500/10 border-red-500/30" },
  preparing: { label: "يُحضَّر",    color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30" },
  ready:     { label: "جاهز",       color: "text-green-500",  bg: "bg-green-500/10 border-green-500/30" },
  done:      { label: "تم",         color: "text-zinc-400",   bg: "bg-zinc-500/10 border-zinc-500/30" },
  cancelled: { label: "ملغي",       color: "text-zinc-400",   bg: "bg-zinc-500/10 border-zinc-500/30" },
};

function fmtTime(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}
function fmtPrice(riyals: number) { return `${riyals.toFixed(2)} ر.س`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Cashier() {
  const { toast } = useToast();

  // Auth
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [cashierPin, setCashierPin] = useState("1234");
  const [pinsLoaded, setPinsLoaded] = useState(false);

  // Core data
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const knownIds = useRef<Set<number>>(new Set());
  const isFirst = useRef(true);

  // View & filter
  const [cashierView, setCashierView] = useState<CashierView>("orders");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Drivers
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<AllDeliveryRow[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<ActiveAssignment[]>([]);
  const [drvSelectedDate, setDrvSelectedDate] = useState(new Date());
  const [drvWeekOffset, setDrvWeekOffset] = useState(0);
  const [drvSummaries, setDrvSummaries] = useState<DrvSummary[]>([]);

  // Modals
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showDriversMgmt, setShowDriversMgmt] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [drvDetailDriver, setDrvDetailDriver] = useState<Driver | null>(null);
  const [chatOrder, setChatOrder] = useState<Order | null>(null);

  // Broadcast
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastRemaining, setBroadcastRemaining] = useState<number | null>(null);

  // Stock
  const [menuItems, setMenuItems] = useState<ApiMenuItem[]>([]);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [stockSaving, setStockSaving] = useState<string | null>(null);

  // Driver management form
  const [driverForm, setDriverForm] = useState<DriverForm>({ name: "", phone: "", pin: "", active: true });
  const [driverFormSaving, setDriverFormSaving] = useState(false);
  const [editingDriverId, setEditingDriverId] = useState<number | null>(null);
  const [showDriverForm, setShowDriverForm] = useState(false);

  // Driver statement
  const [drvStatement, setDrvStatement] = useState<DrvStatement | null>(null);
  const [drvStatementTab, setDrvStatementTab] = useState<"today" | "month" | "year" | "all">("today");
  const [drvStatementLoading, setDrvStatementLoading] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [unreadByOrder, setUnreadByOrder] = useState<Record<number, number>>({});
  const chatRef = useRef<HTMLDivElement>(null);

  // Print receipt
  const [printCash, setPrintCash] = useState("");

  // Auto-assign toggle (persisted across sessions)
  const [autoAssign, setAutoAssign] = useState(() => localStorage.getItem("cashier_auto_assign") === "true");
  const [autoAssigning, setAutoAssigning] = useState(false);

  // Polling refs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load PINs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    apiGet<{ cashier?: string; admin?: string }>("/settings/pins")
      .then(data => {
        if (data.cashier) setCashierPin(data.cashier);
        setPinsLoaded(true);
      })
      .catch(() => setPinsLoaded(true));
  }, []);

  // ── Fetch orders ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const data = await apiGet<Order[]>("/orders");
      if (!isFirst.current) {
        const newPending = data.filter(o => o.status === "pending" && !knownIds.current.has(o.id));
        if (newPending.length > 0) {
          setHasNewOrder(true);
          setTimeout(() => setHasNewOrder(false), 5000);
          try { new Audio("/sounds/order.mp3").play().catch(() => {}); } catch {}
          document.title = `(${data.filter(o => o.status === "pending").length}) طلب جديد 🔔 | الكاشير`;
        }
      } else {
        const pendingCount = data.filter(o => o.status === "pending").length;
        if (pendingCount > 0) document.title = `(${pendingCount}) طلب جديد 🔔 | الكاشير`;
      }
      data.forEach(o => knownIds.current.add(o.id));
      isFirst.current = false;
      setOrders(data);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const data = await apiGet<Record<number, number>>("/messages/unread-counts?fromCashier=true");
      setUnreadByOrder(data);
    } catch {}
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const data = await apiGet<Driver[]>("/drivers");
      setDrivers(data);
    } catch {}
  }, []);

  const fetchActiveAssignments = useCallback(async () => {
    try {
      const assignments = await apiGet<ActiveAssignment[]>("/drivers/active-assignments");
      setActiveAssignments(assignments);
    } catch {}
  }, []);

  const fetchDeliveries = useCallback(async (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    try {
      const [deliveries, assignments, summaries] = await Promise.all([
        apiGet<AllDeliveryRow[]>(`/drivers/all-deliveries?date=${dateStr}`),
        apiGet<ActiveAssignment[]>("/drivers/active-assignments"),
        apiGet<DrvSummary[]>("/drivers/daily-summaries"),
      ]);
      setAllDeliveries(deliveries);
      setActiveAssignments(assignments);
      setDrvSummaries(summaries);
    } catch {}
  }, []);

  // ── Start polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authenticated) return;
    fetchOrders();
    fetchUnreadCounts();
    fetchDrivers();
    fetchDeliveries(drvSelectedDate);
    pollRef.current = setInterval(() => {
      fetchOrders(true);
      fetchUnreadCounts();
      fetchDrivers();
      fetchActiveAssignments();
      if (cashierView === "drivers") fetchDeliveries(drvSelectedDate);
    }, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.title = "لوحة الإدارة";
    };
  }, [authenticated, fetchOrders, fetchUnreadCounts, fetchDrivers, fetchDeliveries, fetchActiveAssignments, cashierView, drvSelectedDate]);

  // ── Date change for drivers ────────────────────────────────────────────────
  useEffect(() => {
    if (authenticated && cashierView === "drivers") fetchDeliveries(drvSelectedDate);
  }, [drvSelectedDate, authenticated, cashierView, fetchDeliveries]);

  // ── Broadcast quota ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!showBroadcastModal) return;
    apiGet<{ sent: number; remaining: number }>("/notifications/broadcast")
      .then(d => setBroadcastRemaining(d.remaining))
      .catch(() => {});
  }, [showBroadcastModal]);

  // ── Stock items ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showStockModal) return;
    apiGet<ApiMenuItem[]>("/menu")
      .then(items => {
        setMenuItems(items);
        const edits: Record<string, string> = {};
        items.forEach(i => { edits[i.id] = i.stock != null ? String(i.stock) : ""; });
        setStockEdits(edits);
      })
      .catch(() => {});
  }, [showStockModal]);

  // ── Driver statement ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!drvDetailDriver) return;
    setDrvStatementLoading(true);
    apiGet<DrvStatement>(`/drivers/${drvDetailDriver.id}/statement`)
      .then(data => setDrvStatement(data))
      .catch(() => setDrvStatement(null))
      .finally(() => setDrvStatementLoading(false));
  }, [drvDetailDriver]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatOrder) return;
    setChatLoading(true);
    apiGet<ChatMsg[]>(`/messages/order/${chatOrder.id}`)
      .then(msgs => setChatMessages(msgs))
      .catch(() => {})
      .finally(() => setChatLoading(false));
    apiPatch<void>(`/messages/order/${chatOrder.id}/read`, { fromCashier: true }).catch(() => {});
  }, [chatOrder]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  // ── PIN Submit ────────────────────────────────────────────────────────────
  const handlePinSubmit = () => {
    if (!pinsLoaded) return;
    if (pinInput === cashierPin) { setAuthenticated(true); setPinInput(""); }
    else { toast({ title: "رمز خاطئ", description: "الرمز المدخل غير صحيح", variant: "destructive" }); setPinInput(""); }
  };

  // ── Order actions ─────────────────────────────────────────────────────────
  const handleUpdateStatus = async (order: Order, newStatus: OrderStatus) => {
    try {
      await apiPatch(`/orders/${order.id}/status`, { status: newStatus });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
    } catch { toast({ title: "خطأ", description: "فشل تحديث الحالة", variant: "destructive" }); }
  };

  // ── Accept + optional auto-assign ────────────────────────────────────────
  const handleAcceptAndAutoAssign = async (order: Order) => {
    try {
      await apiPatch(`/orders/${order.id}/status`, { status: "preparing" });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "preparing" } : o));
    } catch {
      toast({ title: "خطأ", description: "فشل تحديث الحالة", variant: "destructive" });
      return;
    }
    // Auto-assign only for delivery orders
    if (!autoAssign || !order.customerAddress?.trim()) return;
    setAutoAssigning(true);
    try {
      const result = await apiPost<{ ok: boolean; driverName?: string; error?: string }>(
        `/orders/${order.id}/auto-assign-driver`, {}
      );
      if (result.ok) {
        fetchDeliveries(drvSelectedDate);
        toast({ title: "✅ تم التعيين التلقائي", description: `تم تعيين المندوب: ${result.driverName}` });
      } else {
        toast({ title: "⚠️ لا يوجد مندوب متاح", description: result.error ?? "لا يوجد مندوب متاح حاليًا للتعيين التلقائي.", variant: "destructive" });
      }
    } catch {
      toast({ title: "⚠️ لا يوجد مندوب متاح", description: "لا يوجد مندوب متاح حاليًا للتعيين التلقائي.", variant: "destructive" });
    } finally {
      setAutoAssigning(false);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (!window.confirm(`إلغاء الطلب #${order.dailyNumber ?? order.id}؟`)) return;
    try {
      await apiPatch(`/orders/${order.id}/status`, { status: "cancelled" });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: "cancelled" } : o));
    } catch { toast({ title: "خطأ", description: "فشل الإلغاء", variant: "destructive" }); }
  };

  const handleAssignDriver = async (orderId: number, driverId: number) => {
    try {
      await apiPost(`/orders/${orderId}/assign-driver`, { driverId });
      setAssigningOrderId(null);
      fetchDeliveries(drvSelectedDate);
      toast({ title: "تم التعيين", description: "تم تعيين المندوب بنجاح" });
    } catch (error) {
      await fetchDrivers();
      toast({
        title: "تعذّر التعيين",
        description: error instanceof Error ? error.message : "فشل التعيين",
        variant: "destructive",
      });
    }
  };

  const handleConfirmDelivery = async (orderId: number) => {
    try {
      await apiPatch(`/orders/${orderId}/status`, { status: "done" });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "done" } : o));
      setActiveAssignments(prev => prev.filter(a => a.orderId !== orderId));
      toast({ title: "تم التسليم" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Broadcast ─────────────────────────────────────────────────────────────
  const sendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;
    setBroadcastSending(true);
    try {
      const res = await apiPost<{ ok: number; remaining: number }>("/notifications/broadcast", { title: broadcastTitle, body: broadcastBody });
      setBroadcastRemaining(res.remaining);
      setBroadcastTitle(""); setBroadcastBody("");
      toast({ title: `تم الإرسال (${res.ok} مستخدم)` });
      setShowBroadcastModal(false);
    } catch { toast({ title: "خطأ في الإرسال", variant: "destructive" }); }
    finally { setBroadcastSending(false); }
  };

  // ── Stock ─────────────────────────────────────────────────────────────────
  const handleSaveStock = async (itemId: string) => {
    setStockSaving(itemId);
    const val = stockEdits[itemId];
    const stock = val === "" ? null : parseInt(val);
    try {
      await apiPut(`/menu/${itemId}`, { stock });
      setMenuItems(prev => prev.map(i => i.id === itemId ? { ...i, stock } : i));
      toast({ title: "تم حفظ المخزون" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setStockSaving(null); }
  };

  const handleToggleAvailability = async (item: ApiMenuItem) => {
    try {
      await apiPut(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i));
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Driver management ─────────────────────────────────────────────────────
  const openAddDriver = () => { setDriverForm({ name: "", phone: "", pin: "", active: true }); setEditingDriverId(null); setShowDriverForm(true); };
  const openEditDriver = (d: Driver) => { setDriverForm({ name: d.name, phone: d.phone, pin: "", active: d.active }); setEditingDriverId(d.id); setShowDriverForm(true); };

  const handleSaveDriver = async () => {
    if (!driverForm.name.trim() || !driverForm.phone.trim()) return;
    setDriverFormSaving(true);
    try {
      if (editingDriverId) {
        await apiPut(`/drivers/${editingDriverId}`, { name: driverForm.name, phone: driverForm.phone, active: driverForm.active, ...(driverForm.pin ? { pin: driverForm.pin } : {}) });
      } else {
        await apiPost("/drivers", { name: driverForm.name, phone: driverForm.phone, pin: driverForm.pin, active: driverForm.active });
      }
      await fetchDrivers();
      setShowDriverForm(false);
      toast({ title: editingDriverId ? "تم التعديل" : "تمت الإضافة" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setDriverFormSaving(false); }
  };

  const handleDeleteDriver = async (id: number) => {
    if (!window.confirm("حذف المندوب؟")) return;
    try {
      await apiDel(`/drivers/${id}`);
      await fetchDrivers();
      toast({ title: "تم الحذف" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  const handleToggleDriver = async (d: Driver) => {
    try {
      await apiPut(`/drivers/${d.id}`, { active: !d.active });
      setDrivers(prev => prev.map(dr => dr.id === d.id ? { ...dr, active: !dr.active } : dr));
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendChatMessage = async () => {
    if (!chatOrder || !chatInput.trim()) return;
    setChatSending(true);
    const text = chatInput;
    setChatInput("");
    try {
      const msg = await apiPost<ChatMsg>(`/messages/order/${chatOrder.id}`, { text, fromCashier: true });
      setChatMessages(prev => [...prev, msg]);
    } catch { toast({ title: "خطأ في الإرسال", variant: "destructive" }); setChatInput(text); }
    finally { setChatSending(false); }
  };

  // ── Print receipt ─────────────────────────────────────────────────────────
  const handlePrint = () => { window.print(); };

  // ── Weekly calendar ───────────────────────────────────────────────────────
  const getWeekDays = () => {
    const today = new Date();
    today.setDate(today.getDate() + drvWeekOffset * 7);
    const days: Date[] = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i); days.push(d);
    }
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i); days.push(d);
    }
    return days;
  };
  const weekDays = getWeekDays();

  // ── Filtered orders ───────────────────────────────────────────────────────
  const filteredOrders = (view: CashierView) => {
    let base = orders;
    if (view === "pickup") base = orders.filter(o => !o.customerAddress || o.customerAddress.trim() === "");
    if (filter !== "all") base = base.filter(o => o.status === filter);
    return base;
  };

  // ── Action button for order ───────────────────────────────────────────────
  const renderOrderActions = (order: Order) => {
    const assignmentInfo = activeAssignments.find(a => a.orderId === order.id);
    const isActive = order.status !== "done" && order.status !== "cancelled";

    return (
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
        {order.status === "pending" && (
          <button onClick={() => handleAcceptAndAutoAssign(order)} disabled={autoAssigning}
            className="flex-1 min-w-0 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-colors">
            {autoAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            قبول الطلب
          </button>
        )}
        {order.status === "preparing" && (
          <button onClick={() => handleUpdateStatus(order, "ready")}
            className="flex-1 min-w-0 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-colors">
            <CheckCircle className="h-4 w-4" /> تم التجهيز
          </button>
        )}
        {order.status === "ready" && !assignmentInfo && (
          <button onClick={() => handleUpdateStatus(order, "done")}
            className="flex-1 min-w-0 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-colors">
            <CheckCircle className="h-4 w-4" /> تم التسليم
          </button>
        )}
        {isActive && !assignmentInfo && order.status !== "pending" && !(!order.customerAddress || order.customerAddress.trim() === "") && (
          <button onClick={() => setAssigningOrderId(order.id)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-xl flex items-center gap-1 transition-colors">
            <Truck className="h-4 w-4" /> تعيين مندوب
          </button>
        )}
        {assignmentInfo && (
          <>
            <button onClick={() => setAssigningOrderId(order.id)}
              className="bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm font-bold py-2 px-3 rounded-xl flex items-center gap-1 hover:bg-amber-500/20 transition-colors">
              <Truck className="h-4 w-4" /> {assignmentInfo.driverName}
            </button>
            <button onClick={() => setTrackingOrderId(order.id)}
              className="bg-blue-500/10 border border-blue-500/30 text-blue-600 text-sm font-bold py-2 px-3 rounded-xl flex items-center gap-1 hover:bg-blue-500/20 transition-colors">
              <Navigation className="h-4 w-4" /> تتبع
            </button>
          </>
        )}
        {order.status !== "done" && order.status !== "cancelled" && (
          <button onClick={() => handleCancelOrder(order)}
            className="bg-red-500/10 border border-red-500/30 text-red-600 text-sm font-bold py-2 px-3 rounded-xl flex items-center gap-1 hover:bg-red-500/20 transition-colors">
            <X className="h-4 w-4" /> إلغاء
          </button>
        )}
        <button onClick={() => { setChatOrder(order); setChatMessages([]); }}
          className="relative bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-sm py-2 px-3 rounded-xl flex items-center gap-1 transition-colors">
          <MessageCircle className="h-4 w-4" />
          {(unreadByOrder[order.id] ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
              {unreadByOrder[order.id]}
            </span>
          )}
        </button>
        <button onClick={() => { setPrintOrder(order); setPrintCash(""); }}
          className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-sm py-2 px-3 rounded-xl flex items-center gap-1 transition-colors">
          <Printer className="h-4 w-4" />
        </button>
      </div>
    );
  };

  // ── Order Card ────────────────────────────────────────────────────────────
  const renderOrderCard = (order: Order) => {
    const meta = STATUS_META[order.status];
    const isDelivery = !!order.customerAddress?.trim();
    const assignment = activeAssignments.find(a => a.orderId === order.id);
    return (
      <div key={order.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className={cn("flex items-center justify-between px-4 py-2 border-b border-border/50", meta.bg)}>
          <div className="flex items-center gap-2">
            <span className="font-black text-lg text-foreground">#{order.dailyNumber ?? order.id}</span>
            <Badge variant="outline" className={cn("text-xs font-bold", meta.color)}>{meta.label}</Badge>
            {isDelivery && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">🛵 توصيل</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">{fmtTime(order.createdAt)}</span>
        </div>
        {/* Body */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">{order.customerName}</span>
            <a href={`tel:${order.customerPhone}`} className="text-blue-500 hover:text-blue-600">
              <Phone className="h-3.5 w-3.5" />
            </a>
          </div>
          {order.customerAddress && (
            <div className="flex items-start gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{order.customerAddress}</span>
            </div>
          )}
          {assignment && (
            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <Truck className="h-3 w-3" />
              <span>🛵 {assignment.driverName}</span>
            </div>
          )}
          {/* Items */}
          <div className="space-y-1">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{item.name}</span>
                <span className="text-muted-foreground">× {item.quantity}</span>
              </div>
            ))}
          </div>
          {order.notes && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5 text-xs text-amber-800 dark:text-amber-400">
              📝 {order.notes}
            </div>
          )}
          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <span className="font-black text-lg text-amber-500">{formatCurrency(order.totalPrice)}</span>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
              order.paymentMethod === "cash" ? "bg-green-100 text-green-700" :
              order.paymentMethod === "electronic" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
            )}>
              {order.paymentMethod === "cash" ? "💵 نقدي" : order.paymentMethod === "electronic" ? "💳 إلكتروني" : "👛 محفظة"}
            </span>
          </div>
          {renderOrderActions(order)}
        </div>
      </div>
    );
  };

  // ── PIN Screen ────────────────────────────────────────────────────────────
  if (!pinsLoaded || !authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🔐</div>
          <h2 className="text-2xl font-black text-foreground">لوحة الكاشير</h2>
          <p className="text-muted-foreground text-sm mt-1">أدخل رمز الدخول</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <Input
            type="password"
            placeholder="••••••"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
            className="text-center text-xl tracking-widest h-14 rounded-2xl border-2 text-right"
            dir="ltr"
          />
          <Button onClick={handlePinSubmit} disabled={!pinsLoaded}
            className="w-full h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-base">
            {!pinsLoaded ? <Loader2 className="h-5 w-5 animate-spin" /> : "دخول"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Count helpers ─────────────────────────────────────────────────────────
  const pendingCount = orders.filter(o => o.status === "pending").length;
  const totalUnread = Object.values(unreadByOrder).reduce((a, b) => a + b, 0);

  // ── Day stats for selected date ───────────────────────────────────────────
  const todayDeliveries = allDeliveries;
  const totalCollected = todayDeliveries.reduce((s, r) => s + r.totalPrice, 0);
  const cashCollected = todayDeliveries.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);

  return (
    <div className="space-y-4 -mt-2">
      {/* ── New order alert ──────────────────────────────────────────────── */}
      {hasNewOrder && (
        <div className="bg-red-500 text-white font-bold text-center py-3 rounded-2xl animate-pulse text-base flex items-center justify-center gap-2">
          <Bell className="h-5 w-5" /> 🔔 طلب جديد وصل!
        </div>
      )}

      {/* ── Header action buttons ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowBroadcastModal(true)}
          className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-green-500/20 transition-colors">
          <Bell className="h-4 w-4" /> إشعار
        </button>
        <button onClick={() => setShowStockModal(true)}
          className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-green-500/20 transition-colors">
          <Package className="h-4 w-4" /> المخزون
        </button>
        <button onClick={() => setShowDriversMgmt(true)}
          className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-green-500/20 transition-colors">
          <Users className="h-4 w-4" /> مناديب
        </button>
        <button onClick={() => fetchOrders(true)} disabled={refreshing}
          className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
        <div className="relative">
          <button onClick={() => { /* show chat list */ }}
            className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
            <MessageCircle className="h-4 w-4" />
            {totalUnread > 0 && <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0">{totalUnread}</span>}
          </button>
        </div>
      </div>

      {/* ── Auto-assign toggle ────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2.5 rounded-xl border transition-colors",
        autoAssign
          ? "bg-blue-500/10 border-blue-500/30"
          : "bg-zinc-100 dark:bg-zinc-800 border-transparent"
      )}>
        <div className="flex items-center gap-2">
          <Truck className={cn("h-4 w-4", autoAssign ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
          <div>
            <p className={cn("text-sm font-semibold leading-tight", autoAssign ? "text-blue-700 dark:text-blue-300" : "text-foreground")}>
              التعيين التلقائي للمندوب
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {autoAssign ? "يعيّن أقرب مندوب متاح عند قبول الطلب تلقائياً" : "التعيين يدوي — كما هو الآن"}
            </p>
          </div>
        </div>
        <Switch
          checked={autoAssign}
          onCheckedChange={v => { setAutoAssign(v); localStorage.setItem("cashier_auto_assign", String(v)); }}
        />
      </div>

      {/* ── Tab navigation ────────────────────────────────────────────────── */}
      <div className="flex border-b border-border">
        {([
          { key: "orders", icon: ClipboardList, label: "استقبال الطلبات", badge: pendingCount },
          { key: "pickup", icon: Package, label: "تسليم الفرع", badge: 0 },
          { key: "drivers", icon: Truck, label: "المناديب", badge: activeAssignments.length },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setCashierView(tab.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold border-b-2 transition-colors relative",
              cashierView === tab.key
                ? "border-amber-500 text-amber-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="h-5 w-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ORDERS / PICKUP VIEW
         ══════════════════════════════════════════════════════════════════════ */}
      {(cashierView === "orders" || cashierView === "pickup") && (
        <div className="space-y-4">
          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              { key: "all", label: "الكل" },
              { key: "pending", label: "جديد" },
              { key: "preparing", label: "يُحضَّر" },
              { key: "ready", label: "جاهز" },
              { key: "done", label: "تم" },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={cn(
                  "whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors",
                  filter === f.key
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-card text-muted-foreground border-border hover:border-amber-500/50"
                )}>
                {f.label}
                {f.key !== "all" && orders.filter(o => o.status === f.key).length > 0 && (
                  <span className="mr-1.5 bg-white/20 dark:bg-black/20 rounded-full px-1.5 text-xs">
                    {orders.filter(o => o.status === f.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Order list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : filteredOrders(cashierView).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <span className="text-5xl">🍽️</span>
              <span className="text-base font-medium">لا توجد طلبات</span>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders(cashierView).map(order => renderOrderCard(order))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DRIVERS VIEW
         ══════════════════════════════════════════════════════════════════════ */}
      {cashierView === "drivers" && (
        <div className="space-y-4">
          {/* Weekly calendar */}
          <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <button onClick={() => setDrvWeekOffset(w => w - 1)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
              <span className="text-sm font-semibold text-foreground">
                {weekDays[3].toLocaleDateString("ar-SA", { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => setDrvWeekOffset(w => w + 1)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const isSelected = day.toDateString() === drvSelectedDate.toDateString();
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <button key={i} onClick={() => setDrvSelectedDate(day)}
                    className={cn(
                      "flex flex-col items-center py-2 rounded-xl text-xs font-medium transition-colors",
                      isSelected ? "bg-amber-500 text-white" :
                      isToday ? "bg-amber-100 dark:bg-amber-900/20 text-amber-600" :
                      "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted-foreground"
                    )}>
                    <span>{day.toLocaleDateString("ar-SA", { weekday: "short" })}</span>
                    <span className="font-bold">{day.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-amber-500">{fmtPrice(totalCollected)}</div>
              <div className="text-[11px] text-muted-foreground">الإجمالي</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-green-600">{fmtPrice(cashCollected)}</div>
              <div className="text-[11px] text-muted-foreground">نقدي</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
              <div className="text-lg font-black text-blue-600">{todayDeliveries.length}</div>
              <div className="text-[11px] text-muted-foreground">توصيلة</div>
            </div>
          </div>

          {/* Active assignments */}
          {activeAssignments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                في الطريق ({activeAssignments.length})
              </h3>
              {activeAssignments.map(a => (
                <div key={a.orderId} className="bg-card border border-green-500/20 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-foreground">#{a.dailyNumber ?? a.orderId} — {a.customerName}</div>
                      <div className="text-xs text-green-600 font-medium mt-0.5">🛵 {a.driverName}</div>
                      {a.customerAddress && <div className="text-xs text-muted-foreground mt-0.5"><MapPin className="h-3 w-3 inline ml-1" />{a.customerAddress}</div>}
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-black text-amber-500 text-sm">{fmtPrice(a.totalPrice)}</div>
                      <div className="flex gap-1">
                        <button onClick={() => setTrackingOrderId(a.orderId)}
                          className="bg-blue-500/10 border border-blue-500/30 text-blue-600 text-xs py-1 px-2 rounded-lg flex items-center gap-1 hover:bg-blue-500/20 transition-colors">
                          <Navigation className="h-3 w-3" /> تتبع
                        </button>
                        <button onClick={() => handleConfirmDelivery(a.orderId)}
                          className="bg-green-500/10 border border-green-500/30 text-green-600 text-xs py-1 px-2 rounded-lg flex items-center gap-1 hover:bg-green-500/20 transition-colors">
                          <CheckCircle className="h-3 w-3" /> تسليم
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Deliveries grouped by driver */}
          {(() => {
            const driverMap = new Map<string, AllDeliveryRow[]>();
            for (const r of allDeliveries) {
              const key = r.driverName || "غير محدد";
              if (!driverMap.has(key)) driverMap.set(key, []);
              driverMap.get(key)!.push(r);
            }
            const groups = Array.from(driverMap.entries()).map(([name, rows]) => {
              const total = rows.reduce((s, r) => s + r.totalPrice, 0);
              const cash = rows.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);
              return { name, rows, total, cash, electronic: total - cash };
            });
            if (groups.length === 0) return (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Truck className="h-10 w-10 opacity-20" />
                <span className="text-sm">لا توجد توصيلات لهذا اليوم</span>
              </div>
            );
            return (
              <div className="space-y-3">
                {groups.map(group => (
                  <div key={group.name} className="bg-card border border-green-500/20 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between p-3 bg-green-500/5">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center text-base">🛵</div>
                        <div>
                          <div className="font-bold text-sm text-green-600">{group.name}</div>
                          <div className="flex gap-2 text-[11px] text-muted-foreground">
                            <span>{group.rows.length} طلب</span>
                            {group.cash > 0 && <span className="text-green-600">💵 {fmtPrice(group.cash)}</span>}
                            {group.electronic > 0 && <span className="text-blue-600">💳 {fmtPrice(group.electronic)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="font-black text-amber-500">{fmtPrice(group.total)}</div>
                    </div>
                    <div className="divide-y divide-border/50">
                      {group.rows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2.5 text-sm">
                          <div>
                            <span className="font-medium">#{row.dailyNumber ?? row.orderId}</span>
                            <span className="text-muted-foreground mr-2">{row.customerName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{fmtTime(row.deliveredAt)}</span>
                            <span className={cn("font-bold text-sm", row.paymentMethod === "cash" ? "text-green-600" : "text-blue-600")}>
                              {fmtPrice(row.totalPrice)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Driver statement button */}
                    {(() => {
                      const driver = drivers.find(d => d.name === group.name);
                      if (!driver) return null;
                      return (
                        <button onClick={() => { setDrvDetailDriver(driver); setDrvStatementTab("today"); }}
                          className="w-full py-2 text-xs text-blue-600 border-t border-border/50 hover:bg-blue-500/5 transition-colors font-semibold flex items-center justify-center gap-1">
                          <ClipboardList className="h-3 w-3" /> كشف حساب {group.name}
                        </button>
                      );
                    })()}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Broadcast Modal ───────────────────────────────────────────────── */}
      <Dialog open={showBroadcastModal} onOpenChange={setShowBroadcastModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>📣 إشعار جماعي</DialogTitle></DialogHeader>
          {broadcastRemaining !== null && (
            <p className="text-xs text-muted-foreground">المتبقي: <strong>{broadcastRemaining}</strong> إشعار</p>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">العنوان</label>
              <Input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value.slice(0, 100))}
                placeholder="عنوان الإشعار" maxLength={100} />
              <p className="text-[11px] text-muted-foreground mt-1">{broadcastTitle.length}/100</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">نص الرسالة</label>
              <Textarea value={broadcastBody} onChange={e => setBroadcastBody(e.target.value.slice(0, 300))}
                placeholder="نص الرسالة..." rows={4} maxLength={300} />
              <p className="text-[11px] text-muted-foreground mt-1">{broadcastBody.length}/300</p>
            </div>
            <Button onClick={sendBroadcast} disabled={broadcastSending || !broadcastTitle.trim() || !broadcastBody.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {broadcastSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال للجميع"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Stock Modal ───────────────────────────────────────────────────── */}
      <Dialog open={showStockModal} onOpenChange={setShowStockModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📦 إدارة المخزون</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {menuItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                <div className="flex-1">
                  <div className="font-medium text-sm text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.category}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={item.isAvailable} onCheckedChange={() => handleToggleAvailability(item)} />
                  <span className="text-xs text-muted-foreground mr-1">{item.isAvailable ? "متاح" : "نافد"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setStockEdits(e => ({ ...e, [item.id]: String(Math.max(0, (parseInt(e[item.id]) || 0) - 1)) }))}
                    className="h-7 w-7 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold hover:bg-red-200 transition-colors text-sm">−</button>
                  <input type="number" value={stockEdits[item.id] ?? ""} placeholder="∞"
                    onChange={e => setStockEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-14 text-center text-sm border border-border rounded-lg h-7 bg-background text-foreground" />
                  <button onClick={() => setStockEdits(e => ({ ...e, [item.id]: String((parseInt(e[item.id]) || 0) + 1) }))}
                    className="h-7 w-7 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-600 flex items-center justify-center font-bold hover:bg-green-200 transition-colors text-sm">+</button>
                  <button onClick={() => handleSaveStock(item.id)} disabled={stockSaving === item.id}
                    className="h-7 px-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">
                    {stockSaving === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Driver Management Modal ────────────────────────────────────────── */}
      <Dialog open={showDriversMgmt} onOpenChange={v => { setShowDriversMgmt(v); if (!v) setShowDriverForm(false); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>👥 إدارة المناديب</span>
              <Button size="sm" onClick={openAddDriver}
                className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-8">
                <UserPlus className="h-3.5 w-3.5 ml-1" /> إضافة
              </Button>
            </DialogTitle>
          </DialogHeader>
          {showDriverForm && (
            <div className="bg-muted/50 rounded-xl p-4 space-y-3 border border-border">
              <h4 className="font-semibold text-sm text-foreground">{editingDriverId ? "تعديل مندوب" : "إضافة مندوب جديد"}</h4>
              <Input placeholder="الاسم" value={driverForm.name}
                onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="رقم الجوال" value={driverForm.phone} dir="ltr"
                onChange={e => setDriverForm(f => ({ ...f, phone: e.target.value }))} />
              <Input placeholder={editingDriverId ? "رمز جديد (اتركه فارغاً للإبقاء)" : "الرمز السري"}
                type="password" value={driverForm.pin}
                onChange={e => setDriverForm(f => ({ ...f, pin: e.target.value }))} />
              <div className="flex items-center gap-2">
                <Switch checked={driverForm.active} onCheckedChange={v => setDriverForm(f => ({ ...f, active: v }))} />
                <span className="text-sm text-muted-foreground">نشط</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveDriver} disabled={driverFormSaving}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold">
                  {driverFormSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
                </Button>
                <Button variant="outline" onClick={() => setShowDriverForm(false)} className="flex-1">إلغاء</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {drivers.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center text-lg">🛵</div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{d.name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{d.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={d.active} onCheckedChange={() => handleToggleDriver(d)} />
                  <button onClick={() => openEditDriver(d)}
                    className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors text-sm">✏️</button>
                  <button onClick={() => handleDeleteDriver(d.id)}
                    className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors text-sm">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Driver Modal ────────────────────────────────────────────── */}
      <Dialog open={assigningOrderId !== null} onOpenChange={v => !v && setAssigningOrderId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>🛵 تعيين مندوب</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {drivers.filter(d => d.active && d.isOnline).map(d => (
              <button key={d.id} onClick={() => assigningOrderId && handleAssignDriver(assigningOrderId, d.id)}
                className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors text-right">
                <div className="relative h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center text-lg">
                  🛵
                  <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-foreground">{d.name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{d.phone}</div>
                </div>
              </button>
            ))}
            {drivers.filter(d => d.active && d.isOnline).length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">لا يوجد مناديب متاحون الآن</p>
            )}
            {drivers.filter(d => d.active && !d.isOnline).length > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                {drivers.filter(d => d.active && !d.isOnline).length} مندوب غير متصل حالياً
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Live Tracking Modal ────────────────────────────────────────────── */}
      <Dialog open={trackingOrderId !== null} onOpenChange={v => !v && setTrackingOrderId(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>📍 تتبع مباشر</DialogTitle>
          </DialogHeader>
          {trackingOrderId && (
            <iframe
              src={`${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""}/api/map/${trackingOrderId}`}
              className="w-full h-80 border-0"
              title="خريطة التتبع"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Print Receipt Modal ────────────────────────────────────────────── */}
      <Dialog open={printOrder !== null} onOpenChange={v => !v && setPrintOrder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>🖨️ طباعة الإيصال</DialogTitle></DialogHeader>
          {printOrder && (
            <div className="space-y-3 print:block" id="print-receipt">
              <div className="text-center border-b pb-3">
                <div className="font-black text-lg">شركة منتجات السلة للخضار والفواكه</div>
                <div className="text-xs text-muted-foreground">الرقم الضريبي: 312385645800003</div>
                <div className="text-xs text-muted-foreground">العنوان: تبوك — حي الصفا — شارع إبراهيم الخليل</div>
                <div className="text-xs font-bold">فاتورة ضريبية مبسطة</div>
                <div className="text-xs font-bold">Simplified Tax Invoice</div>
                <div className="text-xs text-muted-foreground">طلب #{printOrder.dailyNumber ?? printOrder.id}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(printOrder.createdAt)} — {fmtTime(printOrder.createdAt)}</div>
              </div>
              <div className="space-y-1">
                {printOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatCurrency(Math.round(item.price * item.quantity * getOrderPriceFactor(printOrder) * 100))}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 space-y-1 text-sm">
                {printOrder.deliveryFee != null && printOrder.deliveryFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>رسوم التوصيل</span>
                    <span>{formatCurrency(printOrder.deliveryFee)}</span>
                  </div>
                )}
                {printOrder.discountAmount != null && printOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>خصم ({printOrder.discountCode})</span>
                    <span>−{formatCurrency(printOrder.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-base">
                  <span>الإجمالي</span>
                  <span className="text-amber-500">{formatCurrency(printOrder.totalPrice)}</span>
                </div>
              </div>
              {printOrder.paymentMethod === "cash" && (
                <div className="space-y-2 bg-muted/50 rounded-xl p-3">
                  <label className="text-sm font-medium text-foreground block">المبلغ المدفوع (نقدي)</label>
                  <Input type="number" value={printCash} onChange={e => setPrintCash(e.target.value)}
                    placeholder="0.00" dir="ltr" />
                  {printCash && !isNaN(Number(printCash)) && (
                    <div className="flex justify-between font-bold text-sm text-green-600">
                      <span>الباقي</span>
                      <span>{Math.max(0, Number(printCash) - printOrder.totalPrice / 100).toFixed(2)} ر.س</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col items-center gap-1 py-1">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(`منتجات السلة للخضار والفواكه - طلب رقم ${printOrder.dailyNumber ?? printOrder.id} - ${(printOrder.totalPrice / 100).toFixed(2)} ر.س`)}`}
                  width={90} height={90} alt="QR"
                />
                <span className="text-[10px] text-muted-foreground">طلب #{printOrder.dailyNumber ?? printOrder.id}</span>
              </div>
              <Button onClick={handlePrint} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                <Printer className="h-4 w-4 ml-2" /> طباعة
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Driver Statement Modal ─────────────────────────────────────────── */}
      <Dialog open={drvDetailDriver !== null} onOpenChange={v => !v && setDrvDetailDriver(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📊 كشف حساب — {drvDetailDriver?.name}</DialogTitle>
          </DialogHeader>
          {drvStatementLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
          ) : drvStatement && (
            <div className="space-y-4">
              {/* Period tabs */}
              <div className="flex gap-2">
                {([
                  { key: "today", label: "اليوم" },
                  { key: "month", label: "الشهر" },
                  { key: "year", label: "السنة" },
                  { key: "all", label: "الكل" },
                ] as const).map(t => (
                  <button key={t.key} onClick={() => setDrvStatementTab(t.key)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-bold transition-colors",
                      drvStatementTab === t.key ? "bg-amber-500 text-white" : "bg-card border border-border text-muted-foreground hover:border-amber-500/50"
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Stats */}
              {(() => {
                const stats = drvStatement[drvStatementTab === "today" ? "today" : drvStatementTab === "month" ? "thisMonth" : drvStatementTab === "year" ? "thisYear" : "allTime"];
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                      <div className="font-black text-amber-500 text-lg">{fmtPrice(stats.totalCollected)}</div>
                      <div className="text-[11px] text-muted-foreground">الإجمالي</div>
                    </div>
                    <div className="bg-zinc-500/10 border border-zinc-500/20 rounded-xl p-3 text-center">
                      <div className="font-black text-foreground text-lg">{stats.ordersCount}</div>
                      <div className="text-[11px] text-muted-foreground">طلب</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                      <div className="font-black text-green-600 text-lg">{fmtPrice(stats.cashCollected)}</div>
                      <div className="text-[11px] text-muted-foreground">نقدي</div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                      <div className="font-black text-blue-600 text-lg">{fmtPrice(stats.electronicCollected)}</div>
                      <div className="text-[11px] text-muted-foreground">إلكتروني</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Chat Modal ────────────────────────────────────────────────────── */}
      <Dialog open={chatOrder !== null} onOpenChange={v => !v && setChatOrder(null)}>
        <DialogContent className="max-w-sm flex flex-col max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>💬 محادثة — {chatOrder?.customerName}</DialogTitle>
          </DialogHeader>
          <div ref={chatRef} className="flex-1 overflow-y-auto min-h-0 space-y-2 py-2 max-h-64">
            {chatLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>
            ) : chatMessages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">لا توجد رسائل</p>
            ) : chatMessages.map(msg => (
              <div key={msg.id} className={cn("flex", msg.fromCashier ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  msg.fromCashier
                    ? "bg-amber-500 text-white rounded-tr-sm"
                    : "bg-card border border-border text-foreground rounded-tl-sm"
                )}>
                  <p>{msg.text}</p>
                  <p className={cn("text-[10px] mt-1", msg.fromCashier ? "text-white/70" : "text-muted-foreground")}>
                    {fmtTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t pt-3">
            <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
              placeholder="اكتب رسالة..." className="flex-1" />
            <Button onClick={sendChatMessage} disabled={chatSending || !chatInput.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white">
              {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
