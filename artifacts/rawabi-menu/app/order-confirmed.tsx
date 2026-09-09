import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiGet, apiPost, apiPatch } from "@/constants/api";
import { useLanguage } from "@/context/LanguageContext";

const F = {
  regular: "Cairo_400Regular",
  semi:    "Cairo_600SemiBold",
  bold:    "Cairo_700Bold",
  extra:   "Cairo_800ExtraBold",
};

type OrderStatus = "pending" | "preparing" | "ready" | "done" | "cancelled";
type DriverStatus = "assigned" | "picked_up" | "delivered";

interface Order {
  id: number;
  dailyNumber: number;
  status: OrderStatus;
  createdAt: string;
  notes: string | null;
  customerAddress: string | null;
}

interface AssignmentRow {
  assignment: {
    driverId: number;
    status: DriverStatus;
    assignedAt: string;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    driverLat: number | null;
    driverLng: number | null;
    locationUpdatedAt: string | null;
    driverRating: number | null;
  };
  driver: { id: number; name: string; phone: string; photoUrl: string | null };
}

const POLL_INTERVAL = 5000;

function usePulse() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.08, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

function useSpin() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.linear })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
}

/* ─── Status panels ───────────────────────────────────────── */

function StatusPending({ colors, isEn }: { colors: ReturnType<typeof useColors>; isEn: boolean }) {
  const spin = useSpin();
  return (
    <View style={styles.statusWrap}>
      <Animated.View style={{ transform: [{ rotate: spin }], marginBottom: 16 }}>
        <Feather name="clock" size={64} color={colors.mutedForeground} />
      </Animated.View>
      <Text style={[styles.statusTitle, { color: colors.foreground, fontFamily: F.extra }]}>
        {isEn ? "Order Received" : "طلبك في الانتظار"}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isEn ? "Our team will start preparing it shortly." : "سيبدأ فريقنا بتجهيزه قريباً"}
      </Text>
    </View>
  );
}

function StatusPreparing({ colors, isEn }: { colors: ReturnType<typeof useColors>; isEn: boolean }) {
  const pulse = usePulse();
  return (
    <View style={styles.statusWrap}>
      <Animated.View style={{ transform: [{ scale: pulse }], marginBottom: 16 }}>
        <View style={[styles.iconCircle, { backgroundColor: "#2A3A00", borderColor: "#8BC34A" }]}>
          <Text style={{ fontSize: 52 }}>👨‍🍳</Text>
        </View>
      </Animated.View>
      <Text style={[styles.statusTitle, { color: "#8BC34A", fontFamily: F.extra }]}>
        {isEn ? "Being Prepared" : "طلبك يتجهز"}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isEn ? "Our team is carefully preparing your order." : "بدأ فريقنا بتجهيز طلبك بعناية"}
      </Text>
    </View>
  );
}

function StatusReady({ colors, isDelivery, isEn }: { colors: ReturnType<typeof useColors>; isDelivery: boolean; isEn: boolean }) {
  const pulse = usePulse();
  return (
    <View style={styles.statusWrap}>
      <Animated.View style={{ transform: [{ scale: pulse }], marginBottom: 16 }}>
        <View style={[styles.iconCircle, { backgroundColor: "#1A2A00", borderColor: colors.gold }]}>
          <Text style={{ fontSize: 52 }}>{isDelivery ? "📦" : "🍽️"}</Text>
        </View>
      </Animated.View>
      <View style={[styles.hotBadge, { backgroundColor: colors.gold }]}>
        <Text style={[styles.hotBadgeText, { fontFamily: F.extra }]}>
          {isEn ? "🔥 Almost Ready" : "🔥 جاري التجهيز"}
        </Text>
      </View>
      <Text style={[styles.statusTitle, { color: colors.gold, fontFamily: F.extra, marginTop: 14 }]}>
        {isDelivery
          ? (isEn ? "Packed & Ready for Pickup" : "طلبك جاهز للاستلام من المندوب")
          : (isEn ? "Your Order is Almost Ready" : "طلبك على وشك يجهز")}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isDelivery
          ? (isEn ? "A driver will pick it up shortly." : "سيستلمه المندوب قريباً")
          : (isEn ? "Being prepared and almost complete." : "يُجهَّز الآن ويوشك على الاكتمال")}
      </Text>
    </View>
  );
}

