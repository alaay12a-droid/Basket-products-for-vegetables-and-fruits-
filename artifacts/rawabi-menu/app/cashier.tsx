import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  StatusBar,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  Share,
  Clipboard,
  Linking,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { loadPins, isMasterCode } from "@/hooks/usePins";
import { apiGet, apiPatch, apiPut, apiPost, apiDelete, API_BASE } from "@/constants/api";
import { MapWebView } from "@/components/MapWebView";
import { useChatUnreadAlert } from "@/hooks/useChatSound";
import { useAppSound, stopCurrentSound } from "@/hooks/useAppSound";
import { type ApiMenuItem } from "@/hooks/useMenu";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

const CASHIER_PIN_DEFAULT = "Aa@000";

const CATEGORIES = [
  { id: "chicken",  name: "الدجاج",             icon: "🍗" },
  { id: "meat",     name: "اللحوم",             icon: "🥩" },
  { id: "mains",    name: "الأطباق الرئيسية",   icon: "🍽️" },
  { id: "sides",    name: "الإيدامات",          icon: "🥘" },
  { id: "salads",   name: "السلطات",            icon: "🥗" },
  { id: "desserts", name: "الحلويات",           icon: "🍮" },
  { id: "drinks",   name: "المشروبات",          icon: "🥤" },
  { id: "extras",   name: "إضافات",             icon: "✨" },
];

type OrderStatus = "pending" | "preparing" | "ready" | "done" | "cancelled";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  customization?: {
    size?: string;
    riceType?: string;
    addon?: string;
    selectedOptions?: { groupName: string; choice: string }[];
  };
}

interface Order {
  id: number;
  dailyNumber: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  items: OrderItem[];
  totalPrice: number;
  deliveryFee: number;
  discountCode: string | null;
  discountAmount: number | null;
  status: OrderStatus;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
}

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

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "جديد",
  preparing: "قريباً يتجهز",
  ready: "جاري التجهيز",
  done: "تم التسليم",
  cancelled: "ملغى",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#E53935",
  preparing: "#FB8C00",
  ready: "#43A047",
  done: "#757575",
  cancelled: "#9E9E9E",
};

const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "ready",
};

const STATUS_NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  pending: "قريبه تجهيز الطلب",
  preparing: "جاري تحضير الطلب",
};

