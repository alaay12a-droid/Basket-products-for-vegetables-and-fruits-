import React, { useState, useCallback, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Linking,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPatch, apiPost } from "@/constants/api";
import { useChatUnreadAlert } from "@/hooks/useChatSound";
import { useOrderBadge } from "@/context/OrderBadgeContext";
import { useLanguage } from "@/context/LanguageContext";

import { modernTokens } from "@/constants/modernTokens";

const F = {
  regular: "Cairo_400Regular",
  semi:    "Cairo_600SemiBold",
  bold:    "Cairo_700Bold",
  extra:   "Cairo_800ExtraBold",
};

export const ORDERS_STORAGE_KEY      = "@rawabi_my_orders";
const        LIVE_STATUS_STORAGE_KEY = "@rawabi_live_status";
const        POLL_INTERVAL_MS        = 12_000; // 12 seconds

export interface StoredOrder {
  id:           number;
  dailyNumber:  number;
  createdAt:    string;
  total:        number;
  items:        { name: string; quantity: number }[];
  customerName: string;
}

type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "done" | "cancelled";

interface LiveOrder {
  id:     number;
  status: OrderStatus;
}

const STATUS_LABEL_AR: Record<OrderStatus, string> = {
  pending:          "في الانتظار",
  preparing:        "جاري التحضير",
  ready:            "جاهز للاستلام",
  out_for_delivery: "🛵 المندوب في الطريق",
  done:             "مكتمل",
  cancelled:        "ملغى",
};

const STATUS_LABEL_EN: Record<OrderStatus, string> = {
  pending:          "Pending",
  preparing:        "Preparing",
  ready:            "Ready for Pickup",
  out_for_delivery: "🛵 On the way",
  done:             "Completed",
  cancelled:        "Cancelled",
};

const STATUS_COLOR_CLASSIC: Record<OrderStatus, string> = {
  pending:          "#E8920C",
  preparing:        "#3B82F6",
  ready:            "#22C55E",
  out_for_delivery: "#8B5CF6",
  done:             "#9A7A5A",
  cancelled:        "#E53935",
};

const STATUS_COLOR_MODERN: Record<OrderStatus, string> = modernTokens.status;

const STATUS_ICON: Record<OrderStatus, string> = {
  pending:          "clock",
  preparing:        "loader",
  ready:            "check-circle",
  out_for_delivery: "truck",
  done:             "archive",
  cancelled:        "x-circle",
};