function StatusOnTheWay({ colors, isEn, compact }: { colors: ReturnType<typeof useColors>; isEn: boolean; compact?: boolean }) {
  const pulse = usePulse();
  if (compact) {
    return (
      <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8, gap: 6 }}>
        <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular, textAlign: "center" }]}>
          {isEn ? "Your order is on its way! Get ready." : "طلبك في الطريق — استعد لاستلامه!"}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.statusWrap}>
      <Animated.View style={{ transform: [{ scale: pulse }], marginBottom: 16 }}>
        <View style={[styles.iconCircle, { backgroundColor: "#0A1F2A", borderColor: "#29B6F6" }]}>
          <Text style={{ fontSize: 52 }}>🛵</Text>
        </View>
      </Animated.View>
      <View style={[styles.hotBadge, { backgroundColor: "#29B6F6" }]}>
        <Text style={[styles.hotBadgeText, { fontFamily: F.extra, color: "#032B3D" }]}>
          {isEn ? "🛵 On the Way!" : "🛵 المندوب في الطريق!"}
        </Text>
      </View>
      <Text style={[styles.statusTitle, { color: "#29B6F6", fontFamily: F.extra, marginTop: 14 }]}>
        {isEn ? "Driver is Heading Your Way" : "المندوب في طريقه إليك"}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isEn ? "Your order is on its way! Get ready." : "طلبك في الطريق — استعد لاستلامه!"}
      </Text>
    </View>
  );
}

