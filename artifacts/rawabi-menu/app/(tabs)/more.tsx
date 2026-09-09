import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  Linking,
  Alert,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";

const snapchatLogo = require("@/assets/images/snapchat.jpg");
const tiktokLogo = require("@/assets/images/tiktok.jpg");
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAppTexts } from "@/hooks/useAppTexts";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTranslation } from "@/hooks/useTranslation";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiGet, apiPost, apiPatch } from "@/constants/api";
import { TOKEN_KEY } from "@/hooks/useCustomerPushToken";
import { useChatUnreadAlert } from "@/hooks/useChatSound";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

interface SocialLink { image: any; label: string; url: string; }

const SOCIAL_LINKS: SocialLink[] = [
  { image: snapchatLogo, label: "سناب شات", url: `https://www.snapchat.com/add/rwabi-almndi?share_id=3Bq3Hx1Ah3o&locale=ar-AE` },
  { image: tiktokLogo,   label: "تيك توك",   url: `https://www.tiktok.com/@rwabialmndi?_r=1&_t=ZS-95zIV9lsc6R` },
];

interface MenuItem { icon: string; label: string; action: () => void; danger?: boolean; highlight?: boolean; }

interface StoredOrder { id: number; dailyNumber: number; status: string; customerName?: string; }
interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; createdAt: string; readAt: string | null; }

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearUser } = useUser();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const info = useAppTexts();

  // ─── Support Chat state ─────────────────────────────────
  const [chatOpen, setChatOpen]         = useState(false);
  const [chatOrderId, setChatOrderId]   = useState<number | null>(null);
  const [chatOrder, setChatOrder]       = useState<StoredOrder | null>(null);
  const [myOrders, setMyOrders]         = useState<StoredOrder[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatSending, setChatSending]   = useState(false);
  const [chatLoading, setChatLoading]   = useState(false);
  const [unreadTotal, setUnreadTotal]   = useState(0);
  const chatScrollRef                    = useRef<ScrollView>(null);
  const isEn = language === "en";

  useChatUnreadAlert(unreadTotal);

  const fetchChatMsgs = useCallback(async (orderId: number) => {
    try {
      const msgs = await apiGet<ChatMsg[]>(`/messages/order/${orderId}`);
      setChatMessages(msgs);
      await apiPatch(`/messages/order/${orderId}/read`, { fromCashier: false });
    } catch {}
  }, []);

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

  // Poll messages while chat is open
  useEffect(() => {
    if (!chatOrderId) return;
    const t = setInterval(() => fetchChatMsgs(chatOrderId), 5000);
    return () => clearInterval(t);
  }, [chatOrderId, fetchChatMsgs]);

  // Check unread on mount and when returning to screen
  const checkUnread = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("rawabi_orders");
      const orders: StoredOrder[] = raw ? JSON.parse(raw) : [];
      const recent = orders.slice(0, 6);
      if (!recent.length) return;
      const results = await Promise.allSettled(recent.map(o => apiGet<ChatMsg[]>(`/messages/order/${o.id}`)));
      let total = 0;
      results.forEach(r => {
        if (r.status === "fulfilled") total += r.value.filter(m => m.fromCashier && !m.readAt).length;
      });
      setUnreadTotal(total);
    } catch {}
  }, []);

  useEffect(() => {
    checkUnread();
    const t = setInterval(checkUnread, 10000);
    return () => clearInterval(t);
  }, [checkUnread]);

  const openSupportChat = async () => {
    try {
      const raw = await AsyncStorage.getItem("rawabi_orders");
      const orders: StoredOrder[] = raw ? JSON.parse(raw) : [];
      if (!orders.length) {
        Alert.alert(
          isEn ? "No Orders" : "لا توجد طلبات",
          isEn ? "You need to place an order first before chatting with us." : "يجب أن يكون لديك طلب نشط للتواصل مع الكاشير."
        );
        return;
      }
      setMyOrders(orders.slice(0, 8));
      if (orders.length === 1) {
        const o = orders[0];
        setChatOrder(o);
        setChatOrderId(o.id);
        setChatMessages([]);
        setChatLoading(true);
        setChatOpen(true);
        await fetchChatMsgs(o.id);
        setChatLoading(false);
      } else {
        setChatOrder(null);
        setChatOrderId(null);
        setChatMessages([]);
        setChatOpen(true);
      }
    } catch {
      Alert.alert("خطأ", "تعذّر فتح الدعم");
    }
  };

  const selectOrder = async (o: StoredOrder) => {
    setChatOrder(o);
    setChatOrderId(o.id);
    setChatMessages([]);
    setChatLoading(true);
    await fetchChatMsgs(o.id);
    setChatLoading(false);
  };

  const handleLogout = async () => {
    await clearUser();
    router.replace("/onboarding");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      isEn ? "Delete Account" : "حذف الحساب",
      isEn
        ? "This will permanently delete your account and all personal data from our servers. Past orders are kept for accounting but will no longer be linked to your name or phone. This action cannot be undone."
        : "سيتم حذف حسابك وجميع بياناتك الشخصية من خوادمنا بشكل نهائي. تبقى الطلبات السابقة لأغراض المحاسبة لكنها لن تُربط باسمك أو رقمك. لا يمكن التراجع عن هذا الإجراء.",
      [
        { text: isEn ? "Cancel" : "إلغاء", style: "cancel" },
        {
          text: isEn ? "Delete Permanently" : "حذف نهائياً",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem(TOKEN_KEY);
              const phone = user?.phone ?? "";
              // Hard-delete: removes push token, wallet, referrals, discount
              // usage history, and anonymises orders on the server.
              await apiPost("/account/delete", { token: token ?? "", phone }).catch(() => {});
              await AsyncStorage.clear();
              await clearUser();
              router.replace("/onboarding");
            } catch {
              Alert.alert(
                isEn ? "Error" : "خطأ",
                isEn ? "Could not delete account. Please try again." : "تعذر حذف الحساب، حاول مرة أخرى."
              );
            }
          },
        },
      ]
    );
  };

  const menuItems: MenuItem[] = [
    {
      icon: "message-circle",
      label: isEn ? "Support & Help" : "دعم والمساعدة",
      action: openSupportChat,
      highlight: true,
    },
    {
      icon: "phone",
      label: t("callUs"),
      action: () => Linking.openURL(`tel:${info.phone}`),
    },
    {
      icon: "message-circle",
      label: t("whatsapp"),
      action: () =>
        Linking.openURL(
          `https://wa.me/${info.whatsapp}?text=${encodeURIComponent("السلام عليكم، أرغب في الاستفسار")}`
        ),
    },
    {
      icon: "map-pin",
      label: `${t("location")} — ${info.location}`,
      action: () => Linking.openURL("https://maps.app.goo.gl/DiAZzzLKBAmGNv19A"),
    },
    {
      icon: "info",
      label: t("aboutUs"),
      action: () =>
        Alert.alert(
          "سلة الخضار",
          `${info.tagline}\n\n${info.location}\nهاتف: ${info.phone}`
        ),
    },
    {
      icon: "credit-card",
      label: t("paymentMethods"),
      action: () => router.push("/payment-methods" as any),
    },
    {
      icon: "lock",
      label: t("privacy"),
      action: () => router.push("/privacy" as any),
    },
    {
      icon: "file-text",
      label: t("terms"),
      action: () => router.push("/terms"),
    },
    {
      icon: "activity",
      label: isEn ? "Push Notifications Diagnostics" : "تشخيص الإشعارات",
      action: () => router.push("/push-diagnostics" as any),
    },
    ...(user
      ? [
          { icon: "log-out", label: t("clearData"), action: handleLogout, danger: true } as MenuItem,
          { icon: "trash-2", label: isEn ? "Delete Account" : "حذف الحساب", action: handleDeleteAccount, danger: true } as MenuItem,
        ]
      : []),
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: F.extra }]}>
          {t("more")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Language Toggle */}
        <View style={[styles.langCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>
            {t("language")}
          </Text>
          <View style={[styles.langToggle, { backgroundColor: colors.secondary }]}>
            <TouchableOpacity
              onPress={() => setLanguage("ar")}
              style={[styles.langBtn, language === "ar" && { backgroundColor: colors.card, elevation: 3 }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.langBtnText, { color: language === "ar" ? colors.foreground : colors.mutedForeground, fontFamily: F.bold }]}>العربية</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLanguage("en")}
              style={[styles.langBtn, language === "en" && { backgroundColor: colors.card, elevation: 3 }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.langBtnText, { color: language === "en" ? colors.foreground : colors.mutedForeground, fontFamily: F.bold }]}>EN</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Wallet Card */}
        {user && (
          <TouchableOpacity
            onPress={() => router.push("/wallet")}
            style={[styles.walletCard, { backgroundColor: "#2A1A0A", borderColor: colors.gold + "60" }]}
            activeOpacity={0.85}
          >
            <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1, alignItems: "flex-end", gap: 3 }}>
              <Text style={{ fontSize: 17, color: colors.gold, fontFamily: F.bold }}>{t("wallet")}</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: F.regular }}>{t("walletDesc")}</Text>
            </View>
            <View style={[styles.walletIcon, { backgroundColor: colors.gold + "22" }]}>
              <Feather name="credit-card" size={24} color={colors.gold} />
            </View>
          </TouchableOpacity>
        )}

        {/* Referral Card */}
        {user && (
          <TouchableOpacity
            onPress={() => router.push("/referral" as any)}
            style={[styles.walletCard, { backgroundColor: "#0A1F0A", borderColor: "#4CAF5060" }]}
            activeOpacity={0.85}
          >
            <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1, alignItems: "flex-end", gap: 3 }}>
              <Text style={{ fontSize: 17, color: "#4CAF50", fontFamily: F.bold }}>برنامج الإحالة 🎁</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: F.regular }}>شارك التطبيق واكسب مكافآت</Text>
            </View>
            <View style={[styles.walletIcon, { backgroundColor: "#4CAF5022" }]}>
              <Feather name="users" size={24} color="#4CAF50" />
            </View>
          </TouchableOpacity>
        )}

        {user && (
          <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
              <Feather name="user" size={28} color={colors.gold} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.foreground, fontFamily: F.bold }]}>{user.name}</Text>
              <Text style={[styles.profilePhone, { color: colors.mutedForeground, fontFamily: F.regular }]}>{user.phone}</Text>
            </View>
          </View>
        )}

        {/* Social */}
        <View style={[styles.socialCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>{t("contactUs")}</Text>
          <View style={styles.socialRow}>
            {SOCIAL_LINKS.map((s, i) => (
              <TouchableOpacity key={i} onPress={() => Linking.openURL(s.url).catch(() => {})} style={styles.socialItem}>
                <Image source={s.image} style={styles.socialLogo} resizeMode="cover" />
                <Text style={[styles.socialLabel, { color: colors.foreground, fontFamily: F.bold }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Menu items */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {menuItems.map((item, i) => (
            <React.Fragment key={i}>
              <TouchableOpacity style={styles.menuRow} onPress={item.action} activeOpacity={0.7}>
                <View style={{ position: "relative" }}>
                  <Feather
                    name={item.icon as any}
                    size={18}
                    color={item.danger ? colors.destructive : item.highlight ? "#64B5F6" : colors.gold}
                  />
                  {item.highlight && unreadTotal > 0 && (
                    <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: "#E53935", borderRadius: 8, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 8, fontFamily: F.bold }}>{unreadTotal > 9 ? "9+" : unreadTotal}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.menuLabel, { color: item.danger ? colors.destructive : item.highlight ? "#64B5F6" : colors.foreground, fontFamily: F.semi }]}>
                  {item.label}
                  {item.highlight && unreadTotal > 0 ? `  •  ${unreadTotal} ${isEn ? "new" : "جديدة"}` : ""}
                </Text>
                <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {i < menuItems.length - 1 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground, fontFamily: F.regular }]}>
          سلة الخضار • نسخة 1.0
        </Text>

        {/* ── بواسطة ── */}
        <View style={{ alignItems: "center", marginTop: 12, marginBottom: 20, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>بواسطة</Text>
            <Image
              source={require("@/assets/images/alaa-logo-nobg.png")}
              style={{ width: 90, height: 90 }}
              resizeMode="contain"
            />
          </View>
        </View>
      </ScrollView>

      {/* ── Support Chat Modal ── */}
      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>

            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: topInset + 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#0D1F30" }}>
              <TouchableOpacity
                onPress={() => {
                  if (chatOrderId && myOrders.length > 1) {
                    setChatOrderId(null);
                    setChatOrder(null);
                    setChatMessages([]);
                  } else {
                    setChatOpen(false);
                    setChatOrderId(null);
                    setChatOrder(null);
                    setChatMessages([]);
                  }
                }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}
              >
                <Feather name={chatOrderId && myOrders.length > 1 ? "arrow-right" : "x"} size={20} color={colors.foreground} />
              </TouchableOpacity>
              <View style={{ alignItems: "center", gap: 3 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>
                  💬 {isEn ? "Support & Help" : "دعم والمساعدة"}
                </Text>
                {chatOrder && (
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                    {isEn ? `Order #${chatOrder.dailyNumber}` : `طلب #${chatOrder.dailyNumber}`}
                  </Text>
                )}
              </View>
              <View style={{ width: 36 }} />
            </View>

            {/* Order picker (if multiple orders and none selected) */}
            {!chatOrderId ? (
              <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14, textAlign: "right", marginBottom: 4 }}>
                  {isEn ? "Select an order to chat about:" : "اختر طلبًا للتحدث عنه:"}
                </Text>
                {myOrders.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => selectOrder(o)}
                    style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15, textAlign: "right" }}>
                        {isEn ? `Order #${o.dailyNumber}` : `طلب #${o.dailyNumber}`}
                      </Text>
                      {o.customerName && (
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", marginTop: 2 }}>{o.customerName}</Text>
                      )}
                    </View>
                    <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <>
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
                      <Text style={{ fontSize: 52 }}>💬</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center", lineHeight: 24 }}>
                        {isEn
                          ? "No messages yet\nSend us a message and we'll reply shortly"
                          : "لا توجد رسائل بعد\nأرسل لنا رسالتك وسنرد عليك قريباً"}
                      </Text>
                    </View>
                  ) : chatMessages.map((msg) => {
                    const isMe = !msg.fromCashier;
                    const time = new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <View key={msg.id} style={{ alignItems: isMe ? "flex-end" : "flex-start" }}>
                        <View style={{ maxWidth: "80%", backgroundColor: isMe ? "#2A1800" : colors.secondary, borderRadius: 18, borderTopRightRadius: isMe ? 4 : 18, borderTopLeftRadius: isMe ? 18 : 4, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: isMe ? colors.gold + "55" : colors.border }}>
                          <Text style={{ color: isMe ? colors.gold : colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: isMe ? "right" : "left" }}>{msg.text}</Text>
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10, marginTop: 4, textAlign: isMe ? "right" : "left" }}>
                            {time}{isMe ? (isEn ? " • You" : " • أنت") : (isEn ? " • Cashier" : " • الكاشير")}
                            {!isMe && msg.readAt === null && (
                              <Text style={{ color: "#64B5F6" }}>{isEn ? " • New" : " • جديدة"}</Text>
                            )}
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
                    {chatSending
                      ? <ActivityIndicator size="small" color="#1A0A00" />
                      : <Feather name="send" size={18} color={chatInput.trim() ? "#1A0A00" : colors.mutedForeground} />}
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
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, alignItems: "center" },
  title: { fontSize: 20 },
  profileCard: { margin: 16, borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  profileInfo: { flex: 1, alignItems: "flex-end" },
  profileName: { fontSize: 17 },
  profilePhone: { fontSize: 14, marginTop: 2 },
  socialCard: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  sectionLabel: { fontSize: 13, textAlign: "right" },
  socialRow: { flexDirection: "row-reverse", gap: 20 },
  socialItem: { alignItems: "center", gap: 6 },
  socialLogo: { width: 64, height: 64, borderRadius: 16 },
  socialLabel: { fontSize: 13 },
  socialHandle: { fontSize: 11 },
  menuCard: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  menuRow: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  menuLabel: { flex: 1, fontSize: 15, textAlign: "right" },
  rowDivider: { height: 1, marginHorizontal: 16 },
  version: { textAlign: "center", fontSize: 12, marginTop: 24, marginBottom: 8 },
  langCard: { margin: 16, marginBottom: 0, borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  langToggle: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  langBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  langBtnText: { fontSize: 15 },
  walletCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  walletIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
