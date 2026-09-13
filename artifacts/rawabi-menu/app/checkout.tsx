import React, { useState, useRef, useCallback, useEffect } from "react";
import { resolveCartItemName, resolveCustomizationParts } from "@/utils/cartItemName";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  Linking,
  Animated,
  I18nManager,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useCart } from "@/context/CartContext";
import { useUser } from "@/context/UserContext";
import { apiPost, apiGet } from "@/constants/api";
import { useCustomerPushToken, registerCustomerNotifications } from "@/hooks/useCustomerPushToken";
import { useOrderBadge } from "@/context/OrderBadgeContext";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { ORDERS_STORAGE_KEY, StoredOrder } from "./(tabs)/orders";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguage } from "@/context/LanguageContext";
import { useUIDensity } from "@/hooks/useUIDensity";
import { MapPickerModal } from "@/components/MapPickerModal";
import BranchPickerModal, { type PickerBranch } from "@/components/BranchPickerModal";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

const LAST_ORDER_TS_KEY = "@last_order_submitted_at";
const ORDER_COOLDOWN_MS = 10 * 1000; // 10 seconds

type PaymentMethod = "cash" | "moyasar" | "wallet";

interface Order {
  id: number;
  dailyNumber: number;
  status: string;
}

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, totalPrice, totalItems, clearCart, updateQuantity } = useCart();
  const { user, saveUser } = useUser();

  const customerPushToken = useCustomerPushToken();
  const { incrementBadge } = useOrderBadge();
  const { settings: paymentSettings } = usePaymentSettings();

  const [promoLoading, setPromoLoading] = useState(false);
  const { t } = useTranslation();
  const { language } = useLanguage();
  const isEn = language === "en";
  const [notes, setNotes] = useState("");
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [promoExpanded, setPromoExpanded] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [appliedCodeLabel, setAppliedCodeLabel] = useState("");
  const [appliedCodeId, setAppliedCodeId] = useState<number | null>(null);
  const [promoError, setPromoError] = useState("");
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // ── Branch selection ───────────────────────────────────────────────────────
  const [branches, setBranches]             = useState<PickerBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<PickerBranch | null>(null);
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  useEffect(() => {
    apiGet<PickerBranch[]>("/branches").then(data => {
      const active = data.filter(b => b.active);
      setBranches(active);
    }).catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);
  const [locationUrl, setLocationUrl] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [manualLat, setManualLat] = useState<number | undefined>();
  const [manualLng, setManualLng] = useState<number | undefined>();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paymentPickerVisible, setPaymentPickerVisible] = useState(false);

  // ─── Delivery Zone check ────────────────────────────────────────────────────
  type ZoneCheckResult = { found: boolean; zone: { id: number; name: string; deliveryFee: number; minOrder: number } | null; hasZones: boolean };
  const [zoneCheckResult, setZoneCheckResult] = useState<ZoneCheckResult | null>(null);
  const [zoneChecking, setZoneChecking] = useState(false);

  const VERIFIED_PHONES_KEY = "@rawabi_verified_phones";
  const markPhoneVerified = async (phone: string) => {
    try {
      const raw = await AsyncStorage.getItem(VERIFIED_PHONES_KEY);
      const set: string[] = raw ? JSON.parse(raw) : [];
      if (!set.includes(phone)) {
        set.push(phone);
        await AsyncStorage.setItem(VERIFIED_PHONES_KEY, JSON.stringify(set));
      }
    } catch {}
  };

  const [otpStep, setOtpStep] = useState<"idle" | "sent" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // Skip OTP if phone was already verified in a previous session
  useEffect(() => {
    if (!user?.phone) return;
    AsyncStorage.getItem(VERIFIED_PHONES_KEY).then((raw) => {
      if (!raw) return;
      const set: string[] = JSON.parse(raw);
      if (set.includes(user.phone)) setOtpStep("verified");
    }).catch(() => {});
  }, [user?.phone]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef  = useRef(false); // sync guard — prevents double-submit before loading state re-renders

  const [forOtherExpanded, setForOtherExpanded] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [otherPhone, setOtherPhone] = useState("");

  // ── Phone confirmation modal ───────────────────────────────────────────────
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);

  const isPhoneValid = (phone: string) => /^[0-9]{9,}$/.test(phone.replace(/\s|-/g, ""));

  const handleConfirmPhone = async () => {
    const cleaned = phoneInput.replace(/\s|-/g, "");
    if (!isPhoneValid(cleaned)) return;
    if (!user) return;
    setPhoneSaving(true);
    try {
      await saveUser({ ...user, phone: cleaned });
      setPhoneModalVisible(false);
    } finally {
      setPhoneSaving(false);
    }
  };

  // ── Cooldown: check AsyncStorage on mount, countdown every second ─────────
  useEffect(() => {
    const startCooldown = (remainingMs: number) => {
      const secs = Math.ceil(remainingMs / 1000);
      setCooldownSeconds(secs);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setCooldownSeconds((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    AsyncStorage.getItem(LAST_ORDER_TS_KEY).then((val) => {
      if (!val) return;
      const last = parseInt(val, 10);
      if (isNaN(last)) return;
      const remaining = last + ORDER_COOLDOWN_MS - Date.now();
      if (remaining > 0) startCooldown(remaining);
    }).catch(() => {});

    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // ── Closed-hours toast ────────────────────────────────────────────────────
  const [closedMsg, setClosedMsg] = useState("");
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showClosedToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setClosedMsg(msg);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }, 5000);
  }, [toastAnim]);

  React.useEffect(() => {
    if (user?.phone) {
      apiGet<{ phone: string; balance: number }>(`/wallet?phone=${encodeURIComponent(user.phone)}`)
        .then((w) => setWalletBalance(w.balance))
        .catch(() => {});
    }
  }, [user?.phone]);

  // Auto-load saved coordinates from onboarding as exact location link
  React.useEffect(() => {
    if (user?.lat && user?.lng && !locationUrl) {
      setLocationUrl(`https://maps.google.com/?q=${user.lat},${user.lng}`);
    }
  }, [user?.lat, user?.lng]);

  const handleGetLocation = async () => {
    setLocationLoading(true);
    try {
      if (Platform.OS === "web") {
        if (!navigator.geolocation) {
          Alert.alert(isEn ? "Not Supported" : "غير مدعوم", isEn ? "Your browser does not support location." : "متصفحك لا يدعم تحديد الموقع");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const url = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
            setLocationUrl(url);
            setLocationLoading(false);
          },
          () => {
            Alert.alert(isEn ? "Location Failed" : "تعذّر التحديد", isEn ? "Please allow location access in your browser settings." : "يرجى السماح للمتصفح بالوصول للموقع من الإعدادات");
            setLocationLoading(false);
          }
        );
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(isEn ? "Permission Denied" : "الإذن مرفوض", isEn ? "Please allow location access in device settings." : "يرجى السماح للتطبيق بالوصول لموقعك من إعدادات الجهاز");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const url = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
      setLocationUrl(url);
    } catch {
      Alert.alert(isEn ? "Error" : "خطأ", isEn ? "Could not get location. Please try again." : "تعذّر تحديد الموقع، حاول مرة أخرى");
    } finally {
      setLocationLoading(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // ─── Check delivery zone whenever lat/lng or orderType changes ───────────────
  const effectiveLat = manualLat ?? user?.lat;
  const effectiveLng = manualLng ?? user?.lng;

  useEffect(() => {
    if (orderType !== "delivery" || !effectiveLat || !effectiveLng) {
      setZoneCheckResult(null);
      return;
    }
    let cancelled = false;
    setZoneChecking(true);
    apiGet<ZoneCheckResult>(`/delivery-zones/check?lat=${effectiveLat}&lng=${effectiveLng}`)
      .then((r) => { if (!cancelled) setZoneCheckResult(r); })
      .catch(() => { if (!cancelled) setZoneCheckResult(null); })
      .finally(() => { if (!cancelled) setZoneChecking(false); });
    return () => { cancelled = true; };
  }, [orderType, effectiveLat, effectiveLng]);

  // ─── Delivery fee: zone fee overrides global; null = not in any zone (use global) ───
  // zone.deliveryFee = 0 → explicitly free zone (user intent)
  // zoneFee = null     → no zone matched → fall back to global delivery fee
  const zoneFee = zoneCheckResult?.found && zoneCheckResult.zone
    ? zoneCheckResult.zone.deliveryFee / 100
    : null;
  // Zone fee always applies when in a zone (regardless of deliveryEnabled toggle).
  // deliveryEnabled only gates the global fallback fee when no zone is matched.
  const rawDeliveryFee = orderType === "delivery"
    ? (zoneFee !== null
        ? zoneFee
        : (paymentSettings.deliveryEnabled ? (paymentSettings.deliveryFee ?? 0) : 0))
    : 0;
  // Free delivery threshold: if totalPrice ≥ threshold → delivery is free
  const freeThreshold = paymentSettings.freeDeliveryThreshold ?? 0;
  const deliveryIsFree = freeThreshold > 0 && orderType === "delivery" && totalPrice >= freeThreshold;
  const deliveryFee = deliveryIsFree ? 0 : rawDeliveryFee;
  // Preview fee shown on the delivery button card (independent of selected orderType)
  const rawPreviewDeliveryFee = zoneFee !== null
    ? zoneFee
    : (paymentSettings.deliveryEnabled ? (paymentSettings.deliveryFee ?? 0) : 0);
  const previewDeliveryFee = (freeThreshold > 0 && totalPrice >= freeThreshold) ? 0 : rawPreviewDeliveryFee;
  const previewDeliveryFeeStr = previewDeliveryFee % 1 === 0 ? previewDeliveryFee.toString() : previewDeliveryFee.toFixed(2);
  const grandTotal = Math.max(0, totalPrice + deliveryFee - appliedDiscount);
  const grandTotalStr = grandTotal % 1 === 0 ? grandTotal.toString() : grandTotal.toFixed(2);
  const deliveryFeeStr = deliveryFee % 1 === 0 ? deliveryFee.toString() : deliveryFee.toFixed(2);

  const applyPromoCode = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) { setPromoError(isEn ? "Enter a code first" : "أدخل الكود أولاً"); return; }
    const base = totalPrice + deliveryFee;
    setPromoLoading(true);
    setPromoError("");
    try {
      const found = await apiPost<{ id: number; code: string; type: string; value: number; minOrder: number; description: string }>(
        "/discount-codes/validate",
        { code, orderTotal: base, phone: user?.phone ?? undefined },
      );
      const discount = found.type === "percentage"
        ? Math.round(base * found.value / 100)
        : found.value;
      setAppliedDiscount(Math.min(discount, base));
      setAppliedCodeLabel(found.description || found.code);
      setAppliedCodeId(found.id);
      setPromoInput("");
      setPromoExpanded(false);
    } catch (e: any) {
      setPromoError(e?.message || (isEn ? "Code not found or inactive" : "الكود غير صحيح أو غير فعّال"));
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setAppliedDiscount(0);
    setAppliedCodeLabel("");
    setAppliedCodeId(null);
    setPromoInput("");
    setPromoError("");
  };

  const handleSendOtp = async (): Promise<boolean> => {
    if (!user?.phone) return false;
    setOtpLoading(true);
    try {
      const r = await apiPost<{ ok: boolean; skipped?: boolean }>("/sms/send-otp", { phone: user.phone });
      if (r.skipped) { setOtpStep("verified"); markPhoneVerified(user.phone); return true; }
      setOtpStep("sent");
      setOtpCode("");
      return false;
    } catch {
      Alert.alert(isEn ? "Error" : "خطأ", isEn ? "Could not send code. Please try again." : "تعذر إرسال الرمز، حاول مرة أخرى.");
      return false;
    } finally {
      setOtpLoading(false);
    }
  };

  const submitOrder = async () => {
    if (submittingRef.current) return; // block any second tap before state re-renders
    if (!user) return;
    if (paymentMethod === "moyasar") {
      Alert.alert(isEn ? "Coming Soon" : "قريباً", isEn ? "Online payment will be available soon. Please choose Cash on Delivery." : "الدفع الإلكتروني سيكون متاحاً قريباً. يرجى اختيار الدفع عند الاستلام.", [{ text: isEn ? "OK" : "حسناً" }]);
      return;
    }
    if (paymentMethod === "wallet") {
      if (walletBalance === null || walletBalance < grandTotal) {
        Alert.alert(t("error"), t("insufficientBalance") + ` (${walletBalance ?? 0} ${t("sar")})`);
        return;
      }
    }
    submittingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    try {
      // ── فحص المخزون الطازج قبل الإرسال ────────────────────────────────────
      try {
        type FreshItem = { itemId: string; stock: number | null; available: boolean; name: string };
        const freshMenu = await apiGet<FreshItem[]>("/menu");
        const adjustments: string[] = [];
        for (const ci of items) {
          const fresh = freshMenu.find((m) => m.itemId === ci.item.id);
          if (!fresh || fresh.stock === null) continue;
          if (ci.quantity > fresh.stock) {
            if (fresh.stock === 0) {
              updateQuantity(ci.cartKey, 0); // remove from cart
              adjustments.push(isEn ? `"${ci.item.name}" is out of stock and was removed` : `"${ci.item.name}" نفد المخزون وتم إزالته`);
            } else {
              updateQuantity(ci.cartKey, fresh.stock); // reduce to available
              adjustments.push(isEn ? `"${ci.item.name}": reduced to ${fresh.stock} (available qty)` : `"${ci.item.name}": تم تعديل الكمية إلى ${fresh.stock} فقط`);
            }
          }
        }
        if (adjustments.length > 0) {
          setLoading(false);
          Alert.alert(
            isEn ? "Cart Updated" : "تم تعديل السلة",
            (isEn ? "Some items were adjusted:\n" : "تم تعديل بعض الأصناف:\n") + adjustments.join("\n"),
            [{ text: isEn ? "Review & Confirm" : "مراجعة وتأكيد" }]
          );
          return;
        }
      } catch { /* if stock check fails, let backend validate */ }

      // Wait up to 4 seconds for push token if not ready yet (fresh install race condition)
      let finalPushToken = customerPushToken;
      if (!finalPushToken) {
        finalPushToken = await Promise.race([
          registerCustomerNotifications(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
      }

      const order = await apiPost<Order>("/orders", {
        customerName: user.name,
        customerPhone: user.phone,
        customerAddress: orderType === "delivery" ? (locationUrl || user.address || null) : null,
        orderType,
        branchId:   selectedBranch?.id   ?? null,
        branchName: selectedBranch?.name ?? null,
        items: items.map((ci) => {
          const displayName = resolveCartItemName(ci.item.name, ci.customization);
          const parts = resolveCustomizationParts(ci.customization, displayName);
          return {
            id: ci.item.id,
            name: parts.length > 0 ? `${displayName} (${parts.join(" | ")})` : displayName,
            price: ci.unitPrice,
            quantity: ci.quantity,
            customization: ci.customization ? {
              size: ci.customization.size,
              riceType: ci.customization.riceType,
              addon: ci.customization.addon,
              variantId: ci.customization.variantId,
              variantName: ci.customization.variantName,
              variantPrice: ci.customization.variantPrice,
              unitPrice: ci.unitPrice,
              selectedOptions: ci.customization.selectedOptions,
            } : undefined,
          };
        }),
        totalPrice: grandTotal,
        deliveryFee,
        discountCode: appliedCodeLabel || null,
        discountAmount: appliedDiscount > 0 ? appliedDiscount : null,
        paymentMethod,
        notes: [
          orderType === "delivery"
            ? "🚗 توصيل"
            : selectedBranch
              ? `🏪 استلام من فرع: ${selectedBranch.name}`
              : "🏪 استلام من الفرع",
          paymentMethod === "wallet" ? "💰 محفظة" : null,
          appliedDiscount > 0 ? `🏷️ خصم ${appliedDiscount} ر.س (${appliedCodeLabel})` : null,
          forOtherExpanded && (otherName.trim() || otherPhone.trim())
            ? `👤 لشخص آخر: ${otherName.trim()} ${otherPhone.trim()}`.trim()
            : null,
          notes.trim() || null,
        ].filter(Boolean).join(" | ") || null,
        customerPushToken: finalPushToken ?? null,
      });
      if (paymentMethod === "wallet") {
        try {
          await apiPost("/wallet/pay", { phone: user.phone, amount: grandTotal, orderId: order.id });
          setWalletBalance((prev) => (prev !== null ? prev - grandTotal : null));
        } catch {}
      }
      // Record discount code usage (single-use per phone)
      if (appliedCodeId !== null && user.phone) {
        try {
          await apiPost("/discount-codes/use", { codeId: appliedCodeId, phone: user.phone, orderId: order.id });
        } catch {}
      }
      const storedOrder: StoredOrder = {
        id: order.id,
        dailyNumber: order.dailyNumber,
        createdAt: new Date().toISOString(),
        total: grandTotal,
        items: items.map((ci) => {
          const displayName = resolveCartItemName(ci.item.name, ci.customization);
          const parts = resolveCustomizationParts(ci.customization, displayName);
          return {
            name: parts.length > 0 ? `${displayName} (${parts.join(" | ")})` : displayName,
            quantity: ci.quantity,
          };
        }),
        customerName: user.name,
      };
      try {
        const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
        const prev: StoredOrder[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([storedOrder, ...prev]));
        incrementBadge();
      } catch {}
      clearCart();
      // Save timestamp to enforce cooldown on next order attempt
      try { await AsyncStorage.setItem(LAST_ORDER_TS_KEY, String(Date.now())); } catch {}
      router.replace({ pathname: "/order-confirmed", params: { orderId: String(order.id) } });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      Alert.alert(
        isEn ? "Error" : "خطأ",
        msg && msg !== `HTTP 409` && msg !== `HTTP 400`
          ? msg
          : isEn ? "Could not place order. Please try again." : "تعذر إرسال الطلب، يرجى المحاولة مرة أخرى."
      );
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleVerifyOtp = async () => {
    if (!user?.phone || otpCode.length !== 4) return;
    setOtpLoading(true);
    try {
      await apiPost("/sms/verify-otp", { phone: user.phone, code: otpCode });
      setOtpStep("verified");
      setOtpCode("");
      markPhoneVerified(user.phone);
      await submitOrder();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "الرمز غير صحيح";
      Alert.alert("خطأ", msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!user) return;
    if (items.length === 0) return;

    // ── تحقق من اختيار فرع الاستلام ─────────────────────────────────────────
    if (orderType === "pickup" && branches.length > 0 && !selectedBranch) {
      setBranchModalVisible(true);
      return;
    }

    // ── الحد الأدنى للطلب ──────────────────────────────────────────────────────
    if (totalPrice < 15) {
      Alert.alert(
        isEn ? "Minimum Order" : "الحد الأدنى للطلب",
        isEn ? "Minimum order amount is 15 SAR." : "الحد الأدنى للطلب 15 ر.س.",
        [{ text: isEn ? "OK" : "حسناً" }],
      );
      return;
    }

    // ── تحقق من صحة رقم الجوال قبل المتابعة ─────────────────────────────────
    if (!isPhoneValid(user.phone)) {
      setPhoneInput("");
      setPhoneModalVisible(true);
      return;
    }

    // ── تحقق من منطقة التوصيل ──────────────────────────────────────────────
    if (orderType === "delivery" && effectiveLat && effectiveLng) {
      let check = zoneCheckResult;
      if (!check) {
        try {
          check = await apiGet<ZoneCheckResult>(`/delivery-zones/check?lat=${effectiveLat}&lng=${effectiveLng}`);
          setZoneCheckResult(check);
        } catch {}
      }
      if (check && check.hasZones && !check.found) {
        Alert.alert(
          isEn ? "Outside Delivery Zone" : "خارج نطاق التوصيل",
          isEn
            ? "Sorry, your location is outside our delivery zones. Please choose a different address or pick up from the branch."
            : "عذراً، موقعك خارج نطاق مناطق التوصيل المتاحة. يرجى اختيار موقع آخر أو الاستلام من الفرع.",
          [{ text: isEn ? "OK" : "حسناً" }],
        );
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        return;
      }
      // Minimum order check per zone
      if (check?.found && check.zone && check.zone.minOrder > 0) {
        const minOrderSAR = check.zone.minOrder / 100;
        if (totalPrice < minOrderSAR) {
          Alert.alert(
            isEn ? "Minimum Order" : "الحد الأدنى للطلب",
            isEn
              ? `Minimum order for ${check.zone.name} is ${minOrderSAR.toFixed(0)} SAR.`
              : `الحد الأدنى للطلب في منطقة "${check.zone.name}" هو ${minOrderSAR.toFixed(0)} ر.س.`,
            [{ text: isEn ? "OK" : "حسناً" }],
          );
          return;
        }
      }
    }

    try {
      const branchStatus = await apiGet<{ isOpen: boolean; message: string | null }>("/branch-status");
      if (!branchStatus.isOpen) {
        const msg = branchStatus.message ?? (isEn ? "Outside working hours — ordering is unavailable now." : "خارج أوقات العمل — لا يمكن الطلب الآن");
        showClosedToast(msg);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        return;
      }
    } catch {}
    if (otpStep !== "verified") {
      try {
        const smsSettings = await apiGet<{ enabled: boolean }>("/sms-settings");
        if (smsSettings.enabled) {
          const skipped = await handleSendOtp();
          if (!skipped) return;
        }
      } catch {}
    }
    await submitOrder();
  };

  const GOLD = colors.gold;
  const { values: d } = useUIDensity();
  const dyn = {
    card: { marginHorizontal: d.cardMH, marginTop: d.cardMT, borderRadius: d.radius } as const,
    row:  { paddingVertical: d.rowPV, paddingHorizontal: d.rowPH } as const,
    lbl:  { fontSize: d.labelSize } as const,
    val:  { fontSize: d.valueSize } as const,
    typ:  { paddingVertical: d.typePV, borderRadius: d.radius } as const,
    sec:  { paddingTop: d.sectionPT } as const,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isModern && colors.isLight ? "dark-content" : "light-content"} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topInset + 10, borderBottomColor: colors.border }]}>
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.bold }]}>
          {isEn ? "Checkout" : "الدفع"}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 160 }}>

        {/* ── Delivery / Pickup toggle — always visible ── */}
        <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 6 }]}>
          <View style={{ flexDirection: I18nManager.isRTL ? "row" : "row-reverse", gap: 6 }}>
            <TouchableOpacity
              onPress={() => { setOrderType("delivery"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
              style={[
                styles.orderTypeBtn,
                orderType === "delivery" && { backgroundColor: colors.primary, borderColor: colors.primary },
                orderType !== "delivery" && { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Text style={{ fontSize: 22 }}>🚗</Text>
              <Text style={[styles.orderTypeBtnLabel, { color: orderType === "delivery" ? "#fff" : colors.foreground, fontFamily: F.bold }]}>
                {isEn ? "Delivery" : "توصيل"}
              </Text>
              {zoneChecking ? (
                <Text style={{ color: orderType === "delivery" ? "#ffee99" : colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                  {"..."}
                </Text>
              ) : previewDeliveryFee > 0 ? (
                <Text style={{ color: orderType === "delivery" ? "#ffee99" : colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                  +{previewDeliveryFeeStr} {isEn ? "SAR" : "ر.س"}
                </Text>
              ) : (
                <Text style={{ color: orderType === "delivery" ? "#ccffcc" : (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.semi, fontSize: 12 }}>
                  {isEn ? "Free" : "مجاني"}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setOrderType("pickup");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (branches.length > 0) setBranchModalVisible(true);
              }}
              activeOpacity={0.8}
              style={[
                styles.orderTypeBtn,
                orderType === "pickup" && { backgroundColor: (colors.isModern ? colors.successBg : "#1A4A1A"), borderColor: (colors.isModern ? colors.success : "#4CAF50") },
                orderType !== "pickup" && { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Text style={{ fontSize: 22 }}>🏪</Text>
              <Text style={[styles.orderTypeBtnLabel, { color: orderType === "pickup" ? (colors.isModern ? colors.success : "#4CAF50") : colors.foreground, fontFamily: F.bold }]}>
                {isEn ? "Pickup" : "استلام"}
              </Text>
              <Text style={{ color: orderType === "pickup" ? "#90EE90" : (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.semi, fontSize: 12 }}>
                {isEn ? "No fee" : "بدون رسوم"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Branch status card (when pickup selected) ── */}
        {orderType === "pickup" && (
          <TouchableOpacity
            activeOpacity={branches.length > 0 ? 0.8 : 1}
            onPress={() => branches.length > 0 && setBranchModalVisible(true)}
            style={[styles.listCard, dyn.card, {
              backgroundColor: colors.card,
              borderColor: selectedBranch ? (colors.isModern ? colors.success : "#4CAF50") : (branches.length === 0 ? colors.border : colors.primary + "60"),
              padding: 14,
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 12,
            }]}
          >
            <Text style={{ fontSize: 22 }}>🏪</Text>
            <View style={{ flex: 1 }}>
              {branches.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
                  {isEn ? "No branches available" : "لا توجد فروع متاحة حالياً"}
                </Text>
              ) : selectedBranch ? (
                <>
                  <Text style={{ color: (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                    {selectedBranch.name}
                  </Text>
                  {selectedBranch.address ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", marginTop: 2 }}>
                      {selectedBranch.address}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: colors.primary, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
                  {isEn ? "Tap to choose pickup branch" : "اضغط لاختيار فرع الاستلام"}
                </Text>
              )}
            </View>
            {branches.length > 0 && (
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                {selectedBranch ? (isEn ? "Change" : "تغيير") : "›"}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* ── Zone check badge ── */}
        {orderType === "delivery" && effectiveLat && effectiveLng && (
          <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
            {zoneChecking ? (
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={colors.gold} />
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>جارٍ التحقق من منطقة التوصيل…</Text>
              </View>
            ) : zoneCheckResult && zoneCheckResult.hasZones ? (
              zoneCheckResult.found && zoneCheckResult.zone ? (
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>✅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>
                      {zoneCheckResult.zone.name}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                      {zoneCheckResult.zone.deliveryFee > 0
                        ? `رسوم التوصيل: ${(zoneCheckResult.zone.deliveryFee / 100).toFixed(2)} ر.س`
                        : "توصيل مجاني لهذه المنطقة"}
                      {zoneCheckResult.zone.minOrder > 0 && ` • حد أدنى: ${(zoneCheckResult.zone.minOrder / 100).toFixed(0)} ر.س`}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <Text style={{ color: (colors.isModern ? colors.danger : "#E57373"), fontFamily: F.bold, fontSize: 13, flex: 1, textAlign: "right" }}>
                    موقعك خارج نطاق التوصيل — جرّب موقعاً آخر أو اختر استلام من الفرع
                  </Text>
                </View>
              )
            ) : null}
          </View>
        )}

        {/* ── Customer info section ── */}
        <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Name row */}
          <View style={[styles.listRow, dyn.row]}>
            <Text style={[styles.rowValue, dyn.val, { color: colors.foreground, fontFamily: F.semi }]}>
              {user?.name}
            </Text>
            <View style={styles.rowLeft}>
              <Feather name="user" size={16} color={colors.mutedForeground} />
              <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                {isEn ? "Name" : "الاسم"}
              </Text>
            </View>
          </View>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

          {/* Phone row */}
          <View style={[styles.listRow, dyn.row]}>
            <Text style={[styles.rowValue, dyn.val, { color: colors.foreground, fontFamily: F.semi }]}>
              {user?.phone}
            </Text>
            <View style={styles.rowLeft}>
              <Feather name="phone" size={16} color={colors.mutedForeground} />
              <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                {isEn ? "Phone" : "الجوال"}
              </Text>
            </View>
          </View>

          {/* Address row — if available */}
          {user?.address && user.address !== "غير محدد" && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={[styles.listRow, dyn.row]}>
                <Text style={[styles.rowValue, dyn.val, { color: colors.foreground, fontFamily: F.semi }]} numberOfLines={1}>
                  {user.address}
                </Text>
                <View style={styles.rowLeft}>
                  <Feather name="map-pin" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                    {isEn ? "Address" : "العنوان"}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>


        {/* ── Location row ── */}
        {orderType === "delivery" && (
          <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: locationUrl ? "#2A5A2A" : colors.border }]}>
            {locationUrl ? (
              <>
                <View style={[styles.listRow, dyn.row]}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setLocationUrl(null)}
                      style={[styles.locActionBtn, { backgroundColor: (colors.isModern ? colors.dangerBg : "#3A1A1A") }]}
                    >
                      <Feather name="x" size={13} color={(colors.isModern ? colors.danger : "#E57373")} />
                      <Text style={{ color: (colors.isModern ? colors.danger : "#E57373"), fontFamily: F.bold, fontSize: 12 }}>
                        {isEn ? "Remove" : "إزالة"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const cur = manualLat ?? user?.lat;
                        const cln = manualLng ?? user?.lng;
                        setManualLat(cur);
                        setManualLng(cln);
                        setMapPickerVisible(true);
                      }}
                      style={[styles.locActionBtn, { backgroundColor: colors.isModern ? colors.purpleBg : "#1A1A3A" }]}
                    >
                      <Feather name="map" size={13} color={colors.isModern ? colors.purple : "#CE93D8"} />
                      <Text style={{ color: colors.isModern ? colors.purple : "#CE93D8", fontFamily: F.bold, fontSize: 12 }}>
                        {isEn ? "Adjust" : "تعديل"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(locationUrl)}
                      style={[styles.locActionBtn, { backgroundColor: colors.isModern ? colors.infoBg : "#1A2A3A" }]}
                    >
                      <Feather name="external-link" size={13} color={colors.isModern ? colors.info : "#64B5F6"} />
                      <Text style={{ color: colors.isModern ? colors.info : "#64B5F6", fontFamily: F.bold, fontSize: 12 }}>
                        {isEn ? "View" : "عرض"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.rowLeft}>
                    <Feather name="map-pin" size={16} color={(colors.isModern ? colors.success : "#4CAF50")} />
                    <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                      {isEn ? "Location" : "الموقع"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.locConfirmed, { backgroundColor: (colors.isModern ? colors.successBg : "#1A3A1A") }]}>
                  <Feather name="check-circle" size={14} color={(colors.isModern ? colors.success : "#4CAF50")} />
                  <Text style={{ color: (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.semi, fontSize: 13 }}>
                    {isEn ? "Location confirmed ✓" : "تم تحديد موقعك ✓"}
                  </Text>
                </View>
              </>
            ) : (
              <View>
                <View style={[styles.listRow, dyn.row]}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={handleGetLocation}
                      disabled={locationLoading}
                      style={[styles.locActionBtn, { backgroundColor: colors.isModern ? colors.successBg : "#1A2A1A", opacity: locationLoading ? 0.6 : 1 }]}
                      activeOpacity={0.7}
                    >
                      {locationLoading
                        ? <ActivityIndicator size="small" color={colors.isModern ? colors.success : "#81C784"} />
                        : <Feather name="crosshair" size={13} color={colors.isModern ? colors.success : "#81C784"} />}
                      <Text style={{ color: colors.isModern ? colors.success : "#81C784", fontFamily: F.bold, fontSize: 12 }}>
                        {isEn ? "Auto" : "تلقائي"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setManualLat(user?.lat);
                        setManualLng(user?.lng);
                        setMapPickerVisible(true);
                      }}
                      style={[styles.locActionBtn, { backgroundColor: colors.isModern ? colors.purpleBg : "#1A1A3A" }]}
                      activeOpacity={0.7}
                    >
                      <Feather name="map" size={13} color={colors.isModern ? colors.purple : "#CE93D8"} />
                      <Text style={{ color: colors.isModern ? colors.purple : "#CE93D8", fontFamily: F.bold, fontSize: 12 }}>
                        {isEn ? "Manual" : "خريطة"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.rowLeft}>
                    <Feather name="map-pin" size={16} color={colors.mutedForeground} />
                    <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                      {isEn ? "Location" : "الموقع"}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right", paddingHorizontal: 14, paddingBottom: 10 }}>
                  {isEn ? "Share your location for precise delivery" : "حدد موقعك للتوصيل الدقيق"}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Estimated time row ── */}
        {(!paymentSettings.deliveryEnabled || orderType === "delivery" || orderType === "pickup") && (
          <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.listRow, dyn.row]}>
              <Text style={[styles.rowValue, dyn.val, { color: GOLD, fontFamily: F.bold }]}>
                {orderType === "delivery" ? "~ 45 – 60 دقيقة" : "~ 15 – 20 دقيقة"}
              </Text>
              <View style={styles.rowLeft}>
                <Feather name="clock" size={16} color={colors.mutedForeground} />
                <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                  {isEn ? "Est. prep / delivery time" : "الوقت المتوقع للتجهيز والتوصيل"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Notes row ── */}
        <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.listRow, dyn.row]}
            onPress={() => setNotesExpanded(!notesExpanded)}
            activeOpacity={0.7}
          >
            <Feather name={notesExpanded ? "chevron-up" : "chevron-left"} size={16} color={colors.mutedForeground} />
            <View style={styles.rowLeft}>
              <Feather name="edit-3" size={16} color={colors.mutedForeground} />
              <Text style={[styles.rowLabel, dyn.lbl, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                {isEn ? "Notes" : "ملاحظة"}
              </Text>
            </View>
          </TouchableOpacity>
          {notesExpanded && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={isEn ? "Any notes about your order..." : "أي ملاحظات على طلبك..."}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                style={[styles.notesInput, { color: colors.foreground, backgroundColor: colors.secondary, fontFamily: F.regular }]}
                textAlignVertical="top"
              />
            </>
          )}
        </View>

        {/* ── Order for someone else ── */}
        <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: forOtherExpanded ? GOLD + "60" : colors.border }]}>
          <TouchableOpacity
            style={[styles.listRow, dyn.row]}
            onPress={() => setForOtherExpanded(!forOtherExpanded)}
            activeOpacity={0.7}
          >
            <Feather name={forOtherExpanded ? "chevron-up" : "chevron-left"} size={16} color={forOtherExpanded ? GOLD : colors.mutedForeground} />
            <View style={styles.rowLeft}>
              <Feather name="user-plus" size={16} color={forOtherExpanded ? GOLD : colors.mutedForeground} />
              <Text style={[styles.rowLabel, dyn.lbl, { color: forOtherExpanded ? GOLD : colors.mutedForeground, fontFamily: forOtherExpanded ? F.bold : F.regular }]}>
                {isEn ? "Order for someone else" : "الطلب لشخص آخر"}
              </Text>
            </View>
          </TouchableOpacity>
          {forOtherExpanded && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
                <TextInput
                  value={otherName}
                  onChangeText={setOtherName}
                  placeholder={isEn ? "Recipient's name" : "اسم المستلم"}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.otherInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border, fontFamily: F.regular }]}
                  textAlign="right"
                  returnKeyType="next"
                />
                <TextInput
                  value={otherPhone}
                  onChangeText={setOtherPhone}
                  placeholder={isEn ? "Recipient's phone" : "جوال المستلم"}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  style={[styles.otherInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border, fontFamily: F.regular }]}
                  textAlign="right"
                />
              </View>
            </>
          )}
        </View>

        {/* ── Promo Code ── */}
        <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: appliedDiscount > 0 ? (colors.isModern ? colors.success + "60" : "#22C55E60") : colors.border }]}>
          {appliedDiscount > 0 ? (
            <View style={[styles.listRow, dyn.row]}>
              <TouchableOpacity onPress={removePromo} style={[styles.locActionBtn, { backgroundColor: (colors.isModern ? colors.dangerBg : "#3A1A1A") }]}>
                <Feather name="x" size={13} color={(colors.isModern ? colors.danger : "#E57373")} />
                <Text style={{ color: (colors.isModern ? colors.danger : "#E57373"), fontFamily: F.bold, fontSize: 12 }}>{isEn ? "Remove" : "إزالة"}</Text>
              </TouchableOpacity>
              <View style={styles.rowLeft}>
                <Feather name="tag" size={16} color={(colors.isModern ? colors.success : "#22C55E")} />
                <Text style={[styles.rowLabel, dyn.lbl, { color: (colors.isModern ? colors.success : "#22C55E"), fontFamily: F.bold }]}>{appliedCodeLabel}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setPromoExpanded(!promoExpanded)}
              activeOpacity={0.75}
              style={{ marginHorizontal: 14, marginVertical: 12 }}
            >
              {promoExpanded ? (
                <View style={[styles.listRow, { paddingHorizontal: 0, paddingVertical: 4 }]}>
                  <Feather name="chevron-up" size={16} color={GOLD} />
                  <View style={styles.rowLeft}>
                    <Feather name="tag" size={16} color={GOLD} />
                    <Text style={[styles.rowLabel, dyn.lbl, { color: GOLD, fontFamily: F.bold }]}>
                      {isEn ? "Promo Code" : "كود الخصم"}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={{
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: GOLD,
                  borderRadius: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                  alignItems: "center",
                }}>
                  <Text style={{ color: GOLD, fontFamily: F.semi, fontSize: 14 }}>
                    {isEn ? "Add Promo or Coupon Code" : "إضافة كود خصم أو كوبون"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          {promoExpanded && appliedDiscount === 0 && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TextInput
                    value={promoInput}
                    onChangeText={(v) => { setPromoInput(v); setPromoError(""); }}
                    placeholder={isEn ? "Enter code" : "أدخل الكود"}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="characters"
                    style={[styles.otherInput, { flex: 1, color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border, fontFamily: F.bold, letterSpacing: 2 }]}
                    textAlign="right"
                    returnKeyType="done"
                    onSubmitEditing={applyPromoCode}
                  />
                  <TouchableOpacity
                    onPress={applyPromoCode}
                    disabled={promoLoading}
                    style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: GOLD, borderRadius: 10, justifyContent: "center", opacity: promoLoading ? 0.6 : 1 }}
                  >
                    {promoLoading
                      ? <ActivityIndicator size="small" color={(colors.isModern ? colors.background : "#1A0A00")} />
                      : <Text style={{ color: (colors.isModern ? colors.background : "#1A0A00"), fontFamily: F.extra, fontSize: 13 }}>{isEn ? "Apply" : "تطبيق"}</Text>
                    }
                  </TouchableOpacity>
                </View>
                {promoError ? (
                  <Text style={{ color: (colors.isModern ? colors.danger : "#E57373"), fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>{promoError}</Text>
                ) : null}
              </View>
            </>
          )}
        </View>

        {/* ── Price breakdown ── */}
        <View style={[styles.listCard, dyn.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, dyn.sec, { color: colors.mutedForeground, fontFamily: F.semi }]}>
            {isEn ? "Order Summary" : "ملخص الطلب"}
          </Text>

          {/* Items */}
          {items.map((ci) => {
            const lineTotal = ci.item.price * ci.quantity;
            const lineTotalStr = lineTotal % 1 === 0 ? lineTotal.toString() : lineTotal.toFixed(1);
            const name = isEn && ci.item.nameEn ? ci.item.nameEn : resolveCartItemName(ci.item.name, ci.customization);
            return (
              <React.Fragment key={ci.cartKey}>
                <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                <View style={[styles.listRow, dyn.row]}>
                  <Text style={[styles.rowValue, dyn.val, { color: colors.mutedForeground, fontFamily: F.bold }]}>
                    {lineTotalStr} {isEn ? "SAR" : "ر.س"}
                  </Text>
                  <Text style={[styles.rowLabel, dyn.lbl, { color: colors.foreground, fontFamily: F.semi, flex: 1, textAlign: "right" }]} numberOfLines={1}>
                    {name} × {ci.quantity}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}

          {/* ── VAT breakdown ── */}
          <View style={[styles.totalLine, { backgroundColor: colors.border }]} />

          {/* مبلغ الطلب بدون الضريبة */}
          <View style={[styles.listRow, dyn.row]}>
            <Text style={[styles.rowValue, dyn.val, { color: colors.mutedForeground, fontFamily: F.bold }]}>
              {(totalPrice / 1.15).toFixed(2)} {isEn ? "SAR" : "ر.س"}
            </Text>
            <Text style={[styles.rowLabel, dyn.lbl, { color: colors.foreground, fontFamily: F.semi }]}>
              {isEn ? "Subtotal (excl. VAT)" : "مبلغ الطلب بدون الضريبة"}
            </Text>
          </View>

          {/* رسوم التوصيل بدون الضريبة */}
          <View style={[styles.listRow, { paddingHorizontal: dyn.row.paddingHorizontal, paddingVertical: 6 }]}>
            <Text style={[styles.rowValue, dyn.val, { color: deliveryFee > 0 ? colors.mutedForeground : (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.bold }]}>
              {deliveryFee > 0 ? (deliveryFee / 1.15).toFixed(2) : "0"} {isEn ? "SAR" : "ر.س"}
            </Text>
            <Text style={[styles.rowLabel, dyn.lbl, { color: colors.foreground, fontFamily: F.semi }]}>
              {isEn ? "Delivery (excl. VAT)" : "رسوم التوصيل بدون الضريبة"}
            </Text>
          </View>

          {/* خصم الكود */}
          {appliedDiscount > 0 && (
            <View style={[styles.listRow, { paddingHorizontal: dyn.row.paddingHorizontal, paddingVertical: 6 }]}>
              <Text style={[styles.rowValue, dyn.val, { color: (colors.isModern ? colors.success : "#22C55E"), fontFamily: F.bold }]}>
                -{appliedDiscount % 1 === 0 ? appliedDiscount : appliedDiscount.toFixed(2)} {isEn ? "SAR" : "ر.س"}
              </Text>
              <Text style={[styles.rowLabel, dyn.lbl, { color: (colors.isModern ? colors.success : "#22C55E"), fontFamily: F.semi }]}>
                🏷️ {isEn ? "Discount" : "خصم الكود"}
              </Text>
            </View>
          )}

          {/* الضريبة 15% */}
          <View style={[styles.listRow, { paddingHorizontal: dyn.row.paddingHorizontal, paddingVertical: 6 }]}>
            <Text style={[styles.rowValue, dyn.val, { color: colors.mutedForeground, fontFamily: F.bold }]}>
              {(grandTotal - grandTotal / 1.15).toFixed(2)} {isEn ? "SAR" : "ر.س"}
            </Text>
            <Text style={[styles.rowLabel, dyn.lbl, { color: colors.foreground, fontFamily: F.semi }]}>
              {isEn ? "VAT 15% ∨" : "الضريبة 15% ∨"}
            </Text>
          </View>

          {/* المجموع الضريبة مشمولة */}
          <View style={[styles.totalLine, { backgroundColor: colors.border }]} />
          <View style={[styles.listRow, dyn.row]}>
            <Text style={[styles.grandTotal, { color: GOLD, fontFamily: F.extra }]}>
              {grandTotalStr} {isEn ? "SAR" : "ر.س"}
            </Text>
            <Text style={[styles.rowLabel, dyn.lbl, { color: colors.foreground, fontFamily: F.bold }]}>
              {isEn ? "Total (VAT incl.)" : "المجموع الضريبة مشمولة"}
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Bottom submit bar ── */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomInset + 8 }]}>
        <TouchableOpacity
          style={styles.paymentSummaryRow}
          onPress={() => setPaymentPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          <View style={styles.paymentSummaryContent}>
            <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14 }}>
              {paymentMethod === "moyasar"
                ? (isEn ? "Online payment" : "دفع إلكتروني")
                : (isEn ? "Cash" : "نقدًا")}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>
              {isEn ? "Payment method" : "طريقة الدفع"}
            </Text>
          </View>
        </TouchableOpacity>
        {cooldownSeconds > 0 ? (
          <View style={[styles.submitBtn, { backgroundColor: colors.isModern ? colors.successBg : "#1A2A1A", alignItems: "center", justifyContent: "center", gap: 4 }]}>
            <Text style={{ color: (colors.isModern ? colors.success : "#4CAF50"), fontFamily: F.extra, fontSize: 14, textAlign: "center" }}>
              ✅ {isEn ? "Order pending!" : "طلبك السابق قيد الانتظار"}
            </Text>
            <Text style={{ color: colors.isModern ? colors.mutedForeground : "#7A9A7A", fontFamily: F.regular, fontSize: 12, textAlign: "center" }}>
              {isEn ? `Reorder in ${cooldownSeconds}s` : `متاح بعد ${cooldownSeconds} ث`}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
            <TouchableOpacity
              onPress={handlePlaceOrder}
              disabled={loading}
              style={[styles.submitBtn, { flex: 1, backgroundColor: GOLD, opacity: loading ? 0.7 : 1 }]}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitText, { fontFamily: F.bold, textAlign: "center" }]}>
                  {isEn ? "Place Order" : "إرسال الطلب"}
                </Text>
              )}
            </TouchableOpacity>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: GOLD, fontFamily: F.extra, fontSize: 18 }}>
                {grandTotalStr}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                {isEn ? "SAR" : "ر.س"}
              </Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={{ alignItems: "center", paddingTop: 8 }} activeOpacity={0.7}>
          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
            {isEn ? "Cancellation Policy" : "سياسة الإلغاء"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Closed-hours toast ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: bottomInset + 110,
          left: 16,
          right: 16,
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }}
      >
        <View style={{
          backgroundColor: colors.isModern ? colors.purpleBg : "#2D0A6E",
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 18,
          flexDirection: "row-reverse",
          alignItems: "center",
          gap: 12,
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
          borderWidth: 1,
          borderColor: colors.isModern ? colors.purple : "#6A30CC",
        }}>
          <Text style={{ fontSize: 24 }}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.isModern ? colors.foreground : "#FFFFFF", fontFamily: F.extra, fontSize: 13, textAlign: "right", marginBottom: 2 }}>
              {isEn ? "Outside Working Hours" : "خارج أوقات العمل"}
            </Text>
            <Text style={{ color: colors.isModern ? colors.purple : "#C4A8FF", fontFamily: F.semi, fontSize: 12, textAlign: "right", lineHeight: 18 }}>
              {closedMsg}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* ── Phone Confirmation Modal ── */}
      {phoneModalVisible && (
        <KeyboardAvoidingView
          style={styles.otpOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "android" ? 24 : 0}
        >
          <View style={[styles.otpSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.otpTitle, { color: GOLD, fontFamily: F.extra }]}>
              📱 {isEn ? "Confirm Your Number" : "تأكيد رقم الجوال"}
            </Text>
            <Text style={[styles.otpSubtitle, { color: colors.mutedForeground, fontFamily: F.regular }]}>
              {isEn
                ? "Your phone number needs to be updated before placing an order."
                : "رقم جوالك يحتاج تحديث قبل إتمام الطلب"}
            </Text>
            <TextInput
              value={phoneInput}
              onChangeText={(t) => setPhoneInput(t.replace(/[^0-9]/g, "").slice(0, 13))}
              placeholder={isEn ? "05XXXXXXXX" : "05XXXXXXXX"}
              placeholderTextColor={colors.border}
              keyboardType="phone-pad"
              autoFocus
              style={[
                styles.otpInput,
                {
                  backgroundColor: colors.secondary,
                  color: colors.foreground,
                  borderColor: isPhoneValid(phoneInput) ? GOLD : colors.border,
                  fontSize: 22,
                  letterSpacing: 4,
                  fontFamily: F.bold,
                },
              ]}
            />
            <TouchableOpacity
              onPress={handleConfirmPhone}
              disabled={!isPhoneValid(phoneInput) || phoneSaving}
              style={[
                styles.otpVerifyBtn,
                {
                  backgroundColor: isPhoneValid(phoneInput) ? GOLD : colors.secondary,
                  opacity: isPhoneValid(phoneInput) ? 1 : 0.5,
                },
              ]}
            >
              {phoneSaving
                ? <ActivityIndicator color={colors.background} />
                : <Text style={{ color: colors.background, fontFamily: F.bold, fontSize: 16 }}>
                    ✅ {isEn ? "Save & Continue" : "حفظ ومتابعة"}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPhoneModalVisible(false)}
              style={{ alignItems: "center" }}
            >
              <Text style={{ color: colors.destructive, fontFamily: F.regular, fontSize: 13 }}>
                {isEn ? "Cancel" : "إلغاء"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* OTP Overlay */}
      {otpStep === "sent" && (
        <KeyboardAvoidingView
          style={styles.otpOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "android" ? 24 : 0}
        >
          <View style={[styles.otpSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.otpTitle, { color: GOLD, fontFamily: F.extra }]}>
              📱 {isEn ? "Verify Your Number" : "التحقق من رقمك"}
            </Text>
            <Text style={[styles.otpSubtitle, { color: colors.mutedForeground, fontFamily: F.regular }]}>
              {isEn ? "A 4-digit code was sent to" : "تم إرسال رمز إلى"}{"\n"}
              <Text style={{ color: colors.foreground, fontFamily: F.bold }}>{user?.phone}</Text>
            </Text>
            <TextInput
              value={otpCode}
              onChangeText={(t) => setOtpCode(t.replace(/\D/g, "").slice(0, 4))}
              placeholder="• • • •"
              placeholderTextColor={colors.border}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              style={[styles.otpInput, { backgroundColor: colors.secondary, color: GOLD, borderColor: otpCode.length === 4 ? GOLD : colors.border }]}
            />
            <TouchableOpacity
              onPress={handleVerifyOtp}
              disabled={otpCode.length !== 4 || otpLoading}
              style={[styles.otpVerifyBtn, { backgroundColor: otpCode.length === 4 ? GOLD : colors.secondary, opacity: otpCode.length === 4 ? 1 : 0.5 }]}
            >
              {otpLoading
                ? <ActivityIndicator color={colors.background} />
                : <Text style={[{ color: colors.background, fontFamily: F.bold, fontSize: 16 }]}>
                    ✅ {isEn ? "Verify & Place Order" : "تحقق وأكمل الطلب"}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendOtp} disabled={otpLoading} style={{ alignItems: "center" }}>
              <Text style={[{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }]}>
                {isEn ? "Didn't receive the code? Resend" : "لم تصلك الرسالة؟ أعد الإرسال"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                setOtpStep("verified");
                if (user?.phone) {
                  markPhoneVerified(user.phone);
                  // Mark on server so this device and all future devices skip OTP
                  apiPost("/sms/mark-verified", { phone: user.phone }).catch(() => {});
                }
                await submitOrder();
              }}
              disabled={otpLoading}
              style={{ alignItems: "center", paddingVertical: 4 }}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>
                {isEn ? "Skip verification →" : "تخطي التحقق ←"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOtpStep("idle")} style={{ alignItems: "center" }}>
              <Text style={[{ color: colors.destructive, fontFamily: F.regular, fontSize: 13 }]}>
                {isEn ? "Cancel" : "إلغاء"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── Payment Method Picker Sheet ── */}
      {paymentPickerVisible && (
        <View style={styles.otpOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setPaymentPickerVisible(false)} activeOpacity={1} />
          <View style={[styles.otpSheet, { backgroundColor: colors.card, gap: 0, paddingTop: 14 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border, alignSelf: "center" }]} />
            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18, textAlign: "center", paddingVertical: 14, paddingHorizontal: 20 }}>
              {isEn ? "Payment Method" : "طريقة الدفع"}
            </Text>

            {/* Cash */}
            <TouchableOpacity
              style={[styles.payPickerRow, { borderTopWidth: 1, borderColor: colors.border }, paymentMethod === "cash" && { backgroundColor: GOLD + "18" }]}
              onPress={() => { setPaymentMethod("cash"); setPaymentPickerVisible(false); }}
              activeOpacity={0.75}
            >
              <Text style={{ color: paymentMethod === "cash" ? GOLD : colors.mutedForeground, fontFamily: F.extra, fontSize: 18 }}>
                {paymentMethod === "cash" ? "✓" : ""}
              </Text>
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                {isEn ? "Cash" : "نقدًا"}
              </Text>
            </TouchableOpacity>

            {/* Online payment */}
            <TouchableOpacity
              style={[styles.payPickerRow, { borderTopWidth: 1, borderColor: colors.border }, paymentMethod === "moyasar" && { backgroundColor: GOLD + "18" }]}
              onPress={() => { setPaymentMethod("moyasar"); setPaymentPickerVisible(false); }}
              activeOpacity={0.75}
            >
              <Text style={{ color: paymentMethod === "moyasar" ? GOLD : colors.mutedForeground, fontFamily: F.extra, fontSize: 18 }}>
                {paymentMethod === "moyasar" ? "✓" : ""}
              </Text>
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                {isEn ? "Online payment" : "دفع إلكتروني"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Branch Picker Modal ── */}
      <BranchPickerModal
        visible={branchModalVisible}
        branches={branches}
        selected={selectedBranch}
        userLat={effectiveLat}
        userLng={effectiveLng}
        onSelect={setSelectedBranch}
        onConfirm={b => { setSelectedBranch(b); setBranchModalVisible(false); }}
        onClose={() => setBranchModalVisible(false)}
        colors={colors}
        fontFamily={F}
        isEn={isEn}
      />

      {/* ── Map Picker Modal ── */}
      <MapPickerModal
        visible={mapPickerVisible}
        initialLat={manualLat ?? user?.lat}
        initialLng={manualLng ?? user?.lng}
        onConfirm={(lat, lng, url) => {
          setManualLat(lat);
          setManualLng(lng);
          setLocationUrl(url);
          setMapPickerVisible(false);
        }}
        onClose={() => setMapPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20 },

  listCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    textAlign: "right",
  },
  rowValue: {
    fontSize: 14,
    textAlign: "left",
  },
  rowDivider: { height: 1 },

  typeToggle: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  typeBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  typeBtnLabel: { fontSize: 13 },

  orderTypeBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  orderTypeBtnLabel: { fontSize: 15 },

  locConfirmed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 10,
  },
  locActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  notesInput: {
    borderRadius: 0,
    padding: 14,
    fontSize: 14,
    minHeight: 80,
    textAlign: "right",
  },
  otherInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlign: "right",
  },

  sectionLabel: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  totalLine: { height: 1, marginHorizontal: 16, marginVertical: 4 },
  grandTotal: { fontSize: 20 },

  paymentSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  paymentSummaryContent: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  payPickerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  radioOuter: { justifyContent: "center", alignItems: "center" },
  radioInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  submitBtn: {
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    shadowColor: "#E8920C",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  submitBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  submitTotal: { color: "#FFFFFF", fontSize: 16 },
  submitText: { color: "#FFFFFF", fontSize: 17 },

  otpOverlay: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  otpSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  otpTitle: { fontSize: 18, textAlign: "center" },
  otpSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  otpInput: {
    borderRadius: 14,
    paddingVertical: 14,
    fontSize: 32,
    textAlign: "center",
    letterSpacing: 16,
    borderWidth: 2,
  },
  otpVerifyBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
});