function formatDate(iso: string, isEn: boolean) {
  const d = new Date(iso);
  return d.toLocaleDateString(isEn ? "en-US" : "ar-SA", {
    day:    "numeric",
    month:  "short",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export default function OrdersScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const { refreshBadge } = useOrderBadge();
  const { language } = useLanguage();
  const isEn = language === "en";

  // ─── Chat types ────────────────────────────────────────
  interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; driverId: number | null; createdAt: string; readAt: string | null; }

  // ─── Orders state ──────────────────────────────────────
  const [orders, setOrders]           = useState<StoredOrder[]>([]);
  const [liveStatus, setLiveStatus]   = useState<Record<number, OrderStatus>>({});
  const [refreshing, setRefreshing]   = useState(false);
  const [allowCancel, setAllowCancel] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelBanner, setCancelBanner] = useState<{ orderNum: number; name: string } | null>(null);

  // ─── Rating state ──────────────────────────────────────
  const [ratingOrderId, setRatingOrderId]   = useState<number | null>(null);
  const [ratingStars, setRatingStars]       = useState(0);
  const [ratingComment, setRatingComment]   = useState("");
  const [ratingSending, setRatingSending]   = useState(false);
  const [ratedOrders, setRatedOrders]       = useState<Record<number, number>>({});

  // ─── Chat state ────────────────────────────────────────
  const [chatOrderId, setChatOrderId]       = useState<number | null>(null);
  const [chatMessages, setChatMessages]     = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]           = useState("");
  const [chatSending, setChatSending]       = useState(false);
  const [chatLoading, setChatLoading]       = useState(false);
  const [unreadByOrder, setUnreadByOrder]   = useState<Record<number, number>>({});
  const chatScrollRef                        = useRef<ScrollView>(null);

  const ordersRef    = useRef<StoredOrder[]>([]);
  const liveRef      = useRef<Record<number, OrderStatus>>({});
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenActive = useRef(false);
  const bannerAnim   = useRef(new Animated.Value(0)).current;
  const bannerTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Active driver delivery tracking ──────────────────────────────────────
  const [activeDriver, setActiveDriver] = useState<{
    orderId: number; dailyNumber: number; driverName: string; driverPhone: string; driverPhoto: string | null;
  } | null>(null);
  const driverPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!activeDriver) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(driverPulseAnim, { toValue: 1.03, duration: 750, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(driverPulseAnim, { toValue: 1,    duration: 750, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [activeDriver, driverPulseAnim]);

  const showCancelBanner = useCallback((orderNum: number, name: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerAnim.setValue(0);
    setCancelBanner({ orderNum, name });
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: false, tension: 80, friction: 10 }).start();
    bannerTimer.current = setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
        setCancelBanner(null);
      });
    }, 5000);
  }, [bannerAnim]);

  // ── persist live-status cache to storage ──────────────────────────────────
  const saveLiveStatus = useCallback(async (map: Record<number, OrderStatus>) => {
    try {
      await AsyncStorage.setItem(LIVE_STATUS_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }, []);

  // ── load cached live-status from storage (instant, no flash) ─────────────
  const loadCachedStatus = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LIVE_STATUS_STORAGE_KEY);
      if (raw) {
        const map: Record<number, OrderStatus> = JSON.parse(raw);
        liveRef.current = { ...liveRef.current, ...map };
        setLiveStatus((prev) => ({ ...map, ...prev }));
      }
    } catch {}
  }, []);

  // ── fetch live statuses for a list of order IDs ───────────────────────────
  const fetchStatuses = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    const results = await Promise.allSettled(
      ids.map((id) => apiGet<LiveOrder>(`/orders/${id}`))
    );
    const map: Record<number, OrderStatus> = {};
    results.forEach((r) => {
      if (r.status === "fulfilled") map[r.value.id] = r.value.status;
    });

    // ── detect newly-cancelled orders and alert the customer ──────────────
    for (const [idStr, newStatus] of Object.entries(map)) {
      const id        = Number(idStr);
      const oldStatus = liveRef.current[id] ?? "pending"; // treat unseen orders as pending
      if (newStatus === "cancelled" && oldStatus !== "cancelled") {
        const order = ordersRef.current.find((o) => o.id === id);
        if (order) {
          showCancelBanner(order.dailyNumber, order.customerName);
        }
      }
    }

    const merged = { ...liveRef.current, ...map };
    liveRef.current = merged;
    setLiveStatus(merged);
    await saveLiveStatus(merged);
    refreshBadge();
  }, [saveLiveStatus, refreshBadge, showCancelBanner]);

  // ── IDs of orders that are still "alive" (need polling) ──────────────────
  const getActiveIds = useCallback(() => {
    return ordersRef.current
      .filter((o) => {
        const s = liveRef.current[o.id];
        return !s || s === "pending" || s === "preparing" || s === "ready" || s === "out_for_delivery";
      })
      .map((o) => o.id);
  }, []);

  // ── one polling tick ──────────────────────────────────────────────────────
  const pollTick = useCallback(async () => {
    const ids = getActiveIds();
    if (ids.length > 0) await fetchStatuses(ids);
  }, [getActiveIds, fetchStatuses]);

  // ── start / stop polling ──────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(pollTick, POLL_INTERVAL_MS);
  }, [pollTick]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ─── Load rated orders from AsyncStorage ──────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("@rawabi_rated_orders").then((raw) => {
      if (raw) setRatedOrders(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  const submitRating = useCallback(async () => {
    if (!ratingOrderId || ratingStars === 0) return;
    setRatingSending(true);
    try {
      await apiPost(`/orders/${ratingOrderId}/rate`, { stars: ratingStars, comment: ratingComment.trim() || undefined });
      const updated = { ...ratedOrders, [ratingOrderId]: ratingStars };
      setRatedOrders(updated);
      await AsyncStorage.setItem("@rawabi_rated_orders", JSON.stringify(updated));
      setRatingOrderId(null);
      setRatingStars(0);
      setRatingComment("");
    } catch {}
    setRatingSending(false);
  }, [ratingOrderId, ratingStars, ratingComment, ratedOrders]);

  // ── load orders from AsyncStorage + initial status fetch ─────────────────
  const loadOrders = useCallback(async () => {
    try {
      const raw     = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
      const stored: StoredOrder[] = raw ? JSON.parse(raw) : [];
      stored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      ordersRef.current = stored;
      setOrders(stored);

      apiGet<{ allowed: boolean }>("/settings/customer-cancel")
        .then((r) => setAllowCancel(r.allowed))
        .catch(() => {});

      const ids = stored
        .filter((o) => {
          const s = liveRef.current[o.id];
          return !s || s === "pending" || s === "preparing" || s === "ready" || s === "out_for_delivery";
        })
        .map((o) => o.id);

      if (ids.length > 0) await fetchStatuses(ids);
    } catch {}
  }, [fetchStatuses]);

  // ─── Chat functions ────────────────────────────────────
  const fetchChatMsgs = useCallback(async (orderId: number, markRead = true) => {
    try {
      const msgs = await apiGet<ChatMsg[]>(`/messages/order/${orderId}`);
      setChatMessages(msgs);
      if (markRead) {
        await apiPatch(`/messages/order/${orderId}/read`, { fromCashier: false });
        setUnreadByOrder(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      }
      return msgs;
    } catch { return []; }
  }, []);

  const openChat = useCallback(async (orderId: number) => {
    setChatOrderId(orderId);
    setChatLoading(true);
    setChatMessages([]);
    await fetchChatMsgs(orderId, true);
    setChatLoading(false);
  }, [fetchChatMsgs]);

  const sendMsg = useCallback(async () => {
    if (!chatOrderId || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const msg = await apiPost<ChatMsg>(`/messages/order/${chatOrderId}`, { text, fromCashier: false });
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {} finally { setChatSending(false); }
  }, [chatOrderId, chatInput]);

  // Poll messages while chat modal is open
  const chatOpenRef = useRef(false);
  useEffect(() => {
    chatOpenRef.current = chatOrderId !== null;
    if (!chatOrderId) return;
    const t = setInterval(() => fetchChatMsgs(chatOrderId, true), 5000);
    return () => clearInterval(t);
  }, [chatOrderId, fetchChatMsgs]);

  // Check for unread cashier messages — single API call returns all counts at once
  const checkUnread = useCallback(async () => {
    const myIds = new Set(ordersRef.current.map(o => o.id));
    if (myIds.size === 0) return;
    try {
      const data = await apiGet<Record<number, number>>("/messages/unread-customer");
      const counts: Record<number, number> = {};
      for (const [idStr, cnt] of Object.entries(data)) {
        const id = Number(idStr);
        if (myIds.has(id) && cnt > 0) counts[id] = cnt;
      }
      setUnreadByOrder(counts);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setInterval(() => { if (screenActive.current && !chatOpenRef.current) checkUnread(); }, 10000);
    return () => clearInterval(t);
  }, [checkUnread]);

  const totalUnreadFromCashier = Object.values(unreadByOrder).reduce((s, n) => s + n, 0);
  useChatUnreadAlert(totalUnreadFromCashier);

  // ── check if any recent order has a driver picked_up ─────────────────────
  const checkActiveDriver = useCallback(async () => {
    const stored = ordersRef.current;
    if (stored.length === 0) return;
    const recent = stored.slice(0, 5);
    for (const ord of recent) {
      try {
        const row = await apiGet<{ assignment: { status: string }; driver: { name: string; phone: string; photoUrl: string | null } } | null>(
          `/orders/${ord.id}/assignment`
        );
        if (row && row.assignment.status === "picked_up") {
          setActiveDriver({
            orderId: ord.id,
            dailyNumber: ord.dailyNumber,
            driverName: row.driver.name,
            driverPhone: row.driver.phone,
            driverPhoto: row.driver.photoUrl,
          });
          return;
        }
      } catch { /* skip */ }
    }
    setActiveDriver(null);
  }, []);

  // ── foreground notification listener — refresh status immediately on driver push ──
  useEffect(() => {
    let sub: Notifications.EventSubscription | null = null;
    try {
      sub = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const orderId = data?.orderId ? Number(data.orderId) : null;
        if (orderId != null && !isNaN(orderId)) {
          // Immediately refresh this order's status and check active driver banner
          fetchStatuses([orderId]).catch(() => {});
          checkActiveDriver().catch(() => {});
        }
      });
    } catch {
      // Not supported in this environment — safe to ignore
    }
    return () => { try { sub?.remove(); } catch {} };
  }, [fetchStatuses, checkActiveDriver]);

  // ── screen focus / blur lifecycle ────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      screenActive.current = true;

      // 1. show cached statuses instantly (no pending flash)
      loadCachedStatus().then(() => {
        // 2. then fetch fresh from server + start polling
        loadOrders().then(() => {
          if (screenActive.current) {
            startPolling();
            checkActiveDriver();
          }
        });
      });

      // 3. fetch unread message counts immediately on focus
      checkUnread();

      return () => {
        screenActive.current = false;
        stopPolling();
      };
    }, [loadCachedStatus, loadOrders, startPolling, stopPolling, checkUnread, checkActiveDriver])
  );

  // cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const cancelOrder = async (id: number) => {
    setCancellingId(id);
    try {
      const updated = await apiPatch<LiveOrder>(`/orders/${id}/cancel`, {});
      const merged  = { ...liveRef.current, [id]: updated.status };
      liveRef.current = merged;
      setLiveStatus(merged);
      await saveLiveStatus(merged);
      refreshBadge();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : isEn ? "An error occurred" : "حدث خطأ";
      Alert.alert(isEn ? "Cancellation Failed" : "تعذّر الإلغاء", msg);
    } finally {
      setCancellingId(null);
    }
  };

  const STATUS_LABEL = isEn ? STATUS_LABEL_EN : STATUS_LABEL_AR;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isModern && colors.isLight ? "dark-content" : "light-content"} />

      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: F.extra }]}>
          {isEn ? "Orders" : "الطلبات"}
        </Text>
      </View>

      {/* ── Cancellation Banner ── */}
      {cancelBanner && (
        <Animated.View
          style={{
            transform: [{
              translateY: bannerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-80, 0],
              }),
            }],
            opacity: bannerAnim,
            position: "absolute",
            top: topInset + 62,
            left: 12,
            right: 12,
            zIndex: 999,
            backgroundColor: colors.isModern ? colors.dangerBg : "#1A0808",
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.isModern ? colors.danger + "88" : "#E5393588",
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            shadowColor: colors.isModern ? colors.danger : "#E53935",
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.isModern ? colors.danger + "20" : "#E5393520", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20 }}>❌</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.isModern ? colors.danger : "#EF4444", fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
              {isEn ? "Order Cancelled" : "تم إلغاء طلبك"}
            </Text>
            <Text style={{ color: colors.isModern ? colors.mutedForeground : "#9A7A7A", fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
              {isEn
                ? `Order #${cancelBanner.orderNum} has been cancelled by the restaurant`
                : `طلبك رقم #${cancelBanner.orderNum} تم إلغاؤه من قِبل المطعم`}
            </Text>
          </View>
          <TouchableOpacity onPress={() => {
            if (bannerTimer.current) clearTimeout(bannerTimer.current);
            Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setCancelBanner(null));
          }}>
            <Feather name="x" size={16} color={colors.isModern ? colors.mutedForeground : "#9A7A7A"} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Rating Modal ── */}
      {ratingOrderId !== null && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setRatingOrderId(null)}>
          <View style={{ flex: 1, backgroundColor: "#000A", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 28, width: "100%", gap: 18, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 20, textAlign: "center" }}>
                {isEn ? "Rate your order" : "قيّم طلبك"}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "center" }}>
                {isEn ? "How was your experience?" : "كيف كانت تجربتك؟"}
              </Text>
              {/* Stars */}
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity key={s} onPress={() => setRatingStars(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 38 }}>{s <= ratingStars ? "⭐" : "☆"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Comment */}
              <TextInput
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder={isEn ? "Add a comment (optional)" : "أضف تعليق (اختياري)"}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
                style={{ backgroundColor: colors.secondary, borderRadius: 12, padding: 12, color: colors.foreground, fontFamily: F.regular, fontSize: 14, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
                textAlignVertical="top"
              />
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TouchableOpacity
                  onPress={submitRating}
                  disabled={ratingStars === 0 || ratingSending}
                  style={{ flex: 1, backgroundColor: ratingStars > 0 ? colors.gold : colors.secondary, borderRadius: 14, paddingVertical: 13, alignItems: "center" }}
                >
                  {ratingSending
                    ? <ActivityIndicator size="small" color={(colors.isModern ? colors.background : "#1A0A00")} />
                    : <Text style={{ color: (colors.isModern ? colors.background : "#1A0A00"), fontFamily: F.extra, fontSize: 15 }}>{isEn ? "Submit" : "إرسال"}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setRatingOrderId(null); setRatingStars(0); setRatingComment(""); }}
                  style={{ paddingHorizontal: 18, backgroundColor: colors.secondary, borderRadius: 14, paddingVertical: 13, alignItems: "center" }}
                >
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>{isEn ? "Later" : "لاحقاً"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Chat Modal ── */}
      {chatOrderId !== null && (() => {
        const chatOrder = orders.find(o => o.id === chatOrderId);
        return (
          <Modal visible animationType="slide" onRequestClose={() => setChatOrderId(null)}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
              <View style={{ flex: 1, backgroundColor: colors.background }}>
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: topInset + 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.isModern ? colors.background : "#0D1F30" }}>
                  <TouchableOpacity onPress={() => setChatOrderId(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <View style={{ alignItems: "center", gap: 3 }}>
                    <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>
                      {activeDriver && activeDriver.orderId === chatOrderId
                        ? (isEn ? "💬 Chat with Driver" : "💬 تواصل مع المندوب")
                        : (isEn ? "💬 Support Chat" : "💬 تواصل مع الكاشير")}
                    </Text>
                    {chatOrder && (
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                        {isEn ? `Order #${chatOrder.dailyNumber}` : `طلب #${chatOrder.dailyNumber}`}
                      </Text>
                    )}
                  </View>
                  {/* Call driver button — shown when this order has a picked_up driver */}
                  {activeDriver && activeDriver.orderId === chatOrderId ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${activeDriver.driverPhone}`)}
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.isModern ? colors.successBg : "#1A3A20", borderWidth: 1.5, borderColor: colors.isModern ? colors.success : "#4CAF50", alignItems: "center", justifyContent: "center" }}
                    >
                      <Feather name="phone" size={17} color={colors.isModern ? colors.success : "#4CAF50"} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 36 }} />
                  )}
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
                    <View style={{ alignItems: "center", padding: 40, gap: 14 }}>
                      <Text style={{ fontSize: 48 }}>💬</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                        {isEn
                          ? "No messages yet\nSend us a message and we'll reply shortly"
                          : "لا توجد رسائل بعد\nأرسل رسالتك وسنرد عليك قريباً"}
                      </Text>
                    </View>
                  ) : chatMessages.map((msg) => {
                    const isCustomer = !msg.fromCashier;
                    const time = new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <View key={msg.id} style={{ alignItems: isCustomer ? "flex-end" : "flex-start" }}>
                        <View style={{ maxWidth: "80%", backgroundColor: isCustomer ? (colors.isModern ? colors.surface : "#2A1800") : colors.secondary, borderRadius: 18, borderTopRightRadius: isCustomer ? 4 : 18, borderTopLeftRadius: isCustomer ? 18 : 4, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: isCustomer ? (colors.isModern ? colors.primary : colors.gold) + "55" : colors.border }}>
                          <Text style={{ color: isCustomer ? (colors.isModern ? colors.primary : colors.gold) : colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: isCustomer ? "right" : "left" }}>{msg.text}</Text>
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10, marginTop: 4, textAlign: isCustomer ? "right" : "left" }}>
                            {time}{isCustomer ? (isEn ? " • You" : " • أنت") : (msg.driverId ? (isEn ? " • Driver" : " • المندوب") : (isEn ? " • Cashier" : " • الكاشير"))}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Input bar */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
                  <TouchableOpacity
                    onPress={sendMsg}
                    disabled={chatSending || !chatInput.trim()}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatInput.trim() ? colors.gold : colors.secondary, alignItems: "center", justifyContent: "center" }}
                  >
                    {chatSending ? <ActivityIndicator size="small" color={(colors.isModern ? colors.background : "#1A0A00")} /> : <Feather name="send" size={18} color={chatInput.trim() ? (colors.isModern ? colors.background : "#1A0A00") : colors.mutedForeground} />}
                  </TouchableOpacity>
                  <TextInput
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder={isEn ? "Type a message…" : "اكتب رسالتك…"}
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.background, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: "right" }}
                    onSubmitEditing={sendMsg}
                    returnKeyType="send"
                    multiline
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      {/* ── Active Driver Tracking Banner ── */}
      {activeDriver && (
        <Animated.View style={{ transform: [{ scale: driverPulseAnim }], marginHorizontal: 14, marginTop: 10, marginBottom: 2 }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push(`/order-confirmed?orderId=${activeDriver.orderId}`)}
            style={{
              backgroundColor: colors.isModern ? colors.infoBg : "#0A1F2A",
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: colors.isModern ? colors.info : (colors.isModern ? colors.info : "#29B6F6"),
              padding: 14,
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 12,
              shadowColor: (colors.isModern ? colors.info : "#29B6F6"),
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            {activeDriver.driverPhoto ? (
              <Image source={{ uri: activeDriver.driverPhoto }} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: (colors.isModern ? colors.info : "#29B6F6") }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: (colors.isModern ? colors.info + "22" : "#29B6F622"), borderWidth: 2, borderColor: (colors.isModern ? colors.info : "#29B6F6"), alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22 }}>🛵</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: (colors.isModern ? colors.info : "#29B6F6") }} />
                <Text style={{ color: (colors.isModern ? colors.info : "#29B6F6"), fontFamily: F.extra, fontSize: 13 }}>
                  {isEn ? "Driver on the way!" : "المندوب في الطريق إليك!"}
                </Text>
              </View>
              <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14 }}>{activeDriver.driverName}</Text>
              <Text style={{ color: colors.isModern ? colors.info : "#7ECFF8", fontFamily: F.regular, fontSize: 11 }}>
                {isEn ? `Order #${activeDriver.dailyNumber} • Tap to track` : `طلب #${activeDriver.dailyNumber} • اضغط للتتبع`}
              </Text>
            </View>
            {/* Call button */}
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${activeDriver.driverPhone}`); }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: (colors.isModern ? colors.info : "#29B6F6"), alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="phone" size={20} color={colors.isModern ? colors.background : "#032B3D"} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}

      {orders.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Feather name="shopping-bag" size={44} color={colors.border} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: F.bold }]}>
            {isEn ? "No Orders Yet" : "لا توجد طلبات"}
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>
            {isEn ? "Browse the menu and place your first order!" : "تصفح القائمة وضع طلبك الأول!"}
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.gold }]}
            onPress={() => router.push("/")}
          >
            <Text style={[styles.browseBtnText, { fontFamily: F.bold }]}>
              {isEn ? "Browse Menu" : "تصفح القائمة"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.gold}
              colors={[colors.gold]}
            />
          }
        >
          {orders.map((order) => {
            const status      = liveStatus[order.id] ?? "pending";
            const isDone      = status === "done" || status === "cancelled";
            const isCancelling = cancellingId === order.id;
            const statusColor = colors.isModern ? STATUS_COLOR_MODERN[status] : STATUS_COLOR_CLASSIC[status];

            return (
              <View
                key={order.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isDone ? colors.border : statusColor + "40",
                    opacity: isDone ? 0.75 : 1,
                  },
                ]}
              >
                {/* Card header: order # + status badge */}
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                    <Feather name={STATUS_ICON[status] as any} size={13} color={statusColor} />
                    <Text style={[styles.statusText, { color: statusColor, fontFamily: F.bold }]}>
                      {STATUS_LABEL[status]}
                    </Text>
                  </View>
                  <Text style={[styles.orderNum, { color: colors.gold, fontFamily: F.extra }]}>
                    #{order.dailyNumber}
                  </Text>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Items */}
                <View style={styles.itemsList}>
                  {order.items.map((item, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={[styles.itemQty, { color: colors.gold, fontFamily: F.bold }]}>
                        ×{item.quantity}
                      </Text>
                      <Text style={[styles.itemName, { color: colors.foreground, fontFamily: F.semi }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Footer: date + total */}
                <View style={styles.cardFooter}>
                  <Text style={[styles.total, { color: colors.gold, fontFamily: F.extra }]}>
                    {order.total % 1 === 0 ? order.total : order.total.toFixed(1)} {isEn ? "SAR" : "ر.س"}
                  </Text>
                  <Text style={[styles.date, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                    {formatDate(order.createdAt, isEn)}
                  </Text>
                </View>

                {/* Rating button — for done orders not yet rated */}
                {status === "done" && !ratedOrders[order.id] && (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, backgroundColor: colors.isModern ? colors.warningBg : "#2A1800", borderTopWidth: 1, borderTopColor: colors.isModern ? colors.warning : "#5A3800" }}
                    onPress={() => { setRatingOrderId(order.id); setRatingStars(0); setRatingComment(""); }}
                  >
                    <Text style={{ fontSize: 16 }}>⭐</Text>
                    <Text style={{ color: colors.isModern ? colors.warning : "#E8920C", fontFamily: F.bold, fontSize: 13 }}>
                      {isEn ? "Rate your order" : "قيّم طلبك"}
                    </Text>
                  </TouchableOpacity>
                )}
                {status === "done" && !!ratedOrders[order.id] && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: colors.isModern ? colors.successBg : "#1A2A1A" }}>
                    <Text style={{ fontSize: 13 }}>{"⭐".repeat(ratedOrders[order.id])}</Text>
                    <Text style={{ color: colors.isModern ? colors.success : "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>
                      {isEn ? "Rated" : "تم التقييم"}
                    </Text>
                  </View>
                )}

                {/* Chat button */}
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, backgroundColor: colors.isModern ? colors.infoBg : "#0D2030", borderTopWidth: 1, borderTopColor: colors.isModern ? colors.info : "#1E4A6A" }}
                  onPress={() => openChat(order.id)}
                >
                  <View style={{ position: "relative" }}>
                    <Feather name="message-circle" size={16} color={(colors.isModern ? colors.info : "#64B5F6")} />
                    {!!unreadByOrder[order.id] && (
                      <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: colors.isModern ? colors.danger : "#E53935", borderRadius: 8, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                        <Text style={{ color: "#fff", fontSize: 8, fontFamily: F.bold }}>{unreadByOrder[order.id]}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: (colors.isModern ? colors.info : "#64B5F6"), fontFamily: F.bold, fontSize: 13 }}>
                    {isEn ? "Chat with us" : `تواصل معنا${unreadByOrder[order.id] ? `  •  ${unreadByOrder[order.id]} رسالة جديدة` : ""}`}
                  </Text>
                </TouchableOpacity>

                {/* Cancel button */}
                {allowCancel && status === "pending" && (
                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: (colors.isModern ? colors.danger : "#E53935") + "60", backgroundColor: (colors.isModern ? colors.danger : "#E53935") + "10" }]}
                    onPress={() =>
                      Alert.alert(
                        isEn ? "Cancel Order" : "إلغاء الطلب",
                        isEn ? "Do you want to cancel this order?" : "هل تريد إلغاء هذا الطلب؟",
                        [
                          { text: isEn ? "No" : "لا", style: "cancel" },
                          { text: isEn ? "Yes, Cancel" : "نعم، إلغاء", style: "destructive", onPress: () => cancelOrder(order.id) },
                        ]
                      )
                    }
                    disabled={isCancelling}
                  >
                    {isCancelling ? (
                      <ActivityIndicator size="small" color={colors.isModern ? colors.danger : "#E53935"} />
                    ) : (
                      <>
                        <Feather name="x-circle" size={15} color={colors.isModern ? colors.danger : "#E53935"} />
                        <Text style={[styles.cancelBtnText, { color: colors.isModern ? colors.danger : "#E53935", fontFamily: F.bold }]}>
                          {isEn ? "Cancel Order" : "إلغاء الطلب"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* ── Floating Chat FAB ── */}
        {(() => {
          const activeOrder = orders.find(o => {
            const s = liveStatus[o.id] ?? "pending";
            return s === "pending" || s === "preparing" || s === "ready";
          }) ?? orders[0];
          if (!activeOrder) return null;
          const totalUnread = totalUnreadFromCashier;
          return (
            <TouchableOpacity
              onPress={() => openChat(activeOrder.id)}
              activeOpacity={0.85}
              style={{
                position: "absolute",
                bottom: insets.bottom + 20,
                left: 20,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: colors.isModern ? colors.infoBg : "#0D2030",
                borderRadius: 30,
                paddingHorizontal: 18,
                paddingVertical: 13,
                borderWidth: 1.5,
                borderColor: colors.isModern ? colors.info : "#1E4A6A",
                shadowColor: "#000",
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 10,
              }}
            >
              {/* Badge */}
              <View style={{ position: "relative" }}>
                <Feather name="message-circle" size={22} color={(colors.isModern ? colors.info : "#64B5F6")} />
                {totalUnread > 0 && (
                  <View style={{
                    position: "absolute",
                    top: -5,
                    right: -5,
                    backgroundColor: colors.isModern ? colors.danger : "#E53935",
                    borderRadius: 9,
                    minWidth: 17,
                    height: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 3,
                    borderWidth: 1.5,
                    borderColor: colors.isModern ? colors.background : "#0D2030",
                  }}>
                    <Text style={{ color: "#fff", fontSize: 9, fontFamily: F.bold }}>{totalUnread}</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: (colors.isModern ? colors.info : "#64B5F6"), fontFamily: F.bold, fontSize: 14 }}>
                {isEn ? "Chat with us" : "تواصل معنا"}
              </Text>
            </TouchableOpacity>
          );
        })()}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom:     14,
    borderBottomWidth: 1,
    alignItems:        "center",
  },
  title: { fontSize: 20 },

  emptyWrap: {
    flex:              1,
    alignItems:        "center",
    justifyContent:    "center",
    gap:               14,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width:          90,
    height:         90,
    borderRadius:   45,
    alignItems:     "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, marginTop: 4 },
  emptyText:  { fontSize: 14, textAlign: "center", lineHeight: 24 },
  browseBtn: {
    marginTop:         6,
    paddingHorizontal: 32,
    paddingVertical:   13,
    borderRadius:      14,
  },
  browseBtnText: { color: "#fff", fontSize: 15 },

  card: {
    borderRadius: 16,
    borderWidth:  1,
    overflow:     "hidden",
  },
  cardHeader: {
    flexDirection:   "row-reverse",
    alignItems:      "center",
    justifyContent:  "space-between",
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  statusBadge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    borderRadius:      20,
    paddingHorizontal: 10,
    paddingVertical:   5,
  },
  statusText: { fontSize: 13 },
  orderNum:   { fontSize: 20 },

  divider: { height: 1 },

  itemsList: {
    paddingHorizontal: 14,
    paddingVertical:   10,
    gap:               6,
  },
  itemRow: {
    flexDirection: "row-reverse",
    alignItems:    "center",
    gap:           8,
  },
  itemQty:  { fontSize: 13 },
  itemName: { fontSize: 14, flex: 1, textAlign: "right" },

  cardFooter: {
    flexDirection:     "row-reverse",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  total: { fontSize: 17 },
  date:  { fontSize: 12 },

  cancelBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
    borderWidth:    1,
    borderRadius:   0,
    paddingVertical: 10,
  },
  cancelBtnText: { color: "#E53935", fontSize: 14 },
});