function PinScreen({ onSuccess, correctPin }: { onSuccess: () => void; correctPin: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const topInset = Platform.OS === "web" ? 80 : insets.top;

  const handleConfirm = () => {
    if (pin === correctPin || isMasterCode(pin)) {
      onSuccess();
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <View style={[styles.pinContainer, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity onPress={() => router.back()} style={styles.pinBack}>
        <Feather name="arrow-right" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>
      <Text style={[styles.pinTitle, { color: colors.foreground, fontFamily: F.extra }]}>
        🔐 لوحة الكاشير
      </Text>
      <Text style={[styles.pinSubtitle, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        أدخل رمز الدخول
      </Text>
      <TextInput
        style={[styles.pinInput, { backgroundColor: colors.card, borderColor: error ? "#E53935" : colors.border, color: colors.foreground, fontFamily: F.bold }]}
        value={pin}
        onChangeText={(t) => { setPin(t); setError(false); }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="••••••"
        placeholderTextColor={colors.mutedForeground}
        onSubmitEditing={handleConfirm}
        returnKeyType="done"
      />
      {error && (
        <Text style={[styles.pinError, { fontFamily: F.semi }]}>رمز خاطئ، حاول مجدداً</Text>
      )}
      <TouchableOpacity
        onPress={handleConfirm}
        style={[styles.pinConfirmBtn, { backgroundColor: colors.gold }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.pinConfirmText, { color: "#1A0A00", fontFamily: F.extra }]}>دخول</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CashierScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [cashierPin, setCashierPin] = useState(CASHIER_PIN_DEFAULT);
  const [pinsLoaded, setPinsLoaded] = useState(false);

  React.useEffect(() => {
    loadPins().then((p) => { setCashierPin(p.cashier); setPinsLoaded(true); });
  }, []);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // ─── Chat types ────────────────────────────────────────
  interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; createdAt: string; readAt: string | null; }
  type CashierOrder = (typeof orders)[0];

  // ─── Chat state ────────────────────────────────────────
  const [chatOrder, setChatOrder]           = useState<CashierOrder | null>(null);
  const [chatMessages, setChatMessages]     = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]           = useState("");
  const [chatSending, setChatSending]       = useState(false);
  const [chatLoading, setChatLoading]       = useState(false);
  const [unreadByOrder, setUnreadByOrder]   = useState<Record<number, number>>({});
  const chatScrollRef                        = useRef<ScrollView>(null);
  const chatPollRef                          = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Cashier view ──────────────────────────────────────
  const [cashierView, setCashierView] = useState<"orders" | "drivers" | "pickup">("orders");

  // ─── Pickup (branch) filter ─────────────────────────────
  const [pickupFromHour, setPickupFromHour] = useState("00");
  const [pickupToHour,   setPickupToHour]   = useState("23");
  const [pickupFromMin,  setPickupFromMin]  = useState("00");
  const [pickupToMin,    setPickupToMin]    = useState("59");

  // ─── Drivers state ─────────────────────────────────────
  interface Driver { id: number; name: string; phone: string; photoUrl: string | null; active: boolean; }
  const [driversEnabled, setDriversEnabled] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, { driverId: number; driverName: string; status: string }>>({});

  // ─── Driver financial summaries ─────────────────────────
  interface DrvOrder { orderId: number; dailyNumber: number | null; customerName: string; totalPrice: number; deliveredAt: string | null; }
  interface DrvSummary { driver: Driver; ordersCount: number; totalCollected: number; orders: DrvOrder[]; }
  const [drvSummaries, setDrvSummaries] = useState<DrvSummary[]>([]);
  const [drvSummLoading, setDrvSummLoading] = useState(false);
  const [drvExpanded, setDrvExpanded] = useState<number | null>(null);
  const [drvDetailRow, setDrvDetailRow] = useState<DrvSummary | null>(null);

  // ─── Full driver statement (calendar) ───────────────────
  interface StatOrder {
    orderId: number; dailyNumber: number | null; customerName: string;
    totalPrice: number; paymentMethod: string;
    assignedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; cancelled: boolean;
  }
  interface StatDay { date: string; ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number; cancelledCount: number; orders: StatOrder[]; }
  interface PeriodAcc { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number; cancelledCount: number; }
  interface DrvStatement {
    today: PeriodAcc; thisMonth: PeriodAcc; thisYear: PeriodAcc; allTime: PeriodAcc;
    daily: StatDay[];
  }
  const [drvStatement, setDrvStatement] = useState<DrvStatement | null>(null);
  const [drvStatLoading, setDrvStatLoading] = useState(false);
  const [drvStatTab, setDrvStatTab] = useState<"today" | "month" | "all">("today");

  // ─── Active driver assignments (picked_up — in transit) ─
  interface ActiveAssignment {
    orderId: number; driverId: number; pickedUpAt: string | null;
    driverName: string; driverPhone: string;
    dailyNumber: number | null; customerName: string;
    customerAddress: string | null; totalPrice: number; paymentMethod: string;
    locationUpdatedAt: string | null;
  }
  const [activeAssignments, setActiveAssignments] = useState<ActiveAssignment[]>([]);
  const [activeAssignmentsLoading, setActiveAssignmentsLoading] = useState(false);
  const [deliveringOrderId, setDeliveringOrderId] = useState<number | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);

  // ─── All-deliveries calendar view ──────────────────────────
  interface AllDeliveryRow { orderId: number; dailyNumber: number | null; customerName: string; customerPhone: string; totalPrice: number; paymentMethod: string; driverName: string; deliveredAt: string | null; }
  const [drvSelectedDate, setDrvSelectedDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [drvWeekOffset, setDrvWeekOffset]     = useState(0);
  const [allDeliveries, setAllDeliveries]     = useState<AllDeliveryRow[]>([]);
  const [allDeliveriesLoading, setAllDeliveriesLoading] = useState(false);
  const [drvExpandedId, setDrvExpandedId]     = useState<number | null>(null);
  const [expandedDriverNames, setExpandedDriverNames] = useState<Set<string>>(new Set());

  // ─── Driver management ──────────────────────────────────
  const [showDriversMgmt, setShowDriversMgmt]   = useState(false);
  const [allDrivers, setAllDrivers]             = useState<Driver[]>([]);
  const [allDriversLoading, setAllDriversLoading] = useState(false);
  interface DriverForm { id?: number; name: string; phone: string; pin: string; active: boolean; }
  const [driverForm, setDriverForm]             = useState<DriverForm | null>(null);
  const [driverFormSaving, setDriverFormSaving] = useState(false);
  const [driverDeleteId, setDriverDeleteId]     = useState<number | null>(null);

  const loadAllDrivers = useCallback(async () => {
    setAllDriversLoading(true);
    try {
      const data = await apiGet<Driver[]>("/drivers");
      setAllDrivers(data);
    } catch {}
    setAllDriversLoading(false);
  }, []);

  const saveDriverForm = useCallback(async () => {
    if (!driverForm) return;
    const { name, phone, pin } = driverForm;
    if (!name.trim() || !phone.trim()) { Alert.alert("خطأ", "الاسم ورقم الجوال مطلوبان"); return; }
    if (!driverForm.id && (!pin || pin.length < 4)) { Alert.alert("خطأ", "الرقم السري لازم يكون 4 أرقام على الأقل"); return; }
    setDriverFormSaving(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), active: driverForm.active };
      if (pin.trim()) body.pin = pin.trim();
      if (driverForm.id) {
        await apiPut(`/drivers/${driverForm.id}`, body);
      } else {
        await apiPost("/drivers", body);
      }
      await loadAllDrivers();
      setDriverForm(null);
    } catch (e: any) {
      const msg = e?.error || e?.message || "تعذر حفظ بيانات المندوب";
      Alert.alert("خطأ", msg);
    }
    setDriverFormSaving(false);
  }, [driverForm, loadAllDrivers]);

  const confirmDeleteDriver = useCallback(async (id: number) => {
    setDriverDeleteId(id);
    Alert.alert("حذف المندوب", "هل أنت متأكد؟ سيتم حذف جميع بياناته.", [
      { text: "إلغاء", onPress: () => setDriverDeleteId(null) },
      { text: "حذف", style: "destructive", onPress: async () => {
        try {
          await apiDelete(`/drivers/${id}`);
          await loadAllDrivers();
          setDrivers(prev => prev.filter(d => d.id !== id));
        } catch { Alert.alert("خطأ", "تعذر حذف المندوب"); }
        setDriverDeleteId(null);
      }},
    ]);
  }, [loadAllDrivers]);

  const toggleDriverActive = useCallback(async (driver: Driver) => {
    try {
      await apiPut(`/drivers/${driver.id}`, { active: !driver.active });
      setAllDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, active: !d.active } : d));
      setDrivers(prev => !driver.active ? [...prev, { ...driver, active: true }] : prev.filter(d => d.id !== driver.id));
    } catch { Alert.alert("خطأ", "تعذر تحديث حالة المندوب"); }
  }, []);

  const loadAllDeliveries = useCallback(async (date: Date) => {
    setAllDeliveriesLoading(true);
    try {
      const dateStr = date.toISOString().slice(0, 10);
      const data = await apiGet<AllDeliveryRow[]>(`/drivers/all-deliveries?date=${dateStr}`);
      setAllDeliveries(data);
    } catch {}
    setAllDeliveriesLoading(false);
  }, []);

  const loadDrvSummaries = useCallback(async () => {
    setDrvSummLoading(true);
    try {
      const data = await apiGet<DrvSummary[]>("/drivers/daily-summaries");
      setDrvSummaries(data);
    } catch {}
    setDrvSummLoading(false);
  }, []);

  const loadActiveAssignments = useCallback(async () => {
    setActiveAssignmentsLoading(true);
    try {
      const data = await apiGet<ActiveAssignment[]>("/drivers/active-assignments");
      setActiveAssignments(data);
    } catch {}
    setActiveAssignmentsLoading(false);
  }, []);

  const loadDrvStatement = useCallback(async (driverId: number) => {
    setDrvStatLoading(true);
    setDrvStatement(null);
    try {
      const data = await apiGet<DrvStatement>(`/drivers/${driverId}/statement`);
      setDrvStatement(data);
    } catch {}
    setDrvStatLoading(false);
  }, []);

  const confirmDeliveryByCashier = useCallback(async (orderId: number) => {
    setDeliveringOrderId(orderId);
    try {
      await apiPut(`/orders/${orderId}/driver-status`, { status: "delivered" });
      setActiveAssignments(prev => prev.filter(a => a.orderId !== orderId));
      loadDrvSummaries();
    } catch { Alert.alert("خطأ", "تعذّر تأكيد التسليم"); }
    setDeliveringOrderId(null);
  }, [loadDrvSummaries]);

  const loadDrivers = useCallback(async () => {
    try {
      const [dr, en] = await Promise.all([
        apiGet<Driver[]>("/drivers"),
        apiGet<{ enabled: boolean }>("/settings/drivers-enabled"),
      ]);
      setDrivers(dr.filter((d) => d.active));
      setDriversEnabled(en.enabled);
    } catch {}
  }, []);

  const loadAssignment = useCallback(async (orderId: number) => {
    try {
      const row = await apiGet<{ assignment: { driverId: number; status: string }; driver: { name: string } } | null>(`/orders/${orderId}/assignment`);
      if (row) {
        setAssignments((prev) => ({ ...prev, [orderId]: { driverId: row.assignment.driverId, driverName: row.driver?.name ?? "مندوب", status: row.assignment.status } }));
      }
    } catch {}
  }, []);

  const assignDriver = useCallback(async (orderId: number, driverId: number) => {
    try {
      await apiPost(`/orders/${orderId}/assign-driver`, { driverId });
      await loadAssignment(orderId);
      setAssigningOrderId(null);
    } catch { Alert.alert("خطأ", "تعذّر تعيين المندوب"); }
  }, [loadAssignment]);

  const unassignDriver = useCallback(async (orderId: number) => {
    try {
      await apiDelete(`/orders/${orderId}/assign-driver`);
      setAssignments((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
    } catch {}
  }, []);

  useEffect(() => { if (authenticated) loadDrivers(); }, [authenticated, loadDrivers]);

  // ─── Broadcast notification state ──────────────────────
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle]         = useState("");
  const [broadcastBody, setBroadcastBody]           = useState("");
  const [broadcastSending, setBroadcastSending]     = useState(false);
  const [broadcastRemaining, setBroadcastRemaining] = useState<number | null>(null);

  const fetchBroadcastQuota = useCallback(async () => {
    try {
      const data = await apiGet<{ sent: number; remaining: number; limit: number }>("/notifications/broadcast");
      setBroadcastRemaining(data.remaining);
    } catch {}
  }, []);

  useEffect(() => { if (showBroadcastModal) fetchBroadcastQuota(); }, [showBroadcastModal, fetchBroadcastQuota]);

  const sendBroadcast = useCallback(async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;
    setBroadcastSending(true);
    try {
      const res = await apiPost<{ ok: boolean; remaining: number }>("/notifications/broadcast", {
        title: broadcastTitle.trim(),
        body:  broadcastBody.trim(),
      });
      setBroadcastRemaining(res.remaining);
      setBroadcastTitle("");
      setBroadcastBody("");
      Alert.alert("تم الإرسال ✓", "تم إرسال الإشعار لجميع المستخدمين");
      setShowBroadcastModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذّر الإرسال";
      Alert.alert("خطأ", msg);
    } finally {
      setBroadcastSending(false);
    }
  }, [broadcastTitle, broadcastBody]);

  // ─── Stock state ───────────────────────────────────────
  const [showStockModal, setShowStockModal] = useState(false);
  const [menuItems, setMenuItems] = useState<ApiMenuItem[]>([]);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [stockSaving, setStockSaving] = useState<string | null>(null);
  const [stockViewMode, setStockViewMode] = useState<"table" | "edit">("table");


  const fetchMenuItems = useCallback(async () => {
    try {
      const data = await apiGet<ApiMenuItem[]>("/menu");
      setMenuItems(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (showStockModal) fetchMenuItems();
  }, [showStockModal, fetchMenuItems]);

  const getStockEditValue = (item: ApiMenuItem): string => {
    if (item.itemId in stockEdits) return stockEdits[item.itemId];
    return item.stock === null ? "" : String(item.stock);
  };

  const adjustStock = (item: ApiMenuItem, delta: number) => {
    const current = getStockEditValue(item);
    const next = Math.max(0, (current === "" ? 0 : parseInt(current) || 0) + delta);
    setStockEdits((prev) => ({ ...prev, [item.itemId]: String(next) }));
  };

  const handleQuickStock = async (itemId: string, rawVal: string) => {
    const val = rawVal.trim();
    const stock = val === "" ? null : parseInt(val);
    if (stock !== null && (isNaN(stock) || stock < 0)) return;
    setStockSaving(itemId);
    try {
      await apiPut(`/menu/${itemId}`, { stock });
      await fetchMenuItems();
      setStockEdits((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
    } catch {
      Alert.alert("خطأ", "تعذر تحديث المخزون");
    } finally {
      setStockSaving(null);
    }
  };
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const knownOrderIds = useRef<Set<number>>(new Set());
  const soundEnabled = useRef(false);
  const { playOrder: playNotificationSound } = useAppSound();

  const customerUrl = Platform.OS === "web"
    ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
    : `${API_BASE.replace(/\/+$/, "")}/`;

  const handleCopyLink = () => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(customerUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    } else {
      Clipboard.setString(customerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareLink = async () => {
    try {
      await Share.share({ message: `اطلب من منتجات السلة للخضار والفواكه: ${customerUrl}`, url: customerUrl });
    } catch { /* silent */ }
  };

  const topInset = Platform.OS === "web" ? 60 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGet<Order[]>("/orders");
      const newPending = data.filter((o) => o.status === "pending");

      if (silent && soundEnabled.current) {
        const newOnes = newPending.filter((o) => !knownOrderIds.current.has(o.id));
        if (newOnes.length > 0) {
          playNotificationSound();
          setHasNewOrder(true);
          setTimeout(() => setHasNewOrder(false), 4000);
        }
      }

      newPending.forEach((o) => knownOrderIds.current.add(o.id));

      if (Platform.OS === "web" && typeof document !== "undefined") {
        const pendingCount = newPending.length;
        document.title = pendingCount > 0
          ? `(${pendingCount}) طلب جديد 🔔 | الكاشير`
          : "الكاشير | منتجات السلة للخضار والفواكه";
      }

      setOrders(data);

      // Load all active assignments in a single batch request
      apiGet<Record<number, { driverId: number; driverName: string; status: string }>>("/orders/assignments")
        .then((batch) => { setAssignments(batch); })
        .catch(() => { /* silent */ });
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [playNotificationSound]);

  useEffect(() => {
    if (!authenticated) return;
    fetchOrders();
    const initTimer = setTimeout(() => { soundEnabled.current = true; }, 2000);
    const interval = setInterval(() => fetchOrders(true), 10000);
    return () => {
      clearInterval(interval);
      clearTimeout(initTimer);
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.title = "منتجات السلة للخضار والفواكه";
      }
    };
  }, [authenticated, fetchOrders]);

  useEffect(() => {
    if (!authenticated || cashierView !== "drivers") return;
    loadActiveAssignments();
    const interval = setInterval(loadActiveAssignments, 10000);
    return () => clearInterval(interval);
  }, [authenticated, cashierView, loadActiveAssignments]);

  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [cashPaid, setCashPaid] = useState("");

  const LOGO_B64 = "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";

    const LOGO_URI = Image.resolveAssetSource(
      require("@/assets/images/sallat-alkhodar-logo.png")
    ).uri;

    // Returns a scale factor so item prices match the authoritative totalPrice/100.
  // Handles orders where item.price was stored 100× (or more) too small.
  const getOrderPriceFactor = (order: Order): number => {
    const totalPaid   = order.totalPrice / 100;
    const deliveryFee = (order.deliveryFee ?? 0) / 100;
    const rawSubtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const expected    = totalPaid - deliveryFee;
    return rawSubtotal > 0 && expected > rawSubtotal * 50 ? expected / rawSubtotal : 1;
  };

  const handlePrint = (order: Order, paidAmount?: number) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const date = new Date(order.createdAt);
    const dateStr = date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
    const timeStr = date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

    // ── Price unit detection ──────────────────────────────────────────────────
    // Some orders have item.price stored 100× too small (e.g. 0.44 instead of 44).
    const totalPaid   = order.totalPrice / 100;
    const deliveryFee   = (order.deliveryFee ?? 0) / 100;
    const rawSubtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    // Use totalPaid as the authoritative source.
    // If rawSubtotal is ≥50× smaller than (totalPaid − deliveryFee), prices are
    // stored in a wrong unit — scale them up so the receipt matches the actual total.
    const expected = totalPaid - deliveryFee;
    const priceFactor = rawSubtotal > 0 && expected > rawSubtotal * 50
      ? expected / rawSubtotal
      : 1;
    const itemsSubtotal = rawSubtotal * priceFactor;

    const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
    const discount      = Math.max(0, itemsSubtotal + deliveryFee - totalPaid);
    const hasDiscount   = discount > 0.005;
    const hasDelivery   = deliveryFee > 0;
    const payMethod     = order.paymentMethod === "cash" ? "نقدي" : "إلكتروني";
    const change        = paidAmount !== undefined ? Math.max(0, paidAmount - totalPaid) : null;

    // ── Items table rows ──────────────────────────────────────────────────────
    // RTL column order in DOM: الصنف (right) | الكمية (center) | المبلغ (left)
    const itemsRows = order.items.map((item, idx) => {
      const unitPrice  = item.price * priceFactor;
      const lineTotal  = unitPrice * item.quantity;
      const bg = idx % 2 === 1 ? "background:#fafafa;" : "";
      return `
        <tr style="${bg}">
          <td style="padding:5px 8px;text-align:right;">${getOrderItemDisplayName(item)}</td>
          <td style="padding:5px 8px;text-align:center;">${item.quantity}</td>
          <td style="padding:5px 8px;text-align:left;font-weight:600;">${fmt(lineTotal)} ر.س</td>
        </tr>`;
    }).join("");

    const summaryRows = `
      ${hasDelivery ? `
      <tr>
        <td colspan="2" style="padding:4px 8px;text-align:right;color:#555;">رسوم التوصيل</td>
        <td style="padding:4px 8px;text-align:left;color:#555;">+ ${fmt(deliveryFee)} ر.س</td>
      </tr>` : ""}
      ${hasDiscount ? `
      <tr>
        <td colspan="2" style="padding:4px 8px;text-align:right;color:#C8171A;">خصم</td>
        <td style="padding:4px 8px;text-align:left;color:#C8171A;">- ${fmt(discount)} ر.س</td>
      </tr>` : ""}
      <tr style="background:#FFF8E1;border-top:2px solid #E8920C;">
        <td colspan="2" style="padding:8px;text-align:right;font-size:14px;font-weight:800;color:#7A5C00;">الإجمالي المستحق</td>
        <td style="padding:8px;text-align:left;font-size:14px;font-weight:800;color:#7A5C00;">${fmt(totalPaid)} ر.س</td>
      </tr>
      ${paidAmount !== undefined ? `
      <tr>
        <td colspan="2" style="padding:4px 8px;text-align:right;color:#555;">المبلغ المدفوع</td>
        <td style="padding:4px 8px;text-align:left;color:#555;">${fmt(paidAmount)} ر.س</td>
      </tr>
      <tr style="background:#E8F5E9;">
        <td colspan="2" style="padding:6px 8px;text-align:right;font-weight:700;color:#2e7d32;">الفكة المتبقية</td>
        <td style="padding:6px 8px;text-align:left;font-weight:700;color:#2e7d32;">${fmt(change!)} ر.س</td>
      </tr>` : ""}
    `;

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>إيصال الطلب</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Cairo',sans-serif; background:#fff; color:#111; direction:rtl; font-size:13px; }
  .receipt { max-width:82mm; margin:0 auto; padding:8mm 5mm; }

  /* Header */
  .logo-wrap { text-align:center; margin-bottom:6px; }
  .logo-wrap img { width:72px; height:72px; object-fit:contain; mix-blend-mode:multiply; }
  .restaurant-name { text-align:center; font-size:16px; font-weight:800; color:#8B4513; line-height:1.3; }
  .restaurant-sub  { text-align:center; font-size:10px; color:#777; margin-top:2px; }

  /* Divider */
  .divider { border:none; border-top:1px dashed #ccc; margin:7px 0; }
  .divider-solid { border:none; border-top:2px solid #C8171A; margin:7px 0; }

  /* Order number badge */
  .order-badge { text-align:center; background:#FFF3E0; border:1px solid #E8920C; border-radius:8px; padding:5px 10px; margin:6px 0; }
  .order-badge .num { font-size:17px; font-weight:800; color:#8B4513; }
  .order-badge .date { font-size:10px; color:#777; margin-top:1px; }

  /* Meta grid */
  .meta-grid { display:grid; grid-template-columns:auto 1fr; gap:2px 8px; font-size:11.5px; margin:4px 0; }
  .meta-label { color:#777; white-space:nowrap; }
  .meta-value { font-weight:600; color:#111; word-break:break-all; }

  /* Items table */
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:4px; }
  thead th { background:#3E1A00; color:#E8920C; font-weight:700; font-size:11px; padding:5px 8px; }
  thead th:first-child  { text-align:right; }
  thead th:nth-child(2) { text-align:center; }
  thead th:last-child   { text-align:left; }
  tbody tr:last-child td { border-bottom:1px solid #ddd; }

  /* Subtotal section */
  .subtotal-section { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:2px; }
  .subtotal-section td { padding:4px 8px; }

  /* Footer */
  .footer { text-align:center; font-size:10.5px; color:#888; margin-top:10px; line-height:1.6; }

  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    button { display:none !important; }
  }
</style>
</head>
<body>
<div class="receipt">

  <!-- Header -->
  <div class="logo-wrap">
    <img src="${LOGO_URI}" alt="منتجات السلة للخضار والفواكه"/>
  </div>
  <div class="restaurant-name">منتجات السلة للخضار والفواكه</div>
  <div class="restaurant-sub">تبوك — المملكة العربية السعودية</div>

  <hr class="divider-solid"/>

  <!-- Order badge -->
  <div class="order-badge">
    <div class="num">طلب اليوم #${order.dailyNumber}</div>
    <div class="date">${dateStr} — ${timeStr}</div>
  </div>

  <hr class="divider"/>

  <!-- Customer info -->
  <div class="meta-grid">
    <span class="meta-label">الاسم:</span>
    <span class="meta-value">${order.customerName}</span>
    <span class="meta-label">الجوال:</span>
    <span class="meta-value">${order.customerPhone}</span>
    ${order.customerAddress ? `
    <span class="meta-label">العنوان:</span>
    <span class="meta-value">${order.customerAddress.startsWith("https://") ? "موقع GPS 📍" : order.customerAddress}</span>
    ` : ""}
    <span class="meta-label">الدفع:</span>
    <span class="meta-value">${payMethod}</span>
    ${order.notes ? `
    <span class="meta-label">ملاحظات:</span>
    <span class="meta-value">${order.notes}</span>
    ` : ""}
  </div>

  <hr class="divider"/>

  <!-- Items table: RTL order in DOM = الصنف (right) | الكمية (center) | المبلغ (left) -->
  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th>الكمية</th>
        <th>المبلغ</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <!-- Totals -->
  <table class="subtotal-section">
    <tbody>
      <tr style="border-top:1px solid #ccc;">
        <td colspan="2" style="text-align:right;color:#555;">المجموع</td>
        <td style="text-align:left;color:#555;">${fmt(itemsSubtotal)} ر.س</td>
      </tr>
      ${summaryRows}
    </tbody>
  </table>

  <hr class="divider"/>
  <div class="footer">
    شكراً لاختيارك منتجات السلة للخضار والفواكه 🥬<br/>
    نتمنى لك طلبًا طازجًا!
  </div>
</div>
<script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;
    const win = window.open("", "_blank", "width=440,height=750");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  // ── Print all-drivers report (by date) ──────────────────────────────
  const handlePrintAllDriversReport = (rows: AllDeliveryRow[], date: Date) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const dateLabel = date.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const now = new Date().toLocaleString("ar-SA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const f = (n: number) => n.toFixed(2);
    const fmtT = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "--:--";

    // Group by driver
    const driverMap = new Map<string, AllDeliveryRow[]>();
    for (const r of rows) {
      const key = r.driverName || "غير محدد";
      if (!driverMap.has(key)) driverMap.set(key, []);
      driverMap.get(key)!.push(r);
    }

    const driverSections = Array.from(driverMap.entries()).map(([name, drvRows]) => {
      const total   = drvRows.reduce((s, r) => s + r.totalPrice, 0);
      const cash    = drvRows.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);
      const online  = total - cash;
      const rowsHtml = drvRows.map((r, i) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:6px 8px;text-align:center;color:#888;font-size:12px;">${i + 1}</td>
          <td style="padding:6px 8px;text-align:right;"><b>${r.customerName}</b><br><span style="color:#888;font-size:11px;">${r.customerPhone ?? ""}</span></td>
          <td style="padding:6px 8px;text-align:center;">${r.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}</td>
          <td style="padding:6px 8px;text-align:left;font-weight:800;color:#2e7d32;">${f(r.totalPrice)} ر.س</td>
          <td style="padding:6px 8px;text-align:center;color:#888;font-size:11px;">${fmtT(r.deliveredAt)}</td>
        </tr>`).join("");
      return `
      <div class="driver-block">
        <div class="driver-header">
          <span class="driver-name">🛵 ${name}</span>
          <span class="driver-stats">${drvRows.length} طلب | نقدي: ${f(cash)} | إلكتروني: ${f(online)} | الإجمالي: ${f(total)} ر.س</span>
        </div>
        <table>
          <thead><tr><th>#</th><th>العميل</th><th>الدفع</th><th>المبلغ</th><th>الوقت</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    }).join("");

    const totalAll   = rows.reduce((s, r) => s + r.totalPrice, 0);
    const cashAll    = rows.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/><title>تقرير المناديب — ${dateLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Cairo',sans-serif;background:#fff;color:#111;direction:rtl;padding:10mm 8mm;}
  h1{text-align:center;font-size:18px;font-weight:800;color:#8B4513;margin-bottom:3px;}
  .sub{text-align:center;font-size:11px;color:#888;margin-bottom:14px;}
  .summary{display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;}
  .card{background:#f7f7f7;border-radius:8px;padding:8px 14px;text-align:center;border:1px solid #eee;}
  .card .v{font-size:16px;font-weight:800;}
  .driver-block{margin-bottom:18px;border:1px solid #ddd;border-radius:10px;overflow:hidden;}
  .driver-header{background:#F5F0E8;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;}
  .driver-name{font-size:14px;font-weight:800;color:#5D3A1A;}
  .driver-stats{font-size:11px;color:#777;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  thead th{background:#8B4513;color:#fff;padding:7px 8px;text-align:center;font-size:12px;}
  tbody tr:nth-child(even){background:#fafafa;}
  @media print{body{padding:4mm;}.driver-block{page-break-inside:avoid;}}
</style></head><body>
<h1>منتجات السلة للخضار والفواكه — تقرير مناديب التوصيل</h1>
<div class="sub">📅 ${dateLabel} | طُبع في ${now}</div>
<div class="summary">
  <div class="card"><div class="v" style="color:#E8920C;">${rows.length}</div><div style="font-size:10px;">إجمالي الطلبات</div></div>
  <div class="card"><div class="v" style="color:#2e7d32;">${f(cashAll)} ر.س</div><div style="font-size:10px;">نقدي</div></div>
  <div class="card"><div class="v" style="color:#1565C0;">${f(totalAll - cashAll)} ر.س</div><div style="font-size:10px;">إلكتروني</div></div>
  <div class="card"><div class="v">${f(totalAll)} ر.س</div><div style="font-size:10px;">الإجمالي</div></div>
  <div class="card"><div class="v" style="color:#9C27B0;">${driverMap.size}</div><div style="font-size:10px;">مناديب</div></div>
</div>
${driverSections}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // ── Print single driver statement ────────────────────────────────────
  const handlePrintSingleDriverReport = (
    driverName: string, driverPhone: string,
    filteredDays: Array<{ date: string; ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number; orders: Array<{ orderId: number; dailyNumber: number | null; customerName: string; totalPrice: number; paymentMethod: string; deliveredAt: string | null; cancelled: boolean }> }>,
    tabLabel: string,
    totals: { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number; cancelledCount: number } | undefined,
  ) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const now = new Date().toLocaleString("ar-SA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const f = (n: number) => n.toFixed(2);
    const fmtT = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    const fmtD = (s: string) => new Date(s).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

    const daySections = filteredDays.map(day => {
      const rowsHtml = day.orders.map((o, i) => `
        <tr style="border-bottom:1px solid #f0f0f0;${o.cancelled ? "color:#aaa;" : ""}">
          <td style="padding:6px 8px;text-align:center;color:#888;font-size:12px;">${i + 1}</td>
          <td style="padding:6px 8px;text-align:right;">${o.customerName}${o.cancelled ? " <span style='color:#E53935;font-size:10px;'>(ملغى)</span>" : ""}</td>
          <td style="padding:6px 8px;text-align:center;">${o.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}</td>
          <td style="padding:6px 8px;text-align:left;font-weight:${o.cancelled ? "400" : "800"};color:${o.cancelled ? "#aaa" : "#2e7d32"};">${o.cancelled ? "ملغى" : f(o.totalPrice) + " ر.س"}</td>
          <td style="padding:6px 8px;text-align:center;color:#888;font-size:11px;">${o.cancelled ? "--:--" : fmtT(o.deliveredAt)}</td>
        </tr>`).join("");
      return `
      <div class="day-block">
        <div class="day-header">
          <span>${fmtD(day.date)}</span>
          <span style="font-size:11px;">${day.ordersCount} طلب | ${f(day.cashCollected)} نقدي | ${f(day.electronicCollected)} إلكتروني | المجموع: ${f(day.totalCollected)} ر.س</span>
        </div>
        <table>
          <thead><tr><th>#</th><th>العميل</th><th>الدفع</th><th>المبلغ</th><th>الوقت</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/><title>تقرير المندوب — ${driverName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Cairo',sans-serif;background:#fff;color:#111;direction:rtl;padding:10mm 8mm;}
  h1{text-align:center;font-size:18px;font-weight:800;color:#8B4513;margin-bottom:3px;}
  .sub{text-align:center;font-size:11px;color:#888;margin-bottom:14px;}
  .summary{display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;}
  .card{background:#f7f7f7;border-radius:8px;padding:8px 14px;text-align:center;border:1px solid #eee;}
  .card .v{font-size:16px;font-weight:800;}
  .day-block{margin-bottom:16px;border:1px solid #ddd;border-radius:10px;overflow:hidden;}
  .day-header{background:#EEF5EE;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;font-size:13px;font-weight:700;color:#2e5a1e;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  thead th{background:#2e7d32;color:#fff;padding:7px 8px;text-align:center;font-size:12px;}
  tbody tr:nth-child(even){background:#fafafa;}
  @media print{body{padding:4mm;}.day-block{page-break-inside:avoid;}}
</style></head><body>
<h1>منتجات السلة للخضار والفواكه — تقرير المندوب: ${driverName}</h1>
<div class="sub">📱 ${driverPhone} | الفترة: ${tabLabel} | طُبع في ${now}</div>
${totals ? `
<div class="summary">
  <div class="card"><div class="v" style="color:#E8920C;">${totals.ordersCount}</div><div style="font-size:10px;">طلبات مُسلَّمة</div></div>
  <div class="card"><div class="v" style="color:#2e7d32;">${f(totals.cashCollected)} ر.س</div><div style="font-size:10px;">نقدي</div></div>
  <div class="card"><div class="v" style="color:#1565C0;">${f(totals.electronicCollected)} ر.س</div><div style="font-size:10px;">إلكتروني</div></div>
  <div class="card"><div class="v">${f(totals.totalCollected)} ر.س</div><div style="font-size:10px;">الإجمالي</div></div>
  ${totals.cancelledCount > 0 ? `<div class="card"><div class="v" style="color:#E53935;">${totals.cancelledCount}</div><div style="font-size:10px;">ملغاة</div></div>` : ""}
</div>` : ""}
${daySections}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // ── Print filtered orders list ────────────────────────────────────────
  const handlePrintOrdersList = (ordersArr: Order[], title: string) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
    const now = new Date().toLocaleString("ar-SA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const totalDone  = ordersArr.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.totalPrice / 100, 0);
    const totalCash  = ordersArr.filter(o => o.status !== "cancelled" && o.paymentMethod === "cash").reduce((s, o) => s + o.totalPrice / 100, 0);
    const totalEle   = ordersArr.filter(o => o.status !== "cancelled" && o.paymentMethod !== "cash").reduce((s, o) => s + o.totalPrice / 100, 0);
    const cancelled  = ordersArr.filter(o => o.status === "cancelled").length;

    const rows = ordersArr.map(o => {
      const statusAr = STATUS_LABELS[o.status] ?? o.status;
      const payAr = o.paymentMethod === "cash" ? "نقدي" : "إلكتروني";
      const price = o.status === "cancelled" ? "ملغى" : `${fmt(o.totalPrice / 100)} ر.س`;
      const items = o.items.map(i => `${getOrderItemDisplayName(i)} ×${i.quantity}`).join("، ");
      const t = new Date(o.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
      return `<tr style="border-bottom:1px solid #eee;${o.status === "cancelled" ? "color:#999;" : ""}">
        <td style="padding:5px 8px;text-align:center;">#${o.dailyNumber ?? o.id}</td>
        <td style="padding:5px 8px;text-align:right;">${o.customerName}</td>
        <td style="padding:5px 8px;text-align:right;font-size:11px;color:#555;">${items}</td>
        <td style="padding:5px 8px;text-align:center;">${payAr}</td>
        <td style="padding:5px 8px;text-align:center;">${statusAr}</td>
        <td style="padding:5px 8px;text-align:left;font-weight:700;">${price}</td>
        <td style="padding:5px 8px;text-align:center;color:#888;">${t}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Cairo',sans-serif;background:#fff;color:#111;direction:rtl;padding:15mm 10mm;}
  h1{text-align:center;font-size:18px;font-weight:800;color:#8B4513;margin-bottom:4px;}
  .sub{text-align:center;font-size:11px;color:#888;margin-bottom:12px;}
  .summary{display:flex;gap:16px;justify-content:center;margin-bottom:12px;flex-wrap:wrap;}
  .card{background:#f7f7f7;border-radius:8px;padding:8px 16px;text-align:center;}
  .card .val{font-size:17px;font-weight:800;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  thead th{background:#8B4513;color:#fff;padding:7px 8px;text-align:center;}
  tbody tr:nth-child(even){background:#fafafa;}
  @media print{body{padding:5mm 5mm;}button{display:none!important;}}
</style></head><body>
<h1>منتجات السلة للخضار والفواكه — ${title}</h1>
<div class="sub">طُبع في ${now}</div>
<div class="summary">
  <div class="card"><div class="val" style="color:#2e7d32;">${fmt(totalDone)} ر.س</div><div style="font-size:11px;">إجمالي الإيرادات</div></div>
  <div class="card"><div class="val" style="color:#1565C0;">${fmt(totalCash)} ر.س</div><div style="font-size:11px;">نقدي</div></div>
  <div class="card"><div class="val" style="color:#6A1B9A;">${fmt(totalEle)} ر.س</div><div style="font-size:11px;">إلكتروني</div></div>
  <div class="card"><div class="val">${ordersArr.length}</div><div style="font-size:11px;">إجمالي الطلبات</div></div>
  ${cancelled > 0 ? `<div class="card"><div class="val" style="color:#C8171A;">${cancelled}</div><div style="font-size:11px;">ملغاة</div></div>` : ""}
</div>
<table><thead><tr>
  <th>رقم</th><th>العميل</th><th>الأصناف</th><th>الدفع</th><th>الحالة</th><th>المبلغ</th><th>الوقت</th>
</tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleUpdateStatus = async (order: Order, newStatus: OrderStatus) => {
    stopCurrentSound().catch(() => {}); // إيقاف صوت التنبيه فور قبول الطلب
    try {
      const updated = await apiPatch<Order>(`/orders/${order.id}/status`, { status: newStatus });
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      if (newStatus === "preparing") {
        setPrintOrder(updated);
      }
      // Auto-advance driver to picked_up when cashier marks order done, then switch to drivers tab
      if (newStatus === "done" && assignments[order.id]?.status === "assigned") {
        try {
          await apiPut(`/orders/${order.id}/driver-status`, { status: "picked_up" });
          setAssignments(prev => ({ ...prev, [order.id]: { ...prev[order.id], status: "picked_up" } }));
          // Switch to drivers tab and refresh active assignments
          setCashierView("drivers");
          loadDrvSummaries();
          loadActiveAssignments();
        } catch {}
      }
    } catch {
      Alert.alert("خطأ", "تعذر تحديث الحالة");
    }
  };

  const handleCancelOrder = (order: Order) => {
    const doCancel = async () => {
      stopCurrentSound().catch(() => {});
      try {
        const updated = await apiPatch<Order>(`/orders/${order.id}/status`, { status: "cancelled" });
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      } catch {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert("تعذر إلغاء الطلب");
        } else {
          Alert.alert("خطأ", "تعذر إلغاء الطلب");
        }
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const confirmed = window.confirm(
        `إلغاء طلب #${order.dailyNumber} — ${order.customerName}؟`
      );
      if (confirmed) doCancel();
    } else {
      Alert.alert(
        "إلغاء الطلب",
        `هل تريد إلغاء طلب #${order.dailyNumber} — ${order.customerName}؟`,
        [
          { text: "لا", style: "cancel" },
          { text: "نعم، إلغاء", style: "destructive", onPress: doCancel },
        ]
      );
    }
  };

  // ─── Chat functions ────────────────────────────────────
  const fetchUnreadCounts = useCallback(async () => {
    try {
      type Convo = { orderId: number; unread: number };
      const convos = await apiGet<Convo[]>("/messages/conversations");
      const counts: Record<number, number> = {};
      for (const c of convos) { if (c.unread > 0) counts[c.orderId] = c.unread; }
      setUnreadByOrder(counts);
    } catch {}
  }, []);

  const openOrderChat = useCallback(async (order: CashierOrder) => {
    setChatOrder(order);
    setChatLoading(true);
    setChatMessages([]);
    try {
      const msgs = await apiGet<ChatMsg[]>(`/messages/order/${order.id}`);
      setChatMessages(msgs);
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
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {} finally { setChatSending(false); }
  }, [chatOrder, chatInput]);

  // Poll messages while chat is open
  useEffect(() => {
    if (!chatOrder) {
      if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; }
      return;
    }
    chatPollRef.current = setInterval(async () => {
      try {
        const msgs = await apiGet<ChatMsg[]>(`/messages/order/${chatOrder.id}`);
        setChatMessages(msgs);
        await apiPatch(`/messages/order/${chatOrder.id}/read`, { fromCashier: true });
      } catch {}
    }, 5000);
    return () => { if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; } };
  }, [chatOrder]);

  // Poll unread counts periodically
  useEffect(() => {
    fetchUnreadCounts();
    const t = setInterval(fetchUnreadCounts, 15000);
    return () => clearInterval(t);
  }, [fetchUnreadCounts]);

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const pickupOrders = orders.filter((o) => o.notes?.includes("استلام من الفرع"));
  const pickupPendingCount = pickupOrders.filter((o) => o.status === "pending" || o.status === "preparing" || o.status === "ready").length;
  const totalUnread  = Object.values(unreadByOrder).reduce((s, n) => s + n, 0);

  useChatUnreadAlert(totalUnread);
  useChatUnreadAlert(pendingCount);

  if (!pinsLoaded) return null;
  if (!authenticated) {
    return <PinScreen onSuccess={() => setAuthenticated(true)} correctPin={cashierPin} />;
  }

  const filtered = filter === "all"
    ? orders.filter((o) => o.status !== "done" && o.status !== "cancelled")
    : orders.filter((o) => o.status === filter);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: "#1A1008", paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        {/* ── Row 1: back · title · refresh ── */}
        <View style={styles.headerRow1}>
          <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={[styles.backBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="arrow-right" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.bold }]}>
              لوحة الكاشير
            </Text>
            {pendingCount > 0 && (
              <View style={[styles.badge, { backgroundColor: "#E53935" }]}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => fetchOrders()} style={[styles.refreshBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="refresh-cw" size={18} color={colors.gold} />
          </TouchableOpacity>
        </View>

        {/* ── Row 2: action buttons ── */}
        <View style={styles.headerRow2}>
          <TouchableOpacity
            onPress={() => { const first = orders.find(o => unreadByOrder[o.id]); if (first) openOrderChat(first); }}
            style={[styles.headerActionBtn, { backgroundColor: "#0D2030", borderWidth: 1, borderColor: totalUnread > 0 ? "#3A8ABF" : "#1E4A6A" }]}
          >
            <View style={{ position: "relative" }}>
              <Feather name="message-circle" size={14} color={totalUnread > 0 ? "#64B5F6" : "#3A6A8A"} />
              {totalUnread > 0 && (
                <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: "#E53935", borderRadius: 8, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                  <Text style={{ color: "#fff", fontSize: 8, fontFamily: "Cairo_700Bold" }}>{totalUnread > 9 ? "9+" : totalUnread}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: totalUnread > 0 ? "#64B5F6" : "#3A6A8A", fontFamily: "Cairo_700Bold", fontSize: 12 }}>الرسائل</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowBroadcastModal(true)}
            style={[styles.headerActionBtn, { backgroundColor: "#1A2A1A", borderWidth: 1, borderColor: "#2A5A2A" }]}
          >
            <Feather name="bell" size={14} color="#81C784" />
            <Text style={{ color: "#81C784", fontFamily: "Cairo_700Bold", fontSize: 12 }}>
              إشعار{broadcastRemaining !== null ? ` (${broadcastRemaining})` : ""}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowStockModal(true)}
            style={[styles.headerActionBtn, { backgroundColor: "#1A2A3A", borderWidth: 1, borderColor: "#1E3A5A" }]}
          >
            <Feather name="package" size={14} color="#64B5F6" />
            <Text style={{ color: "#64B5F6", fontFamily: "Cairo_700Bold", fontSize: 12 }}>المخزون</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/admin-menu")}
            style={[styles.headerActionBtn, { backgroundColor: colors.gold }]}
          >
            <Feather name="settings" size={14} color="#1A0A00" />
            <Text style={{ color: "#1A0A00", fontFamily: "Cairo_700Bold", fontSize: 12 }}>القائمة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setShowDriversMgmt(true); loadAllDrivers(); }}
            style={[styles.headerActionBtn, { backgroundColor: "#0A2A1A", borderWidth: 1, borderColor: "#4CAF5044" }]}
          >
            <Feather name="users" size={14} color="#4CAF50" />
            <Text style={{ color: "#4CAF50", fontFamily: "Cairo_700Bold", fontSize: 12 }}>مناديب</Text>
          </TouchableOpacity>

          {Platform.OS === "web" && (
            <TouchableOpacity
              onPress={() => handlePrintOrdersList(orders, "تقرير الحسابات")}
              style={[styles.headerActionBtn, { backgroundColor: "#2A1A0A", borderWidth: 1, borderColor: "#E8920C44" }]}
            >
              <Feather name="printer" size={14} color="#E8920C" />
              <Text style={{ color: "#E8920C", fontFamily: "Cairo_700Bold", fontSize: 12 }}>الحسابات</Text>
            </TouchableOpacity>
          )}

        </View>
      </View>

      {/* ── Bottom Nav Bar ── */}
      <View style={{ flexDirection: "row-reverse", backgroundColor: "#1A1008", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {([
          { key: "orders",  label: "استقبال الطلبات", icon: "clipboard"  as const, color: "#E8920C", badge: pendingCount },
          { key: "pickup",  label: "تسليم الفرع",     icon: "package"    as const, color: "#82B1FF", badge: pickupPendingCount },
          { key: "drivers", label: "المناديب",         icon: "truck"      as const, color: "#4CAF50", badge: activeAssignments.length },
        ]).map(tab => {
          const active = cashierView === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => {
                setCashierView(tab.key as "orders" | "drivers" | "pickup");
                if (tab.key === "drivers") { loadActiveAssignments(); loadAllDeliveries(drvSelectedDate); }
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: active ? tab.color : "transparent", gap: 3 }}
            >
              <View style={{ position: "relative" }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: active ? tab.color + "22" : "transparent", alignItems: "center", justifyContent: "center" }}>
                  <Feather name={tab.icon} size={22} color={active ? tab.color : colors.mutedForeground} />
                </View>
                {tab.badge > 0 && (
                  <View style={{ position: "absolute", top: 0, left: 0, backgroundColor: "#E53935", borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
                    <Text style={{ color: "#fff", fontSize: 10, fontFamily: F.extra }}>{tab.badge > 9 ? "9+" : tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: active ? tab.color : colors.mutedForeground, fontFamily: active ? F.bold : F.regular, fontSize: 12 }}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>


      {/* New Order Alert Banner */}
      {cashierView === "orders" && hasNewOrder && (
        <View style={{ backgroundColor: "#E53935", paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Text style={{ fontSize: 20 }}>🔔</Text>
          <Text style={{ color: "#fff", fontFamily: "Cairo_800ExtraBold", fontSize: 16, letterSpacing: 0.5 }}>
            طلب جديد وصل!
          </Text>
          <Text style={{ fontSize: 20 }}>🔔</Text>
        </View>
      )}

      {/* ── Drivers view ── */}
      {cashierView === "drivers" && (() => {
        // ── Week helpers ──
        const DAY_ABBR = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
        const today0 = new Date(); today0.setHours(0,0,0,0);

        // Sunday-anchored week
        const weekDays: Date[] = (() => {
          const anchor = new Date(today0);
          anchor.setDate(today0.getDate() - today0.getDay() + drvWeekOffset * 7);
          return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(anchor); d.setDate(anchor.getDate() + i); return d;
          });
        })();

        const isToday    = (d: Date) => d.toDateString() === today0.toDateString();
        const isSelected = (d: Date) => d.toDateString() === drvSelectedDate.toDateString();
        const isFuture   = (d: Date) => d > today0;

        // month label for the visible week (use middle day)
        const midDay   = weekDays[3];
        const monthLabel = midDay.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });

        // stats for selected day
        const totalCollected = allDeliveries.reduce((s, r) => s + r.totalPrice, 0);
        const cashCollected  = allDeliveries.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);

        const fmtTime = (iso: string | null) =>
          iso ? new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "--:--";

        return (
          <>
            {/* ── Calendar header (compact) ── */}
            <View style={{ backgroundColor: "#0D0D0D", borderBottomWidth: 1, borderBottomColor: colors.border }}>

              {/* Month row + arrows + today button — all in one row */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 }}>
                {/* Left: go to newer week (disabled at current) */}
                <TouchableOpacity
                  onPress={() => setDrvWeekOffset(p => p + 1)}
                  disabled={drvWeekOffset >= 0}
                  style={{ opacity: drvWeekOffset >= 0 ? 0.25 : 1, padding: 6 }}
                >
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                {/* Center: month label */}
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 14 }}>{monthLabel}</Text>

                {/* Right: today button + go to older week */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => { setDrvWeekOffset(0); const d = new Date(); d.setHours(0,0,0,0); setDrvSelectedDate(d); loadAllDeliveries(d); }}
                    style={{ backgroundColor: "#1A2A1A", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#4CAF5044" }}
                  >
                    <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 11 }}>اليوم</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDrvWeekOffset(p => p - 1)} style={{ padding: 6 }}>
                    <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Day abbreviations */}
              <View style={{ flexDirection: "row-reverse", paddingHorizontal: 8 }}>
                {weekDays.map((_, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>{DAY_ABBR[i]}</Text>
                  </View>
                ))}
              </View>

              {/* Date numbers */}
              <View style={{ flexDirection: "row-reverse", paddingHorizontal: 6, paddingBottom: 8, paddingTop: 2 }}>
                {weekDays.map((d, i) => {
                  const sel  = isSelected(d);
                  const tod  = isToday(d);
                  const fut  = isFuture(d);
                  return (
                    <TouchableOpacity
                      key={i}
                      disabled={fut}
                      onPress={() => { setDrvSelectedDate(d); loadAllDeliveries(d); setDrvExpandedId(null); setExpandedDriverNames(new Set()); }}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 3 }}
                    >
                      <View style={{
                        width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
                        backgroundColor: sel ? "#4CAF50" : tod ? "#4CAF5022" : "transparent",
                        borderWidth: tod && !sel ? 1 : 0, borderColor: "#4CAF5066",
                      }}>
                        <Text style={{
                          color: sel ? "#fff" : fut ? colors.border : tod ? "#4CAF50" : colors.foreground,
                          fontFamily: sel ? F.extra : F.semi, fontSize: 13,
                        }}>
                          {d.getDate()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Stats summary ── */}
            <View style={{ flexDirection: "row-reverse", backgroundColor: "#111", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 14 }}>
              {[
                { icon: "🛒", label: "تم جمعها",       value: `SR ${totalCollected.toFixed(2)}`, color: "#4CAF50" },
                { icon: "📦", label: "عمليات التوصيل", value: String(allDeliveries.length),       color: "#E8920C" },
                { icon: "💵", label: "نقدي",             value: `SR ${cashCollected.toFixed(2)}`,  color: "#81C784" },
                { icon: "🚗", label: "في الطريق",        value: String(activeAssignments.length),  color: "#82B1FF" },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 4, borderRightWidth: i < 3 ? 1 : 0, borderRightColor: colors.border }}>
                  <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                  <Text style={{ color: s.color, fontFamily: F.extra, fontSize: 14 }}>{s.value}</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10 }}>{s.label}</Text>
                </View>
              ))}
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

              {/* ── Active in-transit orders ── */}
              {activeAssignments.length > 0 && (
                <View style={{ padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
                    <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>🚗 بانتظار التسليم ({activeAssignments.length})</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={loadActiveAssignments} style={{ padding: 4 }}>
                      <Feather name="refresh-cw" size={12} color="#4CAF50" />
                    </TouchableOpacity>
                  </View>
                  {activeAssignments.map(a => {
                    const gpsLost = !a.locationUpdatedAt || (Date.now() - new Date(a.locationUpdatedAt).getTime() > 30000);
                    return (
                    <View key={a.orderId} style={{ backgroundColor: "#0A1A0A", borderRadius: 14, borderWidth: 1, borderColor: gpsLost ? "#F9A82544" : "#4CAF5044", overflow: "hidden" }}>
                      {gpsLost && (
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#F9A82518", paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F9A82533" }}>
                          <Text style={{ fontSize: 13 }}>⚠️</Text>
                          <Text style={{ color: "#F9A825", fontFamily: F.bold, fontSize: 12 }}>انقطع إشارة GPS للمندوب</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", padding: 12, gap: 10 }}>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                            <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 }}>
                              <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 12 }}>#{a.dailyNumber ?? a.orderId}</Text>
                            </View>
                            <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{a.customerName}</Text>
                          </View>
                          <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>🛵 {a.driverName}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 3 }}>
                          <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15 }}>{a.totalPrice.toFixed(2)} ر.س</Text>
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>{a.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}</Text>
                        </View>
                      </View>
                      {/* action row: track + confirm */}
                      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#4CAF5033" }}>
                        <TouchableOpacity
                          onPress={() => setTrackingOrderId(a.orderId)}
                          style={{ flex: 1, backgroundColor: "#0A1A2A", paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5, borderRightWidth: 1, borderRightColor: "#4CAF5022" }}
                          activeOpacity={0.75}
                        >
                          <Feather name="map-pin" size={14} color="#29B6F6" />
                          <Text style={{ color: "#29B6F6", fontFamily: F.extra, fontSize: 12 }}>تتبع مباشر</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => confirmDeliveryByCashier(a.orderId)}
                          disabled={deliveringOrderId === a.orderId}
                          style={{ flex: 2, backgroundColor: "#1A3A1A", paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                          activeOpacity={0.75}
                        >
                          {deliveringOrderId === a.orderId
                            ? <ActivityIndicator size="small" color="#4CAF50" />
                            : <><Feather name="check-circle" size={14} color="#4CAF50" /><Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 13 }}>✅ تم التسليم للعميل</Text></>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                    );
                  })}
                </View>
              )}

              {/* ── Divider ── */}
              <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />

              {/* ── Deliveries header ── */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 14 }}>
                  {isToday(drvSelectedDate) ? "توصيلات اليوم" : `توصيلات ${drvSelectedDate.toLocaleDateString("ar-SA", { day: "numeric", month: "long" })}`}
                </Text>
                <View style={{ flexDirection: "row-reverse", gap: 6, alignItems: "center" }}>
                  {allDeliveries.length > 0 && (
                    <TouchableOpacity
                      onPress={() => handlePrintAllDriversReport(allDeliveries, drvSelectedDate)}
                      style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#1A0A2A", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#CE93D844" }}
                    >
                      <Feather name="printer" size={13} color="#CE93D8" />
                      <Text style={{ color: "#CE93D8", fontFamily: F.bold, fontSize: 11 }}>تقرير نهاية الدوام</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => loadAllDeliveries(drvSelectedDate)} style={{ padding: 5 }}>
                    <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── Driver grouped cards ── */}
              <View style={{ padding: 14, paddingTop: 10, gap: 10 }}>

                {allDeliveriesLoading && <ActivityIndicator color="#4CAF50" style={{ marginVertical: 20 }} />}

                {!allDeliveriesLoading && allDeliveries.length === 0 && (
                  <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                    <Text style={{ fontSize: 36 }}>📋</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>لا توجد توصيلات في هذا اليوم</Text>
                  </View>
                )}

                {!allDeliveriesLoading && (() => {
                  // Group by driver
                  const driverMap = new Map<string, AllDeliveryRow[]>();
                  for (const r of allDeliveries) {
                    const key = r.driverName || "غير محدد";
                    if (!driverMap.has(key)) driverMap.set(key, []);
                    driverMap.get(key)!.push(r);
                  }
                  const groups = Array.from(driverMap.entries()).map(([name, rows]) => {
                    const total      = rows.reduce((s, r) => s + r.totalPrice, 0);
                    const cash       = rows.filter(r => r.paymentMethod === "cash").reduce((s, r) => s + r.totalPrice, 0);
                    const electronic = total - cash;
                    return { name, rows, total, cash, electronic };
                  });

                  return groups.map(group => {
                    const isExpanded = expandedDriverNames.has(group.name);
                    const toggleDriver = () => {
                      setExpandedDriverNames(prev => {
                        const next = new Set(prev);
                        if (next.has(group.name)) next.delete(group.name); else next.add(group.name);
                        return next;
                      });
                    };
                    return (
                      <View key={group.name} style={{ backgroundColor: "#0D1A0D", borderRadius: 14, borderWidth: 1, borderColor: "#4CAF5033", overflow: "hidden" }}>
                        {/* Driver header row */}
                        <TouchableOpacity
                          onPress={toggleDriver}
                          activeOpacity={0.8}
                          style={{ padding: 12 }}
                        >
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                            {/* Avatar */}
                            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#1A3A1A", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4CAF5055" }}>
                              <Text style={{ fontSize: 18 }}>🛵</Text>
                            </View>
                            {/* Name + stats */}
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 14, textAlign: "right" }}>{group.name}</Text>
                              <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
                                <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 11 }}>{group.rows.length} طلب</Text>
                                </View>
                                {group.cash > 0 && (
                                  <View style={{ backgroundColor: "#2E7D3222", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                    <Text style={{ color: "#81C784", fontFamily: F.bold, fontSize: 11 }}>💵 {group.cash.toFixed(2)}</Text>
                                  </View>
                                )}
                                {group.electronic > 0 && (
                                  <View style={{ backgroundColor: "#1565C022", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                    <Text style={{ color: "#64B5F6", fontFamily: F.bold, fontSize: 11 }}>💳 {group.electronic.toFixed(2)}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {/* Total + expand icon */}
                            <View style={{ alignItems: "flex-end", gap: 4 }}>
                              <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 15 }}>{group.total.toFixed(2)} ر.س</Text>
                              <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Print button for this driver */}
                        <TouchableOpacity
                          onPress={() => handlePrintAllDriversReport(group.rows, drvSelectedDate)}
                          style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#0A1A2A", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#4CAF5022" }}
                          activeOpacity={0.75}
                        >
                          <Feather name="printer" size={12} color="#64B5F6" />
                          <Text style={{ color: "#64B5F6", fontFamily: F.semi, fontSize: 11 }}>طباعة كشف {group.name}</Text>
                        </TouchableOpacity>

                        {/* Expanded: delivery rows */}
                        {isExpanded && (
                          <View style={{ borderTopWidth: 1, borderTopColor: "#4CAF5022" }}>
                            {group.rows.map((row, idx) => {
                              const isCash = row.paymentMethod === "cash";
                              return (
                                <View
                                  key={`${row.orderId}-${idx}`}
                                  style={{ flexDirection: "row-reverse", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: idx < group.rows.length - 1 ? 1 : 0, borderBottomColor: "#4CAF5011" }}
                                >
                                  {/* Payment icon */}
                                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isCash ? "#0F1A14" : "#0A0F1A", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: isCash ? "#2E7D3244" : "#1565C044" }}>
                                    <Text style={{ fontSize: 13 }}>{isCash ? "💵" : "💳"}</Text>
                                  </View>
                                  {/* Order info */}
                                  <View style={{ flex: 1, gap: 2, paddingHorizontal: 8 }}>
                                    <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
                                      #{row.dailyNumber ?? row.orderId} — {row.customerName}
                                    </Text>
                                    {row.deliveredAt && (
                                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>
                                        {fmtTime(row.deliveredAt)}
                                      </Text>
                                    )}
                                  </View>
                                  {/* Price */}
                                  <Text style={{ color: isCash ? "#81C784" : "#64B5F6", fontFamily: F.extra, fontSize: 13 }}>
                                    {row.totalPrice.toFixed(2)} ر.س
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  });
                })()}
              </View>
            </ScrollView>
          </>
        );
      })()}


      {/* ── Pickup (branch) view ── */}
      {cashierView === "pickup" && (() => {
        const fromMins = parseInt(pickupFromHour) * 60 + parseInt(pickupFromMin);
        const toMins   = parseInt(pickupToHour)   * 60 + parseInt(pickupToMin);

        // today's date boundaries for daily summary
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayPickup = pickupOrders.filter(o => new Date(o.createdAt) >= todayStart);
        const todayDone   = todayPickup.filter(o => o.status === "done");
        const todayTotal  = todayDone.reduce((s, o) => s + o.totalPrice / 100, 0);
        const todayCount  = todayDone.length;
        const todayPending = todayPickup.filter(o => o.status !== "done" && o.status !== "cancelled").length;

        const filtered = pickupOrders.filter(o => {
          const d = new Date(o.createdAt);
          const m = d.getHours() * 60 + d.getMinutes();
          return m >= fromMins && m <= toMins;
        });
        const activeFiltered  = filtered.filter(o => o.status !== "done" && o.status !== "cancelled");
        const doneFiltered    = filtered.filter(o => o.status === "done");
        const filteredTotal   = doneFiltered.reduce((s, o) => s + o.totalPrice / 100, 0);
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 60 }}>
            {/* Header */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>🏪 تسليم من الفرع</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                  {new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </Text>
              </View>
              <View style={{ backgroundColor: "#82B1FF22", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "#82B1FF44", alignItems: "center" }}>
                <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 18 }}>{todayPending}</Text>
                <Text style={{ color: "#82B1FF", fontFamily: F.semi, fontSize: 10 }}>بانتظار</Text>
              </View>
            </View>

            {/* ── Daily sales summary ── */}
            <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: "#E8920C44", overflow: "hidden" }}>
              <View style={{ backgroundColor: "#E8920C11", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                <Feather name="bar-chart-2" size={15} color={colors.gold} />
                <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 14 }}>إجمالي المبيعات اليوم</Text>
              </View>
              <View style={{ flexDirection: "row-reverse", padding: 14, gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: "#4CAF5011", borderRadius: 14, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#4CAF5033" }}>
                  <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 24 }}>{todayTotal.toFixed(2)}</Text>
                  <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>ر.س إجمالي</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#82B1FF11", borderRadius: 14, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#82B1FF33" }}>
                  <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 24 }}>{todayCount}</Text>
                  <Text style={{ color: "#82B1FF", fontFamily: F.semi, fontSize: 12 }}>طلب مكتمل</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#E8920C11", borderRadius: 14, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#E8920C33" }}>
                  <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 24 }}>{todayPending}</Text>
                  <Text style={{ color: colors.gold, fontFamily: F.semi, fontSize: 12 }}>بانتظار</Text>
                </View>
              </View>
            </View>

            {/* ── Time range filter (vertical) ── */}
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#82B1FF33", gap: 12 }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                <Feather name="clock" size={15} color="#82B1FF" />
                <Text style={{ color: "#82B1FF", fontFamily: F.bold, fontSize: 14 }}>تصفية بالوقت</Text>
              </View>

              {/* From row */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>من الساعة</Text>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <TextInput
                    value={pickupFromHour}
                    onChangeText={v => setPickupFromHour(v.replace(/\D/g,"").slice(0,2))}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="00"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, borderWidth: 1, borderColor: "#82B1FF44", color: "#82B1FF", fontFamily: F.extra, fontSize: 22, textAlign: "center", paddingVertical: 10 }}
                  />
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.extra, fontSize: 20 }}>:</Text>
                  <TextInput
                    value={pickupFromMin}
                    onChangeText={v => setPickupFromMin(v.replace(/\D/g,"").slice(0,2))}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="00"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, borderWidth: 1, borderColor: "#82B1FF44", color: "#82B1FF", fontFamily: F.extra, fontSize: 22, textAlign: "center", paddingVertical: 10 }}
                  />
                </View>
              </View>

              {/* Arrow down */}
              <View style={{ alignItems: "center" }}>
                <Feather name="arrow-down" size={18} color={colors.mutedForeground} />
              </View>

              {/* To row */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>إلى الساعة</Text>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <TextInput
                    value={pickupToHour}
                    onChangeText={v => setPickupToHour(v.replace(/\D/g,"").slice(0,2))}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="23"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, borderWidth: 1, borderColor: "#82B1FF44", color: "#82B1FF", fontFamily: F.extra, fontSize: 22, textAlign: "center", paddingVertical: 10 }}
                  />
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.extra, fontSize: 20 }}>:</Text>
                  <TextInput
                    value={pickupToMin}
                    onChangeText={v => setPickupToMin(v.replace(/\D/g,"").slice(0,2))}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="59"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, borderWidth: 1, borderColor: "#82B1FF44", color: "#82B1FF", fontFamily: F.extra, fontSize: 22, textAlign: "center", paddingVertical: 10 }}
                  />
                </View>
              </View>

              {/* Filtered summary */}
              {(doneFiltered.length > 0 || activeFiltered.length > 0) && (
                <View style={{ backgroundColor: "#82B1FF0D", borderRadius: 12, padding: 10, flexDirection: "row-reverse", justifyContent: "space-around", borderWidth: 1, borderColor: "#82B1FF22" }}>
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 16 }}>{filteredTotal.toFixed(2)}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>ر.س في النطاق</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>{doneFiltered.length}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>مكتمل</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16 }}>{activeFiltered.length}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>بانتظار</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Active pickup orders */}
            {activeFiltered.length === 0 ? (
              <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 28, alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 40 }}>🏪</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>لا يوجد طلبات استلام في هذا النطاق</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#82B1FF" }} />
                  <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>بانتظار الاستلام ({activeFiltered.length})</Text>
                </View>
                {activeFiltered.map(order => {
                  const d = new Date(order.createdAt);
                  const timeStr = d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });
                  const dateStr = d.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
                  const pf = getOrderPriceFactor(order);
                  return (
                    <View key={order.id} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: "#82B1FF44", overflow: "hidden" }}>
                      {/* Top bar */}
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#82B1FF11" }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                          <View style={{ backgroundColor: "#82B1FF22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 14 }}>#{order.dailyNumber ?? order.id}</Text>
                          </View>
                          <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>{order.customerName}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 1 }}>
                          <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 16 }}>{(order.totalPrice / 100).toFixed(2)} ر.س</Text>
                          <View style={{ backgroundColor: STATUS_COLORS[order.status] + "22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                            <Text style={{ color: STATUS_COLORS[order.status], fontFamily: F.bold, fontSize: 11 }}>{STATUS_LABELS[order.status]}</Text>
                          </View>
                        </View>
                      </View>
                      {/* Items */}
                      <View style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 3 }}>
                        {order.items.map((item, i) => (
                          <View key={i} style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
                            <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }} numberOfLines={1}>× {item.quantity}  {getOrderItemDisplayName(item)}</Text>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{(item.price * pf * item.quantity).toFixed(2)}</Text>
                          </View>
                        ))}
                      </View>
                      {/* Time / date row */}
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 10, paddingTop: 4 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                          <Feather name="clock" size={13} color={colors.mutedForeground} />
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>{timeStr}</Text>
                        </View>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                          <Feather name="calendar" size={13} color={colors.mutedForeground} />
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{dateStr}</Text>
                        </View>
                      </View>
                      {/* Phone */}
                      {order.customerPhone && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
                          style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}
                        >
                          <Feather name="phone" size={13} color="#82B1FF" />
                          <Text style={{ color: "#82B1FF", fontFamily: F.semi, fontSize: 13 }}>{order.customerPhone}</Text>
                        </TouchableOpacity>
                      )}
                      {/* Action buttons row */}
                      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#82B1FF22" }}>
                        <TouchableOpacity
                          onPress={() => setPrintOrder(order)}
                          style={{ flex: 1, backgroundColor: "#0D1A0D", paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, borderRightWidth: 1, borderRightColor: "#82B1FF22" }}
                          activeOpacity={0.75}
                        >
                          <Feather name="printer" size={15} color="#E8920C" />
                          <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 13 }}>طباعة الفاتورة</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUpdateStatus(order, "done")}
                          style={{ flex: 1, backgroundColor: "#0D1F35", paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                          activeOpacity={0.75}
                        >
                          <Feather name="check-circle" size={15} color="#82B1FF" />
                          <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 13 }}>✅ تم التسليم</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Done pickup orders (collapsible) */}
            {doneFiltered.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>✅ تم استلامها ({doneFiltered.length})</Text>
                {doneFiltered.map(order => {
                  const d = new Date(order.createdAt);
                  const timeStr = d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });
                  const dateStr = d.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
                  return (
                    <View key={order.id} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: "#4CAF5033", overflow: "hidden", opacity: 0.85 }}>
                      <View style={{ padding: 12, gap: 4 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 13 }}>#{order.dailyNumber ?? order.id}</Text>
                            <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{order.customerName}</Text>
                          </View>
                          <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 14 }}>{(order.totalPrice / 100).toFixed(2)} ر.س</Text>
                        </View>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                            <Feather name="clock" size={12} color={colors.mutedForeground} />
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{timeStr}</Text>
                          </View>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                            <Feather name="calendar" size={12} color={colors.mutedForeground} />
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{dateStr}</Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setPrintOrder(order)}
                        style={{ backgroundColor: "#0D1A0D", borderTopWidth: 1, borderTopColor: "#4CAF5022", paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                        activeOpacity={0.75}
                      >
                        <Feather name="printer" size={13} color="#E8920C" />
                        <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 12 }}>إعادة طباعة الفاتورة</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        );
      })()}

      {/* ── Orders view ── */}
      {cashierView === "orders" && (<>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterTabs}
        style={{ backgroundColor: "#1A1008" }}
      >
        {([["all", "الكل"], ["pending", "جديد"], ["preparing", "جاري التحضير"], ["ready", "جاهز"], ["done", "تم"], ["cancelled", "ملغى"]] as [string, string][]).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key as OrderStatus | "all")}
            style={[
              styles.filterTab,
              {
                backgroundColor: filter === key ? colors.gold : colors.secondary,
                borderColor: filter === key ? colors.gold : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterTabText, { color: filter === key ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Print orders list button */}
      {Platform.OS === "web" && !loading && filtered.length > 0 && (
        <TouchableOpacity
          onPress={() => {
            const filterLabels: Record<string, string> = { all: "كل الطلبات", pending: "طلبات جديدة", preparing: "قيد التحضير", ready: "جاهزة للتسليم", done: "مكتملة", cancelled: "ملغاة" };
            handlePrintOrdersList(filtered, filterLabels[filter] ?? "الطلبات");
          }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 14, marginTop: 8, marginBottom: 2, paddingVertical: 10, borderRadius: 12, backgroundColor: "#1A2A3A", borderWidth: 1, borderColor: "#64B5F633" }}
          activeOpacity={0.8}
        >
          <Feather name="printer" size={15} color="#64B5F6" />
          <Text style={{ color: "#64B5F6", fontFamily: F.bold, fontSize: 13 }}>
            طباعة قائمة الطلبات ({filtered.length})
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 48 }}>🍽️</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>
            لا توجد طلبات
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.ordersList, { paddingBottom: bottomInset + 20 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchOrders(); }}
              tintColor={colors.gold}
            />
          }
        >
          {filtered.map((order) => {
            const nextStatus = STATUS_NEXT[order.status];
            const isPickup   = !!order.notes?.includes("استلام من الفرع");
            // الكاشير يرى دائماً قسم المندوب لأي طلب توصيل — بغض النظر عن إعداد driversEnabled
            const isDelivery = !isPickup && (!!order.customerAddress || order.notes?.includes("توصيل"));
            const assignmentRow = assignments[order.id];
            const hasAssignedDriver = order.status === "ready" && assignmentRow?.status === "assigned";
            const driverPickedUp = assignmentRow?.status === "picked_up";
            const nextLabel = STATUS_NEXT_LABEL[order.status];
            const orderDate = new Date(order.createdAt);
            const time = orderDate.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
            const dateStr = orderDate.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
            const total = (order.totalPrice / 100).toFixed(2);
            const pf = getOrderPriceFactor(order);
            return (
              <View key={order.id} style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + "22", borderColor: STATUS_COLORS[order.status] }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[order.status], fontFamily: F.bold }]}>
                      {STATUS_LABELS[order.status]}
                    </Text>
                  </View>
                  <View style={styles.orderMeta}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.dailyBadge, { backgroundColor: colors.gold + "22", borderColor: colors.gold }]}>
                        <Text style={[styles.dailyNumber, { color: colors.gold, fontFamily: F.extra }]}>
                          طلب اليوم #{order.dailyNumber}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={[styles.orderTime, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                        {time}
                      </Text>
                      <Text style={[styles.orderDate, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                        {dateStr}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.customerRow}>
                    <Text style={[styles.customerName, { color: colors.foreground, fontFamily: F.bold }]}>
                      {order.customerName}
                    </Text>
                    <Feather name="user" size={14} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.customerRow}>
                    <Text style={[styles.customerPhone, { color: colors.mutedForeground, fontFamily: F.semi }]}>
                      {order.customerPhone}
                    </Text>
                    <Feather name="phone" size={14} color={colors.mutedForeground} />
                  </View>
                  {order.customerAddress && (
                    <TouchableOpacity
                      style={styles.customerRow}
                      onPress={() => order.customerAddress?.startsWith("https://") ? Linking.openURL(order.customerAddress) : undefined}
                      activeOpacity={order.customerAddress.startsWith("https://") ? 0.6 : 1}
                    >
                      <Text
                        style={[styles.customerPhone, { color: order.customerAddress.startsWith("https://") ? "#4CAF50" : colors.mutedForeground, fontFamily: F.regular }]}
                        numberOfLines={1}
                      >
                        {order.customerAddress.startsWith("https://") ? "📍 فتح الموقع على الخريطة" : order.customerAddress}
                      </Text>
                      <Feather name="map-pin" size={14} color={order.customerAddress.startsWith("https://") ? "#4CAF50" : colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[styles.itemsList, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                  {order.items.map((item, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={[styles.itemPrice, { color: colors.gold, fontFamily: F.bold }]}>
                        {(item.price * pf * item.quantity) % 1 === 0
                          ? (item.price * pf * item.quantity)
                          : (item.price * pf * item.quantity).toFixed(1)} ر.س
                      </Text>
                      <Text style={[styles.itemName, { color: colors.foreground, fontFamily: F.semi }]} numberOfLines={1}>
                        {getOrderItemDisplayName(item)} × {item.quantity}
                      </Text>
                    </View>
                  ))}
                </View>

                {order.discountCode && order.discountAmount != null && (
                  <View style={[styles.notesRow, { backgroundColor: "#1A0A0A", borderTopWidth: 1, borderTopColor: "#C8171A33" }]}>
                    <Text style={[styles.notesLabel, { color: "#C8171A", fontFamily: F.bold }]}>
                      -{(order.discountAmount / 100) % 1 === 0 ? (order.discountAmount / 100) : (order.discountAmount / 100).toFixed(2)} ر.س
                    </Text>
                    <Text style={[styles.notesText, { color: "#E57373", fontFamily: F.semi }]}>
                      🏷️ {order.discountCode}
                    </Text>
                  </View>
                )}

                {order.notes && (
                  <View style={[styles.notesRow, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.notesLabel, { color: colors.gold, fontFamily: F.bold }]}>ملاحظة: </Text>
                    <Text style={[styles.notesText, { color: colors.foreground, fontFamily: F.regular }]}>{order.notes}</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <Text style={[styles.totalAmount, { color: colors.gold, fontFamily: F.extra }]}>
                    {total} ر.س
                  </Text>
                  <Text style={[styles.payMethod, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                    {order.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}
                  </Text>
                </View>

                {/* ── أزرار الحالة العادية: pending→preparing, preparing→ready ── */}
                {nextStatus && nextLabel && order.status !== "ready" && (
                  <TouchableOpacity
                    onPress={() => handleUpdateStatus(order, nextStatus)}
                    style={[styles.actionBtn, { backgroundColor: STATUS_COLORS[nextStatus] }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.actionBtnText, { fontFamily: F.bold }]}>{nextLabel}</Text>
                  </TouchableOpacity>
                )}

                {/* ── زر تسليم مباشر للاستلام من الفرع ── */}
                {order.status === "ready" && isPickup && (
                  <TouchableOpacity
                    onPress={() => handleUpdateStatus(order, "done")}
                    style={[styles.actionBtn, { backgroundColor: "#0D1F35", borderWidth: 1.5, borderColor: "#82B1FF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 18 }}>🏪</Text>
                    <Text style={[styles.actionBtnText, { fontFamily: F.bold, color: "#82B1FF" }]}>✅ تم تسليم الطلب للعميل</Text>
                  </TouchableOpacity>
                )}

                {/* ── قسم التوصيل (يظهر فقط للطلبات الجاهزة delivery) ── */}
                {order.status === "ready" && isDelivery && (
                  <View style={{ gap: 8 }}>

                    {driverPickedUp ? (
                      /* ── المندوب استلم: عرض بارز ── */
                      <View style={{ backgroundColor: "#0A2A0A", borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: "#4CAF50" }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                          <Text style={{ fontSize: 28 }}>🛵</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>
                              {assignmentRow!.driverName}
                            </Text>
                            <Text style={{ color: "#4CAF50BB", fontFamily: F.semi, fontSize: 12 }}>
                              في قسم المناديب — بانتظار التسليم للعميل
                            </Text>
                          </View>
                          <View style={{ backgroundColor: "#4CAF5022", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 11 }}>🚗 في الطريق</Text>
                          </View>
                        </View>
                      </View>

                    ) : (
                      <>
                        {/* زر تسليم الطلب للمندوب — نشط/معطّل حسب وجود مندوب */}
                        <TouchableOpacity
                          onPress={hasAssignedDriver ? () => handleUpdateStatus(order, "done") : undefined}
                          disabled={!hasAssignedDriver}
                          style={[
                            styles.actionBtn,
                            { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
                            hasAssignedDriver
                              ? { backgroundColor: "#1A3A1A", borderWidth: 1.5, borderColor: "#4CAF50" }
                              : { backgroundColor: "#1E1E1E", borderWidth: 1, borderColor: "#444" },
                          ]}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 18 }}>🛵</Text>
                          <View style={{ alignItems: "center" }}>
                            <Text style={[styles.actionBtnText, { fontFamily: F.bold, color: hasAssignedDriver ? "#4CAF50" : "#666" }]}>
                              تسليم الطلب للمندوب
                            </Text>
                            {!hasAssignedDriver && (
                              <Text style={{ color: "#555", fontFamily: F.regular, fontSize: 10 }}>
                                عيّن مندوباً أولاً 🔒
                              </Text>
                            )}
                            {hasAssignedDriver && (
                              <Text style={{ color: "#4CAF50AA", fontFamily: F.semi, fontSize: 11 }}>
                                {assignmentRow!.driverName}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* تعيين / تغيير المندوب */}
                        {assignmentRow ? (
                          <View style={{ backgroundColor: "#0A1F0A", borderRadius: 10, padding: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#2E7D3244" }}>
                            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                              <Text style={{ fontSize: 15 }}>🛵</Text>
                              <View>
                                <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>{assignmentRow.driverName}</Text>
                                <Text style={{ color: "#4CAF50AA", fontFamily: F.regular, fontSize: 11 }}>المندوب المعيّن — بانتظار التسليم</Text>
                              </View>
                            </View>
                            <TouchableOpacity onPress={() => unassignDriver(order.id)} style={{ padding: 6 }}>
                              <Feather name="x" size={14} color="#9E9E9E" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setAssigningOrderId(order.id)}
                            style={[styles.actionBtn, { backgroundColor: "#0A1A0A", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#2E7D32" }]}
                          >
                            <Text style={{ fontSize: 16 }}>➕</Text>
                            <Text style={[styles.actionBtnText, { fontFamily: F.bold, color: "#4CAF50" }]}>تعيين مندوب</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                )}

                {/* زر الإلغاء */}
                {order.status !== "done" && order.status !== "cancelled" && !driverPickedUp && (
                  <TouchableOpacity
                    onPress={() => handleCancelOrder(order)}
                    style={[styles.actionBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#9E9E9E", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]}
                    activeOpacity={0.8}
                  >
                    <Feather name="x" size={14} color="#9E9E9E" />
                    <Text style={[styles.actionBtnText, { fontFamily: F.bold, color: "#9E9E9E" }]}>إلغاء الطلب</Text>
                  </TouchableOpacity>
                )}

                {/* Assign driver modal */}
                {assigningOrderId === order.id && (
                  <View style={{ backgroundColor: "#0F1A0F", borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: "#2E7D32" }}>
                    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>اختر مندوباً للطلب</Text>
                      <TouchableOpacity onPress={() => setAssigningOrderId(null)}><Feather name="x" size={16} color="#9E9E9E" /></TouchableOpacity>
                    </View>
                    {drivers.length === 0
                      ? <Text style={{ color: "#9E9E9E", fontFamily: F.regular, fontSize: 12, textAlign: "center" }}>لا يوجد مناديب نشطون</Text>
                      : drivers.map((d) => (
                        <TouchableOpacity
                          key={d.id}
                          onPress={() => assignDriver(order.id, d.id)}
                          style={{ backgroundColor: "#1A2A1A", borderRadius: 10, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10 }}
                        >
                          {d.photoUrl
                            ? <Image source={{ uri: d.photoUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                            : <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#2A3A2A", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>🛵</Text></View>
                          }
                          <View>
                            <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 13 }}>{d.name}</Text>
                            <Text style={{ color: "#9E9E9E", fontFamily: F.regular, fontSize: 11 }}>{d.phone}</Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    }
                  </View>
                )}

                {/* Chat button */}
                <TouchableOpacity
                  onPress={() => openOrderChat(order)}
                  style={[styles.actionBtn, { backgroundColor: "#0D2030", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#1E4A6A" }]}
                  activeOpacity={0.8}
                >
                  <View style={{ position: "relative" }}>
                    <Feather name="message-circle" size={16} color="#64B5F6" />
                    {!!unreadByOrder[order.id] && (
                      <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: "#E53935", borderRadius: 8, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                        <Text style={{ color: "#fff", fontSize: 8, fontFamily: F.bold }}>{unreadByOrder[order.id]}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.actionBtnText, { fontFamily: F.bold, color: "#64B5F6" }]}>
                    مراسلة العميل{unreadByOrder[order.id] ? `  •  ${unreadByOrder[order.id]} جديدة` : ""}
                  </Text>
                </TouchableOpacity>

                {Platform.OS === "web" && (
                  <TouchableOpacity
                    onPress={() => handlePrint(order)}
                    style={[styles.actionBtn, { backgroundColor: "#1A2A3A", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}
                    activeOpacity={0.8}
                  >
                    <Feather name="printer" size={15} color="#64B5F6" />
                    <Text style={[styles.actionBtnText, { fontFamily: F.bold, color: "#64B5F6" }]}>طباعة الإيصال</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      </>)}

      {/* Print Receipt Modal */}
      <Modal
        visible={!!printOrder}
        transparent
        animationType="fade"
        onRequestClose={() => { setPrintOrder(null); setCashPaid(""); }}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000000AA", padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 22, width: "100%", maxWidth: 420, gap: 14, borderWidth: 1, borderColor: colors.border }}>
            {/* Header */}
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 26 }}>🖨️</Text>
              <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 17, textAlign: "center" }}>
                طباعة الإيصال
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "center" }}>
                تم قبول الطلب — أدخل المبلغ المدفوع ثم اطبع
              </Text>
            </View>

            {/* Order Summary with full breakdown */}
            {printOrder && (() => {
              const totalDue = printOrder.totalPrice / 100;
              const deliveryFee = (printOrder.deliveryFee ?? 0) / 100;
              const rawSubtotal = printOrder.items.reduce((s, i) => s + i.price * i.quantity, 0);
              const expected = totalDue - deliveryFee;
              const priceFactor = rawSubtotal > 0 && expected > rawSubtotal * 50
                ? expected / rawSubtotal
                : 1;
              const itemsSubtotal = rawSubtotal * priceFactor;
              const discount = Math.max(0, itemsSubtotal + deliveryFee - totalDue);
              const hasDiscount = discount > 0.005;
              const hasDelivery = deliveryFee > 0;
              const paidNum = parseFloat(cashPaid);
              const change = !isNaN(paidNum) && cashPaid.trim() !== "" ? Math.max(0, paidNum - totalDue) : null;
              const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));

              return (
                <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 14, gap: 0, borderWidth: 1, borderColor: colors.border }}>
                  {/* Order header */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 14 }}>
                      طلب اليوم #{printOrder.dailyNumber}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                      {new Date(printOrder.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 13, textAlign: "right", marginBottom: 8 }}>
                    {printOrder.customerName} — {printOrder.customerPhone}
                  </Text>

                  {/* Items */}
                  {printOrder.items.map((item, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                        {fmt(item.price * priceFactor * item.quantity)} ر.س
                      </Text>
                      <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 12 }}>
                        {getOrderItemDisplayName(item)} × {item.quantity}
                      </Text>
                    </View>
                  ))}

                  {/* Breakdown */}
                  <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8, gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{fmt(itemsSubtotal)} ر.س</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>المجموع قبل الخصم</Text>
                    </View>
                    {hasDelivery && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{fmt(deliveryFee)} ر.س</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>رسوم التوصيل</Text>
                      </View>
                    )}
                    {hasDiscount && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: "#C8171A", fontFamily: F.bold, fontSize: 12 }}>- {fmt(discount)} ر.س</Text>
                        <Text style={{ color: "#C8171A", fontFamily: F.semi, fontSize: 12 }}>إجمالي الخصم</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 2 }}>
                      <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 15 }}>{fmt(totalDue)} ر.س</Text>
                      <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>الصافي المستحق</Text>
                    </View>
                    {change !== null && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1B4332", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 }}>
                        <Text style={{ color: "#4ade80", fontFamily: F.extra, fontSize: 14 }}>{fmt(change)} ر.س</Text>
                        <Text style={{ color: "#4ade80", fontFamily: F.bold, fontSize: 13 }}>المتبقي (الفكة)</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Cash paid input */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>
                المبلغ المدفوع من الزبون (ر.س)
              </Text>
              <TextInput
                value={cashPaid}
                onChangeText={(t) => setCashPaid(t.replace(/[^0-9.]/g, ""))}
                placeholder="مثال: 50"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontFamily: F.bold,
                  fontSize: 16,
                  color: colors.foreground,
                  textAlign: "center",
                }}
              />
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setPrintOrder(null); setCashPaid(""); }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }}>تخطي</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (printOrder) {
                    const paidNum = parseFloat(cashPaid);
                    handlePrint(printOrder, !isNaN(paidNum) && cashPaid.trim() !== "" ? paidNum : undefined);
                  }
                  setPrintOrder(null);
                  setCashPaid("");
                }}
                style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.gold }}
                activeOpacity={0.8}
              >
                <Feather name="printer" size={18} color="#1A0A00" />
                <Text style={{ color: "#1A0A00", fontFamily: F.extra, fontSize: 15 }}>طباعة الإيصال</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Driver Detail Modal (full calendar report) ── */}
      <Modal
        visible={!!drvDetailRow}
        transparent
        animationType="slide"
        onRequestClose={() => setDrvDetailRow(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 16, maxHeight: "92%" }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 10, marginBottom: 10 }} />

            {drvDetailRow && (() => {
              const d = drvDetailRow.driver;
              const inTransit = activeAssignments.filter(a => a.driverId === d.id);

              // pick summary numbers based on selected tab
              const tabPeriod = drvStatTab === "today"
                ? drvStatement?.today
                : drvStatTab === "month"
                  ? drvStatement?.thisMonth
                  : drvStatement?.allTime;

              // filter daily list to match tab
              const today0 = new Date(); today0.setHours(0,0,0,0);
              const month0 = new Date(today0.getFullYear(), today0.getMonth(), 1);
              const filteredDays = (drvStatement?.daily ?? []).filter(day => {
                const d0 = new Date(day.date);
                if (drvStatTab === "today")  return d0 >= today0;
                if (drvStatTab === "month")  return d0 >= month0;
                return true;
              });

              const fmt = (iso: string | null) =>
                iso ? new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "--:--";

              return (
                <>
                  {/* Driver header */}
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    {d.photoUrl
                      ? <Image source={{ uri: d.photoUrl }} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: "#4CAF50" }} />
                      : <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#0A2010", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#4CAF50" }}>
                          <Text style={{ fontSize: 24 }}>🛵</Text>
                        </View>
                    }
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 17 }}>{d.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>📱 {d.phone}</Text>
                    </View>
                    <View style={{ flexDirection: "row-reverse", gap: 8, alignItems: "center" }}>
                      {!drvStatLoading && filteredDays.length > 0 && (
                        <TouchableOpacity
                          onPress={() => handlePrintSingleDriverReport(
                            d.name, d.phone,
                            filteredDays,
                            drvStatTab === "today" ? "اليوم" : drvStatTab === "month" ? "هذا الشهر" : "كل الوقت",
                            tabPeriod,
                          )}
                          style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#0A1A2A", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#64B5F644" }}
                        >
                          <Feather name="printer" size={13} color="#64B5F6" />
                          <Text style={{ color: "#64B5F6", fontFamily: F.bold, fontSize: 11 }}>طباعة</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => { setDrvDetailRow(null); setDrvStatement(null); }} style={{ padding: 8 }}>
                        <Feather name="x" size={20} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Period tabs */}
                  <View style={{ flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                    {([ ["today","اليوم","📅"], ["month","هذا الشهر","🗓️"], ["all","كل الوقت","📊"] ] as const).map(([key, label, icon]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setDrvStatTab(key)}
                        style={{ flex: 1, backgroundColor: drvStatTab === key ? colors.gold : colors.secondary, borderRadius: 12, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: drvStatTab === key ? colors.gold : colors.border }}
                      >
                        <Text style={{ fontSize: 14 }}>{icon}</Text>
                        <Text style={{ color: drvStatTab === key ? "#000" : colors.foreground, fontFamily: F.bold, fontSize: 11, marginTop: 2 }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Summary numbers */}
                  {drvStatLoading
                    ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} />
                    : (
                      <View style={{ paddingHorizontal: 16, marginBottom: 6, gap: 8 }}>
                        {/* Row 1: orders + cancelled */}
                        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: "#1A1A0A", borderRadius: 14, borderWidth: 1, borderColor: "#E8920C33", padding: 12, alignItems: "center", gap: 2 }}>
                            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 26 }}>
                              {drvStatTab === "today" ? (tabPeriod?.ordersCount ?? 0) + inTransit.length : (tabPeriod?.ordersCount ?? 0)}
                            </Text>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>✅ طلبات مُسلَّمة</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: "#1A0A0A", borderRadius: 14, borderWidth: 1, borderColor: "#E5737333", padding: 12, alignItems: "center", gap: 2 }}>
                            <Text style={{ color: "#E57373", fontFamily: F.extra, fontSize: 26 }}>{tabPeriod?.cancelledCount ?? 0}</Text>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>❌ طلبات ملغاة</Text>
                          </View>
                        </View>
                        {/* Row 2: total + cash + electronic */}
                        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: "#0A1A0A", borderRadius: 14, borderWidth: 1, borderColor: "#4CAF5033", padding: 10, alignItems: "center", gap: 2 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 18 }}>{(tabPeriod?.totalCollected ?? 0).toFixed(2)}</Text>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>💰 إجمالي ر.س</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: "#0F1A14", borderRadius: 14, borderWidth: 1, borderColor: "#2E7D3233", padding: 10, alignItems: "center", gap: 2 }}>
                            <Text style={{ color: "#81C784", fontFamily: F.extra, fontSize: 18 }}>{(tabPeriod?.cashCollected ?? 0).toFixed(2)}</Text>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>💵 نقدي</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: "#0A0F1A", borderRadius: 14, borderWidth: 1, borderColor: "#1565C033", padding: 10, alignItems: "center", gap: 2 }}>
                            <Text style={{ color: "#64B5F6", fontFamily: F.extra, fontSize: 18 }}>{(tabPeriod?.electronicCollected ?? 0).toFixed(2)}</Text>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10 }}>💳 إلكتروني</Text>
                          </View>
                        </View>
                      </View>
                    )
                  }

                  <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20, gap: 6 }}>

                    {/* In-transit orders (only shown in "today" tab) */}
                    {drvStatTab === "today" && inTransit.length > 0 && (
                      <>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <View style={{ flex: 1, height: 1, backgroundColor: "#4CAF5033" }} />
                          <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 12 }}>🚗 في الطريق ({inTransit.length})</Text>
                        </View>
                        {inTransit.map(a => (
                          <View key={a.orderId} style={{ backgroundColor: "#0A1A0A", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#4CAF5033", gap: 8 }}>
                            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                                <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 }}>
                                  <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 11 }}>#{a.dailyNumber ?? a.orderId}</Text>
                                </View>
                                <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{a.customerName}</Text>
                              </View>
                              <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 14 }}>{a.totalPrice.toFixed(2)} ر.س</Text>
                            </View>
                            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: colors.secondary, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 }}>
                                <Feather name="package" size={10} color={colors.gold} />
                                <Text style={{ color: colors.gold, fontFamily: F.semi, fontSize: 10 }}>
                                  {a.pickedUpAt ? fmt(a.pickedUpAt) : "جارٍ التوصيل"}
                                </Text>
                              </View>
                              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 10, alignSelf: "center" }}>
                                {a.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </>
                    )}

                    {/* Delivered orders grouped by day */}
                    {!drvStatLoading && filteredDays.length === 0 && inTransit.length === 0 && (
                      <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                        <Text style={{ fontSize: 40 }}>📋</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>لا يوجد طلبات في هذه الفترة</Text>
                      </View>
                    )}

                    {filteredDays.map(day => {
                      const dayDate = new Date(day.date);
                      const dayLabel = dayDate.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                      const today0Local = new Date(); today0Local.setHours(0,0,0,0);
                      const isToday = dayDate.toDateString() === today0Local.toDateString();
                      const yesterday = new Date(today0Local); yesterday.setDate(yesterday.getDate() - 1);
                      const isYesterday = dayDate.toDateString() === yesterday.toDateString();
                      const headerLabel = isToday ? `اليوم — ${dayLabel}` : isYesterday ? `أمس — ${dayLabel}` : dayLabel;

                      return (
                        <View key={day.date} style={{ gap: 6 }}>
                          {/* Day header */}
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                            <View style={{ backgroundColor: isToday ? "#E8920C22" : colors.secondary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: isToday ? "#E8920C55" : colors.border }}>
                              <Text style={{ color: isToday ? colors.gold : colors.mutedForeground, fontFamily: F.bold, fontSize: 11 }}>{headerLabel}</Text>
                            </View>
                            <View style={{ backgroundColor: "#4CAF5022", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 10 }}>✅ {day.ordersCount} · {day.totalCollected.toFixed(0)} ر.س</Text>
                            </View>
                            {day.cancelledCount > 0 && (
                              <View style={{ backgroundColor: "#E5737322", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ color: "#E57373", fontFamily: F.extra, fontSize: 10 }}>❌ {day.cancelledCount} ملغى</Text>
                              </View>
                            )}
                          </View>

                          {/* Day payment summary row */}
                          {(day.cashCollected > 0 || day.electronicCollected > 0) && (
                            <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                              {day.cashCollected > 0 && (
                                <View style={{ backgroundColor: "#0F1A14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#2E7D3222" }}>
                                  <Text style={{ color: "#81C784", fontFamily: F.semi, fontSize: 10 }}>💵 نقدي: {day.cashCollected.toFixed(2)} ر.س</Text>
                                </View>
                              )}
                              {day.electronicCollected > 0 && (
                                <View style={{ backgroundColor: "#0A0F1A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#1565C022" }}>
                                  <Text style={{ color: "#64B5F6", fontFamily: F.semi, fontSize: 10 }}>💳 إلكتروني: {day.electronicCollected.toFixed(2)} ر.س</Text>
                                </View>
                              )}
                            </View>
                          )}

                          {/* Orders */}
                          {day.orders.map(ord => (
                            <View key={`${ord.orderId}-${ord.cancelled}`}
                              style={{ backgroundColor: ord.cancelled ? "#1A0A0A" : colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: ord.cancelled ? "#E5737344" : colors.border, gap: 8 }}
                            >
                              {/* Order number + name + price */}
                              <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                                  <View style={{ backgroundColor: ord.cancelled ? "#E5737322" : "#E8920C22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 }}>
                                    <Text style={{ color: ord.cancelled ? "#E57373" : "#E8920C", fontFamily: F.extra, fontSize: 12 }}>#{ord.dailyNumber ?? ord.orderId}</Text>
                                  </View>
                                  <Text style={{ color: ord.cancelled ? "#E57373" : colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{ord.customerName}</Text>
                                  {ord.cancelled && (
                                    <View style={{ backgroundColor: "#E5737322", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                      <Text style={{ color: "#E57373", fontFamily: F.bold, fontSize: 9 }}>ملغى</Text>
                                    </View>
                                  )}
                                </View>
                                {ord.cancelled
                                  ? <Text style={{ color: "#E57373", fontFamily: F.semi, fontSize: 12 }}>—</Text>
                                  : <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                                      <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15 }}>{ord.totalPrice.toFixed(2)} ر.س</Text>
                                      <Text style={{ fontSize: 12 }}>{ord.paymentMethod === "cash" ? "💵" : "💳"}</Text>
                                    </View>
                                }
                              </View>

                              {/* Timeline */}
                              {!ord.cancelled && (
                                <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                                  {ord.assignedAt && (
                                    <View style={{ flex: 1, backgroundColor: "#1A1A2A", borderRadius: 8, padding: 7, alignItems: "center", gap: 2, borderWidth: 1, borderColor: "#5C6BC033" }}>
                                      <Feather name="bell" size={10} color="#7986CB" />
                                      <Text style={{ color: "#7986CB", fontFamily: F.bold, fontSize: 11 }}>{fmt(ord.assignedAt)}</Text>
                                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 9 }}>استلام</Text>
                                    </View>
                                  )}
                                  {ord.pickedUpAt && (
                                    <View style={{ flex: 1, backgroundColor: "#1A140A", borderRadius: 8, padding: 7, alignItems: "center", gap: 2, borderWidth: 1, borderColor: "#E8920C33" }}>
                                      <Feather name="package" size={10} color={colors.gold} />
                                      <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 11 }}>{fmt(ord.pickedUpAt)}</Text>
                                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 9 }}>أخذ</Text>
                                    </View>
                                  )}
                                  <View style={{ flex: 1, backgroundColor: "#0A1A0A", borderRadius: 8, padding: 7, alignItems: "center", gap: 2, borderWidth: 1, borderColor: "#4CAF5033" }}>
                                    <Feather name="check-circle" size={10} color="#4CAF50" />
                                    <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 11 }}>{fmt(ord.deliveredAt)}</Text>
                                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 9 }}>تسليم</Text>
                                  </View>
                                </View>
                              )}
                              {ord.cancelled && ord.assignedAt && (
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                                  <Feather name="x-circle" size={11} color="#E57373" />
                                  <Text style={{ color: "#E57373", fontFamily: F.regular, fontSize: 11 }}>تم الإلغاء · {fmt(ord.assignedAt)}</Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Customer Link Modal */}
      <Modal
        visible={showLinkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Cairo_800ExtraBold", fontSize: 20, textAlign: "center" }}>
              🔗 رابط موقع العميل
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "center" }}>
              شارك هذا الرابط مع عملائك ليطلبوا مباشرة من الموقع
            </Text>

            {/* URL Box */}
            <TouchableOpacity
              onPress={handleCopyLink}
              style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, alignItems: "center" }}
            >
              <Text style={{ color: "#4CAF50", fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "center" }} numberOfLines={2}>
                {customerUrl}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={handleCopyLink}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: copied ? "#1A4A1A" : "#1A3A2A", borderRadius: 14, paddingVertical: 14 }}
              >
                <Feather name={copied ? "check" : "copy"} size={17} color={copied ? "#81C784" : "#4CAF50"} />
                <Text style={{ color: copied ? "#81C784" : "#4CAF50", fontFamily: "Cairo_700Bold", fontSize: 14 }}>
                  {copied ? "تم النسخ ✓" : "نسخ الرابط"}
                </Text>
              </TouchableOpacity>
              {Platform.OS !== "web" && (
                <TouchableOpacity
                  onPress={handleShareLink}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1A2A3A", borderRadius: 14, paddingVertical: 14 }}
                >
                  <Feather name="share-2" size={17} color="#64B5F6" />
                  <Text style={{ color: "#64B5F6", fontFamily: "Cairo_700Bold", fontSize: 14 }}>مشاركة</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setShowLinkModal(false)}
              style={{ alignItems: "center", paddingVertical: 12 }}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: "Cairo_600SemiBold", fontSize: 14 }}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Chat Modal ── */}
      <Modal visible={!!chatOrder} animationType="slide" onRequestClose={() => setChatOrder(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#0D1F30" }}>
              <TouchableOpacity onPress={() => setChatOrder(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <View style={{ alignItems: "center", gap: 3 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>💬 مراسلة العميل</Text>
                {chatOrder && (
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                    طلب #{chatOrder.dailyNumber} — {chatOrder.customerName}
                  </Text>
                )}
              </View>
              <View style={{ width: 36 }} />
            </View>

            {/* Messages list */}
            <ScrollView
              ref={chatScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, gap: 10 }}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {chatLoading ? (
                <ActivityIndicator size="large" color={colors.gold} style={{ margin: 40 }} />
              ) : chatMessages.length === 0 ? (
                <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
                  <Text style={{ fontSize: 44 }}>💬</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center" }}>
                    لا توجد رسائل بعد{"\n"}ابدأ المحادثة مع العميل
                  </Text>
                </View>
              ) : chatMessages.map((msg) => {
                const time = new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                return (
                  <View key={msg.id} style={{ alignItems: msg.fromCashier ? "flex-end" : "flex-start" }}>
                    <View style={{ maxWidth: "80%", backgroundColor: msg.fromCashier ? "#2A1800" : colors.secondary, borderRadius: 18, borderTopRightRadius: msg.fromCashier ? 4 : 18, borderTopLeftRadius: msg.fromCashier ? 18 : 4, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: msg.fromCashier ? colors.gold + "55" : colors.border }}>
                      <Text style={{ color: msg.fromCashier ? colors.gold : colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: msg.fromCashier ? "right" : "left" }}>{msg.text}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10, marginTop: 4, textAlign: msg.fromCashier ? "right" : "left" }}>
                        {time}{msg.fromCashier ? " • أنت" : " • العميل"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Input bar */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
              <TouchableOpacity
                onPress={sendChatMessage}
                disabled={chatSending || !chatInput.trim()}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatInput.trim() ? colors.gold : colors.secondary, alignItems: "center", justifyContent: "center" }}
              >
                {chatSending ? <ActivityIndicator size="small" color="#1A0A00" /> : <Feather name="send" size={18} color={chatInput.trim() ? "#1A0A00" : colors.mutedForeground} />}
              </TouchableOpacity>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="اكتب رسالتك للعميل…"
                placeholderTextColor={colors.mutedForeground}
                style={{ flex: 1, backgroundColor: colors.background, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: "right" }}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
                multiline
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Stock Modal */}
      <Modal
        visible={showStockModal}
        animationType="slide"
        onRequestClose={() => setShowStockModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setShowStockModal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>📦 إدارة المخزون</Text>
            <TouchableOpacity onPress={fetchMenuItems} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="refresh-cw" size={16} color={colors.gold} />
            </TouchableOpacity>
          </View>

          {/* ── View mode toggle ── */}
          <View style={{ flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity
              onPress={() => setStockViewMode("table")}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: stockViewMode === "table" ? "#7B1FA2" : colors.secondary, borderWidth: 1, borderColor: stockViewMode === "table" ? "#CE93D8" : colors.border }}
            >
              <Text style={{ color: stockViewMode === "table" ? "#fff" : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>📋 جدول المخزون</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStockViewMode("edit")}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: stockViewMode === "edit" ? colors.gold : colors.secondary, borderWidth: 1, borderColor: stockViewMode === "edit" ? colors.gold : colors.border }}
            >
              <Text style={{ color: stockViewMode === "edit" ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>✏️ تعديل الكميات</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
            {/* loading guard */}
            {menuItems.length === 0 && (
              <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
                <ActivityIndicator size="large" color="#7B1FA2" />
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14 }}>جار تحميل بيانات المخزون…</Text>
              </View>
            )}

            {/* ── TABLE VIEW ── */}
            {stockViewMode === "table" && CATEGORIES.map((cat) => {
              const catItems = menuItems.filter((i) => i.category === cat.id);
              if (catItems.length === 0) return null;
              const totalStock = catItems.reduce((s, i) => s + (i.stock ?? 0), 0);
              const outCount   = catItems.filter((i) => i.stock === 0).length;
              const lowCount   = catItems.filter((i) => i.stock !== null && i.stock > 0 && i.stock <= 3).length;
              return (
                <View key={cat.id} style={{ marginBottom: 14 }}>
                  <View style={{ backgroundColor: "#1A1008", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2A1A0A" }}>
                    <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 15, flex: 1 }}>{cat.name}</Text>
                    {outCount > 0 && <Text style={{ color: "#E57373", fontFamily: F.bold, fontSize: 11 }}>⚠️ {outCount} نافد</Text>}
                    {lowCount > 0 && <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 11, marginStart: 6 }}>⬇️ {lowCount} منخفض</Text>}
                  </View>
                  <View style={{ flexDirection: "row", backgroundColor: "#120A02", borderBottomWidth: 1, borderBottomColor: "#2A1A0A", paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>الصنف</Text>
                    <Text style={{ width: 64, color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "center" }}>الكمية</Text>
                    <Text style={{ width: 72, color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "center" }}>الحالة</Text>
                  </View>
                  {catItems.map((item, idx) => {
                    const isLast = idx === catItems.length - 1;
                    const rowBg = idx % 2 === 0 ? colors.card : "#130D06";
                    const stockColor = item.stock === null ? "#4CAF50" : item.stock === 0 ? "#E57373" : item.stock <= 3 ? colors.gold : "#64B5F6";
                    const statusLabel = item.stock === null ? "غير محدود" : item.stock === 0 ? "نافد" : item.stock <= 3 ? "منخفض" : "متاح";
                    const statusBg = item.stock === null ? "#1A3A1A" : item.stock === 0 ? "#3A1A1A" : item.stock <= 3 ? "#3A2A00" : "#1A2A3A";
                    return (
                      <View key={item.itemId} style={{ flexDirection: "row", alignItems: "center", backgroundColor: rowBg, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 11 }}>
                        <Text style={{ flex: 1, color: item.available ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ width: 64, color: stockColor, fontFamily: F.extra, fontSize: 16, textAlign: "center" }}>{item.stock === null ? "∞" : item.stock}</Text>
                        <View style={{ width: 72, alignItems: "center" }}>
                          <View style={{ backgroundColor: statusBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color: stockColor, fontFamily: F.bold, fontSize: 11 }}>{statusLabel}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ flexDirection: "row", backgroundColor: "#0E0800", paddingHorizontal: 14, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#2A1A0A" }}>
                    <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{catItems.length} صنف</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>
                      إجمالي المخزون المحدود: <Text style={{ color: colors.gold, fontFamily: F.bold }}>{totalStock}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* ── LIVE EDIT VIEW ── */}
            {stockViewMode === "edit" && CATEGORIES.map((cat) => {
              const catItems = menuItems.filter((i) => i.category === cat.id);
              if (catItems.length === 0) return null;
              return (
                <View key={cat.id} style={{ marginBottom: 14 }}>
                  <View style={{ backgroundColor: "#1A1008", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2A1A0A" }}>
                    <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 15 }}>{cat.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, marginRight: "auto" }}>{catItems.length} صنف</Text>
                  </View>
                  {catItems.map((item, idx) => {
                    const editVal = getStockEditValue(item);
                    const isSaving = stockSaving === item.itemId;
                    const isUnlimited = editVal === "";
                    const isDirty = item.itemId in stockEdits;
                    const liveQty = isUnlimited ? null : (parseInt(editVal) || 0);
                    const liveColor = liveQty === null ? "#4CAF50" : liveQty === 0 ? "#E57373" : liveQty <= 3 ? colors.gold : "#64B5F6";
                    const liveBg   = liveQty === null ? "#1A3A1A"  : liveQty === 0 ? "#3A1A1A"  : liveQty <= 3 ? "#3A2A00"  : "#1A2A3A";
                    const liveLabel = liveQty === null ? "غير محدود" : liveQty === 0 ? "نافد" : liveQty <= 3 ? "منخفض" : "متاح";
                    const rowBg = idx % 2 === 0 ? colors.card : "#130D06";
                    return (
                      <View key={item.itemId} style={{ backgroundColor: rowBg, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                        {/* Row 1: name + live badge + save button */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ flex: 1, color: item.available ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }} numberOfLines={1}>{item.name}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ color: liveColor, fontFamily: F.extra, fontSize: 20, minWidth: 28, textAlign: "center" }}>
                              {liveQty === null ? "∞" : liveQty}
                            </Text>
                            <View style={{ backgroundColor: liveBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: liveColor + "55" }}>
                              <Text style={{ color: liveColor, fontFamily: F.bold, fontSize: 11 }}>{liveLabel}</Text>
                            </View>
                          </View>
                          {(isDirty || isUnlimited !== (item.stock === null)) && (
                            isSaving
                              ? <ActivityIndicator size="small" color={colors.gold} />
                              : (
                                <TouchableOpacity onPress={() => handleQuickStock(item.itemId, editVal)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.gold }}>
                                  <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 13 }}>حفظ ✓</Text>
                                </TouchableOpacity>
                              )
                          )}
                        </View>
                        {/* Row 2: controls — fixed layout, حفظ no longer competes here */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => { isUnlimited ? setStockEdits((prev) => ({ ...prev, [item.itemId]: "10" })) : setStockEdits((prev) => ({ ...prev, [item.itemId]: "" })); }}
                            style={{ width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: isUnlimited ? "#1A4A1A" : colors.secondary, borderWidth: 1, borderColor: isUnlimited ? "#4CAF50" : colors.border }}
                          >
                            <Text style={{ color: isUnlimited ? "#4CAF50" : colors.mutedForeground, fontFamily: F.bold, fontSize: 15 }}>∞</Text>
                          </TouchableOpacity>
                          {!isUnlimited ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                              <TouchableOpacity onPress={() => adjustStock(item, -1)} style={{ width: 40, height: 36, borderRadius: 8, backgroundColor: "#3A1A1A", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5737344" }}>
                                <Feather name="minus" size={18} color="#E57373" />
                              </TouchableOpacity>
                              <TextInput
                                value={editVal}
                                onChangeText={(t) => setStockEdits((prev) => ({ ...prev, [item.itemId]: t.replace(/[^0-9]/g, "") }))}
                                keyboardType="number-pad"
                                style={{ flex: 1, height: 36, borderRadius: 8, backgroundColor: colors.secondary, borderWidth: 1, borderColor: isDirty ? colors.gold : colors.border, color: colors.foreground, fontFamily: F.bold, fontSize: 16, textAlign: "center" }}
                              />
                              <TouchableOpacity onPress={() => adjustStock(item, 1)} style={{ width: 40, height: 36, borderRadius: 8, backgroundColor: "#1A3A1A", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4CAF5044" }}>
                                <Feather name="plus" size={18} color="#4CAF50" />
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ color: "#4CAF50", fontFamily: F.regular, fontSize: 12 }}>غير محدودة — اضغط ∞ للتحديد</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Broadcast Notification Modal ─────────────────── */}
      <Modal
        visible={showBroadcastModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBroadcastModal(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000099" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, borderTopWidth: 1, borderColor: colors.border }}>

            {/* Header */}
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 30 }}>🔔</Text>
              <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 19, textAlign: "center" }}>
                إشعار جماعي للعملاء
              </Text>
              <View style={{ backgroundColor: "#1A2A1A", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 }}>
                <Text style={{ color: "#81C784", fontFamily: F.bold, fontSize: 13 }}>
                  {"بلا حدود ∞"}
                </Text>
              </View>
            </View>

            {/* Title input */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>عنوان الإشعار</Text>
              <TextInput
                value={broadcastTitle}
                onChangeText={setBroadcastTitle}
                placeholder="مثال: عرض خاص اليوم فقط 🔥"
                placeholderTextColor={colors.mutedForeground}
                maxLength={100}
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, fontFamily: F.regular, fontSize: 14, textAlign: "right" }}
              />
            </View>

            {/* Body input */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>نص الرسالة</Text>
              <TextInput
                value={broadcastBody}
                onChangeText={setBroadcastBody}
                placeholder="اكتب تفاصيل العرض أو الخبر هنا..."
                placeholderTextColor={colors.mutedForeground}
                maxLength={300}
                multiline
                numberOfLines={3}
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, fontFamily: F.regular, fontSize: 14, textAlign: "right", minHeight: 80, textAlignVertical: "top" }}
              />
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowBroadcastModal(false); setBroadcastTitle(""); setBroadcastBody(""); }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendBroadcast}
                disabled={broadcastSending || !broadcastTitle.trim() || !broadcastBody.trim()}
                style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: (!broadcastTitle.trim() || !broadcastBody.trim()) ? colors.secondary : "#2E7D32", opacity: broadcastSending ? 0.7 : 1 }}
                activeOpacity={0.8}
              >
                {broadcastSending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="send" size={16} color="#fff" />
                }
                <Text style={{ color: "#fff", fontFamily: F.extra, fontSize: 15 }}>
                  {broadcastSending ? "جارٍ الإرسال..." : "إرسال لجميع العملاء"}
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>


      {/* ══════════════════════════════════════════════════════
          ── نافذة إدارة المناديب ──
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={showDriversMgmt}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowDriversMgmt(false); setDriverForm(null); }}
      >
        <View style={{ flex: 1, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 16, maxHeight: "94%" }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 10, marginBottom: 6 }} />

            {/* Header */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 20 }}>🛵</Text>
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>إدارة المناديب</Text>
                {allDrivers.length > 0 && (
                  <View style={{ backgroundColor: "#4CAF5022", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#4CAF5044" }}>
                    <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 12 }}>{allDrivers.length}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setShowDriversMgmt(false); setDriverForm(null); }} style={{ padding: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* ─── Add driver button ─── */}
            {!driverForm && (
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <TouchableOpacity
                  onPress={() => setDriverForm({ name: "", phone: "", pin: "", active: true })}
                  style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0A2A1A", borderRadius: 14, paddingVertical: 13, borderWidth: 1.5, borderColor: "#4CAF50" }}
                  activeOpacity={0.8}
                >
                  <Feather name="user-plus" size={18} color="#4CAF50" />
                  <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15 }}>➕ إضافة مندوب جديد</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── Driver form (add / edit) ─── */}
            {driverForm && (
              <View style={{ margin: 16, backgroundColor: colors.background, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: "#4CAF5044" }}>
                <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15, textAlign: "right" }}>
                  {driverForm.id ? "✏️ تعديل بيانات المندوب" : "➕ مندوب جديد"}
                </Text>

                {/* Name */}
                <View style={{ gap: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>الاسم *</Text>
                  <TextInput
                    value={driverForm.name}
                    onChangeText={v => setDriverForm(p => p ? { ...p, name: v } : p)}
                    placeholder="اسم المندوب"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: "right" }}
                  />
                </View>

                {/* Phone */}
                <View style={{ gap: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>رقم الجوال *</Text>
                  <TextInput
                    value={driverForm.phone}
                    onChangeText={v => setDriverForm(p => p ? { ...p, phone: v } : p)}
                    placeholder="05xxxxxxxx"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    style={{ backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: "right" }}
                  />
                </View>

                {/* PIN */}
                <View style={{ gap: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>
                    الرقم السري {driverForm.id ? "(اتركه فارغاً إذا لا تريد تغييره)" : "*"}
                  </Text>
                  <TextInput
                    value={driverForm.pin}
                    onChangeText={v => setDriverForm(p => p ? { ...p, pin: v } : p)}
                    placeholder="4 أرقام على الأقل"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    secureTextEntry
                    style={{ backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: "right" }}
                  />
                </View>

                {/* Active toggle */}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14 }}>الحالة</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    {[true, false].map(v => (
                      <TouchableOpacity
                        key={String(v)}
                        onPress={() => setDriverForm(p => p ? { ...p, active: v } : p)}
                        style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10, borderWidth: 1,
                          backgroundColor: driverForm.active === v ? (v ? "#0A2A1A" : "#2A0A0A") : colors.secondary,
                          borderColor: driverForm.active === v ? (v ? "#4CAF50" : "#E57373") : colors.border }}
                      >
                        <Text style={{ color: driverForm.active === v ? (v ? "#4CAF50" : "#E57373") : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>
                          {v ? "نشط" : "موقوف"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Buttons */}
                <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={saveDriverForm}
                    disabled={driverFormSaving}
                    style={{ flex: 1, backgroundColor: "#4CAF50", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
                    activeOpacity={0.8}
                  >
                    {driverFormSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: "#fff", fontFamily: F.extra, fontSize: 15 }}>💾 حفظ</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDriverForm(null)}
                    style={{ paddingHorizontal: 20, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ─── Drivers list ─── */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
              {allDriversLoading && <ActivityIndicator color="#4CAF50" style={{ marginTop: 20 }} />}

              {!allDriversLoading && allDrivers.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                  <Text style={{ fontSize: 40 }}>🛵</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>لا يوجد مناديب — أضف أول مندوب</Text>
                </View>
              )}

              {!allDriversLoading && allDrivers.map(driver => (
                <View
                  key={driver.id}
                  style={{ backgroundColor: colors.background, borderRadius: 16, borderWidth: 1, borderColor: driver.active ? "#4CAF5033" : colors.border, overflow: "hidden" }}
                >
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 }}>
                    {/* Avatar */}
                    {driver.photoUrl
                      ? <Image source={{ uri: driver.photoUrl }} style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: driver.active ? "#4CAF50" : colors.border }} />
                      : <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: driver.active ? "#0A2A1A" : colors.secondary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: driver.active ? "#4CAF50" : colors.border }}>
                          <Text style={{ fontSize: 22 }}>🛵</Text>
                        </View>
                    }

                    {/* Info */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}>
                        <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>{driver.name}</Text>
                        <View style={{ backgroundColor: driver.active ? "#4CAF5022" : "#E5737322", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, borderWidth: 1, borderColor: driver.active ? "#4CAF5044" : "#E5737344" }}>
                          <Text style={{ color: driver.active ? "#4CAF50" : "#E57373", fontFamily: F.bold, fontSize: 10 }}>
                            {driver.active ? "● نشط" : "● موقوف"}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>📱 {driver.phone}</Text>
                    </View>

                    {/* Action buttons */}
                    <View style={{ gap: 6 }}>
                      {/* Edit */}
                      <TouchableOpacity
                        onPress={() => setDriverForm({ id: driver.id, name: driver.name, phone: driver.phone, pin: "", active: driver.active })}
                        style={{ backgroundColor: "#1A2A3A", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#1E3A5A" }}
                        activeOpacity={0.8}
                      >
                        <Feather name="edit-2" size={13} color="#64B5F6" />
                        <Text style={{ color: "#64B5F6", fontFamily: F.semi, fontSize: 12 }}>تعديل</Text>
                      </TouchableOpacity>

                      {/* Toggle active */}
                      <TouchableOpacity
                        onPress={() => toggleDriverActive(driver)}
                        style={{ backgroundColor: driver.active ? "#2A1A0A" : "#0A2A1A", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: driver.active ? "#E8920C44" : "#4CAF5044" }}
                        activeOpacity={0.8}
                      >
                        <Feather name={driver.active ? "pause-circle" : "play-circle"} size={13} color={driver.active ? "#E8920C" : "#4CAF50"} />
                        <Text style={{ color: driver.active ? "#E8920C" : "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>
                          {driver.active ? "إيقاف" : "تفعيل"}
                        </Text>
                      </TouchableOpacity>

                      {/* Delete */}
                      <TouchableOpacity
                        onPress={() => confirmDeleteDriver(driver.id)}
                        disabled={driverDeleteId === driver.id}
                        style={{ backgroundColor: "#2A0A0A", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#E5737344" }}
                        activeOpacity={0.8}
                      >
                        <Feather name="trash-2" size={13} color="#E57373" />
                        <Text style={{ color: "#E57373", fontFamily: F.semi, fontSize: 12 }}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Live Driver Tracking Modal ── */}
      <Modal
        visible={trackingOrderId !== null}
        animationType="slide"
        onRequestClose={() => setTrackingOrderId(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#0D1117" }}>
          {/* header */}
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 16 : 52, paddingBottom: 12, backgroundColor: "#0A0502", borderBottomWidth: 1, borderBottomColor: "#C8171A44" }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
              <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 16 }}>تتبع مباشر</Text>
            </View>
            <TouchableOpacity
              onPress={() => setTrackingOrderId(null)}
              style={{ backgroundColor: "#1A0A00", borderWidth: 1, borderColor: "#C8171A44", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}
              activeOpacity={0.75}
            >
              <Text style={{ color: "#E57373", fontFamily: F.bold, fontSize: 13 }}>✕ إغلاق</Text>
            </TouchableOpacity>
          </View>
          {/* map */}
          {trackingOrderId !== null && (
            <MapWebView
              uri={`${API_BASE}/api/map/${trackingOrderId}`}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "column",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerRow1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerRow2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 16,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  headerTitle: { fontSize: 20 },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  adminMenuBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  filterTabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterTabText: { fontSize: 13 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 16 },
  ordersList: { padding: 12, gap: 12 },
  orderCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: { fontSize: 13 },
  orderMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flex: 1 },
  orderId: { fontSize: 18 },
  orderTime: { fontSize: 12 },
  orderDate: { fontSize: 11 },
  dailyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  dailyNumber: { fontSize: 14 },
  cardBody: { padding: 12, gap: 6 },
  customerRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  customerName: { fontSize: 16 },
  customerPhone: { fontSize: 13 },
  itemsList: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, gap: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemName: { flex: 1, fontSize: 14, textAlign: "right" },
  itemPrice: { fontSize: 14, minWidth: 60, textAlign: "left" },
  notesRow: {
    flexDirection: "row",
    padding: 10,
    paddingHorizontal: 12,
    flexWrap: "wrap",
  },
  notesLabel: { fontSize: 13 },
  notesText: { fontSize: 13, flex: 1 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  totalAmount: { fontSize: 20 },
  payMethod: { fontSize: 13 },
  actionBtn: {
    margin: 12,
    marginTop: 0,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontSize: 16 },
  pinContainer: { flex: 1, alignItems: "center", paddingTop: 40, padding: 24 },
  pinBack: { alignSelf: "flex-start", marginBottom: 20, padding: 4 },
  pinTitle: { fontSize: 26, marginBottom: 8 },
  pinSubtitle: { fontSize: 15, marginBottom: 24 },
  pinInput: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 20,
    textAlign: "center",
    letterSpacing: 4,
    marginBottom: 10,
  },
  pinError: { color: "#E53935", fontSize: 14, marginBottom: 10 },
  pinConfirmBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
  pinConfirmText: { fontSize: 18 },
});