function StatusDone({ colors, onReturn, isEn, isDelivery }: { colors: ReturnType<typeof useColors>; onReturn: () => void; isEn: boolean; isDelivery: boolean }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);
  return (
    <View style={styles.statusWrap}>
      <Animated.View style={{ transform: [{ scale }], marginBottom: 16 }}>
        <View style={[styles.iconCircle, { backgroundColor: "#1A3A1A", borderColor: "#4CAF50" }]}>
          <Feather name="check-circle" size={60} color="#4CAF50" />
        </View>
      </Animated.View>
      <Text style={[styles.statusTitle, { color: "#4CAF50", fontFamily: F.extra }]}>
        {isDelivery
          ? (isEn ? "Delivered Successfully 🎉" : "تم التوصيل بنجاح 🎉")
          : (isEn ? "Order Completed 🎉" : "تم استلام الطلب 🎉")}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isEn
          ? "Thank you for choosing منتجات السلة للخضار والفواكه 🥬\nEnjoy your fresh order!"
          : "شكراً لاختيارك منتجات السلة للخضار والفواكه 🥬\nنتمنى لك طلبًا طازجًا!"}
      </Text>
      <TouchableOpacity
        onPress={onReturn}
        style={[styles.returnBtn, { backgroundColor: colors.gold, marginTop: 28 }]}
        activeOpacity={0.85}
      >
        <Text style={[styles.returnBtnText, { fontFamily: F.bold }]}>
          {isEn ? "Back to Menu" : "العودة للقائمة"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─── Delivered panel with optional driver rating ─────────── */

function StatusDelivered({
  colors, isEn, orderId, driverName, driverPhoto, existingRating, onReturn,
}: {
  colors: ReturnType<typeof useColors>;
  isEn: boolean;
  orderId: string;
  driverName: string;
  driverPhoto: string | null;
  existingRating: number | null;
  onReturn: () => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const [selected, setSelected]   = useState<number>(existingRating ?? 0);
  const [submitted, setSubmitted] = useState(!!existingRating);
  const [loading, setLoading]     = useState(false);
  const [comment, setComment]     = useState("");

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 60 }).start();
  }, [scale]);

  const submitRating = async () => {
    if (submitted || loading || selected === 0) return;
    setLoading(true);
    try {
      await apiPost(`/orders/${orderId}/driver-rating`, { stars: selected, comment: comment.trim() || null });
      setSubmitted(true);
    } catch {}
    setLoading(false);
  };

  return (
    <View style={styles.statusWrap}>
      {/* Check icon — small so it doesn't overflow */}
      <Animated.View style={{ transform: [{ scale }], marginBottom: 8 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: "#1A3A1A", borderColor: "#4CAF50", borderWidth: 2, alignItems: "center", justifyContent: "center" }}>
          <Feather name="check-circle" size={40} color="#4CAF50" />
        </View>
      </Animated.View>

      {/* Title */}
      <Text style={[styles.statusTitle, { color: "#4CAF50", fontFamily: F.extra }]}>
        {isEn ? "Order Delivered! 🎉" : "تم تسليم طلبك 🎉"}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isEn
          ? "Your order has been delivered successfully.\nEnjoy your meal!"
          : "وصل طلبك بنجاح!\nنتمنى لك وجبة شهية 🍗"}
      </Text>

      {/* Rating card */}
      <View style={[styles.ratingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Driver avatar */}
        <View style={{ alignItems: "center", gap: 8, marginBottom: 12 }}>
          {driverPhoto
            ? <Image source={{ uri: driverPhoto }} style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.gold }} />
            : (
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.gold + "22", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.gold }}>
                <Text style={{ fontSize: 30 }}>🛵</Text>
              </View>
            )
          }
          <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>{driverName}</Text>
        </View>

        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "center", marginBottom: 14 }}>
          {submitted
            ? (isEn ? "Thank you for your rating! ⭐" : "شكراً على تقييمك! ⭐")
            : (isEn ? "How was your delivery experience?" : "كيف كانت تجربة التوصيل؟")}
        </Text>

        {/* Stars */}
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 16 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => { if (!submitted) setSelected(star); }}
              activeOpacity={submitted ? 1 : 0.7}
              disabled={loading}
            >
              <Text style={{ fontSize: 38, opacity: submitted && star > selected ? 0.3 : 1 }}>
                {star <= selected ? "⭐" : "☆"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!submitted && selected > 0 && (
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={isEn ? "Add a comment (optional)" : "أضف تعليقاً (اختياري)"}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={200}
            style={{
              width: "100%",
              minHeight: 70,
              backgroundColor: colors.background,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              color: colors.foreground,
              fontFamily: F.regular,
              fontSize: 13,
              textAlignVertical: "top",
              textAlign: isEn ? "left" : "right",
              marginBottom: 12,
            }}
          />
        )}

        {!submitted && (
          <View style={{ width: "100%", gap: 8 }}>
            {selected > 0 && (
              <TouchableOpacity
                onPress={submitRating}
                disabled={loading}
                activeOpacity={0.85}
                style={{ backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#0B0F14", fontFamily: F.bold, fontSize: 14 }}>
                  {loading ? "..." : (isEn ? "Submit Rating" : "إرسال التقييم")}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onReturn}
              style={{ paddingVertical: 10, alignItems: "center" }}
              activeOpacity={0.7}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textDecorationLine: "underline" }}>
                {isEn ? "Skip rating" : "تخطي التقييم"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Return button */}
      <TouchableOpacity
        onPress={onReturn}
        style={[styles.returnBtn, { backgroundColor: colors.gold, marginTop: 8 }]}
        activeOpacity={0.85}
      >
        <Text style={[styles.returnBtnText, { fontFamily: F.bold }]}>
          {isEn ? "Back to Menu" : "العودة للقائمة"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─── Driver card ─────────────────────────────────────────── */

interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; createdAt: string; readAt: string | null; }

function DriverCard({ row, colors, isEn, orderId }: { row: AssignmentRow; colors: ReturnType<typeof useColors>; isEn: boolean; orderId: string }) {
  const { driver, assignment } = row;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 20 : insets.top;

  // ── In-app chat state ────────────────────────────────────────────────────
  const [chatOpen, setChatOpen]       = useState(false);
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatScrollRef                  = useRef<ScrollView>(null);
  const numericOrderId                 = parseInt(orderId, 10);

  const fetchMsgs = useCallback(async (markRead = true) => {
    try {
      const msgs = await apiGet<ChatMsg[]>(`/messages/order/${numericOrderId}`);
      setChatMsgs(msgs);
      if (markRead) {
        await apiPatch(`/messages/order/${numericOrderId}/read`, { fromCashier: false });
        setUnreadCount(0);
      }
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 80);
    } catch {}
  }, [numericOrderId]);

  const openChat = useCallback(async () => {
    setChatOpen(true);
    setChatLoading(true);
    await fetchMsgs(true);
    setChatLoading(false);
  }, [fetchMsgs]);

  const sendMsg = useCallback(async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const msg = await apiPost<ChatMsg>(`/messages/order/${numericOrderId}`, { text, fromCashier: false });
      setChatMsgs(prev => [...prev, msg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {} finally { setChatSending(false); }
  }, [chatInput, numericOrderId]);

  // Poll while chat is open
  useEffect(() => {
    if (!chatOpen) return;
    const t = setInterval(() => fetchMsgs(true), 5000);
    return () => clearInterval(t);
  }, [chatOpen, fetchMsgs]);

  // Check unread count periodically when chat is closed
  useEffect(() => {
    if (chatOpen || !numericOrderId) return;
    const check = async () => {
      try {
        const data = await apiGet<Record<number, number>>("/messages/unread-customer");
        setUnreadCount(data[numericOrderId] ?? 0);
      } catch {}
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [chatOpen, numericOrderId]);

  const driverStatusLabel: Record<DriverStatus, string> = {
    assigned:  isEn ? "Picking up your order" : "يستلم طلبك الآن",
    picked_up: isEn ? "On the way 🚗"         : "في الطريق إليك 🚗",
    delivered: isEn ? "Delivered ✅"           : "تم التسليم ✅",
  };
  const driverStatusColor: Record<DriverStatus, string> = {
    assigned:  "#FB8C00",
    picked_up: "#29B6F6",
    delivered: "#4CAF50",
  };
  const color = driverStatusColor[assignment.status];
  const hasLocation = !!(assignment.driverLat && assignment.driverLng);
  const onTheWay = assignment.status === "picked_up";

  const openUrl = (url: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.open(url);
    } else {
      Linking.openURL(url);
    }
  };

  const callDriver  = () => openUrl(`tel:${driver.phone}`);
  const trackDriver = () => router.push(`/driver-map?orderId=${orderId}`);

  return (
    <View style={[styles.driverCard, { backgroundColor: color + "14", borderColor: color + "55" }]}>

      {/* ── In-app chat modal ── */}
      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: topInset + 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#0D1F30" }}>
              <TouchableOpacity onPress={() => setChatOpen(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <View style={{ alignItems: "center", gap: 3 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>
                  {isEn ? "💬 Support Chat" : "💬 تواصل مع الكاشير"}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                  {isEn ? `Order #${orderId}` : `طلب #${orderId}`}
                </Text>
              </View>
              {/* Call driver shortcut */}
              {onTheWay && (
                <TouchableOpacity
                  onPress={callDriver}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#1A3A20", borderWidth: 1.5, borderColor: "#4CAF50", alignItems: "center", justifyContent: "center" }}
                >
                  <Feather name="phone" size={17} color="#4CAF50" />
                </TouchableOpacity>
              )}
              {!onTheWay && <View style={{ width: 36 }} />}
            </View>

            {/* Messages */}
            <ScrollView
              ref={chatScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, gap: 10 }}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {chatLoading ? (
                <ActivityIndicator size="large" color={colors.gold} style={{ margin: 40 }} />
              ) : chatMsgs.length === 0 ? (
                <View style={{ alignItems: "center", padding: 40, gap: 14 }}>
                  <Text style={{ fontSize: 48 }}>💬</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                    {isEn ? "No messages yet\nSend us a message and we'll reply shortly" : "لا توجد رسائل بعد\nأرسل رسالتك وسنرد عليك قريباً"}
                  </Text>
                </View>
              ) : chatMsgs.map((msg) => {
                const isCustomer = !msg.fromCashier;
                const time = new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                return (
                  <View key={msg.id} style={{ alignItems: isCustomer ? "flex-end" : "flex-start" }}>
                    <View style={{ maxWidth: "80%", backgroundColor: isCustomer ? "#2A1800" : colors.secondary, borderRadius: 18, borderTopRightRadius: isCustomer ? 4 : 18, borderTopLeftRadius: isCustomer ? 18 : 4, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: isCustomer ? colors.gold + "55" : colors.border }}>
                      <Text style={{ color: isCustomer ? colors.gold : colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: isCustomer ? "right" : "left" }}>{msg.text}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10, marginTop: 4, textAlign: isCustomer ? "right" : "left" }}>
                        {time}{isCustomer ? (isEn ? " • You" : " • أنت") : (isEn ? " • Cashier" : " • الكاشير")}
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
                {chatSending ? <ActivityIndicator size="small" color="#1A0A00" /> : <Feather name="send" size={18} color={chatInput.trim() ? "#1A0A00" : colors.mutedForeground} />}
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

      {/* ── Driver info row ── */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        {driver.photoUrl
          ? <Image source={{ uri: driver.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: color }} />
          : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color + "22", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color }}>
              <Text style={{ fontSize: 28 }}>🛵</Text>
            </View>
          )
        }
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: color, fontFamily: F.bold, fontSize: 15 }}>{driver.name}</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
            {driverStatusLabel[assignment.status]}
          </Text>
          {hasLocation && onTheWay && (
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#4CAF50" }} />
              <Text style={{ color: "#4CAF50", fontFamily: F.regular, fontSize: 10 }}>
                {isEn ? "Location live" : "موقع مباشر"}
              </Text>
            </View>
          )}
        </View>
        {/* Small call icon — always visible when not delivered */}
        {!onTheWay && assignment.status !== "delivered" && (
          <TouchableOpacity
            onPress={callDriver}
            style={{ backgroundColor: "#4CAF5022", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#4CAF5055" }}
          >
            <Feather name="phone" size={18} color="#4CAF50" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Map tracking row (picked_up only) ── */}
      {onTheWay && (
        hasLocation ? (
          <TouchableOpacity
            onPress={trackDriver}
            style={{ marginTop: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#29B6F6", borderRadius: 12, paddingVertical: 11 }}
          >
            <Feather name="map-pin" size={16} color="#032B3D" />
            <Text style={{ color: "#032B3D", fontFamily: F.extra, fontSize: 14 }}>
              {isEn ? "Track Driver on Map 🗺️" : "تتبع المندوب على الخريطة 🗺️"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ marginTop: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#29B6F611", borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#29B6F633" }}>
            <Feather name="map-pin" size={16} color="#29B6F6" />
            <Text style={{ color: "#29B6F6", fontFamily: F.semi, fontSize: 13 }}>
              {isEn ? "Locating driver..." : "جاري تحديد موقع المندوب..."}
            </Text>
          </View>
        )
      )}

      {/* ── Contact buttons — only when on the way ── */}
      {onTheWay && (
        <View style={{ marginTop: 10, flexDirection: "row-reverse", gap: 10 }}>
          {/* Call button */}
          <TouchableOpacity
            onPress={callDriver}
            activeOpacity={0.82}
            style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#4CAF50", borderRadius: 12, paddingVertical: 12 }}
          >
            <Feather name="phone" size={17} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14 }}>
              {isEn ? "Call Driver" : "اتصال بالمندوب"}
            </Text>
          </TouchableOpacity>

          {/* In-app chat button */}
          <TouchableOpacity
            onPress={openChat}
            activeOpacity={0.82}
            style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0D2030", borderRadius: 12, paddingVertical: 12, borderWidth: 1.5, borderColor: "#1E4A6A" }}
          >
            <View style={{ position: "relative" }}>
              <Feather name="message-circle" size={17} color="#64B5F6" />
              {unreadCount > 0 && (
                <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: "#E53935", borderRadius: 8, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                  <Text style={{ color: "#fff", fontSize: 8, fontFamily: F.bold }}>{unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: "#64B5F6", fontFamily: F.bold, fontSize: 14 }}>
              {isEn ? "Chat" : "دردشة"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ─── Cancelled panel ─────────────────────────────────────── */

function StatusCancelled({ colors, isEn, onReturn }: { colors: ReturnType<typeof useColors>; isEn: boolean; onReturn: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);
  return (
    <View style={styles.statusWrap}>
      <Animated.View style={{ transform: [{ scale }], marginBottom: 16 }}>
        <View style={[styles.iconCircle, { backgroundColor: "#3A1A1A", borderColor: "#EF5350" }]}>
          <Feather name="x-circle" size={60} color="#EF5350" />
        </View>
      </Animated.View>
      <Text style={[styles.statusTitle, { color: "#EF5350", fontFamily: F.extra }]}>
        {isEn ? "Order Cancelled ❌" : "تم إلغاء الطلب ❌"}
      </Text>
      <Text style={[styles.statusDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {isEn
          ? "We're sorry, your order was cancelled by the restaurant.\nPlease contact us for more information."
          : "نأسف، تم إلغاء طلبك من قِبل المطعم.\nللاستفسار تواصل معنا مباشرة."}
      </Text>
      <TouchableOpacity
        onPress={onReturn}
        style={[styles.returnBtn, { backgroundColor: "#EF5350", marginTop: 28 }]}
        activeOpacity={0.85}
      >
        <Text style={[styles.returnBtnText, { fontFamily: F.bold }]}>
          {isEn ? "Back to Menu" : "العودة للقائمة"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─── Main screen ─────────────────────────────────────────── */

export default function OrderConfirmedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { language } = useLanguage();
  const isEn = language === "en";

  const [status, setStatus]           = useState<OrderStatus>("pending");
  const [dailyNumber, setDailyNumber] = useState<number>(0);
  const [orderDate, setOrderDate]     = useState<string>("");
  const [isDelivery, setIsDelivery]   = useState(false);
  const [assignment, setAssignment]   = useState<AssignmentRow | null>(null);

  const topInset    = Platform.OS === "web" ? 80 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchAll = useCallback(async () => {
    if (!orderId) return;
    try {
      const order = await apiGet<Order>(`/orders/${orderId}`);
      setStatus(order.status);
      if (order.dailyNumber) setDailyNumber(order.dailyNumber);
      if (order.createdAt) {
        const d = new Date(order.createdAt);
        setOrderDate(d.toLocaleDateString(isEn ? "en-US" : "ar-SA", { day: "numeric", month: "long", year: "numeric" }));
      }
      const delivery = !!(
        order.customerAddress ||
        order.notes?.includes("توصيل") ||
        order.notes?.includes("delivery")
      );
      setIsDelivery(delivery);
    } catch {}

    try {
      const row = await apiGet<AssignmentRow | null>(`/orders/${orderId}/assignment`);
      setAssignment(row ?? null);
      if (row) setIsDelivery(true);
    } catch {}
  }, [orderId, isEn]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleReturn = () => {
    if (router.canGoBack()) {
      router.dismissAll();
    } else {
      router.replace("/(tabs)");
    }
  };

  /* ── Effective status for display ── */
  const driverStatus = assignment?.assignment.status ?? null;
  const effectivelyDelivered = isDelivery && driverStatus === "delivered";
  const onTheWay = isDelivery && driverStatus === "picked_up" && status === "done";

  /* ── Steps ── */
  type StepKey = "pending" | "preparing" | "ready" | "on_the_way" | "delivered" | "done";
  const deliverySteps: { key: StepKey; label: string; labelEn: string; icon: string }[] = [
    { key: "pending",    label: "استلام الطلب",  labelEn: "Received",  icon: "📋" },
    { key: "preparing",  label: "بدء التجهيز",   labelEn: "Preparing", icon: "👨‍🍳" },
    { key: "ready",      label: "جاهز",           labelEn: "Ready",     icon: "📦" },
    { key: "on_the_way", label: "مع المندوب",     labelEn: "On Way",    icon: "🛵" },
    { key: "delivered",  label: "تم التوصيل",    labelEn: "Delivered", icon: "✅" },
  ];
  const pickupSteps: { key: StepKey; label: string; labelEn: string; icon: string }[] = [
    { key: "pending",   label: "استلام الطلب",  labelEn: "Received",   icon: "📋" },
    { key: "preparing", label: "بدء التجهيز",   labelEn: "Preparing",  icon: "👨‍🍳" },
    { key: "ready",     label: "جاري التجهيز",  labelEn: "Almost Ready", icon: "🍽️" },
    { key: "done",      label: "تم الاستلام",   labelEn: "Done",       icon: "✅" },
  ];

  const steps = isDelivery ? deliverySteps : pickupSteps;

  const getCurrentIdx = (): number => {
    if (isDelivery) {
      if (effectivelyDelivered || (status === "done" && !driverStatus)) return 4;
      if (driverStatus === "picked_up") return 3;
      if (driverStatus === "assigned" || status === "done" || status === "ready") return 2;
      if (status === "preparing") return 1;
      return 0;
    }
    return ["pending", "preparing", "ready", "done"].indexOf(status);
  };
  const currentIdx = getCurrentIdx();

  /* ── Which status panel to show ── */
  const showPanel = () => {
    if (isDelivery) {
      if (effectivelyDelivered) return "delivered";
      if (status === "done" && !driverStatus) return "done";
      if (driverStatus === "picked_up") return "on_the_way";
      return status === "done" ? "ready" : status;
    }
    return status;
  };
  const panel = showPanel();
  const isDonePanel = panel === "done" || panel === "delivered" || panel === "cancelled";

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topInset, paddingBottom: bottomInset }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.gold, fontFamily: F.extra }]}>
          {isEn ? "Track Your Order" : "تتبع طلبك"}
        </Text>
        {dailyNumber > 0 && (
          <Text style={[styles.headerDailyNum, { color: colors.gold, fontFamily: F.bold }]}>
            {isEn ? `Today's Order #${dailyNumber}` : `طلب اليوم #${dailyNumber}`}
          </Text>
        )}
        {orderDate ? (
          <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: F.regular }]}>
            {orderDate}
          </Text>
        ) : null}
        {isDelivery && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, backgroundColor: "#29B6F611", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#29B6F633" }}>
            <Text style={{ color: "#29B6F6", fontFamily: F.semi, fontSize: 12 }}>
              🛵 {isEn ? "Delivery Order" : "طلب توصيل"}
            </Text>
          </View>
        )}
      </View>

      {/* Steps bar */}
      <View style={[styles.stepsRow, { paddingHorizontal: isDelivery ? 8 : 16 }]}>
        {steps.map((step, idx) => {
          const done   = idx <= currentIdx;
          const active = idx === currentIdx;
          return (
            <React.Fragment key={step.key}>
              <View style={[styles.stepItem, { width: isDelivery ? 52 : 64 }]}>
                <View style={[
                  styles.stepDot,
                  {
                    width: isDelivery ? 38 : 44, height: isDelivery ? 38 : 44,
                    borderRadius: isDelivery ? 19 : 22,
                    backgroundColor: done ? (active ? colors.gold : "#2A4A2A") : colors.secondary,
                    borderColor:     done ? (active ? colors.gold : "#4CAF50") : colors.border,
                    borderWidth: active ? 3 : 1.5,
                  },
                ]}>
                  <Text style={{ fontSize: isDelivery ? 12 : 14 }}>{step.icon}</Text>
                </View>
                <Text style={[styles.stepLabel, { color: done ? (active ? colors.gold : "#4CAF50") : colors.mutedForeground, fontFamily: active ? F.bold : F.regular }]} numberOfLines={1}>
                  {isEn ? step.labelEn : step.label}
                </Text>
              </View>
              {idx < steps.length - 1 && (
                <View style={[styles.stepLine, { backgroundColor: idx < currentIdx ? "#4CAF50" : colors.border }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Driver card — hide when delivered (rating card takes over) */}
      {assignment && isDelivery && panel !== "delivered" && (
        <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
          <DriverCard row={assignment} colors={colors} isEn={isEn} orderId={orderId ?? ""} />
        </View>
      )}

      {/* Status panel */}
      {panel === "delivered" && assignment ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
        >
          <StatusDelivered
            colors={colors}
            isEn={isEn}
            orderId={orderId ?? ""}
            driverName={assignment.driver.name}
            driverPhoto={assignment.driver.photoUrl}
            existingRating={assignment.assignment.driverRating}
            onReturn={handleReturn}
          />
        </ScrollView>
      ) : (
        <View style={styles.mainArea}>
          {panel === "pending"    && <StatusPending    colors={colors} isEn={isEn} />}
          {panel === "preparing"  && <StatusPreparing  colors={colors} isEn={isEn} />}
          {panel === "ready"      && <StatusReady      colors={colors} isDelivery={isDelivery} isEn={isEn} />}
          {panel === "on_the_way" && <StatusOnTheWay   colors={colors} isEn={isEn} compact={!!(assignment && isDelivery)} />}
          {panel === "done"       && <StatusDone       colors={colors} onReturn={handleReturn} isEn={isEn} isDelivery={isDelivery} />}
          {panel === "cancelled"  && <StatusCancelled  colors={colors} onReturn={handleReturn} isEn={isEn} />}
        </View>
      )}

      {!isDonePanel && (
        <TouchableOpacity
          onPress={handleReturn}
          style={[styles.backBtn, { borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: colors.mutedForeground, fontFamily: F.semi }]}>
            {isEn ? "Back to Menu" : "العودة للقائمة"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    gap: 4,
  },
  headerTitle:    { fontSize: 22 },
  headerDailyNum: { fontSize: 17, marginTop: 2 },
  headerSub:      { fontSize: 14 },

  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
  },
  stepItem:  { alignItems: "center", gap: 6 },
  stepDot:   { alignItems: "center", justifyContent: "center" },
  stepLabel: { fontSize: 9, textAlign: "center" },
  stepLine:  { flex: 1, height: 3, borderRadius: 2, marginBottom: 18 },

  driverCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },

  mainArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  statusWrap: { alignItems: "center", gap: 8, width: "100%" },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },
  statusTitle: { fontSize: 24, textAlign: "center" },
  statusDesc:  { fontSize: 14, textAlign: "center", lineHeight: 24, marginTop: 4 },

  hotBadge:     { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, marginTop: 8 },
  hotBadgeText: { color: "#1A1008", fontSize: 17 },

  ratingCard: {
    width: "100%",
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },

  returnBtn:     { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 20, marginTop: 4 },
  returnBtnText: { color: "#1A1008", fontSize: 16 },

  backBtn:     { marginHorizontal: 24, marginBottom: 16, paddingVertical: 14, borderRadius: 16, alignItems: "center", borderWidth: 1 },
  backBtnText: { fontSize: 15 },
});
