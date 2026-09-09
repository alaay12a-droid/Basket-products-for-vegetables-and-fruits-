import React, { useState, useCallback, useEffect, useRef } from "react";
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
  Switch,
  Modal,
  KeyboardAvoidingView,
  Image,
  Dimensions,
  Linking,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import Svg, { Rect, Text as SvgText, Line } from "react-native-svg";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { getCustomKey } from "@/constants/appSounds";
import { useColors } from "@/hooks/useColors";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMenu, type ApiMenuItem } from "@/hooks/useMenu";
import type { ApiOccasion } from "@/hooks/useOccasions";
import { useTabConfig, type TabConfig } from "@/hooks/useTabConfig";
import { loadPins, savePins, isMasterCode, type Pins } from "@/hooks/usePins";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { useUIDensity, type UIDensity } from "@/hooks/useUIDensity";
import { useDiscountCodes, type DiscountCode, type DiscountCodeUsage, type ChartDataPoint } from "@/hooks/useDiscountCodes";
import { useBanners, type ApiBanner } from "@/hooks/useBanners";
import { useRevenue, type RevenuePeriod } from "@/hooks/useRevenue";
import { useCombos, type ApiCombo, type ComboComponent } from "@/hooks/useCombos";
import { apiGet, apiPost, apiPut, apiDelete, API_BASE, STORAGE_BASE_URL } from "@/constants/api";
import { invalidateAppTextsCache, DEFAULT_TEXTS } from "@/hooks/useAppTexts";
import { useMusic, PRESET_MUSIC } from "@/context/MusicContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OCCASION_KEY,
  OCCASION_THEMES,
  OCCASION_LIST,
  detectCurrentOccasion,
  type OccasionId,
} from "@/constants/occasions";
import { SOUND_CHOICES, SOUND_KEYS, type SoundOption } from "@/constants/appSounds";
import { useAppSound } from "@/hooks/useAppSound";
import { ZoneDrawerModal, type LatLng } from "@/components/ZoneDrawerModal";

const LOGO_BG_COLORS = [
  { label: "بني داكن",  value: "#1F130A" },
  { label: "بني",       value: "#3D2010" },
  { label: "كريمي",     value: "#F5EDD8" },
  { label: "أبيض",      value: "#FFFFFF" },
  { label: "أسود",      value: "#000000" },
  { label: "أحمر",      value: "#C8171A" },
  { label: "ذهبي",      value: "#E8920C" },
  { label: "شفاف",      value: "transparent" },
];

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

const ADMIN_PIN_DEFAULT = "Aa@000";

const CATEGORIES = [
  { id: "chicken",  name: "الدجاج",              icon: "🍗" },
  { id: "meat",     name: "اللحوم",              icon: "🥩" },
  { id: "mains",    name: "الأطباق الرئيسية",    icon: "🍽️" },
  { id: "sides",    name: "الإيدامات",           icon: "🥘" },
  { id: "salads",   name: "السلطات",             icon: "🥗" },
  { id: "desserts", name: "الحلويات",            icon: "🍮" },
  { id: "drinks",   name: "المشروبات",           icon: "🥤" },
  { id: "extras",   name: "إضافات",              icon: "✨" },
];

function getCatMeta(catId: string) {
  return CATEGORIES.find((c) => c.id === catId) ?? { id: catId, name: catId, icon: "🍽️" };
}

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
        🔐 إدارة القائمة
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

// step: "idle" | "sending" | "otp" | "verifying" | "change"
function PinEditor({ label, current, onSave }: { label: string; current: string; onSave: (pin: string) => Promise<void> }) {
  const colors = useColors();
  const [step, setStep]       = useState<"idle"|"sending"|"otp"|"verifying"|"change">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [newPin, setNewPin]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [err, setErr]         = useState("");

  const reset = () => { setStep("idle"); setOtpCode(""); setNewPin(""); setConfirm(""); setErr(""); };

  const requestOtp = async () => {
    setErr("");
    setStep("sending");
    try {
      const res = await apiPost<{ ok: boolean }>("/auth/pin-otp/send", {});
      if (res.ok) setStep("otp");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "فشل إرسال الرمز");
      setStep("idle");
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== 6) { setErr("أدخل الرمز المكوّن من 6 أرقام"); return; }
    setErr("");
    setStep("verifying");
    try {
      const res = await apiPost<{ ok: boolean }>("/auth/pin-otp/verify", { code: otpCode });
      if (res.ok) { setStep("change"); setOtpCode(""); }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "الرمز غير صحيح");
      setStep("otp");
    }
  };

  const handleSave = async () => {
    if (newPin.length < 4) { setErr("الرمز لازم يكون 4 أحرف على الأقل"); return; }
    if (newPin !== confirm) { setErr("الرمزان غير متطابقين"); return; }
    setSaving(true);
    await onSave(newPin);
    setSaving(false);
    setSaved(true);
    reset();
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 }}>
      {/* Header row */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>{label}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {saved && <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>✓ تم الحفظ</Text>}
          {step === "idle" ? (
            <TouchableOpacity
              onPress={requestOtp}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.gold }}
            >
              <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 12 }}>تغيير الرمز</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={reset}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.secondary }}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>إلغاء</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Current PIN dots */}
      {step === "idle" && (
        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "right" }}>
          الرمز الحالي: {"•".repeat(current.length)}
        </Text>
      )}

      {/* Sending indicator */}
      {step === "sending" && (
        <View style={{ alignItems: "center", paddingVertical: 12, gap: 8 }}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>جاري إرسال الرمز إلى بريدك الإلكتروني…</Text>
        </View>
      )}

      {/* OTP entry */}
      {step === "otp" && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "right" }}>
            📧 تم إرسال رمز التحقق إلى بريدك الإلكتروني. أدخله هنا:
          </Text>
          <TextInput
            style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 12, color: colors.foreground, fontFamily: F.bold, textAlign: "center", borderWidth: 1, borderColor: err ? "#E53935" : colors.gold, fontSize: 22, letterSpacing: 8 }}
            value={otpCode}
            onChangeText={(t) => { setOtpCode(t.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
            keyboardType="numeric"
            maxLength={6}
            placeholder="• • • • • •"
            placeholderTextColor={colors.mutedForeground}
          />
          {err !== "" && <Text style={{ color: "#E53935", fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>{err}</Text>}
          <TouchableOpacity
            onPress={verifyOtp}
            style={{ paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.gold }}
          >
            <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>تحقق من الرمز</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={requestOtp} style={{ alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>لم يصلك الرمز؟ إعادة إرسال</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Verifying indicator */}
      {step === "verifying" && (
        <View style={{ alignItems: "center", paddingVertical: 12, gap: 8 }}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>جاري التحقق…</Text>
        </View>
      )}

      {/* Change PIN form */}
      {step === "change" && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>✓ تم التحقق — أدخل الرمز الجديد</Text>
          <TextInput
            style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 12, color: colors.foreground, fontFamily: F.bold, textAlign: "right", borderWidth: 1, borderColor: err ? "#E53935" : colors.border }}
            value={newPin}
            onChangeText={(t) => { setNewPin(t); setErr(""); }}
            secureTextEntry
            autoCapitalize="none"
            placeholder="الرمز الجديد"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 12, color: colors.foreground, fontFamily: F.bold, textAlign: "right", borderWidth: 1, borderColor: err ? "#E53935" : colors.border }}
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setErr(""); }}
            secureTextEntry
            autoCapitalize="none"
            placeholder="تأكيد الرمز"
            placeholderTextColor={colors.mutedForeground}
          />
          {err !== "" && <Text style={{ color: "#E53935", fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>{err}</Text>}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{ paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.gold }}
          >
            <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>
              {saving ? "جاري الحفظ..." : "حفظ الرمز"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function AdminMenuScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiItems: items, refresh } = useMenu();

  const topInset = Platform.OS === "web" ? 60 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [allOccasions, setAllOccasions] = useState<ApiOccasion[]>([]);
  const refreshOccasions = useCallback(async () => {
    try {
      const data = await apiGet<ApiOccasion[]>("/occasions");
      setAllOccasions(data);
    } catch { /* keep */ }
  }, []);
  React.useEffect(() => { refreshOccasions(); }, [refreshOccasions]);

  const [authenticated, setAuthenticated] = useState(false);
  const [pins, setPins] = useState<Pins>({ cashier: ADMIN_PIN_DEFAULT, admin: ADMIN_PIN_DEFAULT });
  const [pinsLoaded, setPinsLoaded] = useState(false);

  React.useEffect(() => {
    loadPins().then((p) => { setPins(p); setPinsLoaded(true); });
  }, []);

  const [activeTab, setActiveTab] = useState<"menu" | "occasions" | "stock" | "settings" | "banners" | "revenue" | "combos" | "zones" | "referrals">("menu");

  // ─── Referrals ─────────────────────────────────────────────
  const [referralSettings, setReferralSettings] = useState<{ rate: number; enabled: boolean } | null>(null);
  const [referralRows, setReferralRows] = useState<{ referrerPhone: string; total: number; rewarded: number; totalRewardSAR: number }[]>([]);
  const [referralRateInput, setReferralRateInput] = useState("");
  const [referralSaving, setReferralSaving] = useState(false);

  const loadReferrals = useCallback(async () => {
    try {
      const [settings, data] = await Promise.all([
        apiGet<{ rate: number; enabled: boolean }>("/referrals/settings"),
        apiGet<{ summary: { referrerPhone: string; total: number; rewarded: number; totalRewardSAR: number }[] }>("/referrals/all"),
      ]);
      setReferralSettings(settings);
      setReferralRateInput(String(settings.rate));
      setReferralRows(data.summary);
    } catch {}
  }, []);

  useEffect(() => { if (activeTab === "referrals") loadReferrals(); }, [activeTab, loadReferrals]);

  // ─── Delivery Zones ───────────────────────────────────────
  type DeliveryZone = { id: number; name: string; polygon: LatLng[]; deliveryFee: number; minOrder: number; enabled: boolean; sortOrder: number };
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zoneFormModal, setZoneFormModal] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [zoneFormName, setZoneFormName] = useState("");
  const [zoneFormFee, setZoneFormFee] = useState("");
  const [zoneFormMinOrder, setZoneFormMinOrder] = useState("");
  const [zonePolygon, setZonePolygon] = useState<LatLng[]>([]);
  const [zoneMapDrawVisible, setZoneMapDrawVisible] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);

  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    try { setDeliveryZones(await apiGet<DeliveryZone[]>("/delivery-zones")); } catch {} finally { setZonesLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === "zones") loadZones(); }, [activeTab, loadZones]);

  const openAddZone = () => { setEditingZone(null); setZoneFormName(""); setZoneFormFee(""); setZoneFormMinOrder(""); setZonePolygon([]); setZoneFormModal(true); };
  const openEditZone = (z: DeliveryZone) => { setEditingZone(z); setZoneFormName(z.name); setZoneFormFee(String(z.deliveryFee)); setZoneFormMinOrder(String(z.minOrder)); setZonePolygon(z.polygon); setZoneFormModal(true); };

  const saveZone = async () => {
    const name = zoneFormName.trim();
    if (!name) { Alert.alert("خطأ", "أدخل اسم المنطقة"); return; }
    if (zonePolygon.length < 3) { Alert.alert("خطأ", "ارسم المنطقة على الخريطة (3 نقاط على الأقل)"); return; }
    const deliveryFee = Math.round(parseFloat(zoneFormFee || "0") * 100);
    const minOrder   = Math.round(parseFloat(zoneFormMinOrder || "0") * 100);
    setZoneSaving(true);
    try {
      if (editingZone) {
        const updated = await apiPut<DeliveryZone>(`/delivery-zones/${editingZone.id}`, { name, polygon: zonePolygon, deliveryFee, minOrder });
        setDeliveryZones(prev => prev.map(z => z.id === editingZone.id ? updated : z));
      } else {
        const created = await apiPost<DeliveryZone>("/delivery-zones", { name, polygon: zonePolygon, deliveryFee, minOrder });
        setDeliveryZones(prev => [...prev, created]);
      }
      setZoneFormModal(false);
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل الحفظ");
    } finally { setZoneSaving(false); }
  };

  const deleteZone = (z: DeliveryZone) => {
    Alert.alert("حذف المنطقة", `هل تريد حذف "${z.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        await apiDelete(`/delivery-zones/${z.id}`);
        setDeliveryZones(prev => prev.filter(x => x.id !== z.id));
      }},
    ]);
  };

  const toggleZone = async (z: DeliveryZone, enabled: boolean) => {
    await apiPut(`/delivery-zones/${z.id}`, { enabled });
    setDeliveryZones(prev => prev.map(x => x.id === z.id ? { ...x, enabled } : x));
  };
  const { config: tabConfig, update: updateTabConfig } = useTabConfig();
  const { density: uiDensity, saveDensity: saveUIDensity } = useUIDensity();
  const { settings: paymentSettings, saveSettings: savePaymentSettings } = usePaymentSettings();
  const { codes: discountCodes, addCode, updateCode, deleteCode, fetchUsages, cleanupExpired } = useDiscountCodes();
  const { banners: allBanners, refresh: refreshBanners } = useBanners();
  const { data: revenueData, loading: revenueLoading, refresh: refreshRevenue } = useRevenue();
  const [revenueView, setRevenueView] = useState<"daily" | "monthly" | "yearly" | "items">("daily");
  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "week" | "month" | "year">("month");
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printPreset, setPrintPreset] = useState<string>("today");
  const [printFromDate, setPrintFromDate] = useState("");
  const [printToDate, setPrintToDate] = useState("");
  const [printSections, setPrintSections] = useState({ kpi: true, payment: true, summary: true });
  const [printFetching, setPrintFetching] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"hours" | "payment" | "discounts" | "wallets" | "sms" | "security" | "appearance" | "ratings" | "drivers" | "texts" | "music" | "occasions" | "logobg" | "sounds">("hours");

  // ─── Logo background (synced via API) ────────────────────
  const { config: appConfig, update: updateAppConfig } = useAppConfig();
  const logoBg = appConfig.logoBg;
  const changeLogoBg = useCallback(async (color: string) => {
    await updateAppConfig({ logoBg: color });
  }, [updateAppConfig]);

  // ─── Occasions ────────────────────────────────────────────
  const [occasionSetting, setOccasionSetting] = useState<"auto" | OccasionId>("auto");
  useEffect(() => {
    AsyncStorage.getItem(OCCASION_KEY).then(v => {
      setOccasionSetting((v as "auto" | OccasionId) ?? "auto");
    });
  }, []);
  const changeOccasion = useCallback(async (val: "auto" | OccasionId) => {
    setOccasionSetting(val);
    await AsyncStorage.setItem(OCCASION_KEY, val);
  }, []);

  // ─── Sound settings ───────────────────────────────────────
  const { previewSound } = useAppSound();
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundOrder, setSoundOrder] = useState<SoundOption>("default");
  const [soundMessage, setSoundMessage] = useState<SoundOption>("default");
  const [soundDelivery, setSoundDelivery] = useState<SoundOption>("default");
  const [customUriOrder, setCustomUriOrder] = useState<string | null>(null);
  const [customUriMessage, setCustomUriMessage] = useState<string | null>(null);
  const [customUriDelivery, setCustomUriDelivery] = useState<string | null>(null);
  const [customSoundModalVisible, setCustomSoundModalVisible] = useState(false);
  const [customSoundUrlInput, setCustomSoundUrlInput] = useState("");
  const customSoundCallbacksRef = useRef<{ soundKey: string; setUri: (u: string) => void; setSoundVal: (v: SoundOption) => void } | null>(null);
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(SOUND_KEYS.muted),
      AsyncStorage.getItem(SOUND_KEYS.order),
      AsyncStorage.getItem(SOUND_KEYS.message),
      AsyncStorage.getItem(SOUND_KEYS.delivery),
      AsyncStorage.getItem(SOUND_KEYS.customOrder),
      AsyncStorage.getItem(SOUND_KEYS.customMessage),
      AsyncStorage.getItem(SOUND_KEYS.customDelivery),
    ]).then(([m, o, msg, d, co, cm, cd]) => {
      if (m) setSoundMuted(m === "true");
      if (o) setSoundOrder(o as SoundOption);
      if (msg) setSoundMessage(msg as SoundOption);
      if (d) setSoundDelivery(d as SoundOption);
      if (co) setCustomUriOrder(co);
      if (cm) setCustomUriMessage(cm);
      if (cd) setCustomUriDelivery(cd);
    });
  }, []);
  const setSoundPref = useCallback(async (key: string, val: SoundOption | boolean) => {
    await AsyncStorage.setItem(key, String(val));
    const payload: Record<string, string | boolean> = {};
    if (key === SOUND_KEYS.muted)    payload.muted    = val;
    if (key === SOUND_KEYS.order)    payload.order    = String(val);
    if (key === SOUND_KEYS.message)  payload.message  = String(val);
    if (key === SOUND_KEYS.delivery) payload.delivery = String(val);
    if (Object.keys(payload).length) apiPut("/settings/sounds", payload).catch(() => {});
  }, []);
  const pickCustomSound = useCallback((soundKey: string, setUri: (u: string) => void, setSoundVal: (v: SoundOption) => void) => {
    customSoundCallbacksRef.current = { soundKey, setUri, setSoundVal };
    setCustomSoundUrlInput("");
    setCustomSoundModalVisible(true);
  }, []);
  const confirmCustomSoundUrl = useCallback(async () => {
    const url = customSoundUrlInput.trim();
    if (!url || !customSoundCallbacksRef.current) return;
    const { soundKey, setUri, setSoundVal } = customSoundCallbacksRef.current;
    const customKey = getCustomKey(soundKey);
    await AsyncStorage.setItem(customKey, url);
    await AsyncStorage.setItem(soundKey, "custom");
    setUri(url);
    setSoundVal("custom");
    const payload: Record<string, string | null> = {};
    if (soundKey === SOUND_KEYS.order)    payload.customOrderUrl    = url;
    if (soundKey === SOUND_KEYS.message)  payload.customMessageUrl  = url;
    if (soundKey === SOUND_KEYS.delivery) payload.customDeliveryUrl = url;
    if (Object.keys(payload).length) apiPut("/settings/sounds", payload).catch(() => {});
    setCustomSoundModalVisible(false);
  }, [customSoundUrlInput]);

  // ─── Music ────────────────────────────────────────────────
  const {
    musicPlaying, musicIdx, musicVolume, musicTracks,
    musicAddName, musicAddUrl,
    setMusicAddName, setMusicAddUrl,
    setMusicPlaying,
    handlePlayMusicTrack, handleMusicVolume,
    handleAddMusicTrack, handleDeleteMusicTrack, resetToPresets,
  } = useMusic();
  const [showAddTrack, setShowAddTrack] = useState(false);

  // Combos
  const { combos, addCombo, updateCombo, deleteCombo } = useCombos();
  const [showAddComboModal, setShowAddComboModal] = useState(false);
  const [editCombo, setEditCombo] = useState<ApiCombo | null>(null);
  const [comboName, setComboName] = useState("");
  const [comboDesc, setComboDesc] = useState("");
  const [comboPrice, setComboPrice] = useState("");
  const [comboImageUrl, setComboImageUrl] = useState("");
  const [comboComponents, setComboComponents] = useState<ComboComponent[]>([{ name: "", quantity: 1 }]);
  const [comboLoading, setComboLoading] = useState(false);

  // App Texts
  const [appTexts, setAppTexts] = useState<Record<string, string>>({});
  const [textsLoading, setTextsLoading] = useState(false);
  const [textsSaving, setTextsSaving] = useState(false);

  const loadAppTexts = useCallback(async () => {
    setTextsLoading(true);
    try {
      const data = await apiGet<Record<string, string>>("/app-texts");
      setAppTexts(data);
    } catch {}
    setTextsLoading(false);
  }, []);

  const [settingsRefreshing, setSettingsRefreshing] = useState(false);

  const saveAppTexts = async () => {
    setTextsSaving(true);
    try {
      await apiPut("/app-texts", appTexts);
      invalidateAppTextsCache();
      Alert.alert("✅", "تم حفظ النصوص بنجاح");
    } catch {
      Alert.alert("خطأ", "تعذّر حفظ النصوص");
    }
    setTextsSaving(false);
  };

  // Commission rate
  const [commissionRate, setCommissionRate] = useState(5);
  const [commissionModalVisible, setCommissionModalVisible] = useState(false);
  const [commissionInput, setCommissionInput] = useState("5");
  const [commissionSaving, setCommissionSaving] = useState(false);

  const loadCommissionRate = async () => {
    try {
      const r = await apiGet<{ rate: number }>("/settings/commission-rate");
      setCommissionRate(r.rate);
      setCommissionInput(String(r.rate));
    } catch {}
  };

  const saveCommissionRate = async () => {
    const v = parseFloat(commissionInput.replace(",", "."));
    if (isNaN(v) || v < 0 || v > 100) { Alert.alert("خطأ", "أدخل نسبة صحيحة بين 0 و 100"); return; }
    setCommissionSaving(true);
    try {
      await apiPut("/settings/commission-rate", { rate: v });
      setCommissionRate(v);
      setCommissionModalVisible(false);
    } catch { Alert.alert("خطأ", "تعذّر حفظ النسبة"); }
    setCommissionSaving(false);
  };

  // SMS OTP settings
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsHasKey, setSmsHasKey] = useState(false);
  const [smsApiKey, setSmsApiKey] = useState("");
  const [smsSender, setSmsSender] = useState("منتجات السلة للخضار والفواكه");
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsProvider, setSmsProvider] = useState<"msegat"|"taqnyat"|"4jawaly"|"unifonic"|"twilio"|"authentica">("msegat");
  const [smsMethod, setSmsMethod] = useState<"sms"|"whatsapp">("sms");
  const [smsTestPhone, setSmsTestPhone] = useState("");
  const [smsTestLoading, setSmsTestLoading] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<string | null>(null);
  const [allowCustomerCancel, setAllowCustomerCancel] = useState(false);

  // Branch hours
  interface DaySchedule { enabled: boolean; open: string; close: string; }
  interface BranchHours { enabled: boolean; days: DaySchedule[]; }
  const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  const defaultHours: BranchHours = {
    enabled: false,
    days: [0,1,2,3,4,5,6].map(() => ({ enabled: true, open: "09:00", close: "23:00" })),
  };
  const [branchHours, setBranchHours] = useState<BranchHours>(defaultHours);
  const [hoursLoading, setHoursLoading] = useState(false);
  const loadBranchHours = useCallback(async () => {
    try {
      const r = await apiGet<BranchHours>("/branch-hours");
      setBranchHours(r);
    } catch {}
  }, []);

  // Wallet management
  const [walletPhone, setWalletPhone] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSearchBalance, setWalletSearchBalance] = useState<number | null>(null);
  const [walletSearchPhone, setWalletSearchPhone] = useState("");

  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerLoading, setBannerLoading] = useState<string | null>(null);

  useEffect(() => { refreshBanners(); }, [refreshBanners]);
  useEffect(() => { if (activeTab === "revenue") { refreshRevenue(); loadCommissionRate(); } }, [activeTab, refreshRevenue]);

  const getSaudiDateStr = (offsetDays = 0): string => {
    const now = new Date(Date.now() + 3 * 3600 * 1000);
    now.setUTCDate(now.getUTCDate() - offsetDays);
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  };

  const generatePrintHTML = (pd: RevenuePeriod, label: string, sections: { kpi: boolean; payment: boolean; summary: boolean }): string => {
    const now = new Date().toLocaleString("ar-SA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const f = (n: number) => n.toFixed(2);
    const totalPay = pd.cashRevenue + pd.onlineRevenue || 1;
    const cashPct  = Math.round((pd.cashRevenue / totalPay) * 100);
    const kpiBlock = sections.kpi ? `
<div class="kpi-grid">
  <div class="kpi" style="background:#FFF8EE;border-color:#E8920C44;"><div class="val" style="color:#E8920C;">${f(pd.totalRevenue)} ر.س</div><div class="lbl">الإيرادات الإجمالية</div></div>
  <div class="kpi" style="background:#F0FFF0;border-color:#4CAF5044;"><div class="val" style="color:#2e7d32;">${f(pd.netRevenue)} ر.س</div><div class="lbl">الصافي بعد الضريبة</div></div>
  <div class="kpi" style="background:#F0F4FF;border-color:#82B1FF44;"><div class="val" style="color:#1565C0;">${f(pd.taxAmount)} ر.س</div><div class="lbl">ضريبة 15%</div></div>
  <div class="kpi" style="background:#F9F0FF;border-color:#CE93D844;"><div class="val" style="color:#6A1B9A;">${f(pd.deliveryRevenue)} ر.س</div><div class="lbl">إيراد التوصيل</div></div>
  <div class="kpi" style="background:#F5F5F5;border-color:#ccc;"><div class="val" style="color:#333;">${pd.orderCount}</div><div class="lbl">الطلبات المكتملة</div></div>
  <div class="kpi" style="background:#FFF0F0;border-color:#EF444444;"><div class="val" style="color:#C62828;">${pd.cancelledCount}</div><div class="lbl">الملغاة${pd.cancelledValue > 0 ? `<br><small>${f(pd.cancelledValue)} ر.س</small>` : ""}</div></div>
</div>` : "";
    const payBlock = sections.payment ? `
<div class="section">
  <h2>💳 طريقة الدفع</h2>
  <div class="bar-wrap"><div class="bar-cash" style="width:${cashPct}%;"></div></div>
  <div class="pay-row">
    <div class="pay-item"><div class="v" style="color:#4CAF50;">${f(pd.cashRevenue)} ر.س</div><div class="l">نقدي — ${pd.cashCount} طلب (${cashPct}%)</div></div>
    <div class="pay-item"><div class="v" style="color:#82B1FF;">${f(pd.onlineRevenue)} ر.س</div><div class="l">إلكتروني — ${pd.onlineCount} طلب (${100 - cashPct}%)</div></div>
  </div>
</div>` : "";
    const sumBlock = sections.summary ? `
<div class="section">
  <h2>📋 الملخص المالي</h2>
  <div class="row"><span class="lbl">إجمالي الإيرادات</span><span class="val" style="color:#E8920C;">${f(pd.totalRevenue)} ر.س</span></div>
  <div class="row"><span class="lbl">إيراد الأصناف</span><span class="val">${f(pd.itemsRevenue)} ر.س</span></div>
  <div class="row"><span class="lbl">إيراد التوصيل</span><span class="val" style="color:#9C27B0;">${f(pd.deliveryRevenue)} ر.س</span></div>
  <div class="row"><span class="lbl">ضريبة القيمة المضافة 15%</span><span class="val" style="color:#1565C0;">${f(pd.taxAmount)} ر.س</span></div>
  <div class="row"><span class="lbl">الصافي بعد الضريبة</span><span class="val" style="color:#2e7d32;">${f(pd.netRevenue)} ر.س</span></div>
  ${pd.cancelledValue > 0 ? `<div class="row"><span class="lbl">قيمة الملغاة</span><span class="val" style="color:#C62828;">${f(pd.cancelledValue)} ر.س</span></div>` : ""}
</div>` : "";
    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/><title>التقرير المالي — ${label}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Cairo',sans-serif;background:#fff;color:#111;direction:rtl;padding:12mm 10mm;}
  h1{text-align:center;font-size:20px;font-weight:800;color:#8B4513;margin-bottom:3px;}
  .sub{text-align:center;font-size:11px;color:#888;margin-bottom:16px;}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;}
  .kpi{border-radius:10px;padding:12px;text-align:center;border:1px solid #eee;}
  .kpi .val{font-size:18px;font-weight:800;margin-bottom:3px;}
  .kpi .lbl{font-size:11px;color:#888;}
  .section{background:#f9f9f9;border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid #eee;}
  .section h2{font-size:13px;font-weight:700;color:#555;margin-bottom:10px;border-bottom:1px solid #ddd;padding-bottom:6px;}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;}
  .row:last-child{border-bottom:none;}
  .row .lbl{color:#666;font-size:12px;}
  .row .val{font-weight:700;font-size:12px;}
  .bar-wrap{background:#eee;border-radius:6px;height:10px;overflow:hidden;margin:6px 0;}
  .bar-cash{background:#4CAF50;height:100%;float:right;}
  .pay-row{display:flex;justify-content:space-between;margin-top:6px;}
  .pay-item{text-align:center;}
  .pay-item .v{font-size:15px;font-weight:800;}
  .pay-item .l{font-size:10px;color:#888;}
  @media print{body{padding:5mm;}}
</style></head><body>
<h1>منتجات السلة للخضار والفواكه — التقرير المالي</h1>
<div class="sub">الفترة: ${label} | طُبع في ${now}</div>
${kpiBlock}${payBlock}${sumBlock}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  };

  const executePrint = async () => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    setPrintFetching(true);
    try {
      let pd: RevenuePeriod | null = null;
      let label = "";
      if (printPreset === "today" && revenueData)       { pd = revenueData.today; label = "اليوم"; }
      else if (printPreset === "week" && revenueData)   { pd = revenueData.week;  label = "آخر 7 أيام"; }
      else if (printPreset === "month" && revenueData)  { pd = revenueData.month; label = "هذا الشهر"; }
      else if (printPreset === "year" && revenueData)   { pd = revenueData.year;  label = "هذه السنة"; }
      else {
        let from = printFromDate;
        let to   = printToDate;
        if (printPreset === "yesterday")  { from = to = getSaudiDateStr(1); label = "أمس"; }
        else if (printPreset === "daybefore") { from = to = getSaudiDateStr(2); label = "أول أمس"; }
        else if (printPreset === "lastmonth") {
          const nl = new Date(Date.now() + 3 * 3600 * 1000);
          const y = nl.getUTCFullYear(); const m = nl.getUTCMonth();
          from = m === 0 ? `${y - 1}-12-01` : `${y}-${String(m).padStart(2, "0")}-01`;
          const lastDay = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 12 : m, 0)).getUTCDate();
          to   = m === 0 ? `${y - 1}-12-${lastDay}` : `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
          label = "الشهر الماضي";
        } else { label = from === to ? from : `${from} → ${to}`; }
        if (!from || !to) { setPrintFetching(false); return; }
        pd = await apiGet<RevenuePeriod>(`/revenue/range?from=${from}&to=${to}`);
      }
      if (!pd) return;
      const html = generatePrintHTML(pd, label, printSections);
      const win = window.open("", "_blank", "width=900,height=700");
      if (win) { win.document.write(html); win.document.close(); }
      setPrintModalVisible(false);
    } catch {
      Alert.alert("خطأ", "فشل في جلب بيانات الفترة المحددة");
    } finally {
      setPrintFetching(false);
    }
  };
  useEffect(() => { if (activeTab === "stock") refresh(); }, [activeTab, refresh]);

  const loadSmsSettings = useCallback(async () => {
    try {
      const r = await apiGet<{ enabled: boolean; hasApiKey: boolean; sender: string; provider: "msegat"|"taqnyat"|"4jawaly"|"unifonic"|"twilio"|"authentica"; method: "sms"|"whatsapp" }>("/sms-settings");
      setSmsEnabled(r.enabled);
      setSmsHasKey(r.hasApiKey);
      setSmsSender(r.sender === "روابي المندي" ? "منتجات السلة للخضار والفواكه" : (r.sender ?? "منتجات السلة للخضار والفواكه"));
      setSmsProvider(r.provider ?? "msegat");
      setSmsMethod(r.method ?? "sms");
    } catch {}
  }, []);
  const loadCancelSetting = useCallback(async () => {
    try {
      const r = await apiGet<{ allowed: boolean }>("/settings/customer-cancel");
      setAllowCustomerCancel(r.allowed);
    } catch {}
  }, []);
  // ── Ratings (admin view) ────────────────────────────────────────────────────
  interface AdminRating {
    orderId: number;
    stars: number;
    comment: string | null;
    ratedAt: string;
    customerName: string | null;
    customerPhone: string | null;
    orderTotal: number | null;
  }
  const [ratings, setRatings] = useState<AdminRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [deletingRating, setDeletingRating] = useState<number | null>(null);

  const loadRatings = useCallback(async () => {
    setRatingsLoading(true);
    try {
      const r = await apiGet<AdminRating[]>("/ratings");
      setRatings(r);
    } catch {}
    setRatingsLoading(false);
  }, []);

  const deleteRating = useCallback(async (orderId: number) => {
    setDeletingRating(orderId);
    try {
      await apiDelete(`/ratings/${orderId}`);
      setRatings((prev) => prev.filter((r) => r.orderId !== orderId));
    } catch {}
    setDeletingRating(null);
  }, []);

  // ── Drivers (admin) ─────────────────────────────────────────────────────────
  interface AdminDriver { id: number; name: string; phone: string; photoUrl: string | null; active: boolean; pin: string; }
  const [adminDrivers, setAdminDrivers] = useState<AdminDriver[]>([]);
  const [driversEnabled, setDriversEnabled] = useState(false);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverPin, setDriverPin] = useState("");
  const [driverPhotoUrl, setDriverPhotoUrl] = useState("");
  const [driverPhotoUploading, setDriverPhotoUploading] = useState(false);
  const [driverSaving, setDriverSaving] = useState(false);

  // Delete confirmation modals
  const [driverToDelete, setDriverToDelete] = useState<AdminDriver | null>(null);
  const [driverDeleteLoading, setDriverDeleteLoading] = useState(false);
  const [bannerToDelete, setBannerToDelete] = useState<ApiBanner | null>(null);
  const [bannerDeleteLoading, setBannerDeleteLoading] = useState(false);

  // Edit driver modal
  const [editingDriver, setEditingDriver] = useState<AdminDriver | null>(null);
  const [editDriverName, setEditDriverName] = useState("");
  const [editDriverPhone, setEditDriverPhone] = useState("");
  const [editDriverPin, setEditDriverPin] = useState("");
  const [editDriverPhotoUrl, setEditDriverPhotoUrl] = useState("");
  const [editDriverPhotoUploading, setEditDriverPhotoUploading] = useState(false);
  const [editDriverSaving, setEditDriverSaving] = useState(false);

  // ── اختيار جودة الصورة قبل الرفع ──────────────────────────────────────
  // يعرض خيارات المقاس ويرجع قيمة الجودة (0-1) أو null إذا ألغى المستخدم
  const askImageQuality = (): Promise<number | null> =>
    new Promise((resolve) => {
      Alert.alert(
        "حجم الصورة",
        "اختر مقاس الصورة قبل الرفع",
        [
          {
            text: "🔹 صغير  (سريع التحميل)",
            onPress: () => resolve(0.3),
          },
          {
            text: "🔷 متوسط  (مُوصى به)",
            onPress: () => resolve(0.6),
          },
          {
            text: "🔶 كبير  (جودة عالية)",
            onPress: () => resolve(0.9),
          },
          {
            text: "⭕ أصلي  (بدون ضغط)",
            onPress: () => resolve(1.0),
          },
          {
            text: "إلغاء",
            style: "cancel",
            onPress: () => resolve(null),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(null) }
      );
    });

  const handlePickDriverPhoto = async () => {
    const quality = await askImageQuality();
    if (quality === null) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الصور في الإعدادات");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setDriverPhotoUploading(true);
    try {
      const ext = (asset.uri.split(".").pop() ?? "jpg").replace("jpeg", "jpg");
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      const urlRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `driver-${Date.now()}.${ext}`, size: asset.fileSize ?? 0, contentType }),
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const imageBlob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: imageBlob });
      setDriverPhotoUrl(`${STORAGE_BASE_URL}/api/storage${objectPath}`);
    } catch {
      Alert.alert("خطأ", "تعذر رفع الصورة، حاول مرة أخرى");
    } finally {
      setDriverPhotoUploading(false);
    }
  };

  interface DriverSummaryOrder { orderId: number; dailyNumber: number | null; customerName: string; totalPrice: number; deliveredAt: string | null; }
  interface DriverSummaryRow { driver: AdminDriver; ordersCount: number; totalCollected: number; orders: DriverSummaryOrder[]; }
  const [driverSummaries, setDriverSummaries] = useState<DriverSummaryRow[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [expandedDriverId, setExpandedDriverId] = useState<number | null>(null);
  const [driversSubTab, setDriversSubTab] = useState<"manage" | "statements">("manage");

  const loadDriverSummaries = useCallback(async () => {
    setSummariesLoading(true);
    try {
      const data = await apiGet<DriverSummaryRow[]>("/drivers/daily-summaries");
      setDriverSummaries(data);
    } catch {}
    setSummariesLoading(false);
  }, []);

  const loadAdminDrivers = useCallback(async () => {
    setDriversLoading(true);
    try {
      const [dr, en] = await Promise.all([
        apiGet<AdminDriver[]>("/drivers"),
        apiGet<{ enabled: boolean }>("/settings/drivers-enabled"),
      ]);
      setAdminDrivers(dr);
      setDriversEnabled(en.enabled);
    } catch {}
    setDriversLoading(false);
  }, []);

  const openEditDriver = (d: AdminDriver) => {
    setEditingDriver(d);
    setEditDriverName(d.name);
    setEditDriverPhone(d.phone);
    setEditDriverPin(d.pin);
    setEditDriverPhotoUrl(d.photoUrl ?? "");
  };

  const handlePickEditDriverPhoto = async () => {
    const quality = await askImageQuality();
    if (quality === null) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("الإذن مرفوض", "يرجى السماح بالوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    const ext = (asset.uri.split(".").pop() ?? "jpg").replace("jpeg", "jpg");
    const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
    setEditDriverPhotoUploading(true);
    try {
      const urlRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `driver-${Date.now()}.${ext}`, size: asset.fileSize ?? 0, contentType }),
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const imageBlob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: imageBlob });
      setEditDriverPhotoUrl(`${STORAGE_BASE_URL}/api/storage${objectPath}`);
    } catch { Alert.alert("خطأ", "تعذّر رفع الصورة"); }
    setEditDriverPhotoUploading(false);
  };

  const saveEditDriver = async () => {
    if (!editingDriver) return;
    if (!editDriverName.trim() || !editDriverPhone.trim() || !editDriverPin.trim()) {
      Alert.alert("تنبيه", "يرجى تعبئة الاسم والجوال والرقم السري"); return;
    }
    setEditDriverSaving(true);
    try {
      await apiPut(`/drivers/${editingDriver.id}`, {
        name: editDriverName.trim(),
        phone: editDriverPhone.trim(),
        pin: editDriverPin.trim(),
        photoUrl: editDriverPhotoUrl.trim() || null,
      });
      await loadAdminDrivers();
      setEditingDriver(null);
    } catch { Alert.alert("خطأ", "تعذّر تحديث بيانات المندوب"); }
    setEditDriverSaving(false);
  };

  const saveDriver = useCallback(async () => {
    if (!driverName.trim() || !driverPhone.trim() || !driverPin.trim()) {
      Alert.alert("تنبيه", "يرجى تعبئة الاسم والجوال والرقم السري");
      return;
    }
    setDriverSaving(true);
    try {
      await apiPost("/drivers", { name: driverName.trim(), phone: driverPhone.trim(), pin: driverPin.trim(), photoUrl: driverPhotoUrl.trim() || null, active: true });
      await loadAdminDrivers();
      setDriverName(""); setDriverPhone(""); setDriverPin(""); setDriverPhotoUrl("");
    } catch (e: unknown) { Alert.alert("خطأ", (e as { message?: string })?.message ?? "تعذر الحفظ"); }
    setDriverSaving(false);
  }, [driverName, driverPhone, driverPin, driverPhotoUrl, loadAdminDrivers]);

  useEffect(() => {
    if (activeTab === "settings" && settingsSection === "drivers") loadAdminDrivers();
    if (activeTab === "settings" && settingsSection === "texts") loadAppTexts();
  }, [settingsSection, activeTab]);

  // ── Favorites enabled ───────────────────────────────────────────────────────
  const [favoritesEnabled, setFavoritesEnabled] = useState(true);

  const loadFavoritesEnabled = useCallback(async () => {
    try {
      const r = await apiGet<{ enabled: boolean }>("/settings/favorites-enabled");
      setFavoritesEnabled(r.enabled);
    } catch {}
  }, []);

  const refreshCurrentSection = useCallback(async () => {
    setSettingsRefreshing(true);
    try {
      if (settingsSection === "hours")           await loadBranchHours();
      else if (settingsSection === "sms")        await loadSmsSettings();
      else if (settingsSection === "ratings")    await loadRatings();
      else if (settingsSection === "drivers")    await loadAdminDrivers();
      else if (settingsSection === "texts")      await loadAppTexts();
      else if (settingsSection === "appearance") await loadFavoritesEnabled();
      else if (settingsSection === "security")   await loadCancelSetting();
    } catch {}
    setSettingsRefreshing(false);
  }, [settingsSection, loadBranchHours, loadSmsSettings, loadRatings, loadAdminDrivers, loadAppTexts, loadFavoritesEnabled, loadCancelSetting]);

  useEffect(() => {
    if (activeTab === "settings") {
      loadSmsSettings();
      loadCancelSetting();
      loadBranchHours();
      loadFavoritesEnabled();
      if (settingsSection === "ratings") loadRatings();
    }
  }, [activeTab, loadSmsSettings, loadCancelSetting, loadBranchHours, loadFavoritesEnabled]);

  useEffect(() => {
    if (activeTab === "settings" && settingsSection === "ratings") loadRatings();
  }, [settingsSection]);

  const [dcCode, setDcCode] = useState("");
  const [dcType, setDcType] = useState<"percentage" | "fixed">("percentage");
  const [dcValue, setDcValue] = useState("");
  const [dcMinOrder, setDcMinOrder] = useState("");
  const [dcDesc, setDcDesc] = useState("");
  const [dcExpiresAt, setDcExpiresAt] = useState<Date | null>(null);
  const [dcMaxUses, setDcMaxUses] = useState("");
  const [dcPickerVisible, setDcPickerVisible] = useState(false);
  const [dcPickerDate, setDcPickerDate] = useState<Date>(new Date());
  const [dcPickerStep, setDcPickerStep] = useState<"date" | "time">("date");
  const [dcPickerContext, setDcPickerContext] = useState<"edit" | "new">("new");
  const [dcPickerEditId, setDcPickerEditId] = useState<number | null>(null);
  const [dcEditingMaxUsesId, setDcEditingMaxUsesId] = useState<number | null>(null);
  const [dcEditingMaxUsesVal, setDcEditingMaxUsesVal] = useState("");
  const [dcSortBy, setDcSortBy] = useState<"default" | "cost" | "usage">("default");

  const [selectedDcId, setSelectedDcId] = useState<number | null>(null);
  const [dcUsages, setDcUsages] = useState<DiscountCodeUsage[]>([]);
  const [dcTotalSavings, setDcTotalSavings] = useState(0);
  const [dcChartData, setDcChartData] = useState<ChartDataPoint[]>([]);
  const [dcUsagesLoading, setDcUsagesLoading] = useState(false);
  const [showDcUsagesModal, setShowDcUsagesModal] = useState(false);
  const [dcUsagePeriod, setDcUsagePeriod] = useState<"7d" | "30d" | "all">("all");
  const [dcChartMetric, setDcChartMetric] = useState<"count" | "savings">("count");
  const [dcChartSharing, setDcChartSharing] = useState(false);
  const dcChartRef = useRef<View>(null);

  const shareDcChart = useCallback(async () => {
    if (!dcChartRef.current) return;
    setDcChartSharing(true);
    try {
      const uri = await captureRef(dcChartRef, { format: "png", quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "مشاركة مخطط الاستخدام" });
    } catch {
      Alert.alert("خطأ", "تعذّر التقاط المخطط، حاول مرة أخرى.");
    }
    setDcChartSharing(false);
  }, []);

  const loadDcUsages = useCallback(async (id: number, period: "7d" | "30d" | "all") => {
    setDcUsagesLoading(true);
    try {
      const result = await fetchUsages(id, period);
      setDcUsages(result.usages);
      setDcTotalSavings(result.totalSavings);
      setDcChartData(result.chartData ?? []);
    } catch {}
    setDcUsagesLoading(false);
  }, [fetchUsages]);

  const openDcUsages = useCallback(async (dc: DiscountCode) => {
    setSelectedDcId(dc.id);
    setDcUsages([]);
    setDcTotalSavings(0);
    setDcChartData([]);
    setDcUsagePeriod("all");
    setDcChartMetric("count");
    setShowDcUsagesModal(true);
    loadDcUsages(dc.id, "all");
  }, [loadDcUsages]);

  const exportDcUsagesCsv = useCallback(async () => {
    if (selectedDcId == null) return;
    const code = discountCodes.find((d) => d.id === selectedDcId)?.code ?? String(selectedDcId);
    const url = `${API_BASE}/api/discount-codes/${selectedDcId}/usages.csv?period=${dcUsagePeriod}`;
    if (Platform.OS === "web") {
      Linking.openURL(url);
      return;
    }
    try {
      const filename = `discount-${code}-${dcUsagePeriod}.csv`;
      const destFile = new FileSystem.File(FileSystem.Paths.document, filename);
      const downloaded = await FileSystem.File.downloadFileAsync(url, destFile, { idempotent: true });
      await Sharing.shareAsync(downloaded.uri, {
        mimeType: "text/csv",
        dialogTitle: "تصدير بيانات الكود",
        UTI: "public.comma-separated-values-text",
      });
    } catch {
      Alert.alert("خطأ", "تعذر تصدير الملف");
    }
  }, [selectedDcId, discountCodes, dcUsagePeriod]);

  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [stockSaving, setStockSaving] = useState<string | null>(null);
  const [stockViewMode, setStockViewMode] = useState<"table" | "edit">("table");

  const [filterCat, setFilterCat] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<ApiMenuItem | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("chicken");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [menuImageUploading, setMenuImageUploading] = useState(false);
  const [menuImageDeleting, setMenuImageDeleting] = useState(false);
  const [stockItem, setStockItem] = useState<ApiMenuItem | null>(null);
  const [stockInput, setStockInput] = useState("");

  const [editOccasion, setEditOccasion] = useState<ApiOccasion | null>(null);
  const [showAddOccasionModal, setShowAddOccasionModal] = useState(false);
  const [occName, setOccName] = useState("");
  const [occDesc, setOccDesc] = useState("");
  const [occImageUrl, setOccImageUrl] = useState("");
  const [occImageUploading, setOccImageUploading] = useState(false);

  const handlePickMenuImage = async () => {
    const quality = await askImageQuality();
    if (quality === null) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الصور في الإعدادات");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setMenuImageUploading(true);
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      const urlRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `menu-${Date.now()}.${ext}`, size: asset.fileSize ?? 0, contentType }),
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const imageBlob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: imageBlob });
      setNewImageUrl(`${STORAGE_BASE_URL}/api/storage${objectPath}`);
    } catch {
      Alert.alert("خطأ", "تعذر رفع الصورة، حاول مرة أخرى");
    } finally {
      setMenuImageUploading(false);
    }
  };

  const handleDeleteMenuImagePermanently = () => {
    Alert.alert(
      "حذف الصورة نهائياً",
      "سيتم حذف الصورة من التخزين وقاعدة البيانات ولن تُسترجع. هل أنت متأكد؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف نهائياً",
          style: "destructive",
          onPress: async () => {
            if (!editItem) {
              setNewImageUrl("");
              return;
            }
            setMenuImageDeleting(true);
            try {
              await apiDelete(`/menu/${editItem.itemId}/image`);
              setNewImageUrl("");
              await refresh();
            } catch {
              Alert.alert("خطأ", "تعذر حذف الصورة، حاول مرة أخرى");
            } finally {
              setMenuImageDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handlePickImage = async () => {
    const quality = await askImageQuality();
    if (quality === null) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الصور في الإعدادات");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setOccImageUploading(true);
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      const urlRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `occ-${Date.now()}.${ext}`, size: asset.fileSize ?? 0, contentType }),
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const imageBlob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: imageBlob });
      setOccImageUrl(`${STORAGE_BASE_URL}/api/storage${objectPath}`);
    } catch {
      Alert.alert("خطأ", "تعذر رفع الصورة، حاول مرة أخرى");
    } finally {
      setOccImageUploading(false);
    }
  };

  if (!pinsLoaded) return null;
  if (!authenticated) {
    return <PinScreen onSuccess={() => setAuthenticated(true)} correctPin={pins.admin} />;
  }

  const filtered = filterCat === "all"
    ? items
    : items.filter((i) => i.category === filterCat);

  const handleSetStock = async () => {
    if (!stockItem) return;
    const val = stockInput.trim();
    const stock = val === "" || val === "∞" ? null : parseInt(val);
    if (stock !== null && (isNaN(stock) || stock < 0)) {
      Alert.alert("خطأ", "أدخل رقماً صحيحاً أو اتركه فارغاً للكمية غير المحدودة");
      return;
    }
    setLoading(`stock-${stockItem.itemId}`);
    try {
      await apiPut(`/menu/${stockItem.itemId}`, { stock });
      await refresh();
      setStockItem(null);
    } catch {
      Alert.alert("خطأ", "تعذر تحديث المخزون");
    } finally {
      setLoading(null);
    }
  };

  const getStockEditValue = (item: ApiMenuItem): string => {
    if (item.itemId in stockEdits) return stockEdits[item.itemId];
    return item.stock === null ? "" : String(item.stock);
  };

  const handleQuickStock = async (itemId: string, rawVal: string) => {
    const val = rawVal.trim();
    const stock = val === "" ? null : parseInt(val);
    if (stock !== null && (isNaN(stock) || stock < 0)) return;
    setStockSaving(itemId);
    try {
      await apiPut(`/menu/${itemId}`, { stock });
      await refresh();
      setStockEdits((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
    } catch {
      Alert.alert("خطأ", "تعذر تحديث المخزون");
    } finally {
      setStockSaving(null);
    }
  };

  const adjustStock = (item: ApiMenuItem, delta: number) => {
    const current = getStockEditValue(item);
    const currentNum = current === "" ? 0 : parseInt(current);
    const next = Math.max(0, (isNaN(currentNum) ? 0 : currentNum) + delta);
    setStockEdits((prev) => ({ ...prev, [item.itemId]: String(next) }));
  };

  const handleToggleAvail = async (item: ApiMenuItem) => {
    setLoading(item.itemId);
    try {
      await apiPut(`/menu/${item.itemId}`, { available: !item.available });
      await refresh();
    } catch {
      Alert.alert("خطأ", "تعذر تحديث الحالة");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = (item: ApiMenuItem) => {
    Alert.alert(
      "حذف الصنف",
      `هل تريد حذف "${item.name}"؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            setLoading(item.itemId);
            try {
              await apiDelete(`/menu/${item.itemId}`);
              await refresh();
            } catch {
              Alert.alert("خطأ", "تعذر الحذف");
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const openEdit = (item: ApiMenuItem) => {
    setEditItem(item);
    setNewName(item.name);
    setNewNameEn(item.nameEn ?? "");
    setNewPrice((item.price / 100).toString());
    setNewCategory(item.category);
    setNewImageUrl(item.imageUrl ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    const priceNum = parseFloat(newPrice);
    if (!newName.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("خطأ", "تأكد من صحة الاسم والسعر");
      return;
    }
    setLoading(editItem.itemId);
    try {
      await apiPut(`/menu/${editItem.itemId}`, {
        name: newName.trim(),
        nameEn: newNameEn.trim() || undefined,
        price: priceNum,
        category: newCategory,
        imageUrl: newImageUrl || null,
      });
      await refresh();
      setEditItem(null);
    } catch {
      Alert.alert("خطأ", "تعذر الحفظ");
    } finally {
      setLoading(null);
    }
  };

  const handleAdd = async () => {
    const priceNum = parseFloat(newPrice);
    if (!newName.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("خطأ", "تأكد من صحة الاسم والسعر");
      return;
    }
    setLoading("add");
    try {
      await apiPost("/menu", {
        name: newName.trim(),
        nameEn: newNameEn.trim() || undefined,
        price: priceNum,
        category: newCategory,
        imageUrl: newImageUrl || null,
      });
      await refresh();
      setShowAddModal(false);
      setNewName("");
      setNewNameEn("");
      setNewPrice("");
      setNewCategory("chicken");
      setNewImageUrl("");
    } catch {
      Alert.alert("خطأ", "تعذر الإضافة");
    } finally {
      setLoading(null);
    }
  };

  const openAdd = () => {
    setNewName("");
    setNewNameEn("");
    setNewPrice("");
    setNewCategory("chicken");
    setNewImageUrl("");
    setShowAddModal(true);
  };

  const handleToggleOccasion = async (occ: ApiOccasion) => {
    setLoading(occ.occasionId);
    try {
      await apiPut(`/occasions/${occ.occasionId}`, { active: !occ.active });
      await refreshOccasions();
    } catch {
      Alert.alert("خطأ", "تعذر تحديث الحالة");
    } finally {
      setLoading(null);
    }
  };

  const openEditOccasion = (occ: ApiOccasion) => {
    setEditOccasion(occ);
    setOccName(occ.name);
    setOccDesc(occ.description ?? "");
    setOccImageUrl(occ.imageUrl ?? "");
  };

  const handleSaveOccasion = async () => {
    if (!occName.trim()) { Alert.alert("خطأ", "أدخل اسم المناسبة"); return; }
    setLoading("occ-save");
    try {
      if (editOccasion) {
        await apiPut(`/occasions/${editOccasion.occasionId}`, {
          name: occName.trim(),
          description: occDesc.trim() || undefined,
          imageUrl: occImageUrl.trim() || undefined,
        });
        setEditOccasion(null);
      } else {
        await apiPost("/occasions", {
          name: occName.trim(),
          description: occDesc.trim() || undefined,
          imageUrl: occImageUrl.trim() || undefined,
        });
        setShowAddOccasionModal(false);
      }
      setOccName(""); setOccDesc(""); setOccImageUrl("");
      await refreshOccasions();
    } catch {
      Alert.alert("خطأ", "تعذر الحفظ");
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteOccasion = (occ: ApiOccasion) => {
    Alert.alert("حذف المناسبة", `هل تريد حذف "${occ.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try {
          await apiDelete(`/occasions/${occ.occasionId}`);
          await refreshOccasions();
        } catch {
          Alert.alert("خطأ", "تعذر الحذف");
        }
      }},
    ]);
  };

  const handlePickBannerImage = async () => {
    const quality = await askImageQuality();
    if (quality === null) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الصور في الإعدادات"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    setBannerUploading(true);
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      const urlRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `banner-${Date.now()}.${ext}`, size: asset.fileSize ?? 0, contentType }),
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const imageBlob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: imageBlob });
      setBannerImageUrl(`${STORAGE_BASE_URL}/api/storage${objectPath}`);
    } catch {
      Alert.alert("خطأ", "تعذر رفع الصورة، حاول مرة أخرى");
    } finally {
      setBannerUploading(false);
    }
  };

  const handleAddBanner = async () => {
    if (!bannerImageUrl) { Alert.alert("تنبيه", "يرجى اختيار صورة أولاً"); return; }
    try {
      await apiPost("/banners", { imageUrl: bannerImageUrl, title: bannerTitle.trim() || null });
      setBannerImageUrl("");
      setBannerTitle("");
      await refreshBanners();
    } catch {
      Alert.alert("خطأ", "تعذر إضافة البانر");
    }
  };

  const handleToggleBanner = async (b: ApiBanner) => {
    setBannerLoading(b.bannerId);
    try {
      await apiPut(`/banners/${b.bannerId}`, { active: !b.active });
      await refreshBanners();
    } catch {
      Alert.alert("خطأ", "تعذر تعديل البانر");
    } finally {
      setBannerLoading(null);
    }
  };

  const handleDeleteBanner = (b: ApiBanner) => {
    setBannerToDelete(b);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: "#1A1008", paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
          <Feather name="arrow-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4, alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => setActiveTab("menu")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "menu" ? colors.gold : colors.secondary }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "menu" ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold }]}>الأصناف</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("occasions")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "occasions" ? colors.gold : colors.secondary }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "occasions" ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold }]}>المناسبات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("stock")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "stock" ? "#7B1FA2" : colors.secondary, borderWidth: 1, borderColor: activeTab === "stock" ? "#CE93D8" : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "stock" ? "#fff" : colors.mutedForeground, fontFamily: F.bold }]}>📦 المخزون</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("settings")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "settings" ? "#1B5E20" : colors.secondary, borderWidth: 1, borderColor: activeTab === "settings" ? "#66BB6A" : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "settings" ? "#fff" : colors.mutedForeground, fontFamily: F.bold }]}>⚙️ الإعدادات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("banners")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "banners" ? "#7B3F00" : colors.secondary, borderWidth: 1, borderColor: activeTab === "banners" ? colors.gold : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "banners" ? colors.gold : colors.mutedForeground, fontFamily: F.bold }]}>🖼️ البانر</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("revenue")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "revenue" ? "#0A2A1A" : colors.secondary, borderWidth: 1, borderColor: activeTab === "revenue" ? "#4CAF50" : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "revenue" ? "#4CAF50" : colors.mutedForeground, fontFamily: F.bold }]}>📊 الإيرادات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("combos")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "combos" ? "#1A2A3A" : colors.secondary, borderWidth: 1, borderColor: activeTab === "combos" ? "#82B1FF" : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "combos" ? "#82B1FF" : colors.mutedForeground, fontFamily: F.bold }]}>🎁 الوجبات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("zones")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "zones" ? "#0A2A2A" : colors.secondary, borderWidth: 1, borderColor: activeTab === "zones" ? "#26C6DA" : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "zones" ? "#26C6DA" : colors.mutedForeground, fontFamily: F.bold }]}>🗺️ التوصيل</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("referrals")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "referrals" ? "#0A1F0A" : colors.secondary, borderWidth: 1, borderColor: activeTab === "referrals" ? "#4CAF50" : "transparent" }]}
          >
            <Text style={[styles.tabBtnText, { color: activeTab === "referrals" ? "#4CAF50" : colors.mutedForeground, fontFamily: F.bold }]}>🎁 الإحالات</Text>
          </TouchableOpacity>
        </ScrollView>
        <TouchableOpacity
          onPress={
            activeTab === "menu" ? openAdd
            : activeTab === "occasions" ? () => { setOccName(""); setOccDesc(""); setOccImageUrl(""); setShowAddOccasionModal(true); }
            : activeTab === "combos" ? () => { setComboName(""); setComboDesc(""); setComboPrice(""); setComboImageUrl(""); setComboComponents([{ name: "", quantity: 1 }]); setEditCombo(null); setShowAddComboModal(true); }
            : activeTab === "zones" ? openAddZone
            : undefined
          }
          style={[styles.iconBtn, { backgroundColor: (activeTab === "stock" || activeTab === "settings" || activeTab === "banners" || activeTab === "revenue") ? colors.secondary : colors.gold, opacity: (activeTab === "stock" || activeTab === "settings" || activeTab === "banners" || activeTab === "revenue") ? 0.3 : 1 }]}
          disabled={activeTab === "stock" || activeTab === "settings" || activeTab === "banners" || activeTab === "revenue"}
        >
          <Feather name="plus" size={20} color={(activeTab === "stock" || activeTab === "settings" || activeTab === "banners" || activeTab === "revenue") ? colors.mutedForeground : "#fff"} />
        </TouchableOpacity>
      </View>

      {activeTab === "menu" && <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ backgroundColor: "#1A1008" }}
      >
        <TouchableOpacity
          onPress={() => setFilterCat("all")}
          style={[styles.filterTab, { backgroundColor: filterCat === "all" ? colors.gold : colors.secondary, borderColor: filterCat === "all" ? colors.gold : colors.border }]}
        >
          <Text style={[styles.filterText, { color: filterCat === "all" ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold }]}>الكل ({items.length})</Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => {
          const count = items.filter((i) => i.category === cat.id).length;
          const active = filterCat === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setFilterCat(cat.id)}
              style={[styles.filterTab, { backgroundColor: active ? colors.gold : colors.secondary, borderColor: active ? colors.gold : colors.border }]}
            >
              <Text style={[styles.filterText, { color: active ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold }]}>
                {cat.icon} {cat.name} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>}

      {/* Items list — menu tab */}
      {activeTab === "menu" && <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 20 }]}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>🍽️</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>لا توجد أصناف</Text>
          </View>
        ) : (
          filtered.map((item) => {
            const cat = getCatMeta(item.category);
            const priceStr = (item.price / 100) % 1 === 0
              ? (item.price / 100).toString()
              : (item.price / 100).toFixed(2);
            const isLoading = loading === item.itemId;

            return (
              <View key={item.itemId} style={[styles.card, { backgroundColor: colors.card, borderColor: item.available ? colors.border : "#5A2A2A" }]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardLeft}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.gold} />
                    ) : (
                      <Switch
                        value={item.available}
                        onValueChange={() => handleToggleAvail(item)}
                        trackColor={{ false: "#3A1A1A", true: "#2A5A2A" }}
                        thumbColor={item.available ? "#4CAF50" : "#E57373"}
                      />
                    )}
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.itemName, { color: item.available ? colors.foreground : colors.mutedForeground, fontFamily: F.bold }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View style={styles.itemMeta}>
                      <Text style={[styles.itemCat, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                        {cat.icon} {cat.name}
                      </Text>
                      <Text style={[styles.itemPrice, { color: colors.gold, fontFamily: F.extra }]}>
                        {priceStr} ر.س
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      {item.stock === null ? (
                        <View style={[styles.stockBadge, { backgroundColor: "#1A2A1A", borderColor: "#2A4A2A" }]}>
                          <Text style={[styles.stockText, { color: "#4CAF50", fontFamily: F.semi }]}>∞ غير محدود</Text>
                        </View>
                      ) : item.stock === 0 ? (
                        <View style={[styles.stockBadge, { backgroundColor: "#5A1A1A", borderColor: "#8A2A2A" }]}>
                          <Text style={[styles.stockText, { color: "#E57373", fontFamily: F.bold }]}>نافد 0</Text>
                        </View>
                      ) : (
                        <View style={[styles.stockBadge, { backgroundColor: item.stock <= 3 ? "#3A2A00" : "#1A2A3A", borderColor: item.stock <= 3 ? colors.gold : "#2A4A5A" }]}>
                          <Text style={[styles.stockText, { color: item.stock <= 3 ? colors.gold : "#64B5F6", fontFamily: F.bold }]}>
                            📦 {item.stock} متبقي{item.stock <= 3 ? " ⚠️" : ""}
                          </Text>
                        </View>
                      )}
                      {!item.available && item.stock === null && (
                        <View style={[styles.unavailBadge, { backgroundColor: "#5A1A1A" }]}>
                          <Text style={[styles.unavailText, { fontFamily: F.bold }]}>معطل</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, { backgroundColor: "#3A1A1A" }]}>
                    <Feather name="trash-2" size={15} color="#E57373" />
                    <Text style={[styles.actionText, { color: "#E57373", fontFamily: F.bold }]}>حذف</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(item)} style={[styles.actionBtn, { backgroundColor: "#1A2A3A", flex: 2 }]}>
                    <Feather name="edit-2" size={15} color="#64B5F6" />
                    <Text style={[styles.actionText, { color: "#64B5F6", fontFamily: F.bold }]}>تعديل</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>}

      {/* Occasions tab */}
      {activeTab === "occasions" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 20 }]}
        >
          {allOccasions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🎉</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>لا توجد مناسبات</Text>
            </View>
          ) : allOccasions.map((occ) => {
            const isOccLoading = loading === occ.occasionId;
            return (
              <View key={occ.occasionId} style={[styles.card, { backgroundColor: colors.card, borderColor: occ.active ? colors.border : "#5A2A2A" }]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardLeft}>
                    {isOccLoading ? (
                      <ActivityIndicator size="small" color={colors.gold} />
                    ) : (
                      <Switch
                        value={occ.active}
                        onValueChange={() => handleToggleOccasion(occ)}
                        trackColor={{ false: "#3A1A1A", true: "#2A5A2A" }}
                        thumbColor={occ.active ? "#4CAF50" : "#E57373"}
                      />
                    )}
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.itemName, { color: occ.active ? colors.foreground : colors.mutedForeground, fontFamily: F.bold }]} numberOfLines={2}>
                      {occ.name}
                    </Text>
                    {occ.description ? (
                      <Text style={[styles.itemCat, { color: colors.mutedForeground, fontFamily: F.regular }]} numberOfLines={1}>{occ.description}</Text>
                    ) : null}
                    {occ.imageUrl ? (
                      <Text style={[styles.itemCat, { color: colors.gold, fontFamily: F.regular }]} numberOfLines={1}>🖼️ صورة مخصصة</Text>
                    ) : (
                      <Text style={[styles.itemCat, { color: colors.mutedForeground, fontFamily: F.regular }]}>🖼️ صورة افتراضية</Text>
                    )}
                    {!occ.active && (
                      <View style={[styles.unavailBadge, { backgroundColor: "#5A1A1A" }]}>
                        <Text style={[styles.unavailText, { fontFamily: F.bold }]}>مخفية</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity onPress={() => handleDeleteOccasion(occ)} style={[styles.actionBtn, { backgroundColor: "#3A1A1A" }]}>
                    <Feather name="trash-2" size={15} color="#E57373" />
                    <Text style={[styles.actionText, { color: "#E57373", fontFamily: F.bold }]}>حذف</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEditOccasion(occ)} style={[styles.actionBtn, { backgroundColor: "#1A2A3A" }]}>
                    <Feather name="edit-2" size={15} color="#64B5F6" />
                    <Text style={[styles.actionText, { color: "#64B5F6", fontFamily: F.bold }]}>تعديل</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 20, gap: 0 }]}
        >
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

          {/* loading / empty guard */}
          {items.length === 0 && (
            <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
              <ActivityIndicator size="large" color="#7B1FA2" />
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14 }}>جار تحميل بيانات المخزون…</Text>
            </View>
          )}

          {/* ── TABLE VIEW ── */}
          {stockViewMode === "table" && CATEGORIES.map((cat) => {
            const catItems = items.filter((i) => i.category === cat.id);
            if (catItems.length === 0) return null;
            const totalStock = catItems.reduce((s, i) => s + (i.stock ?? 0), 0);
            const outCount   = catItems.filter((i) => i.stock === 0).length;
            const lowCount   = catItems.filter((i) => i.stock !== null && i.stock > 0 && i.stock <= 3).length;
            return (
              <View key={cat.id} style={{ marginBottom: 14 }}>
                {/* Category header */}
                <View style={{ backgroundColor: "#1A1008", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2A1A0A" }}>
                  <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                  <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 15, flex: 1 }}>{cat.name}</Text>
                  {outCount > 0 && <Text style={{ color: "#E57373", fontFamily: F.bold, fontSize: 11 }}>⚠️ {outCount} نافد</Text>}
                  {lowCount > 0 && <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 11, marginStart: 6 }}>⬇️ {lowCount} منخفض</Text>}
                </View>
                {/* Table header row */}
                <View style={{ flexDirection: "row", backgroundColor: "#120A02", borderBottomWidth: 1, borderBottomColor: "#2A1A0A", paddingHorizontal: 14, paddingVertical: 6 }}>
                  <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>الصنف</Text>
                  <Text style={{ width: 64, color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "center" }}>الكمية</Text>
                  <Text style={{ width: 72, color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "center" }}>الحالة</Text>
                </View>
                {/* Rows */}
                {catItems.map((item, idx) => {
                  const isLast = idx === catItems.length - 1;
                  const rowBg = idx % 2 === 0 ? colors.card : "#130D06";
                  const stockColor = item.stock === null ? "#4CAF50"
                    : item.stock === 0 ? "#E57373"
                    : item.stock <= 3 ? colors.gold
                    : "#64B5F6";
                  const statusLabel = item.stock === null ? "غير محدود"
                    : item.stock === 0 ? "نافد"
                    : item.stock <= 3 ? "منخفض"
                    : "متاح";
                  const statusBg = item.stock === null ? "#1A3A1A"
                    : item.stock === 0 ? "#3A1A1A"
                    : item.stock <= 3 ? "#3A2A00"
                    : "#1A2A3A";
                  return (
                    <View key={item.itemId} style={{ flexDirection: "row", alignItems: "center", backgroundColor: rowBg, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 11 }}>
                      <Text style={{ flex: 1, color: item.available ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={{ width: 64, color: stockColor, fontFamily: F.extra, fontSize: 16, textAlign: "center" }}>
                        {item.stock === null ? "∞" : item.stock}
                      </Text>
                      <View style={{ width: 72, alignItems: "center" }}>
                        <View style={{ backgroundColor: statusBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ color: stockColor, fontFamily: F.bold, fontSize: 11 }}>{statusLabel}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {/* Category footer: totals */}
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
            const catItems = items.filter((i) => i.category === cat.id);
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

          {/* Occasions section */}
          <View style={{ marginTop: 16 }}>
            <View style={{ backgroundColor: "#1A0D1A", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderTopWidth: 1, borderColor: "#2A0A2A" }}>
              <Text style={{ fontSize: 18 }}>🎉</Text>
              <Text style={{ color: "#CE93D8", fontFamily: F.extra, fontSize: 15 }}>المناسبات</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, marginRight: "auto" }}>
                {allOccasions.length} مناسبة
              </Text>
            </View>
            {allOccasions.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular }}>لا توجد مناسبات</Text>
              </View>
            ) : allOccasions.map((occ) => {
              const isOccLoading = loading === occ.occasionId;
              return (
                <View key={occ.occasionId} style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: occ.active ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }} numberOfLines={1}>
                      {occ.name}
                    </Text>
                    <Text style={{ color: occ.active ? "#CE93D8" : colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                      {occ.active ? "✅ مفعّلة" : "⛔ مخفية"}
                    </Text>
                  </View>
                  {isOccLoading ? (
                    <ActivityIndicator size="small" color="#CE93D8" />
                  ) : (
                    <Switch
                      value={occ.active}
                      onValueChange={() => handleToggleOccasion(occ)}
                      trackColor={{ false: "#3A1A1A", true: "#5A2A6A" }}
                      thumbColor={occ.active ? "#CE93D8" : "#E57373"}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {activeTab === "settings" && (
        <View style={{ flex: 1 }}>
          {/* ── Settings Sub-Nav ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8, flexDirection: "row-reverse" }}
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 }}
          >
            {([
              { key: "hours",      icon: "clock",       label: "الأوقات"    },
              { key: "payment",    icon: "credit-card", label: "الدفع"      },
              { key: "discounts",  icon: "tag",         label: "الخصومات"   },
              { key: "ratings",    icon: "star",        label: "التقييمات"  },
              { key: "drivers",    icon: "truck",       label: "المناديب"   },
              { key: "wallets",    icon: "dollar-sign", label: "المحافظ"    },
              { key: "sms",        icon: "message-square", label: "الرسائل" },
              { key: "security",   icon: "lock",        label: "الأمان"     },
              { key: "appearance", icon: "sliders",     label: "المظهر"     },
              { key: "occasions",  icon: "calendar",    label: "المناسبات"  },
              { key: "logobg",     icon: "image",       label: "الشعار"     },
              { key: "sounds",     icon: "volume-2",    label: "الأصوات"    },
              { key: "texts",      icon: "edit-2",      label: "النصوص"     },
              { key: "music",      icon: "music",       label: "الموسيقى"   },
            ] as const).map(({ key, icon, label }) => {
              const active = settingsSection === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSettingsSection(key)}
                  style={{
                    flexDirection: "row-reverse", alignItems: "center", gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: active ? colors.gold : colors.secondary,
                    borderWidth: 1, borderColor: active ? colors.gold : colors.border,
                  }}
                >
                  <Feather name={icon as any} size={13} color={active ? "#1A1008" : colors.mutedForeground} />
                  <Text style={{ color: active ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12, writingDirection: "rtl" }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Refresh bar ── */}
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity
              onPress={refreshCurrentSection}
              disabled={settingsRefreshing}
              style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border, opacity: settingsRefreshing ? 0.6 : 1 }}
            >
              {settingsRefreshing
                ? <ActivityIndicator size="small" color={colors.gold} />
                : <Feather name="refresh-cw" size={13} color={colors.gold} />
              }
              <Text style={{ color: colors.gold, fontFamily: F.semi, fontSize: 12 }}>
                {settingsRefreshing ? "جارٍ التحديث..." : "تحديث"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 16 }}>

          {/* ══════════════════ HOURS ══════════════════ */}
          {settingsSection === "hours" && (<>
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            🕐 أوقات عمل الفرع
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: colors.border }}>

            {/* Master toggle */}
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: "right" }}>
                  تفعيل قيود أوقات العمل
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", marginTop: 3 }}>
                  {branchHours.enabled
                    ? "✅ مفعّل — الطلبات تُقبل فقط في ساعات العمل"
                    : "❌ موقوف — الطلبات مقبولة في أي وقت"}
                </Text>
              </View>
              <Switch
                value={branchHours.enabled}
                onValueChange={(v) => setBranchHours({ ...branchHours, enabled: v })}
                trackColor={{ false: colors.border, true: "#7B1FA2" + "88" }}
                thumbColor={branchHours.enabled ? "#CE93D8" : colors.mutedForeground}
              />
            </View>

            {branchHours.enabled && (
              <View style={{ gap: 10 }}>
                {DAY_NAMES.map((name, i) => {
                  const day = branchHours.days[i] ?? { enabled: true, open: "09:00", close: "23:00" };
                  return (
                    <View key={i} style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 12, gap: 8, borderWidth: 1, borderColor: day.enabled ? colors.border : "#3A1A1A" }}>
                      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: day.enabled ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }}>
                          {name}
                        </Text>
                        <Switch
                          value={day.enabled}
                          onValueChange={(v) => {
                            const days = [...branchHours.days];
                            days[i] = { ...day, enabled: v };
                            setBranchHours({ ...branchHours, days });
                          }}
                          trackColor={{ false: "#3A1A1A", true: "#1A4A2A" }}
                          thumbColor={day.enabled ? "#4CAF50" : "#E57373"}
                        />
                      </View>
                      {day.enabled && (
                        <View style={{ flexDirection: "row-reverse", gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "right", marginBottom: 4 }}>يفتح</Text>
                            <TextInput
                              value={day.open}
                              onChangeText={(v) => {
                                const days = [...branchHours.days];
                                days[i] = { ...day, open: v };
                                setBranchHours({ ...branchHours, days });
                              }}
                              placeholder="09:00"
                              placeholderTextColor={colors.mutedForeground}
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                              style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: "#4CAF50", fontFamily: F.bold, textAlign: "center", borderWidth: 1, borderColor: colors.border }}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "right", marginBottom: 4 }}>يغلق</Text>
                            <TextInput
                              value={day.close}
                              onChangeText={(v) => {
                                const days = [...branchHours.days];
                                days[i] = { ...day, close: v };
                                setBranchHours({ ...branchHours, days });
                              }}
                              placeholder="23:00"
                              placeholderTextColor={colors.mutedForeground}
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                              style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: "#E57373", fontFamily: F.bold, textAlign: "center", borderWidth: 1, borderColor: colors.border }}
                            />
                          </View>
                        </View>
                      )}
                      {!day.enabled && (
                        <Text style={{ color: "#E57373", fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>مغلق</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Save button */}
            <TouchableOpacity
              onPress={async () => {
                setHoursLoading(true);
                try {
                  await apiPut("/branch-hours", branchHours);
                  Alert.alert("✅ تم الحفظ", "تم حفظ أوقات العمل بنجاح");
                } catch {
                  Alert.alert("خطأ", "تعذر حفظ الإعدادات");
                } finally {
                  setHoursLoading(false);
                }
              }}
              disabled={hoursLoading}
              style={{ backgroundColor: "#7B1FA2", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 }}
            >
              {hoursLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 15 }}>💾 حفظ أوقات العمل</Text>
              }
            </TouchableOpacity>
          </View>
          </>)}

          {/* ══════════════════ APPEARANCE ══════════════════ */}
          {settingsSection === "appearance" && (<>

          {/* Colors & Spacing shortcut */}
          <TouchableOpacity
            onPress={() => router.push("/app-settings" as any)}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5,
              borderColor: colors.gold + "66", padding: 18,
              flexDirection: "row-reverse", alignItems: "center", gap: 14,
            }}
          >
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.gold + "22", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>🎨</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 15, textAlign: "right" }}>
                الألوان والمسافات والخطوط
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                تخصيص لون التطبيق • سمة الخلفية • حجم الخطوط • المسافات
              </Text>
            </View>
            <Feather name="chevron-left" size={20} color={colors.gold} />
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* ── UI Density ── */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            📐 كثافة واجهة الشاشات
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
              تحكم في المسافات وحجم العناصر في شاشة الدفع وغيرها
            </Text>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              {(["compact", "normal", "spacious"] as UIDensity[]).map((d) => {
                const label = d === "compact" ? "مضغوط" : d === "normal" ? "عادي" : "مريح";
                const icon  = d === "compact" ? "🗜️" : d === "normal" ? "⚖️" : "🌿";
                const active = uiDensity === d;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => saveUIDensity(d)}
                    style={{
                      flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", gap: 4,
                      backgroundColor: active ? colors.gold + "22" : colors.secondary,
                      borderWidth: 1.5, borderColor: active ? colors.gold : colors.border,
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 18 }}>{icon}</Text>
                    <Text style={{ color: active ? colors.gold : colors.mutedForeground, fontFamily: active ? F.bold : F.regular, fontSize: 13 }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border }} />

          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            ⚙️ إعدادات التاب بار
          </Text>

          {/* Height */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>الارتفاع</Text>
              <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 20 }}>{tabConfig.height}</Text>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              {[55, 60, 65, 70, 75, 80, 85, 90].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => updateTabConfig({ ...tabConfig, height: v })}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: tabConfig.height === v ? colors.gold : colors.secondary }}
                >
                  <Text style={{ color: tabConfig.height === v ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              <TouchableOpacity
                onPress={() => updateTabConfig({ ...tabConfig, height: Math.max(50, tabConfig.height - 1) })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
              >
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateTabConfig({ ...tabConfig, height: Math.min(100, tabConfig.height + 1) })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
              >
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Padding Bottom */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>التباعد السفلي</Text>
              <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 20 }}>{tabConfig.paddingBottom}</Text>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              {[4, 6, 8, 10, 12, 14, 16, 18].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => updateTabConfig({ ...tabConfig, paddingBottom: v })}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: tabConfig.paddingBottom === v ? colors.gold : colors.secondary }}
                >
                  <Text style={{ color: tabConfig.paddingBottom === v ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              <TouchableOpacity
                onPress={() => updateTabConfig({ ...tabConfig, paddingBottom: Math.max(0, tabConfig.paddingBottom - 1) })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
              >
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateTabConfig({ ...tabConfig, paddingBottom: Math.min(30, tabConfig.paddingBottom + 1) })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
              >
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Font Size */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>حجم الخط</Text>
              <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 20 }}>{tabConfig.fontSize}</Text>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              {[10, 11, 12, 13, 14, 15, 16].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => updateTabConfig({ ...tabConfig, fontSize: v })}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: tabConfig.fontSize === v ? colors.gold : colors.secondary }}
                >
                  <Text style={{ color: tabConfig.fontSize === v ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              <TouchableOpacity
                onPress={() => updateTabConfig({ ...tabConfig, fontSize: Math.max(9, tabConfig.fontSize - 1) })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
              >
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateTabConfig({ ...tabConfig, fontSize: Math.min(18, tabConfig.fontSize + 1) })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
              >
                <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Reset button */}
          <TouchableOpacity
            onPress={() => updateTabConfig({ height: 70, paddingBottom: 10, fontSize: 12 })}
            style={{ paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }}>↺ إعادة ضبط الإعدادات</Text>
          </TouchableOpacity>

          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "center" }}>
            التغييرات تُحفظ تلقائياً وتظهر فور الرجوع للتطبيق
          </Text>
          </>)}

          {/* ══════════════════ PAYMENT ══════════════════ */}
          {settingsSection === "payment" && (<>
          {/* Payment Settings */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            💳 إعدادات الدفع
          </Text>

          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14 }}>
            {/* Delivery Option Toggle */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ gap: 3, flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15, textAlign: "right" }}>
                  🚗 تفعيل خيار التوصيل
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                  {paymentSettings.deliveryEnabled
                    ? "العميل يرى خيار \"توصيل\" أو \"استلام من الفرع\" في الفاتورة"
                    : "إيقاف — لا يظهر خيار التوصيل للعميل"}
                </Text>
              </View>
              <Switch
                value={paymentSettings.deliveryEnabled}
                onValueChange={(val) => updateAppConfig({ deliveryEnabled: val })}
                trackColor={{ false: colors.border, true: "#8B6914" }}
                thumbColor={paymentSettings.deliveryEnabled ? colors.gold : colors.mutedForeground}
              />
            </View>

            {paymentSettings.deliveryEnabled && (
              <>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                {/* Delivery Fee */}
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15, textAlign: "right", flex: 1 }}>
                      💰 رسوم التوصيل
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary, borderRadius: 10, borderWidth: 1, borderColor: paymentSettings.deliveryFee > 0 ? colors.gold : colors.border, paddingHorizontal: 12, gap: 6 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>ر.س</Text>
                      <TextInput
                        value={paymentSettings.deliveryFee === 0 ? "" : String(paymentSettings.deliveryFee)}
                        onChangeText={(v) => {
                          const num = parseFloat(v) || 0;
                          updateAppConfig({ deliveryFee: num });
                        }}
                        placeholder="0"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                        style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 16, minWidth: 60, textAlign: "center", paddingVertical: 10 }}
                      />
                    </View>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                    {paymentSettings.deliveryFee === 0 ? "✅ التوصيل مجاني حالياً" : `سيُضاف ${paymentSettings.deliveryFee} ر.س رسوم توصيل على كل طلب توصيل`}
                  </Text>
                </View>
              </>
            )}

            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Apple Pay Toggle */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ gap: 3, flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15, textAlign: "right" }}>
                   Apple Pay
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                  إظهار خيار الدفع بـ Apple Pay في الشاشة الدفع
                </Text>
              </View>
              <Switch
                value={paymentSettings.applePayEnabled}
                onValueChange={(val) =>
                  savePaymentSettings({ ...paymentSettings, applePayEnabled: val })
                }
                trackColor={{ false: colors.border, true: "#D4AF37" }}
                thumbColor={paymentSettings.applePayEnabled ? "#1A0A00" : colors.mutedForeground}
              />
            </View>

            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Moyasar Publishable Key */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                🔑 Moyasar Publishable Key
              </Text>
              <TextInput
                value={paymentSettings.moyasarPublishableKey}
                onChangeText={(v) =>
                  savePaymentSettings({ ...paymentSettings, moyasarPublishableKey: v.trim() })
                }
                placeholder="pk_live_xxxxxxxxxxxxxxxxxx"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.secondary,
                  fontFamily: F.regular,
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 12,
                  textAlign: "left",
                  fontSize: 13,
                }}
              />
            </View>

            {/* Moyasar Apple Pay Merchant Identifier */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                🏪 Apple Pay Merchant ID
              </Text>
              <TextInput
                value={paymentSettings.moyasarApplePayIdentifier}
                onChangeText={(v) =>
                  savePaymentSettings({ ...paymentSettings, moyasarApplePayIdentifier: v.trim() })
                }
                placeholder="merchant.com.sallatalkhodar.app"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.secondary,
                  fontFamily: F.regular,
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 12,
                  textAlign: "left",
                  fontSize: 13,
                }}
              />
            </View>

            <View style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: 10 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", lineHeight: 20 }}>
                💡 اشغّل Apple Pay بعد إضافة الـ Keys من لوحة تحكم Moyasar.{"\n"}الإعدادات تُحفظ تلقائياً.
              </Text>
            </View>
          </View>
          </>)}

          {/* ══════════════════ RATINGS ══════════════════ */}
          {settingsSection === "ratings" && (<>
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            ⭐ تقييمات العملاء
          </Text>

          {/* Favorites toggle */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: "right" }}>
                  ❤️ تفعيل قسم المفضلة
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                  {favoritesEnabled ? "العملاء يستطيعون حفظ الأصناف المفضلة وتظهر في أعلى القائمة" : "قسم المفضلة مخفي من التطبيق"}
                </Text>
              </View>
              <Switch
                value={favoritesEnabled}
                onValueChange={async (v) => {
                  setFavoritesEnabled(v);
                  try { await apiPut("/settings/favorites-enabled", { enabled: v }); } catch {}
                }}
                trackColor={{ false: colors.border, true: "#C8171A88" }}
                thumbColor={favoritesEnabled ? "#C8171A" : colors.mutedForeground}
              />
            </View>
          </View>

          {/* Stats bar */}
          {!ratingsLoading && ratings.length > 0 && (() => {
            const avg = ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
            const dist = [5,4,3,2,1].map((s) => ({ stars: s, count: ratings.filter((r) => r.stars === s).length }));
            return (
              <View style={{ backgroundColor: "#1A0D05", borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: "#E8920C44" }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                  <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 32 }}>{avg.toFixed(1)}</Text>
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: "#FFD700", fontSize: 18 }}>{"⭐".repeat(Math.round(avg))}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>من {ratings.length} تقييم</Text>
                  </View>
                </View>
                {dist.map(({ stars, count }) => (
                  <View key={stars} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 12, width: 14, textAlign: "right" }}>{stars}</Text>
                    <Text style={{ fontSize: 10 }}>⭐</Text>
                    <View style={{ flex: 1, height: 8, backgroundColor: colors.secondary, borderRadius: 4, overflow: "hidden" }}>
                      <View style={{ width: ratings.length > 0 ? `${(count / ratings.length) * 100}%` : "0%", height: "100%", backgroundColor: "#E8920C", borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11, width: 20, textAlign: "left" }}>{count}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {ratingsLoading && <ActivityIndicator color={colors.gold} style={{ marginVertical: 20 }} />}

          {!ratingsLoading && ratings.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <Text style={{ fontSize: 40 }}>⭐</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14, marginTop: 8 }}>لا يوجد تقييمات حتى الآن</Text>
            </View>
          )}

          {/* Ratings list */}
          {ratings.map((r) => (
            <View key={r.orderId} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ gap: 4 }}>
                  <Text style={{ color: "#FFD700", fontSize: 16 }}>{"⭐".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</Text>
                  {r.customerName && (
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>
                      {r.customerName}
                    </Text>
                  )}
                  {r.customerPhone && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>
                      📱 {r.customerPhone}
                    </Text>
                  )}
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>
                    طلب رقم #{r.orderId}{r.orderTotal ? ` · ${r.orderTotal} ر.س` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                    {new Date(r.ratedAt).toLocaleDateString("ar-SA")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => Alert.alert("حذف التقييم", "هل تريد حذف هذا التقييم؟", [
                      { text: "إلغاء", style: "cancel" },
                      { text: "حذف", style: "destructive", onPress: () => deleteRating(r.orderId) },
                    ])}
                    disabled={deletingRating === r.orderId}
                  >
                    {deletingRating === r.orderId
                      ? <ActivityIndicator size="small" color="#E57373" />
                      : <Feather name="trash-2" size={16} color="#E57373" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
              {r.comment ? (
                <View style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: 10 }}>
                  <Text style={{ color: colors.foreground, fontFamily: F.regular, fontSize: 13, textAlign: "right", lineHeight: 20 }}>
                    💬 {r.comment}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
          </>)}

          {/* ══════════════════ DRIVERS ══════════════════ */}
          {settingsSection === "drivers" && (<>
          <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            🛵 المناديب
          </Text>

          {/* Sub-tab bar */}
          <View style={{ flexDirection: "row-reverse", backgroundColor: colors.secondary, borderRadius: 12, padding: 4, gap: 4 }}>
            {([
              { key: "manage",     label: "إدارة المناديب",  icon: "users" },
              { key: "statements", label: "كشف الحسابات",   icon: "dollar-sign" },
            ] as const).map(tab => {
              const active = driversSubTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => {
                    setDriversSubTab(tab.key);
                    if (tab.key === "statements") loadDriverSummaries();
                  }}
                  style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 9, backgroundColor: active ? colors.card : "transparent", borderWidth: active ? 1 : 0, borderColor: active ? "#4CAF5044" : "transparent" }}
                >
                  <Feather name={tab.icon} size={13} color={active ? "#4CAF50" : colors.mutedForeground} />
                  <Text style={{ color: active ? "#4CAF50" : colors.mutedForeground, fontFamily: active ? F.bold : F.regular, fontSize: 13 }}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── كشف الحسابات ── */}
          {driversSubTab === "statements" && (<>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                📅 {new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}
              </Text>
              <TouchableOpacity onPress={loadDriverSummaries} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: colors.border }}>
                <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>تحديث</Text>
              </TouchableOpacity>
            </View>

            {summariesLoading && <ActivityIndicator color="#4CAF50" style={{ marginVertical: 20 }} />}

            {!summariesLoading && driverSummaries.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 8 }}>
                <Text style={{ fontSize: 36 }}>📭</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>لا يوجد مناديب</Text>
              </View>
            )}

            {!summariesLoading && driverSummaries.map((row) => {
              const expanded = expandedDriverId === row.driver.id;
              return (
                <View key={row.driver.id} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: row.ordersCount > 0 ? "#4CAF5033" : colors.border, overflow: "hidden" }}>
                  {/* Driver header row */}
                  <TouchableOpacity
                    onPress={() => setExpandedDriverId(expanded ? null : row.driver.id)}
                    style={{ flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 }}
                  >
                    {/* Avatar */}
                    {row.driver.photoUrl
                      ? <Image source={{ uri: row.driver.photoUrl }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: row.driver.active ? "#4CAF50" : colors.border }} />
                      : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#1A2A1A", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: row.driver.active ? "#4CAF50" : colors.border }}>
                          <Text style={{ fontSize: 20 }}>🛵</Text>
                        </View>
                    }
                    {/* Info */}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>{row.driver.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{row.driver.phone}</Text>
                    </View>
                    {/* Stats */}
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#E8920C22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                        <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 15 }}>{row.ordersCount}</Text>
                        <Text style={{ color: "#E8920C", fontFamily: F.semi, fontSize: 11 }}>طلب</Text>
                      </View>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                        <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 14 }}>{row.totalCollected.toFixed(2)}</Text>
                        <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 11 }}>ريال</Text>
                      </View>
                    </View>
                    <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  {/* Expanded orders list */}
                  {expanded && (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                      {row.orders.length === 0 ? (
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "center", paddingVertical: 16 }}>لا يوجد طلبات مسلّمة اليوم</Text>
                      ) : (
                        row.orders.map((ord) => {
                          const time = ord.deliveredAt
                            ? new Date(ord.deliveredAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
                            : "--:--";
                          return (
                            <View key={ord.orderId} style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + "66" }}>
                              <View style={{ gap: 2 }}>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                                  <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 }}>
                                    <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 12 }}>#{ord.dailyNumber ?? ord.orderId}</Text>
                                  </View>
                                  <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{ord.customerName}</Text>
                                </View>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                                  <Feather name="clock" size={10} color={colors.mutedForeground} />
                                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{time}</Text>
                                </View>
                              </View>
                              <View style={{ alignItems: "flex-end" }}>
                                <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15 }}>{ord.totalPrice.toFixed(2)}</Text>
                                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>ريال</Text>
                              </View>
                            </View>
                          );
                        })
                      )}
                      {/* Total row */}
                      {row.orders.length > 0 && (
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#4CAF5011" }}>
                          <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 14 }}>الإجمالي</Text>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>{row.totalCollected.toFixed(2)}</Text>
                            <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>ريال — {row.ordersCount} طلبات</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>)}

          {/* ── إدارة المناديب ── */}
          {driversSubTab === "manage" && (<>

          {/* Feature toggle */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: "right" }}>
                  تفعيل خاصية المناديب
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                  {driversEnabled ? "يظهر زر تعيين مندوب للكاشير على طلبات التوصيل" : "خاصية المناديب مُوقفة"}
                </Text>
              </View>
              <Switch
                value={driversEnabled}
                onValueChange={async (v) => {
                  setDriversEnabled(v);
                  try { await apiPut("/settings/drivers-enabled", { enabled: v }); } catch {}
                }}
                trackColor={{ false: colors.border, true: "#4CAF5088" }}
                thumbColor={driversEnabled ? "#4CAF50" : colors.mutedForeground}
              />
            </View>
          </View>

          {/* Drivers list */}
          {driversLoading && <ActivityIndicator color="#4CAF50" style={{ marginVertical: 16 }} />}

          {!driversLoading && adminDrivers.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
              <Text style={{ fontSize: 40 }}>🛵</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>لا يوجد مناديب بعد</Text>
            </View>
          )}

          {adminDrivers.map((d) => (
            <View key={d.id} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: d.active ? "#4CAF5033" : colors.border, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                  {d.photoUrl
                    ? <Image source={{ uri: d.photoUrl }} style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: d.active ? "#4CAF50" : colors.border }} />
                    : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#1A2A1A", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: d.active ? "#4CAF50" : colors.border }}>
                        <Text style={{ fontSize: 22 }}>🛵</Text>
                      </View>
                  }
                  <View style={{ gap: 3 }}>
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>{d.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>📱 {d.phone}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>🔑 الرقم السري: {d.pin}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Switch
                    value={d.active}
                    onValueChange={async (v) => {
                      await apiPut(`/drivers/${d.id}`, { active: v }).catch(() => {});
                      await loadAdminDrivers();
                    }}
                    trackColor={{ false: colors.border, true: "#4CAF5088" }}
                    thumbColor={d.active ? "#4CAF50" : colors.mutedForeground}
                  />
                  <TouchableOpacity
                    onPress={() => openEditDriver(d)}
                    style={{ backgroundColor: "#E8920C22", borderRadius: 8, padding: 7, borderWidth: 1, borderColor: "#E8920C55" }}
                  >
                    <Feather name="edit-2" size={15} color="#E8920C" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDriverToDelete(d)}
                    style={{ backgroundColor: "#E5737322", borderRadius: 8, padding: 7, borderWidth: 1, borderColor: "#E5737355" }}
                  >
                    <Feather name="trash-2" size={15} color="#E57373" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          {/* ── Edit driver modal ── */}
          <Modal visible={!!editingDriver} transparent animationType="slide" onRequestClose={() => setEditingDriver(null)}>
            <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}>
              <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, maxHeight: "90%" }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>✏️ تعديل بيانات المندوب</Text>
                  <TouchableOpacity onPress={() => setEditingDriver(null)} style={{ padding: 4 }}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Avatar */}
                <TouchableOpacity
                  onPress={handlePickEditDriverPhoto}
                  disabled={editDriverPhotoUploading}
                  style={{ alignSelf: "center", alignItems: "center", gap: 6 }}
                >
                  {editDriverPhotoUploading ? (
                    <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.secondary, borderWidth: 2, borderColor: "#4CAF5066", alignItems: "center", justifyContent: "center" }}>
                      <ActivityIndicator color="#4CAF50" />
                    </View>
                  ) : editDriverPhotoUrl.trim() ? (
                    <View style={{ position: "relative" }}>
                      <Image source={{ uri: editDriverPhotoUrl.trim() }} style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: "#4CAF50" }} />
                      <View style={{ position: "absolute", bottom: 0, left: 0, backgroundColor: "#4CAF50", borderRadius: 14, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card }}>
                        <Feather name="camera" size={14} color="#fff" />
                      </View>
                    </View>
                  ) : (
                    <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.secondary, borderWidth: 2, borderColor: "#4CAF5066", borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="camera" size={26} color="#4CAF50" />
                    </View>
                  )}
                  <Text style={{ color: editDriverPhotoUrl ? "#4CAF50" : colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                    {editDriverPhotoUrl ? "تغيير الصورة" : "رفع صورة 📷"}
                  </Text>
                </TouchableOpacity>

                <TextInput
                  value={editDriverName}
                  onChangeText={setEditDriverName}
                  placeholder="الاسم الكامل"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "right" }}
                />
                <TextInput
                  value={editDriverPhone}
                  onChangeText={setEditDriverPhone}
                  placeholder="رقم الجوال"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "right" }}
                />
                <View style={{ gap: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>الرقم السري (أرقام فقط)</Text>
                  <TextInput
                    value={editDriverPin}
                    onChangeText={(v) => setEditDriverPin(v.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.extra, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "center", fontSize: 18, letterSpacing: 6 }}
                  />
                </View>

                <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                  <TouchableOpacity
                    onPress={saveEditDriver}
                    disabled={editDriverSaving}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#4CAF50", opacity: editDriverSaving ? 0.7 : 1 }}
                  >
                    {editDriverSaving
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14 }}>💾 حفظ التعديلات</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEditingDriver(null)}
                    style={{ paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Add driver form */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
            <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>➕ إضافة مندوب جديد</Text>

            <TextInput
              value={driverName}
              onChangeText={setDriverName}
              placeholder="الاسم الكامل"
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "right" }}
            />
            <TextInput
              value={driverPhone}
              onChangeText={setDriverPhone}
              placeholder="رقم الجوال"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "right" }}
            />
            <TextInput
              value={driverPin}
              onChangeText={(v) => setDriverPin(v.replace(/\D/g, "").slice(0, 8))}
              placeholder="الرقم السري (أرقام فقط)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.extra, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "center", fontSize: 18, letterSpacing: 6 }}
            />
            {/* Photo picker */}
            <TouchableOpacity
              onPress={handlePickDriverPhoto}
              disabled={driverPhotoUploading}
              style={{ alignSelf: "center", alignItems: "center", gap: 8 }}
            >
              {driverPhotoUploading ? (
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.secondary, borderWidth: 2, borderColor: "#4CAF5066", alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color="#4CAF50" />
                </View>
              ) : driverPhotoUrl.trim() ? (
                <View style={{ position: "relative" }}>
                  <Image source={{ uri: driverPhotoUrl.trim() }} style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: "#4CAF50" }} />
                  <View style={{ position: "absolute", bottom: 0, left: 0, backgroundColor: "#4CAF50", borderRadius: 14, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card }}>
                    <Feather name="camera" size={14} color="#fff" />
                  </View>
                </View>
              ) : (
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.secondary, borderWidth: 2, borderColor: "#4CAF5066", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Feather name="camera" size={26} color="#4CAF50" />
                </View>
              )}
              <Text style={{ color: driverPhotoUrl ? "#4CAF50" : colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                {driverPhotoUrl ? "تغيير الصورة" : "رفع صورة المندوب 📷"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={saveDriver}
              disabled={driverSaving}
              style={{ paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#4CAF50", opacity: driverSaving ? 0.7 : 1 }}
            >
              {driverSaving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14 }}>حفظ المندوب 🛵</Text>}
            </TouchableOpacity>
          </View>
          </>)}
          </>)}

          {/* ══════════════════ DISCOUNTS ══════════════════ */}
          {settingsSection === "discounts" && (<>
          {/* Discount Codes */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            🏷️ أكواد الخصم
          </Text>

          {/* Bulk delete expired button */}
          {discountCodes.some((dc) => !!dc.expiresAt && new Date(dc.expiresAt) < new Date()) && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  "حذف الأكواد المنتهية",
                  "سيتم حذف جميع الأكواد المنتهية الصلاحية نهائياً. هل أنت متأكد؟",
                  [
                    { text: "إلغاء", style: "cancel" },
                    {
                      text: "حذف الكل",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          const n = await cleanupExpired();
                          Alert.alert("تم", `تم حذف ${n} كود منتهي`);
                        } catch {
                          Alert.alert("خطأ", "تعذّر حذف الأكواد المنتهية");
                        }
                      },
                    },
                  ],
                );
              }}
              style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5737355", backgroundColor: "#2A0A08" }}
            >
              <Feather name="trash-2" size={14} color="#E57373" />
              <Text style={{ color: "#E57373", fontFamily: F.bold, fontSize: 13 }}>حذف جميع الأكواد المنتهية</Text>
            </TouchableOpacity>
          )}

          {/* Existing codes list */}
          {discountCodes.length > 0 && (
            <View style={{ gap: 10 }}>
              {/* Sort toggle */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>ترتيب:</Text>
                {(["default", "cost", "usage"] as const).map((opt) => {
                  const label = opt === "default" ? "الافتراضي" : opt === "cost" ? "الأعلى تكلفة" : "الأكثر استخداماً";
                  const active = dcSortBy === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setDcSortBy(opt)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: active ? colors.gold : colors.secondary, borderWidth: 1, borderColor: active ? colors.gold : colors.border }}
                    >
                      <Text style={{ color: active ? "#1A0A00" : colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {[...discountCodes]
                .sort((a, b) => {
                  if (dcSortBy === "cost") return (b.totalSavings ?? 0) - (a.totalSavings ?? 0);
                  if (dcSortBy === "usage") return (b.usageCount ?? 0) - (a.usageCount ?? 0);
                  const aExpired = !!a.expiresAt && new Date(a.expiresAt) < new Date();
                  const bExpired = !!b.expiresAt && new Date(b.expiresAt) < new Date();
                  if (aExpired === bExpired) return 0;
                  return aExpired ? 1 : -1;
                })
                .map((dc) => {
                const now = new Date();
                const isExpired = !!dc.expiresAt && new Date(dc.expiresAt) < now;
                const isExpiringSoon = !!dc.expiresAt && !isExpired && (new Date(dc.expiresAt).getTime() - now.getTime()) <= 3 * 24 * 60 * 60 * 1000;
                const usageCount = dc.usageCount ?? 0;
                const isExhausted = dc.maxUses != null && usageCount >= dc.maxUses;
                const isNearlyExhausted = dc.maxUses != null && !isExhausted && usageCount / dc.maxUses >= 0.8;
                const borderColor = isExpired ? "#E57373" : isExhausted ? "#E8920C" : isExpiringSoon ? "#F5C518" : isNearlyExhausted ? "#E8920C" : (dc.active ? colors.gold : colors.border);
                return (
                <View key={dc.id} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor, padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                      <View style={{ backgroundColor: isExpired ? "#2A0A08" : (dc.active ? "#2A1A08" : colors.secondary), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: isExpired ? "#E5737355" : (dc.active ? colors.gold : colors.border) }}>
                        <Text style={{ color: isExpired ? "#E57373" : (dc.active ? colors.gold : colors.mutedForeground), fontFamily: F.extra, fontSize: 13 }}>{dc.code}</Text>
                      </View>
                      <View style={{ backgroundColor: colors.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 12 }}>
                          {dc.type === "percentage" ? `${dc.value}%` : `${dc.value} ر.س`}
                        </Text>
                      </View>
                      {isExpired && (
                        <View style={{ backgroundColor: "#3A1010", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#E5737355" }}>
                          <Text style={{ color: "#E57373", fontFamily: F.bold, fontSize: 11 }}>منتهي</Text>
                        </View>
                      )}
                      {isExpiringSoon && (
                        <View style={{ backgroundColor: "#2A2000", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#F5C51855" }}>
                          <Text style={{ color: "#F5C518", fontFamily: F.bold, fontSize: 11 }}>⏰ ينتهي قريباً</Text>
                        </View>
                      )}
                      {isExhausted && (
                        <View style={{ backgroundColor: "#2A1800", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#E8920C55" }}>
                          <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 11 }}>نفد الرصيد 🔒</Text>
                        </View>
                      )}
                      {isNearlyExhausted && (
                        <View style={{ backgroundColor: "#2A1800", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#E8920C55" }}>
                          <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 11 }}>قارب على النفاد ⚠️</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: "row-reverse", gap: 10, alignItems: "center" }}>
                      <Switch
                        value={dc.active}
                        onValueChange={(v) => updateCode(dc.id, { active: v })}
                        trackColor={{ false: colors.border, true: "#D4AF37" }}
                        thumbColor={dc.active ? "#1A0A00" : colors.mutedForeground}
                      />
                      <TouchableOpacity onPress={() => deleteCode(dc.id)}>
                        <Feather name="trash-2" size={16} color="#E57373" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {dc.description ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>{dc.description}</Text>
                  ) : null}
                  {dc.minOrder > 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>الحد الأدنى للطلب: {dc.minOrder} ر.س</Text>
                  ) : null}
                  {dc.expiresAt ? (
                    <Text style={{ color: isExpired ? "#E57373" : isExpiringSoon ? "#F5C518" : colors.mutedForeground, fontFamily: F.semi, fontSize: 11, textAlign: "right" }}>
                      {isExpired ? "⏰ انتهت الصلاحية: " : isExpiringSoon ? "⚠️ ينتهي قريباً: " : "⏳ صالح حتى: "}
                      {(() => {
                        const exp = new Date(dc.expiresAt!);
                        const h = exp.getHours(), m = exp.getMinutes();
                        const isEndOfDay = h === 23 && m >= 59;
                        const datePart = exp.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
                        return isEndOfDay ? datePart : `${datePart} — ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      })()}
                    </Text>
                  ) : null}
                  {/* Expiry edit row */}
                  <TouchableOpacity
                    onPress={() => {
                      const initial = dc.expiresAt ? new Date(dc.expiresAt) : (() => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; })();
                      setDcPickerDate(initial);
                      setDcPickerStep("date");
                      setDcPickerContext("edit");
                      setDcPickerEditId(dc.id);
                      setDcPickerVisible(true);
                    }}
                    style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingTop: 2 }}
                  >
                    <Feather name="calendar" size={12} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                      {dc.expiresAt ? "تعديل أو إزالة تاريخ الانتهاء" : "تحديد تاريخ انتهاء الصلاحية"}
                    </Text>
                  </TouchableOpacity>
                  {/* Max uses edit row */}
                  {dcEditingMaxUsesId === dc.id ? (
                    <View style={{ gap: 6 }}>
                      <TextInput
                        value={dcEditingMaxUsesVal}
                        onChangeText={setDcEditingMaxUsesVal}
                        placeholder="عدد الاستخدامات (اتركه فارغاً لجعله غير محدود)"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="number-pad"
                        style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.regular, borderWidth: 1, borderRadius: 8, padding: 10, textAlign: "right", fontSize: 13 }}
                      />
                      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                        <TouchableOpacity
                          onPress={async () => {
                            const raw = dcEditingMaxUsesVal.trim();
                            let maxUses: number | null = null;
                            if (raw) {
                              const parsed = parseInt(raw, 10);
                              if (isNaN(parsed) || parsed < 1) {
                                Alert.alert("تنبيه", "أدخل رقماً صحيحاً أكبر من صفر");
                                return;
                              }
                              maxUses = parsed;
                            }
                            const doSave = async () => {
                              try {
                                await updateCode(dc.id, { maxUses });
                                setDcEditingMaxUsesId(null);
                              } catch { Alert.alert("خطأ", "تعذّر تحديث حد الاستخدام"); }
                            };
                            if (maxUses !== null && maxUses <= (dc.usageCount ?? 0)) {
                              Alert.alert(
                                "تحذير",
                                `الحد الجديد (${maxUses}) أقل من أو يساوي عدد الاستخدامات الحالية (${dc.usageCount ?? 0}). سيظهر الكود منتهياً فور الحفظ. هل تريد المتابعة؟`,
                                [
                                  { text: "إلغاء", style: "cancel" },
                                  { text: "متابعة", style: "destructive", onPress: doSave },
                                ]
                              );
                              return;
                            }
                            await doSave();
                          }}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: colors.gold }}
                        >
                          <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 13 }}>حفظ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setDcEditingMaxUsesId(null)}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>إلغاء</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : isExhausted ? (
                    <TouchableOpacity
                      onPress={() => {
                        setDcEditingMaxUsesId(dc.id);
                        setDcEditingMaxUsesVal(dc.maxUses != null ? String(dc.maxUses) : "");
                      }}
                      style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#2A1800", borderWidth: 1, borderColor: "#E8920C55" }}
                    >
                      <Feather name="sliders" size={13} color="#E8920C" />
                      <Text style={{ color: "#E8920C", fontFamily: F.semi, fontSize: 12 }}>رفع الحد لإعادة تفعيل الكود</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        setDcEditingMaxUsesId(dc.id);
                        setDcEditingMaxUsesVal(dc.maxUses != null ? String(dc.maxUses) : "");
                      }}
                      style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingTop: 2 }}
                    >
                      <Feather name="sliders" size={12} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                        {dc.maxUses != null ? "تعديل أو إزالة حد الاستخدام" : "تحديد حد للاستخدام"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {/* Usage count + cost row */}
                  <TouchableOpacity
                    onPress={() => openDcUsages(dc)}
                    style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border + "55" }}
                  >
                    <View style={{ backgroundColor: "#1A2A3A", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: "#64B5F655" }}>
                      <Text style={{ color: "#64B5F6", fontFamily: F.bold, fontSize: 12 }}>
                        {dc.maxUses != null
                          ? `${dc.usageCount ?? 0}/${dc.maxUses} مستخدم`
                          : `${dc.usageCount ?? 0} ${dc.usageCount === 1 ? "استخدام" : "مرة"}`}
                      </Text>
                    </View>
                    {(dc.totalSavings ?? 0) > 0 && (
                      <View style={{ backgroundColor: "#2A1A00", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: colors.gold + "55" }}>
                        <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 12 }}>
                          -{((dc.totalSavings ?? 0) / 100).toFixed((dc.totalSavings ?? 0) % 100 === 0 ? 0 : 2)} ر.س
                        </Text>
                      </View>
                    )}
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>اضغط للتفاصيل</Text>
                    <Feather name="chevron-left" size={13} color={colors.mutedForeground} style={{ marginRight: "auto" }} />
                  </TouchableOpacity>
                  {dc.maxUses != null && (() => {
                    const pct = Math.min((usageCount / dc.maxUses) * 100, 100);
                    const barColor = pct >= 100 ? "#E57373" : pct >= 80 ? "#E8920C" : "#4CAF50";
                    return (
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border + "55", overflow: "hidden" }}>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: barColor, width: `${pct}%` }} />
                      </View>
                    );
                  })()}
                </View>
                );
              })}
            </View>
          )}

          {/* Total cost summary row */}
          {discountCodes.length > 0 && (() => {
            const activeCodes = discountCodes.filter((c) => c.active);
            const totalCostAll = discountCodes.reduce((s, c) => s + (c.totalSavings ?? 0), 0);
            const totalCostActive = activeCodes.reduce((s, c) => s + (c.totalSavings ?? 0), 0);
            if (totalCostAll === 0) return null;
            return (
              <View style={{ backgroundColor: "#1A0E02", borderRadius: 12, borderWidth: 1, borderColor: colors.gold + "44", padding: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 13, textAlign: "right" }}>💰 إجمالي الخصومات الممنوحة</Text>
                <View style={{ alignItems: "flex-start", gap: 2 }}>
                  <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 14, textAlign: "left" }}>
                    {(totalCostAll / 100).toFixed(totalCostAll % 100 === 0 ? 0 : 2)} ر.س
                  </Text>
                  {totalCostActive !== totalCostAll && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "left" }}>
                      {(totalCostActive / 100).toFixed(totalCostActive % 100 === 0 ? 0 : 2)} ر.س للأكواد الفعّالة
                    </Text>
                  )}
                </View>
              </View>
            );
          })()}

          {/* Add new code form */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
            <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>➕ إضافة كود جديد</Text>

            <TextInput
              value={dcCode}
              onChangeText={(v) => setDcCode(v.toUpperCase().replace(/\s/g, ""))}
              placeholder="مثال: KHDAR10"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.extra, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "center", fontSize: 15, letterSpacing: 2 }}
            />

            {/* Type toggle */}
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              {(["percentage", "fixed"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setDcType(t)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: dcType === t ? colors.gold : colors.secondary, borderWidth: 1, borderColor: dcType === t ? colors.gold : colors.border }}
                >
                  <Text style={{ color: dcType === t ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>
                    {t === "percentage" ? "نسبة مئوية %" : "مبلغ ثابت ر.س"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>
                  {dcType === "percentage" ? "نسبة الخصم %" : "مبلغ الخصم (ر.س)"}
                </Text>
                <TextInput
                  value={dcValue}
                  onChangeText={setDcValue}
                  placeholder={dcType === "percentage" ? "10" : "5"}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "center" }}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>الحد الأدنى (ر.س)</Text>
                <TextInput
                  value={dcMinOrder}
                  onChangeText={setDcMinOrder}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "center" }}
                />
              </View>
            </View>

            <TextInput
              value={dcDesc}
              onChangeText={setDcDesc}
              placeholder="وصف مختصر (اختياري)"
              placeholderTextColor={colors.mutedForeground}
              style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.regular, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "right" }}
            />

            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>تاريخ انتهاء الصلاحية (اختياري)</Text>
              <TouchableOpacity
                onPress={() => {
                  const initial = dcExpiresAt ?? (() => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; })();
                  setDcPickerDate(initial);
                  setDcPickerStep("date");
                  setDcPickerContext("new");
                  setDcPickerEditId(null);
                  setDcPickerVisible(true);
                }}
                style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, borderColor: colors.border, backgroundColor: colors.secondary, borderWidth: 1, borderRadius: 10, padding: 12 }}
              >
                <Feather name="calendar" size={16} color={dcExpiresAt ? colors.gold : colors.mutedForeground} />
                <Text style={{ color: dcExpiresAt ? colors.foreground : colors.mutedForeground, fontFamily: F.regular, fontSize: 13, flex: 1, textAlign: "right" }}>
                  {dcExpiresAt
                    ? (() => {
                        const h = dcExpiresAt.getHours(), m = dcExpiresAt.getMinutes();
                        const isEndOfDay = h === 23 && m === 59;
                        const datePart = dcExpiresAt.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
                        return isEndOfDay ? datePart : `${datePart} — ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      })()
                    : "اختر تاريخاً واقت الانتهاء (اختياري)"}
                </Text>
                {dcExpiresAt && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setDcExpiresAt(null); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>الحد الأقصى للاستخدام (اختياري — اتركه فارغاً للاستخدام غير المحدود)</Text>
              <TextInput
                value={dcMaxUses}
                onChangeText={setDcMaxUses}
                placeholder="مثال: 50"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.bold, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "center" }}
              />
            </View>

            <TouchableOpacity
              onPress={async () => {
                const val = parseFloat(dcValue);
                if (!dcCode.trim() || isNaN(val) || val <= 0) {
                  Alert.alert("تنبيه", "يرجى إدخال كود وقيمة صحيحة");
                  return;
                }
                let expiresAtIso: string | null = null;
                if (dcExpiresAt) {
                  if (dcExpiresAt.getTime() <= Date.now()) {
                    Alert.alert("تنبيه", "وقت انتهاء الصلاحية يجب أن يكون في المستقبل. عدّل الوقت أو التاريخ.");
                    return;
                  }
                  expiresAtIso = dcExpiresAt.toISOString();
                }
                const maxUsesVal = dcMaxUses.trim() ? parseInt(dcMaxUses.trim(), 10) : null;
                if (maxUsesVal !== null && (isNaN(maxUsesVal) || maxUsesVal < 1)) {
                  Alert.alert("تنبيه", "الحد الأقصى للاستخدام يجب أن يكون رقماً أكبر من صفر");
                  return;
                }
                try {
                  await addCode({
                    code: dcCode.trim(),
                    type: dcType,
                    value: val,
                    minOrder: parseFloat(dcMinOrder) || 0,
                    description: dcDesc.trim(),
                    active: true,
                    expiresAt: expiresAtIso,
                    maxUses: maxUsesVal,
                  });
                  setDcCode(""); setDcValue(""); setDcMinOrder(""); setDcDesc(""); setDcExpiresAt(null); setDcMaxUses("");
                } catch (e: any) {
                  Alert.alert("خطأ", e?.message || "تعذّر حفظ الكود");
                }
              }}
              style={{ paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: colors.gold }}
            >
              <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>حفظ الكود</Text>
            </TouchableOpacity>
          </View>

          {/* Customer Cancel Setting */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            🚫 إلغاء الطلبات
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: "right" }}>
                  السماح للعميل بإلغاء طلبه
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", marginTop: 3 }}>
                  {allowCustomerCancel
                    ? "العميل يستطيع إلغاء طلبه طالما لم يبدأ التحضير"
                    : "الإلغاء متاح للكاشير فقط"}
                </Text>
              </View>
              <Switch
                value={allowCustomerCancel}
                onValueChange={async (v) => {
                  setAllowCustomerCancel(v);
                  try { await apiPut("/settings/customer-cancel", { allowed: v }); } catch {}
                }}
                trackColor={{ false: colors.border, true: "#4CAF50" + "88" }}
                thumbColor={allowCustomerCancel ? "#4CAF50" : colors.mutedForeground}
              />
            </View>
          </View>
          </>)}

          {/* ══════════════════ WALLETS ══════════════════ */}
          {settingsSection === "wallets" && (<>
          {/* Wallet Management */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            💰 إدارة المحافظ
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "right" }}>
              اشحن محفظة زبون عبر رقم جواله
            </Text>

            {/* Search balance */}
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TextInput
                value={walletSearchPhone}
                onChangeText={setWalletSearchPhone}
                placeholder="05xxxxxxxx"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!walletSearchPhone.trim()) return;
                  try {
                    const w = await apiGet<{ balance: number }>(`/wallet?phone=${encodeURIComponent(walletSearchPhone.trim())}`);
                    setWalletSearchBalance(w.balance);
                    setWalletPhone(walletSearchPhone.trim());
                  } catch { Alert.alert("خطأ", "تعذر البحث"); }
                }}
                style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, justifyContent: "center" }}
              >
                <Feather name="search" size={18} color={colors.gold} />
              </TouchableOpacity>
            </View>

            {walletSearchBalance !== null && (
              <View style={{ backgroundColor: "#2A1A0A", borderRadius: 10, padding: 12, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>الرصيد الحالي</Text>
                <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 20 }}>{walletSearchBalance} ر.س</Text>
              </View>
            )}

            <TextInput
              value={walletAmount}
              onChangeText={setWalletAmount}
              placeholder="مبلغ الشحن (ر.س)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.gold, fontFamily: F.bold, textAlign: "right", borderWidth: 1, borderColor: colors.border, fontSize: 18 }}
            />
            <TextInput
              value={walletNote}
              onChangeText={setWalletNote}
              placeholder="سبب الشحن (اختياري)"
              placeholderTextColor={colors.mutedForeground}
              style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
            />
            <TouchableOpacity
              onPress={async () => {
                const amount = parseInt(walletAmount);
                if (!walletPhone.trim() || isNaN(amount) || amount <= 0) {
                  Alert.alert("خطأ", "أدخل رقم الجوال والمبلغ");
                  return;
                }
                setWalletLoading(true);
                try {
                  const r = await apiPost<{ balance: number }>("/wallet/deposit", {
                    phone: walletPhone.trim(),
                    amount,
                    note: walletNote.trim() || "شحن من الأدمن",
                  });
                  setWalletSearchBalance(r.balance);
                  setWalletAmount("");
                  setWalletNote("");
                  Alert.alert("✅ تم الشحن", `رصيد الزبون أصبح ${r.balance} ر.س`);
                } catch {
                  Alert.alert("خطأ", "تعذر الشحن");
                } finally {
                  setWalletLoading(false);
                }
              }}
              disabled={walletLoading}
              style={{ backgroundColor: "#4CAF50", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
            >
              {walletLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 15 }}>💰 شحن المحفظة</Text>
              )}
            </TouchableOpacity>
          </View>
          </>)}

          {/* ══════════════════ SMS ══════════════════ */}
          {settingsSection === "sms" && (<>
          {/* SMS OTP Settings */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            📱 التحقق برسالة SMS
          </Text>

          {/* Provider picker */}
          {(() => {
            const providers: { id: "msegat"|"taqnyat"|"4jawaly"|"unifonic"|"twilio"|"authentica"; label: string; url: string; hint: string; badge?: string }[] = [
              { id: "authentica", label: "أوثنتيكا",  url: "authentica.sa",  hint: "API Key فقط", badge: "SMS+واتساب" },
              { id: "msegat",     label: "مسجات",    url: "msegat.com",     hint: "اسم_المستخدم:مفتاح_API" },
              { id: "taqnyat",    label: "تقنيات",   url: "taqnyat.sa",     hint: "Bearer Token" },
              { id: "4jawaly",    label: "فور جوالي", url: "4jawaly.com",    hint: "api_key:api_secret" },
              { id: "unifonic",   label: "يونيفونك",  url: "unifonic.com",   hint: "AppSid فقط" },
              { id: "twilio",     label: "Twilio",    url: "twilio.com",     hint: "AccountSid:AuthToken:+fromNumber" },
            ];
            const active = providers.find(p => p.id === smsProvider) ?? providers[0];
            return (
              <>
                <View style={{ backgroundColor: "#0A1A1A", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#4CAF5033", marginBottom: 4, gap: 6 }}>
                  <Text style={{ color: "#81C784", fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>اختر شركة SMS:</Text>
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                    {providers.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setSmsProvider(p.id)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
                          backgroundColor: smsProvider === p.id ? "#1A3A2A" : colors.secondary,
                          borderColor: smsProvider === p.id ? "#4CAF50" : colors.border }}
                      >
                        <Text style={{ color: smsProvider === p.id ? "#4CAF50" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>{p.label}</Text>
                        {p.badge && <Text style={{ color: "#E8920C", fontFamily: F.regular, fontSize: 9, textAlign: "center" }}>{p.badge}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>
                    🔗 {active.url} — صيغة المفتاح: {active.hint}
                  </Text>
                  {/* WhatsApp/SMS method picker — Authentica only */}
                  {smsProvider === "authentica" && (
                    <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 4 }}>
                      {([["sms","📱 SMS"],["whatsapp","💬 واتساب"]] as const).map(([key, label]) => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => setSmsMethod(key)}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: "center", borderWidth: 1,
                            backgroundColor: smsMethod === key ? "#1A2A3A" : colors.secondary,
                            borderColor: smsMethod === key ? "#64B5F6" : colors.border }}
                        >
                          <Text style={{ color: smsMethod === key ? "#64B5F6" : colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </>
            );
          })()}

          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: colors.border }}>
            {/* Enable toggle */}
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14 }}>
                تفعيل التحقق بالرسائل
              </Text>
              <Switch
                value={smsEnabled}
                onValueChange={async (v) => {
                  setSmsEnabled(v);
                  try { await apiPut("/sms-settings", { enabled: v }); } catch {}
                }}
                trackColor={{ false: "#3A1A1A", true: "#1A4A2A" }}
                thumbColor={smsEnabled ? "#4CAF50" : "#E57373"}
              />
            </View>

            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
              {smsEnabled
                ? "✅ مفعّل — العميل يستقبل رمز تحقق SMS عند إدخال رقمه"
                : "❌ موقوف — الطلبات تكتمل بدون تحقق"}
            </Text>

            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Sender name */}
            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
              اسم المرسل (Sender Name)
            </Text>
            <TextInput
              value={smsSender}
              onChangeText={setSmsSender}
              placeholder="منتجات السلة للخضار والفواكه"
              placeholderTextColor={colors.mutedForeground}
              style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
            />

            {/* API Key */}
            <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
              مفتاح الشركة{smsHasKey ? " ✅ محفوظ" : " — لم يُضَف بعد"}
            </Text>
            <TextInput
              value={smsApiKey}
              onChangeText={setSmsApiKey}
              placeholder={smsHasKey ? "اتركه فارغاً إذا ما تريد تغييره" : (() => {
                switch (smsProvider) {
                  case "taqnyat":  return "Bearer Token";
                  case "unifonic": return "AppSid";
                  case "twilio":   return "AccountSid:AuthToken:+fromNumber";
                  default:         return "اسم_المستخدم:مفتاح_API";
                }
              })()}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
            />

            <TouchableOpacity
              onPress={async () => {
                setSmsLoading(true);
                try {
                  const body: Record<string, unknown> = { sender: smsSender, provider: smsProvider, method: smsMethod };
                  if (smsApiKey.trim()) body.apiKey = smsApiKey.trim();
                  await apiPut("/sms-settings", body);
                  setSmsApiKey("");
                  await loadSmsSettings();
                  Alert.alert("تم", "تم حفظ إعدادات الرسائل");
                } catch {
                  Alert.alert("خطأ", "تعذّر حفظ الإعدادات");
                } finally {
                  setSmsLoading(false);
                }
              }}
              style={{ paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: colors.gold }}
            >
              {smsLoading
                ? <ActivityIndicator color="#1A0A00" />
                : <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>حفظ إعدادات الرسائل</Text>
              }
            </TouchableOpacity>

            {/* Test SMS */}
            {smsHasKey && (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
                  🔬 اختبر الإرسال — أدخل رقم جوالك
                </Text>
                <TextInput
                  value={smsTestPhone}
                  onChangeText={setSmsTestPhone}
                  placeholder="966501234567"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "left", borderWidth: 1, borderColor: colors.border }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (!smsTestPhone.trim()) return;
                    setSmsTestLoading(true);
                    setSmsTestResult(null);
                    try {
                      const r = await apiPost<{ ok: boolean; response?: string }>("/sms/test", { phone: smsTestPhone.trim() });
                      setSmsTestResult(r.ok ? `✅ تم الإرسال بنجاح` : `❌ فشل: ${r.response ?? "خطأ غير معروف"}`);
                    } catch (e: unknown) {
                      setSmsTestResult(`❌ خطأ: ${e instanceof Error ? e.message : String(e)}`);
                    } finally {
                      setSmsTestLoading(false);
                    }
                  }}
                  style={{ paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: "#1A2A3A", borderWidth: 1, borderColor: "#64B5F633" }}
                  disabled={smsTestLoading}
                >
                  {smsTestLoading
                    ? <ActivityIndicator color="#64B5F6" />
                    : <Text style={{ color: "#64B5F6", fontFamily: F.bold, fontSize: 13 }}>إرسال رسالة اختبار</Text>
                  }
                </TouchableOpacity>
                {smsTestResult && (
                  <Text style={{ color: smsTestResult.startsWith("✅") ? "#4CAF50" : "#E57373", fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>
                    {smsTestResult}
                  </Text>
                )}
              </View>
            )}

          </View>
          </>)}

          {/* ══════════════════ SECURITY ══════════════════ */}
          {settingsSection === "security" && (<>
          {/* PIN Management */}
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right", marginTop: 8 }}>
            🔐 رموز الدخول
          </Text>

          <PinEditor
            label="رمز الكاشير"
            current={pins.cashier}
            onSave={async (newPin) => {
              const updated = { ...pins, cashier: newPin };
              setPins(updated);
              await savePins(updated);
            }}
          />

          <PinEditor
            label="رمز الإدارة"
            current={pins.admin}
            onSave={async (newPin) => {
              const updated = { ...pins, admin: newPin };
              setPins(updated);
              await savePins(updated);
            }}
          />

          <View style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", lineHeight: 20 }}>
              💡 إذا نسيت الرمز، يمكنك استخدام رمز الطوارئ للدخول وتغيير الرموز.{"\n"}للحصول على رمز الطوارئ تواصل مع المطور.
            </Text>
          </View>
          </>)}

          {/* ══════════════════ TEXTS ══════════════════ */}
          {settingsSection === "texts" && (<>
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            ✏️ نصوص التطبيق
          </Text>
          <View style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", lineHeight: 20 }}>
              💡 النصوص التالية تظهر للعملاء في التطبيق. بعد الحفظ تُحدَّث عند فتح التطبيق.
            </Text>
          </View>

          {textsLoading ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: 20 }} />
          ) : (
            <>
            {([
              { section: "🏠 معلومات المطعم", fields: [
                { key: "txt_name",       label: "اسم المطعم (عربي)",      placeholder: DEFAULT_TEXTS.name       },
                { key: "txt_name_en",    label: "اسم المطعم (إنجليزي)",    placeholder: DEFAULT_TEXTS.nameEn     },
                { key: "txt_tagline",    label: "الشعار (عربي)",           placeholder: DEFAULT_TEXTS.tagline    },
                { key: "txt_tagline_en", label: "الشعار (إنجليزي)",        placeholder: DEFAULT_TEXTS.taglineEn  },
              ]},
              { section: "📞 التواصل", fields: [
                { key: "txt_phone",      label: "رقم الهاتف الرئيسي",      placeholder: DEFAULT_TEXTS.phone      },
                { key: "txt_whatsapp",   label: "واتساب (مع كود الدولة)",  placeholder: DEFAULT_TEXTS.whatsapp   },
                { key: "txt_instagram",  label: "إنستقرام",                 placeholder: DEFAULT_TEXTS.instagram  },
                { key: "txt_snapchat",   label: "سناب شات (اسم المستخدم)", placeholder: DEFAULT_TEXTS.snapchat   },
                { key: "txt_tiktok",     label: "تيك توك (اسم المستخدم)",  placeholder: DEFAULT_TEXTS.tiktok     },
              ]},
              { section: "📍 الموقع", fields: [
                { key: "txt_location",     label: "العنوان (عربي)",         placeholder: DEFAULT_TEXTS.location    },
                { key: "txt_location_en",  label: "العنوان (إنجليزي)",      placeholder: DEFAULT_TEXTS.locationEn  },
                { key: "txt_delivery_area",label: "منطقة التوصيل (عربي)",   placeholder: DEFAULT_TEXTS.deliveryArea },
              ]},
              { section: "🐑 الذبائح", fields: [
                { key: "txt_dhabiha_phone",    label: "هاتف الذبائح",              placeholder: DEFAULT_TEXTS.dhabihaPhone    },
                { key: "txt_dhabiha_whatsapp", label: "واتساب الذبائح (مع كود)", placeholder: DEFAULT_TEXTS.dhabihaWhatsapp },
              ]},
              { section: "📢 إعلان عام", fields: [
                { key: "txt_announcement", label: "نص الإعلان (اتركه فارغاً لإخفائه)", placeholder: "مثال: يسعدنا خدمتكم يومياً من 12 ظهراً..." },
              ]},
            ] as const).map(({ section, fields }) => (
              <View key={section} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
                <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 14, textAlign: "right" }}>{section}</Text>
                {fields.map(({ key, label, placeholder }) => (
                  <View key={key} style={{ gap: 4 }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "right" }}>{label}</Text>
                    <TextInput
                      value={appTexts[key] ?? ""}
                      onChangeText={(v) => setAppTexts(prev => ({ ...prev, [key]: v }))}
                      placeholder={placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      style={{ color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.regular, borderWidth: 1, borderRadius: 10, padding: 12, textAlign: "right" }}
                      multiline={key === "txt_announcement"}
                      numberOfLines={key === "txt_announcement" ? 3 : 1}
                    />
                  </View>
                ))}
              </View>
            ))}

            <TouchableOpacity
              onPress={saveAppTexts}
              disabled={textsSaving}
              style={{ backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
            >
              {textsSaving
                ? <ActivityIndicator color="#1A0A00" />
                : <Text style={{ color: "#1A0A00", fontFamily: F.extra, fontSize: 16 }}>💾 حفظ جميع النصوص</Text>
              }
            </TouchableOpacity>
            </>
          )}
          </>)}

          {/* ══════════════════ MUSIC ══════════════════ */}
          {settingsSection === "music" && (<>

          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            🎵 موسيقى الخلفية
          </Text>

          {/* Status + Play/Pause */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: musicPlaying ? "#4CAF5044" : colors.border, padding: 16, gap: 14 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 20 }}>{musicPlaying ? "🎵" : "🎼"}</Text>
                <Text style={{ color: musicPlaying ? "#81C784" : colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }}>
                  {musicPlaying ? `▶ يعزف: ${musicTracks[musicIdx]?.name ?? ""}` : "الموسيقى متوقفة"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setMusicPlaying(!musicPlaying)}
                style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: musicPlaying ? "#2E7D32" : colors.gold, alignItems: "center", justifyContent: "center" }}
                activeOpacity={0.8}
              >
                <Feather name={musicPlaying ? "pause" : "play"} size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Volume */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 12, textAlign: "right" }}>
                مستوى الصوت: {musicVolume}%
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => handleMusicVolume(musicVolume - 10)}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18, lineHeight: 20 }}>−</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, height: 8, backgroundColor: colors.secondary, borderRadius: 4, overflow: "hidden" }}>
                  <View style={{ height: 8, width: `${musicVolume}%` as any, backgroundColor: "#4CAF50", borderRadius: 4 }} />
                </View>
                <TouchableOpacity
                  onPress={() => handleMusicVolume(musicVolume + 10)}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 18, lineHeight: 20 }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Track list */}
          <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>
            قائمة المقاطع ({musicTracks.length})
          </Text>
          {musicTracks.map((track, i) => {
            const active = musicIdx === i && musicPlaying;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => handlePlayMusicTrack(i)}
                style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: active ? "#0D2A1A" : colors.card,
                  borderRadius: 12, padding: 14,
                  borderWidth: 1, borderColor: active ? "#4CAF50" : colors.border, gap: 10,
                }}
                activeOpacity={0.8}
              >
                {active
                  ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
                  : <Feather name="play-circle" size={16} color={colors.mutedForeground} />
                }
                <Text style={{ flex: 1, color: active ? "#81C784" : colors.foreground, fontFamily: active ? F.bold : F.regular, fontSize: 14, textAlign: "right" }}>
                  {track.name}
                </Text>
                <TouchableOpacity onPress={() => handleDeleteMusicTrack(i)} disabled={musicTracks.length <= 1} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={15} color={musicTracks.length <= 1 ? colors.border : "#E57373"} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          {/* Add track */}
          <TouchableOpacity
            onPress={() => setShowAddTrack(v => !v)}
            style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: showAddTrack ? colors.gold : colors.border, backgroundColor: showAddTrack ? colors.gold + "11" : colors.card }}
            activeOpacity={0.8}
          >
            <Feather name={showAddTrack ? "minus" : "plus"} size={15} color={colors.gold} />
            <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 14 }}>
              {showAddTrack ? "إلغاء" : "➕ إضافة مقطع YouTube"}
            </Text>
          </TouchableOpacity>

          {showAddTrack && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 }}>
              <TextInput
                value={musicAddName}
                onChangeText={setMusicAddName}
                placeholder="اسم المقطع (اختياري)"
                placeholderTextColor={colors.mutedForeground}
                style={{ backgroundColor: colors.secondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.regular, fontSize: 14, color: colors.foreground, textAlign: "right" }}
              />
              <TextInput
                value={musicAddUrl}
                onChangeText={setMusicAddUrl}
                placeholder="رابط YouTube (مثال: youtube.com/watch?v=...)"
                placeholderTextColor={colors.mutedForeground}
                style={{ backgroundColor: colors.secondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.regular, fontSize: 13, color: colors.foreground, textAlign: "right" }}
              />
              <TouchableOpacity
                onPress={() => { handleAddMusicTrack(); setShowAddTrack(false); }}
                style={{ backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
                activeOpacity={0.8}
              >
                <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>إضافة للقائمة</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            onPress={resetToPresets}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: colors.card }}
            activeOpacity={0.8}
          >
            <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>🔄 استعادة المقاطع الافتراضية</Text>
          </TouchableOpacity>

          </>)}

          {/* ══════════════════ OCCASIONS ══════════════════ */}
          {settingsSection === "occasions" && (<>

          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            🎉 المناسبات والأجواء
          </Text>

          {/* Auto */}
          <TouchableOpacity
            onPress={() => changeOccasion("auto")}
            style={{
              flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12,
              borderWidth: 1.5,
              backgroundColor: occasionSetting === "auto" ? "#1A2A0A" : colors.card,
              borderColor: occasionSetting === "auto" ? "#4CAF50" : colors.border,
            }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 20 }}>🗓️</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: occasionSetting === "auto" ? "#4CAF50" : colors.foreground, fontFamily: F.bold, fontSize: 14 }}>
                  تلقائي (بحسب التاريخ)
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                  {(() => {
                    const auto = detectCurrentOccasion();
                    return auto === "none" ? "لا توجد مناسبة حالياً" : `المكتشف: ${OCCASION_THEMES[auto].name}`;
                  })()}
                </Text>
              </View>
            </View>
            {occasionSetting === "auto" && <Feather name="check-circle" size={18} color="#4CAF50" />}
          </TouchableOpacity>

          {/* None */}
          <TouchableOpacity
            onPress={() => changeOccasion("none")}
            style={{
              flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12,
              borderWidth: 1.5,
              backgroundColor: occasionSetting === "none" ? "#2A1A1A" : colors.card,
              borderColor: occasionSetting === "none" ? "#E57373" : colors.border,
            }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 20 }}>🚫</Text>
              <Text style={{ color: occasionSetting === "none" ? "#E57373" : colors.foreground, fontFamily: F.bold, fontSize: 14 }}>
                بدون مناسبة
              </Text>
            </View>
            {occasionSetting === "none" && <Feather name="check-circle" size={18} color="#E57373" />}
          </TouchableOpacity>

          {/* Occasion list */}
          {OCCASION_LIST.map(occ => {
            const selected = occasionSetting === occ.id;
            return (
              <TouchableOpacity
                key={occ.id}
                onPress={() => changeOccasion(occ.id)}
                style={{
                  flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12,
                  borderWidth: 1.5,
                  backgroundColor: selected ? occ.bg + "EE" : colors.card,
                  borderColor: selected ? occ.textColor + "88" : colors.border,
                }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 22 }}>{occ.emoji}</Text>
                  <View style={{ alignItems: "flex-end", flex: 1 }}>
                    <Text style={{ color: selected ? occ.textColor : colors.foreground, fontFamily: F.bold, fontSize: 14 }}>
                      {occ.name}
                    </Text>
                    <Text style={{ color: selected ? occ.subColor : colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }} numberOfLines={1}>
                      {occ.greeting}
                    </Text>
                    {selected && <Text style={{ fontSize: 13, marginTop: 4 }}>{occ.decorRow}</Text>}
                  </View>
                </View>
                {selected && <Feather name="check-circle" size={18} color={occ.textColor} />}
              </TouchableOpacity>
            );
          })}

          </>)}

          {/* ══════════════════ LOGO BG ══════════════════ */}
          {settingsSection === "logobg" && (<>

          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            🎨 خلفية شعار المطعم
          </Text>

          {/* Live preview */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: "center", gap: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 13 }}>معاينة مباشرة</Text>
            <Image
              source={require("@/assets/images/sallat-alkhodar-logo.png")}
              style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: logoBg as any }}
              resizeMode="contain"
            />
          </View>

          {/* Color grid */}
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 14, justifyContent: "flex-start" }}>
            {LOGO_BG_COLORS.map(c => {
              const selected = logoBg === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => changeLogoBg(c.value)}
                  style={{ alignItems: "center", gap: 6 }}
                  activeOpacity={0.8}
                >
                  <View style={{
                    width: 54, height: 54, borderRadius: 27,
                    backgroundColor: c.value === "transparent" ? undefined : c.value,
                    borderWidth: selected ? 3.5 : 1.5,
                    borderColor: selected ? colors.gold : colors.border,
                    overflow: "hidden",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {c.value === "transparent" && <Text style={{ fontSize: 22 }}>🚫</Text>}
                    {selected && c.value !== "transparent" && (
                      <Feather name="check" size={22} color={c.value === "#FFFFFF" || c.value === "#F5EDD8" ? "#000" : "#fff"} />
                    )}
                  </View>
                  <Text style={{ color: selected ? colors.gold : colors.mutedForeground, fontFamily: selected ? F.bold : F.regular, fontSize: 12 }}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          </>)}

          {/* ══════════════════ SOUNDS ══════════════════ */}
          {settingsSection === "sounds" && (<>

          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>
            🔊 إعدادات الأصوات والتنبيهات
          </Text>

          {/* Mute toggle */}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>حالة الصوت</Text>
            <TouchableOpacity
              onPress={async () => {
                const next = !soundMuted;
                setSoundMuted(next);
                await AsyncStorage.setItem(SOUND_KEYS.muted, String(next));
              }}
              style={{
                flexDirection: "row-reverse", alignItems: "center", gap: 6,
                backgroundColor: soundMuted ? "#2A1A1A" : "#0A2A10",
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                borderWidth: 1, borderColor: soundMuted ? "#E5737340" : "#4CAF5040",
              }}
              activeOpacity={0.8}
            >
              <Feather name={soundMuted ? "volume-x" : "volume-2"} size={16} color={soundMuted ? "#E57373" : "#4CAF50"} />
              <Text style={{ color: soundMuted ? "#E57373" : "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>
                {soundMuted ? "مكتوم" : "مفعّل"}
              </Text>
            </TouchableOpacity>
          </View>

          {soundMuted && (
            <View style={{ backgroundColor: "#2A1A1A", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E5737340" }}>
              <Text style={{ color: "#E57373", fontFamily: F.regular, fontSize: 13, textAlign: "right" }}>
                🔕 جميع أصوات التطبيق مكتومة حالياً
              </Text>
            </View>
          )}

          {(
            [
              { label: "🛎️ استلام طلب جديد",   key: SOUND_KEYS.order,    val: soundOrder,    set: setSoundOrder,    customUri: customUriOrder,    setUri: setCustomUriOrder    },
              { label: "💬 استلام رسالة",        key: SOUND_KEYS.message,  val: soundMessage,  set: setSoundMessage,  customUri: customUriMessage,  setUri: setCustomUriMessage  },
              { label: "🚗 تسليم الطلب",         key: SOUND_KEYS.delivery, val: soundDelivery, set: setSoundDelivery, customUri: customUriDelivery, setUri: setCustomUriDelivery },
            ] as { label: string; key: string; val: SoundOption; set: (v: SoundOption) => void; customUri: string | null; setUri: (u: string) => void }[]
          ).map(row => (
            <View key={row.key} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                {row.label}
              </Text>
              <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                {SOUND_CHOICES.map(choice => {
                  const selected = row.val === choice.id;
                  return (
                    <TouchableOpacity
                      key={choice.id}
                      onPress={async () => {
                        row.set(choice.id);
                        await setSoundPref(row.key, choice.id);
                        if (choice.id !== "silent") previewSound(choice.id);
                      }}
                      style={{
                        flexDirection: "row-reverse", alignItems: "center", gap: 5,
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                        borderWidth: 1.5,
                        backgroundColor: selected ? colors.gold + "22" : colors.secondary,
                        borderColor: selected ? colors.gold : colors.border,
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 15 }}>{choice.emoji}</Text>
                      <Text style={{ color: selected ? colors.gold : colors.mutedForeground, fontFamily: selected ? F.bold : F.regular, fontSize: 13 }}>
                        {choice.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom sound from device */}
                {Platform.OS !== "web" && (
                  <TouchableOpacity
                    onPress={() => pickCustomSound(row.key, row.setUri, row.set)}
                    style={{
                      flexDirection: "row-reverse", alignItems: "center", gap: 5,
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                      borderWidth: 1.5,
                      backgroundColor: row.val === "custom" ? "#4CAF5022" : colors.secondary,
                      borderColor: row.val === "custom" ? "#4CAF50" : colors.border,
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="folder" size={14} color={row.val === "custom" ? "#4CAF50" : colors.mutedForeground} />
                    <Text style={{ color: row.val === "custom" ? "#4CAF50" : colors.mutedForeground, fontFamily: row.val === "custom" ? F.bold : F.regular, fontSize: 13 }}>
                      من الجهاز
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Show selected custom file name + preview button */}
              {row.val === "custom" && row.customUri && (
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#0A2A10", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#4CAF5040" }}>
                  <Feather name="music" size={14} color="#4CAF50" />
                  <Text style={{ color: "#4CAF50", fontFamily: F.regular, fontSize: 11, flex: 1, textAlign: "right" }} numberOfLines={1}>
                    {row.customUri.split("/").pop() ?? "ملف مخصص"}
                  </Text>
                  <TouchableOpacity onPress={() => previewSound("custom", row.customUri!)} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#4CAF5033", borderRadius: 8 }}>
                    <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 11 }}>▶ معاينة</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>
                اضغط على أي نغمة لمعاينتها
              </Text>
            </View>
          ))}

          </>)}

          </ScrollView>
        </View>
      )}

      {/* Banners tab */}
      {activeTab === "banners" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 20 }]}
        >
          {/* Add Banner Form */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.gold, borderWidth: 1.5 }]}>
            <Text style={[styles.itemName, { color: colors.gold, fontFamily: F.bold, marginBottom: 12 }]}>➕ إضافة بانر جديد</Text>

            <TouchableOpacity
              onPress={handlePickBannerImage}
              disabled={bannerUploading}
              style={{ borderRadius: 12, overflow: "hidden", marginBottom: 10, height: 140, backgroundColor: "#2A1508", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" }}
            >
              {bannerUploading ? (
                <ActivityIndicator size="large" color={colors.gold} />
              ) : bannerImageUrl ? (
                <Image source={{ uri: bannerImageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Feather name="image" size={32} color={colors.gold} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>اضغط لاختيار صورة (أفضل نسبة 16:9)</Text>
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              value={bannerTitle}
              onChangeText={setBannerTitle}
              placeholder="عنوان البانر (اختياري)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border, fontFamily: F.regular }]}
              textAlign="right"
            />

            <TouchableOpacity
              onPress={handleAddBanner}
              disabled={!bannerImageUrl || bannerUploading}
              style={{ borderRadius: 12, paddingVertical: 14, alignItems: "center" as const, backgroundColor: bannerImageUrl ? colors.gold : "#3A2410", marginTop: 10 }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700" as const, color: bannerImageUrl ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold }}>
                حفظ البانر
              </Text>
            </TouchableOpacity>
          </View>

          {/* Banner List */}
          {allBanners.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🖼️</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>لا توجد بانرات مضافة بعد</Text>
            </View>
          ) : allBanners.map((b) => (
            <View key={b.bannerId} style={[styles.card, { backgroundColor: colors.card, borderColor: b.active ? colors.border : "#5A2A2A" }]}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  {bannerLoading === b.bannerId ? (
                    <ActivityIndicator size="small" color={colors.gold} />
                  ) : (
                    <Switch
                      value={b.active}
                      onValueChange={() => handleToggleBanner(b)}
                      trackColor={{ false: "#3A1A1A", true: "#2A5A2A" }}
                      thumbColor={b.active ? "#4CAF50" : "#E57373"}
                    />
                  )}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  {b.title ? (
                    <Text style={[styles.itemName, { color: b.active ? colors.foreground : colors.mutedForeground, fontFamily: F.bold }]} numberOfLines={1}>{b.title}</Text>
                  ) : (
                    <Text style={[styles.itemCat, { color: colors.mutedForeground, fontFamily: F.regular }]}>بدون عنوان</Text>
                  )}
                  <Image source={{ uri: b.imageUrl }} style={{ width: "100%", height: 120, borderRadius: 8 }} resizeMode="cover" />
                  <Text style={[styles.itemCat, { color: b.active ? "#4CAF50" : "#E57373", fontFamily: F.semi, fontSize: 11 }]}>
                    {b.active ? "✅ ظاهر" : "❌ مخفي"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteBanner(b)} style={[styles.iconBtn, { backgroundColor: "#3A1010" }]}>
                  <Feather name="trash-2" size={16} color="#E57373" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Revenue Tab ── */}
      {activeTab === "revenue" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>

          {/* ── Header: period + refresh + print ── */}
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>📊 التقرير المالي</Text>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setPrintPreset("today"); setPrintFromDate(getSaudiDateStr(0)); setPrintToDate(getSaudiDateStr(0)); setPrintModalVisible(true); }}
                disabled={!revenueData}
                style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#1A2A1A", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "#4CAF5044", opacity: revenueData ? 1 : 0.4 }}
              >
                <Feather name="printer" size={14} color="#4CAF50" />
                <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 12 }}>طباعة</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={refreshRevenue}
                style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: colors.secondary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}
              >
                <Feather name="refresh-cw" size={14} color={colors.gold} />
                <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 12 }}>تحديث</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Period selector ── */}
          <View style={{ flexDirection: "row-reverse", gap: 6 }}>
            {([
              { key: "today", label: "اليوم" },
              { key: "week",  label: "الأسبوع" },
              { key: "month", label: "الشهر" },
              { key: "year",  label: "السنة" },
            ] as const).map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setRevenuePeriod(key)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                  backgroundColor: revenuePeriod === key ? colors.gold : colors.secondary,
                  borderWidth: 1, borderColor: revenuePeriod === key ? colors.gold : colors.border,
                }}
              >
                <Text style={{ color: revenuePeriod === key ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold, fontSize: 11 }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {revenueLoading ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
          ) : !revenueData ? (
            <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 40, fontFamily: F.regular }}>لا توجد بيانات</Text>
          ) : (() => {
            const pd = revenuePeriod === "today" ? revenueData.today
                     : revenuePeriod === "week"  ? revenueData.week
                     : revenuePeriod === "month" ? revenueData.month
                     : revenueData.year;

            const totalPayment = pd.cashRevenue + pd.onlineRevenue || 1;
            const cashPct   = Math.round((pd.cashRevenue / totalPayment) * 100);
            const onlinePct = 100 - cashPct;

            return (
              <>
                {/* ── KPI Grid (2×3) ── */}
                <View style={{ gap: 8 }}>
                  {/* Row 1 */}
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    {/* Total Revenue */}
                    <View style={{ flex: 1, backgroundColor: "#1A1008", borderRadius: 14, borderWidth: 1, borderColor: "#E8920C44", padding: 14, gap: 4 }}>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>💰 الإيرادات الإجمالية</Text>
                      <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{pd.totalRevenue.toFixed(2)}</Text>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                    </View>
                    {/* Net Revenue */}
                    <View style={{ flex: 1, backgroundColor: "#0A1A0A", borderRadius: 14, borderWidth: 1, borderColor: "#4CAF5044", padding: 14, gap: 4 }}>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>✅ الصافي (بعد الضريبة)</Text>
                      <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{pd.netRevenue.toFixed(2)}</Text>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                    </View>
                  </View>
                  {/* Row 2 */}
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    {/* Tax */}
                    <View style={{ flex: 1, backgroundColor: "#0A0F1A", borderRadius: 14, borderWidth: 1, borderColor: "#82B1FF44", padding: 14, gap: 4 }}>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>🏛️ ضريبة القيمة المضافة 15%</Text>
                      <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{pd.taxAmount.toFixed(2)}</Text>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                    </View>
                    {/* Delivery */}
                    <View style={{ flex: 1, backgroundColor: "#0F0A1A", borderRadius: 14, borderWidth: 1, borderColor: "#CE93D844", padding: 14, gap: 4 }}>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>🚗 إيراد التوصيل</Text>
                      <Text style={{ color: "#CE93D8", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{pd.deliveryRevenue.toFixed(2)}</Text>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                    </View>
                  </View>
                  {/* Row 3 */}
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    {/* Orders done */}
                    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>📦 الطلبات المكتملة</Text>
                      <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 22, textAlign: "right" }}>{pd.orderCount}</Text>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>طلب</Text>
                    </View>
                    {/* Cancelled */}
                    <View style={{ flex: 1, backgroundColor: "#1A0A0A", borderRadius: 14, borderWidth: 1, borderColor: "#EF444444", padding: 14, gap: 4 }}>
                      <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>❌ الطلبات الملغاة</Text>
                      <View style={{ flexDirection: "row-reverse", alignItems: "baseline", gap: 4 }}>
                        <Text style={{ color: "#EF4444", fontFamily: F.extra, fontSize: 22, textAlign: "right" }}>{pd.cancelledCount}</Text>
                        <Text style={{ color: "#EF444488", fontFamily: F.semi, fontSize: 11 }}>طلب</Text>
                      </View>
                      <Text style={{ color: "#EF4444", fontFamily: F.semi, fontSize: 11, textAlign: "right" }}>
                        {pd.cancelledValue > 0 ? `خسارة: ${pd.cancelledValue.toFixed(2)} ر.س` : "لا خسائر"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ── Payment method bar ── */}
                <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
                  <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>💳 طريقة الدفع</Text>
                  {/* Bar */}
                  <View style={{ height: 12, borderRadius: 6, flexDirection: "row-reverse", overflow: "hidden", backgroundColor: colors.secondary }}>
                    {pd.cashRevenue > 0 && (
                      <View style={{ flex: cashPct, backgroundColor: "#4CAF50" }} />
                    )}
                    {pd.onlineRevenue > 0 && (
                      <View style={{ flex: onlinePct, backgroundColor: "#82B1FF" }} />
                    )}
                  </View>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>نقدي</Text>
                      </View>
                      <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>{pd.cashRevenue.toFixed(1)} ر.س</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10 }}>{pd.cashCount} طلب • {cashPct}%</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#82B1FF" }} />
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>إلكتروني</Text>
                      </View>
                      <Text style={{ color: "#82B1FF", fontFamily: F.bold, fontSize: 13 }}>{pd.onlineRevenue.toFixed(1)} ر.س</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10 }}>{pd.onlineCount} طلب • {onlinePct}%</Text>
                    </View>
                  </View>
                </View>

                {/* ── Financial summary row ── */}
                <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                  <View style={{ backgroundColor: colors.secondary, paddingVertical: 8, paddingHorizontal: 14 }}>
                    <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 12, textAlign: "right" }}>📋 ملخص مالي</Text>
                  </View>
                  {[
                    { label: "إجمالي الإيرادات",         value: `${pd.totalRevenue.toFixed(2)} ر.س`,   color: "#E8920C" },
                    { label: "إيراد الأصناف",             value: `${pd.itemsRevenue.toFixed(2)} ر.س`,   color: colors.foreground },
                    { label: "إيراد التوصيل",             value: `${pd.deliveryRevenue.toFixed(2)} ر.س`, color: "#CE93D8" },
                    { label: "ضريبة القيمة المضافة 15%", value: `${pd.taxAmount.toFixed(2)} ر.س`,      color: "#82B1FF" },
                    { label: "الصافي بعد الضريبة",        value: `${pd.netRevenue.toFixed(2)} ر.س`,     color: "#4CAF50" },
                    { label: "قيمة الطلبات الملغاة",      value: pd.cancelledValue > 0 ? `${pd.cancelledValue.toFixed(2)} ر.س` : "لا يوجد", color: pd.cancelledValue > 0 ? "#EF4444" : colors.mutedForeground },
                  ].map((r, i, arr) => (
                    <View key={r.label}>
                      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 11, paddingHorizontal: 14 }}>
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>{r.label}</Text>
                        <Text style={{ color: r.color, fontFamily: F.bold, fontSize: 12 }}>{r.value}</Text>
                      </View>
                      {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 14 }} />}
                    </View>
                  ))}
                </View>

                {/* ── علاء الباسطي Commission Card ── */}
                {(() => {
                  const COMMISSION_RATE = commissionRate / 100;
                  const commissionBase  = pd.totalRevenue;
                  const commission      = commissionBase * COMMISSION_RATE;
                  const netAfter        = commissionBase - commission;
                  return (
                    <View style={{
                      borderRadius: 16, overflow: "hidden",
                      borderWidth: 1.5, borderColor: "#E8920C88",
                      backgroundColor: "#110D00",
                    }}>
                      {/* Header */}
                      <View style={{
                        backgroundColor: "#E8920C",
                        paddingVertical: 10, paddingHorizontal: 16,
                        flexDirection: "row-reverse", alignItems: "center", gap: 8,
                      }}>
                        <Text style={{ fontSize: 16 }}>🤝</Text>
                        <Text style={{ color: "#1A1008", fontFamily: F.extra, fontSize: 13, flex: 1, textAlign: "right" }}>
                          عمولة علاء الباسطي
                        </Text>
                        <TouchableOpacity
                          onPress={() => { setCommissionInput(String(commissionRate)); setCommissionModalVisible(true); }}
                          style={{ backgroundColor: "#1A1008", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4 }}
                        >
                          <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 12 }}>{commissionRate}%</Text>
                          <Feather name="edit-2" size={10} color="#E8920C" />
                        </TouchableOpacity>
                      </View>

                      {/* Rows */}
                      <View style={{ padding: 14, gap: 0 }}>
                        {/* Base */}
                        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E8920C22" }}>
                          <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 12 }}>قاعدة الحساب (الإجمالي)</Text>
                          <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 12 }}>{commissionBase.toFixed(2)} ر.س</Text>
                        </View>
                        {/* Rate */}
                        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E8920C22" }}>
                          <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 12 }}>نسبة العمولة</Text>
                          <Text style={{ color: "#E8920C", fontFamily: F.semi, fontSize: 12 }}>{commissionRate}%</Text>
                        </View>
                        {/* Commission amount — highlighted */}
                        <View style={{
                          flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
                          paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E8920C22",
                          backgroundColor: "#E8920C11", marginHorizontal: -14, paddingHorizontal: 14,
                        }}>
                          <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 13 }}>💰 عمولة علاء الباسطي</Text>
                          <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 18 }}>{commission.toFixed(2)} ر.س</Text>
                        </View>
                        {/* Net after commission */}
                        <View style={{
                          flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
                          paddingVertical: 12, backgroundColor: "#0A1A0A", marginHorizontal: -14, paddingHorizontal: 14,
                          marginBottom: -14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
                        }}>
                          <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>✅ الإجمالي بعد العمولة</Text>
                          <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 18 }}>{netAfter.toFixed(2)} ر.س</Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* ── View toggle ── */}
                <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                  {([
                    { key: "daily",   label: "📅 يومي" },
                    { key: "monthly", label: "📆 شهري" },
                    { key: "yearly",  label: "🗓️ سنوي" },
                    { key: "items",   label: "🏆 الأصناف" },
                  ] as const).map(({ key, label }) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setRevenueView(key)}
                      style={{
                        flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center",
                        backgroundColor: revenueView === key ? colors.gold : colors.secondary,
                        borderWidth: 1, borderColor: revenueView === key ? colors.gold : colors.border,
                      }}
                    >
                      <Text style={{ color: revenueView === key ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold, fontSize: 10 }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Top Items Table ── */}
                {revenueView === "items" && (
                  <View style={{ backgroundColor: colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                    {/* Header */}
                    <View style={{ flexDirection: "row-reverse", backgroundColor: colors.secondary, paddingVertical: 10, paddingHorizontal: 12, gap: 4 }}>
                      {["#", "الصنف", "الكمية", "الإيراد"].map((h, i) => (
                        <Text key={h} style={{ flex: i === 1 ? 2.5 : 0.7, color: colors.gold, fontFamily: F.bold, fontSize: 11, textAlign: "center" }}>{h}</Text>
                      ))}
                    </View>
                    {revenueData.topItems.length === 0 ? (
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "center", padding: 20 }}>لا توجد بيانات</Text>
                    ) : revenueData.topItems.map((item, i) => (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row-reverse", paddingVertical: 10, paddingHorizontal: 12, gap: 4,
                          backgroundColor: i % 2 === 0 ? colors.card : colors.secondary + "88",
                          borderTopWidth: 1, borderTopColor: colors.border + "55",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flex: 0.7, alignItems: "center" }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i < 3 ? colors.gold : colors.secondary, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: i < 3 ? "#1A1008" : colors.mutedForeground, fontFamily: F.bold, fontSize: 10 }}>{i + 1}</Text>
                          </View>
                        </View>
                        <Text style={{ flex: 2.5, color: colors.foreground, fontFamily: F.semi, fontSize: 11, textAlign: "right" }} numberOfLines={2}>{item.name}</Text>
                        <Text style={{ flex: 0.7, color: "#4CAF50", fontFamily: F.bold, fontSize: 12, textAlign: "center" }}>{item.qty}</Text>
                        <Text style={{ flex: 0.7, color: colors.gold, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{item.revenue.toFixed(0)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* ── Yearly view ── */}
                {revenueView === "yearly" && (() => {
                  const yr = revenueData.year;
                  const commission = yr.totalRevenue * (commissionRate / 100);
                  const netAfterComm = yr.totalRevenue - commission;
                  return (
                    <>
                      {/* Year KPIs */}
                      <View style={{ gap: 8 }}>
                        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: "#1A1008", borderRadius: 14, borderWidth: 1, borderColor: "#E8920C44", padding: 14, gap: 4 }}>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>💰 إجمالي العام</Text>
                            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{yr.totalRevenue.toFixed(2)}</Text>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: "#0A1A0A", borderRadius: 14, borderWidth: 1, borderColor: "#4CAF5044", padding: 14, gap: 4 }}>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>✅ الصافي بعد الضريبة</Text>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{yr.netRevenue.toFixed(2)}</Text>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: "#0A0F1A", borderRadius: 14, borderWidth: 1, borderColor: "#82B1FF44", padding: 14, gap: 4 }}>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>🏛️ ضريبة السنة 15%</Text>
                            <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 18, textAlign: "right" }}>{yr.taxAmount.toFixed(2)}</Text>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>ر.س</Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>📦 إجمالي الطلبات</Text>
                            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 22, textAlign: "right" }}>{yr.orderCount}</Text>
                            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 10, textAlign: "right" }}>طلب</Text>
                          </View>
                        </View>
                      </View>

                      {/* Commission yearly */}
                      <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1.5, borderColor: "#E8920C88", backgroundColor: "#110D00" }}>
                        <View style={{ backgroundColor: "#E8920C", paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                          <Text style={{ fontSize: 16 }}>🤝</Text>
                          <Text style={{ color: "#1A1008", fontFamily: F.extra, fontSize: 13, flex: 1, textAlign: "right" }}>عمولة علاء الباسطي — السنوية</Text>
                          <TouchableOpacity
                            onPress={() => { setCommissionInput(String(commissionRate)); setCommissionModalVisible(true); }}
                            style={{ backgroundColor: "#1A1008", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4 }}
                          >
                            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 12 }}>{commissionRate}%</Text>
                            <Feather name="edit-2" size={10} color="#E8920C" />
                          </TouchableOpacity>
                        </View>
                        <View style={{ padding: 14, gap: 0 }}>
                          {[
                            { label: "إجمالي إيرادات السنة", value: `${yr.totalRevenue.toFixed(2)} ر.س`, color: colors.foreground },
                            { label: "نسبة العمولة", value: `${commissionRate}%`, color: "#E8920C" },
                          ].map((r, i) => (
                            <View key={i} style={{ flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E8920C22" }}>
                              <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 12 }}>{r.label}</Text>
                              <Text style={{ color: r.color, fontFamily: F.semi, fontSize: 12 }}>{r.value}</Text>
                            </View>
                          ))}
                          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E8920C22", backgroundColor: "#E8920C11", marginHorizontal: -14, paddingHorizontal: 14 }}>
                            <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 13 }}>💰 العمولة السنوية</Text>
                            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 18 }}>{commission.toFixed(2)} ر.س</Text>
                          </View>
                          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, backgroundColor: "#0A1A0A", marginHorizontal: -14, paddingHorizontal: 14, marginBottom: -14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>✅ الإجمالي بعد العمولة</Text>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 18 }}>{netAfterComm.toFixed(2)} ر.س</Text>
                          </View>
                        </View>
                      </View>

                      {/* Monthly breakdown for the year */}
                      <View style={{ backgroundColor: colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ backgroundColor: colors.secondary, paddingVertical: 8, paddingHorizontal: 14 }}>
                          <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 12, textAlign: "right" }}>📆 التفصيل الشهري للسنة الحالية</Text>
                        </View>
                        <View style={{ flexDirection: "row-reverse", backgroundColor: colors.secondary, paddingVertical: 10, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                          {[
                            { label: "الشهر", flex: 1.4 }, { label: "الطلبات", flex: 0.8 },
                            { label: "الإجمالي", flex: 1.1 }, { label: "الضريبة", flex: 1 },
                            { label: "الصافي", flex: 1 }, { label: "الملغاة", flex: 0.8 },
                          ].map((h) => (
                            <Text key={h.label} style={{ flex: h.flex, color: colors.gold, fontFamily: F.bold, fontSize: 9.5, textAlign: "center" }}>{h.label}</Text>
                          ))}
                        </View>
                        {revenueData.monthlyBreakdown.map((row, i) => {
                          const hasData = row.total > 0;
                          return (
                            <View key={i} style={{ flexDirection: "row-reverse", paddingVertical: 9, paddingHorizontal: 8, backgroundColor: i % 2 === 0 ? colors.card : colors.secondary + "66", borderTopWidth: 1, borderTopColor: colors.border + "44" }}>
                              <Text style={{ flex: 1.4, color: hasData ? colors.foreground : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{row.month}</Text>
                              <Text style={{ flex: 0.8, color: hasData ? colors.foreground : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{row.orders > 0 ? row.orders : "—"}</Text>
                              <Text style={{ flex: 1.1, color: hasData ? "#E8920C" : colors.mutedForeground, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{row.total > 0 ? row.total.toFixed(1) : "—"}</Text>
                              <Text style={{ flex: 1, color: hasData ? "#82B1FF" : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{row.tax > 0 ? row.tax.toFixed(1) : "—"}</Text>
                              <Text style={{ flex: 1, color: hasData ? "#4CAF50" : colors.mutedForeground, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{row.net > 0 ? row.net.toFixed(1) : "—"}</Text>
                              <Text style={{ flex: 0.8, color: row.cancelledCount > 0 ? "#EF4444" : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{row.cancelledCount > 0 ? row.cancelledCount : "—"}</Text>
                            </View>
                          );
                        })}
                        {/* Footer totals */}
                        {(() => {
                          const t = revenueData.monthlyBreakdown.reduce((acc, r) => ({ orders: acc.orders + r.orders, total: acc.total + r.total, tax: acc.tax + r.tax, net: acc.net + r.net, cancelled: acc.cancelled + r.cancelledCount }), { orders: 0, total: 0, tax: 0, net: 0, cancelled: 0 });
                          return (
                            <View style={{ flexDirection: "row-reverse", paddingVertical: 10, paddingHorizontal: 8, backgroundColor: colors.secondary, borderTopWidth: 1, borderTopColor: colors.gold + "44" }}>
                              <Text style={{ flex: 1.4, color: colors.gold, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>المجموع</Text>
                              <Text style={{ flex: 0.8, color: colors.foreground, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{t.orders}</Text>
                              <Text style={{ flex: 1.1, color: "#E8920C", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{t.total.toFixed(1)}</Text>
                              <Text style={{ flex: 1, color: "#82B1FF", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{t.tax.toFixed(1)}</Text>
                              <Text style={{ flex: 1, color: "#4CAF50", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{t.net.toFixed(1)}</Text>
                              <Text style={{ flex: 0.8, color: "#EF4444", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{t.cancelled || "—"}</Text>
                            </View>
                          );
                        })()}
                      </View>
                    </>
                  );
                })()}

                {/* ── Daily / Monthly breakdown table ── */}
                {(revenueView === "daily" || revenueView === "monthly") && (
                  <View style={{ backgroundColor: colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                    {/* Table header */}
                    <View style={{ flexDirection: "row-reverse", backgroundColor: colors.secondary, paddingVertical: 10, paddingHorizontal: 8 }}>
                      {[
                        { label: revenueView === "daily" ? "التاريخ" : "الشهر", flex: 1.4 },
                        { label: "الطلبات", flex: 0.8 },
                        { label: "الإجمالي", flex: 1.1 },
                        { label: "الضريبة", flex: 1 },
                        { label: "الصافي", flex: 1 },
                        { label: "الملغاة", flex: 0.8 },
                      ].map((h) => (
                        <Text key={h.label} style={{ flex: h.flex, color: colors.gold, fontFamily: F.bold, fontSize: 9.5, textAlign: "center" }}>{h.label}</Text>
                      ))}
                    </View>
                    {(revenueView === "daily" ? revenueData.dailyBreakdown : revenueData.monthlyBreakdown).map((row, i) => {
                      const label = revenueView === "daily" ? (row as { date: string }).date : (row as { month: string }).month;
                      const hasData = row.total > 0;
                      const hasCancelled = row.cancelledCount > 0;
                      return (
                        <View
                          key={i}
                          style={{
                            flexDirection: "row-reverse", paddingVertical: 9, paddingHorizontal: 8,
                            backgroundColor: i % 2 === 0 ? colors.card : colors.secondary + "66",
                            borderTopWidth: 1, borderTopColor: colors.border + "44",
                          }}
                        >
                          <Text style={{ flex: 1.4, color: hasData ? colors.foreground : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{label}</Text>
                          <Text style={{ flex: 0.8, color: hasData ? colors.foreground : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{row.orders > 0 ? row.orders : "—"}</Text>
                          <Text style={{ flex: 1.1, color: hasData ? "#E8920C" : colors.mutedForeground, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{row.total > 0 ? row.total.toFixed(1) : "—"}</Text>
                          <Text style={{ flex: 1, color: hasData ? "#82B1FF" : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{row.tax > 0 ? row.tax.toFixed(1) : "—"}</Text>
                          <Text style={{ flex: 1, color: hasData ? "#4CAF50" : colors.mutedForeground, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{row.net > 0 ? row.net.toFixed(1) : "—"}</Text>
                          <Text style={{ flex: 0.8, color: hasCancelled ? "#EF4444" : colors.mutedForeground, fontFamily: F.semi, fontSize: 10, textAlign: "center" }}>{hasCancelled ? row.cancelledCount : "—"}</Text>
                        </View>
                      );
                    })}
                    {/* Table footer totals for visible rows */}
                    {(() => {
                      const rows = revenueView === "daily" ? revenueData.dailyBreakdown : revenueData.monthlyBreakdown;
                      const totals = rows.reduce((acc, r) => ({
                        orders: acc.orders + r.orders,
                        total: acc.total + r.total,
                        tax: acc.tax + r.tax,
                        net: acc.net + r.net,
                        cancelled: acc.cancelled + r.cancelledCount,
                      }), { orders: 0, total: 0, tax: 0, net: 0, cancelled: 0 });
                      return (
                        <View style={{ flexDirection: "row-reverse", paddingVertical: 10, paddingHorizontal: 8, backgroundColor: colors.secondary, borderTopWidth: 1, borderTopColor: colors.gold + "44" }}>
                          <Text style={{ flex: 1.4, color: colors.gold, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>المجموع</Text>
                          <Text style={{ flex: 0.8, color: colors.foreground, fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{totals.orders}</Text>
                          <Text style={{ flex: 1.1, color: "#E8920C", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{totals.total.toFixed(1)}</Text>
                          <Text style={{ flex: 1, color: "#82B1FF", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{totals.tax.toFixed(1)}</Text>
                          <Text style={{ flex: 1, color: "#4CAF50", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{totals.net.toFixed(1)}</Text>
                          <Text style={{ flex: 0.8, color: "#EF4444", fontFamily: F.bold, fontSize: 10, textAlign: "center" }}>{totals.cancelled || "—"}</Text>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </>
            );
          })()}
        </ScrollView>
      )}

      {/* ── Combos Tab ── */}
      {activeTab === "combos" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {combos.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 48, gap: 12 }}>
              <Text style={{ fontSize: 40 }}>🎁</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, textAlign: "center" }}>
                لا توجد وجبات مجمعة بعد{"\n"}اضغط + لإضافة وجبة جديدة
              </Text>
            </View>
          )}
          {combos.map((c) => (
            <View key={c.comboId} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: c.available ? "#82B1FF44" : colors.border }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                <Switch
                  value={c.available}
                  onValueChange={async (v) => { try { await updateCombo(c.comboId, { available: v }); } catch {} }}
                  trackColor={{ false: "#3A1A1A", true: "#1A2A4A" }}
                  thumbColor={c.available ? "#82B1FF" : "#E57373"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.available ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 15, textAlign: "right" }}>{c.name}</Text>
                  <Text style={{ color: colors.gold, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>{c.price.toFixed(2)} ر.س</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setEditCombo(c);
                    setComboName(c.name);
                    setComboDesc(c.description ?? "");
                    setComboPrice(String(c.price));
                    setComboImageUrl(c.imageUrl ?? "");
                    setComboComponents(c.components.length > 0 ? c.components.map(x => ({ ...x })) : [{ name: "", quantity: 1 }]);
                    setShowAddComboModal(true);
                  }}
                  style={[styles.iconBtn, { backgroundColor: "#1A2A3A" }]}
                >
                  <Feather name="edit-2" size={15} color="#82B1FF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert("حذف الوجبة", `هل تريد حذف "${c.name}"؟`, [
                    { text: "إلغاء", style: "cancel" },
                    { text: "حذف", style: "destructive", onPress: () => deleteCombo(c.comboId) },
                  ])}
                  style={[styles.iconBtn, { backgroundColor: "#3A1010" }]}
                >
                  <Feather name="trash-2" size={15} color="#E57373" />
                </TouchableOpacity>
              </View>

              {/* Components list */}
              <View style={{ gap: 4 }}>
                {c.components.map((comp, i) => (
                  <View key={i} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: "#82B1FF", fontFamily: F.bold, fontSize: 12 }}>×{comp.quantity}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{comp.name}</Text>
                  </View>
                ))}
              </View>

              {c.description ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>{c.description}</Text>
              ) : null}

              <Text style={{ color: c.available ? "#82B1FF" : "#E57373", fontFamily: F.semi, fontSize: 11, textAlign: "right" }}>
                {c.available ? "✅ متاحة" : "❌ غير متاحة"}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ══ Delivery Zones Tab ══ */}
      {activeTab === "zones" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Info banner */}
          <View style={{ backgroundColor: "#0A2A2A", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#26C6DA33" }}>
            <Text style={{ color: "#26C6DA", fontFamily: F.bold, fontSize: 13, textAlign: "right", marginBottom: 4 }}>
              🗺️ مناطق التوصيل
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right", lineHeight: 18 }}>
              ارسم مناطق التوصيل على الخريطة. عند تفعيل منطقة واحدة على الأقل، يتحقق التطبيق من موقع العميل تلقائياً ويمنع الطلب إذا كان خارج النطاق.
            </Text>
          </View>

          {zonesLoading && <ActivityIndicator color="#26C6DA" style={{ marginTop: 24 }} />}

          {!zonesLoading && deliveryZones.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 48, gap: 12 }}>
              <Text style={{ fontSize: 40 }}>🗺️</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, textAlign: "center" }}>
                لا توجد مناطق توصيل بعد{"\n"}اضغط + لإضافة أول منطقة
              </Text>
            </View>
          )}

          {deliveryZones.map((z) => (
            <View key={z.id} style={{
              backgroundColor: colors.card, borderRadius: 16, padding: 14,
              gap: 10, borderWidth: 1,
              borderColor: z.enabled ? "#26C6DA44" : colors.border,
            }}>
              {/* Header row */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                <Switch
                  value={z.enabled}
                  onValueChange={(v) => toggleZone(z, v)}
                  trackColor={{ false: "#3A1A1A", true: "#0A3A3A" }}
                  thumbColor={z.enabled ? "#26C6DA" : "#E57373"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: z.enabled ? colors.foreground : colors.mutedForeground, fontFamily: F.bold, fontSize: 15, textAlign: "right" }}>
                    {z.name}
                  </Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 2 }}>
                    <Text style={{ color: colors.gold, fontFamily: F.semi, fontSize: 12 }}>
                      رسوم: {(z.deliveryFee / 100).toFixed(2)} ر.س
                    </Text>
                    {z.minOrder > 0 && (
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                        حد أدنى: {(z.minOrder / 100).toFixed(0)} ر.س
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={() => openEditZone(z)} style={[styles.iconBtn, { backgroundColor: "#0A2A2A" }]}>
                  <Feather name="edit-2" size={15} color="#26C6DA" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteZone(z)} style={[styles.iconBtn, { backgroundColor: "#3A1010" }]}>
                  <Feather name="trash-2" size={15} color="#E57373" />
                </TouchableOpacity>
              </View>

              {/* Polygon stats */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                <Feather name="map" size={13} color={z.polygon.length >= 3 ? "#26C6DA" : "#E57373"} />
                <Text style={{ color: z.polygon.length >= 3 ? "#26C6DA" : "#E57373", fontFamily: F.regular, fontSize: 12 }}>
                  {z.polygon.length >= 3 ? `${z.polygon.length} نقطة — المنطقة مرسومة` : "⚠️ لا توجد منطقة مرسومة"}
                </Text>
                <Text style={{ color: z.enabled ? "#4CAF50" : colors.mutedForeground, fontFamily: F.semi, fontSize: 11, marginRight: "auto" }}>
                  {z.enabled ? "✅ مفعّلة" : "⏸ معطّلة"}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ══ Referrals Tab ══ */}
      {activeTab === "referrals" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {/* Settings card */}
          <View style={{ backgroundColor: "#0A1F0A", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#4CAF5033", gap: 12 }}>
            <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 16, textAlign: "right" }}>⚙️ إعدادات برنامج الإحالة</Text>

            {/* Enable toggle */}
            {referralSettings && (
              <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14 }}>تفعيل البرنامج</Text>
                <TouchableOpacity
                  onPress={async () => {
                    const newEnabled = !referralSettings.enabled;
                    setReferralSettings({ ...referralSettings, enabled: newEnabled });
                    try {
                      await apiPost("/referrals/settings", { rate: referralSettings.rate, enabled: newEnabled });
                    } catch { loadReferrals(); }
                  }}
                  style={{
                    width: 52, height: 28, borderRadius: 14,
                    backgroundColor: referralSettings.enabled ? "#4CAF50" : colors.secondary,
                    justifyContent: "center",
                    paddingHorizontal: 3,
                    borderWidth: 1,
                    borderColor: referralSettings.enabled ? "#4CAF50" : colors.border,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff",
                    alignSelf: referralSettings.enabled ? "flex-end" : "flex-start",
                  }} />
                </TouchableOpacity>
              </View>
            )}

            {/* Rate input */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>مبلغ المكافأة (ر.س) لكل إحالة ناجحة</Text>
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TextInput
                  value={referralRateInput}
                  onChangeText={setReferralRateInput}
                  keyboardType="decimal-pad"
                  placeholder="مثال: 5.00"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: "#4CAF50", fontFamily: F.bold, textAlign: "right", borderWidth: 1, borderColor: "#4CAF5044" }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    const rate = parseFloat(referralRateInput);
                    if (isNaN(rate) || rate < 0) return;
                    setReferralSaving(true);
                    try {
                      await apiPost("/referrals/settings", { rate, enabled: referralSettings?.enabled ?? true });
                      await loadReferrals();
                    } catch {} finally { setReferralSaving(false); }
                  }}
                  disabled={referralSaving}
                  style={{ backgroundColor: "#4CAF5022", borderRadius: 12, paddingHorizontal: 18, justifyContent: "center", borderWidth: 1, borderColor: "#4CAF50" }}
                >
                  {referralSaving
                    ? <ActivityIndicator color="#4CAF50" />
                    : <Text style={{ color: "#4CAF50", fontFamily: F.bold }}>حفظ</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Summary table */}
          <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 15, textAlign: "right", marginTop: 4 }}>📋 قائمة المُحيلين</Text>
          {referralRows.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 32, gap: 10 }}>
              <Text style={{ fontSize: 38 }}>🎁</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, textAlign: "center" }}>لا توجد إحالات بعد</Text>
            </View>
          )}
          {referralRows.map((row, i) => (
            <View key={i} style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#4CAF5033", gap: 6 }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, textAlign: "right", fontSize: 14 }}>{row.referrerPhone}</Text>
              <View style={{ flexDirection: "row-reverse", gap: 16, flexWrap: "wrap" }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>الإجمالي: {row.total}</Text>
                <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>مكافآت: {row.rewarded}</Text>
                <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 12 }}>{row.totalRewardSAR.toFixed(2)} ر.س</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Zone Form Modal */}
      <Modal visible={zoneFormModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior="padding">
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 }}>
              <Text style={{ color: "#26C6DA", fontFamily: F.extra, fontSize: 18, textAlign: "center" }}>
                {editingZone ? "✏️ تعديل المنطقة" : "🗺️ إضافة منطقة توصيل"}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>اسم المنطقة *</Text>
              <TextInput
                value={zoneFormName} onChangeText={setZoneFormName}
                placeholder="مثال: حي الروضة، وسط المدينة..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border, fontFamily: F.regular }]}
              />

              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>رسوم التوصيل (ر.س)</Text>
                  <TextInput
                    value={zoneFormFee} onChangeText={setZoneFormFee}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border, fontFamily: F.regular }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>الحد الأدنى (ر.س)</Text>
                  <TextInput
                    value={zoneFormMinOrder} onChangeText={setZoneFormMinOrder}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border, fontFamily: F.regular }]}
                  />
                </View>
              </View>

              {/* Draw polygon button */}
              <TouchableOpacity
                onPress={() => setZoneMapDrawVisible(true)}
                style={{
                  backgroundColor: zonePolygon.length >= 3 ? "#0A3A2A" : "#1A1A0A",
                  borderRadius: 12, paddingVertical: 14,
                  borderWidth: 1, borderColor: zonePolygon.length >= 3 ? "#4CAF50" : "#26C6DA",
                  alignItems: "center", gap: 6,
                }}
              >
                <Text style={{ color: zonePolygon.length >= 3 ? "#4CAF50" : "#26C6DA", fontFamily: F.bold, fontSize: 15 }}>
                  {zonePolygon.length >= 3
                    ? `✅ المنطقة مرسومة (${zonePolygon.length} نقطة) — اضغط للتعديل`
                    : "🗺️ ارسم المنطقة على الخريطة *"}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalBtns}>
                <TouchableOpacity onPress={() => setZoneFormModal(false)} style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Text style={[styles.modalBtnText, { color: colors.mutedForeground, fontFamily: F.regular }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveZone}
                  disabled={zoneSaving}
                  style={[styles.modalBtn, { backgroundColor: "#26C6DA22", borderColor: "#26C6DA" }]}
                >
                  {zoneSaving
                    ? <ActivityIndicator color="#26C6DA" />
                    : <Text style={[styles.modalBtnText, { color: "#26C6DA", fontFamily: F.bold }]}>حفظ المنطقة</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Zone Map Drawer */}
      <ZoneDrawerModal
        visible={zoneMapDrawVisible}
        initialPolygon={zonePolygon}
        zoneName={zoneFormName}
        onConfirm={(poly) => { setZonePolygon(poly); setZoneMapDrawVisible(false); }}
        onClose={() => setZoneMapDrawVisible(false)}
      />

      {/* Add / Edit Combo Modal */}
      <Modal visible={showAddComboModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 18, textAlign: "center", marginBottom: 4 }}>
                {editCombo ? "✏️ تعديل الوجبة" : "🎁 إضافة وجبة مجمعة"}
              </Text>

              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>اسم الوجبة *</Text>
              <TextInput
                value={comboName} onChangeText={setComboName}
                placeholder="مثال: الوجبة العائلية الكبرى"
                placeholderTextColor={colors.mutedForeground}
                style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
              />

              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>السعر (ر.س) *</Text>
              <TextInput
                value={comboPrice} onChangeText={setComboPrice}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.gold, fontFamily: F.bold, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
              />

              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>وصف الوجبة (اختياري)</Text>
              <TextInput
                value={comboDesc} onChangeText={setComboDesc}
                placeholder="وصف مختصر..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", minHeight: 60, borderWidth: 1, borderColor: colors.border }}
              />

              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "right" }}>رابط صورة الوجبة (اختياري)</Text>
              <TextInput
                value={comboImageUrl} onChangeText={setComboImageUrl}
                placeholder="https://..."
                placeholderTextColor={colors.mutedForeground}
                style={{ backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
              />

              {/* Components */}
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: "#82B1FF", fontFamily: F.bold, fontSize: 14 }}>📋 محتويات الوجبة</Text>
                <TouchableOpacity
                  onPress={() => setComboComponents((prev) => [...prev, { name: "", quantity: 1 }])}
                  style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: "#1A2A3A", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                >
                  <Feather name="plus" size={14} color="#82B1FF" />
                  <Text style={{ color: "#82B1FF", fontFamily: F.semi, fontSize: 12 }}>أضف صنف</Text>
                </TouchableOpacity>
              </View>

              {comboComponents.map((comp, idx) => (
                <View key={idx} style={{ flexDirection: "row-reverse", gap: 8, alignItems: "center" }}>
                  <TextInput
                    value={comp.name}
                    onChangeText={(t) => setComboComponents((prev) => prev.map((x, i) => i === idx ? { ...x, name: t } : x))}
                    placeholder="اسم الصنف"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: colors.foreground, fontFamily: F.regular, textAlign: "right", borderWidth: 1, borderColor: colors.border }}
                  />
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}>
                    <TouchableOpacity onPress={() => setComboComponents((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x))}>
                      <Feather name="plus" size={16} color={colors.gold} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, minWidth: 20, textAlign: "center" }}>{comp.quantity}</Text>
                    <TouchableOpacity onPress={() => setComboComponents((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>
                      <Feather name="minus" size={16} color={colors.gold} />
                    </TouchableOpacity>
                  </View>
                  {comboComponents.length > 1 && (
                    <TouchableOpacity onPress={() => setComboComponents((prev) => prev.filter((_, i) => i !== idx))}>
                      <Feather name="x" size={18} color="#E57373" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* Save / Cancel */}
              <View style={{ gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={async () => {
                    const price = parseFloat(comboPrice);
                    if (!comboName.trim() || isNaN(price) || price <= 0) {
                      Alert.alert("خطأ", "أدخل اسم الوجبة والسعر"); return;
                    }
                    const validComponents = comboComponents.filter(c => c.name.trim());
                    if (validComponents.length === 0) {
                      Alert.alert("خطأ", "أضف على الأقل صنف واحد في الوجبة"); return;
                    }
                    setComboLoading(true);
                    try {
                      const data = {
                        name: comboName.trim(),
                        description: comboDesc.trim() || null,
                        price,
                        imageUrl: comboImageUrl.trim() || null,
                        imageKey: null,
                        components: validComponents,
                        available: true,
                        sortOrder: 0,
                      };
                      if (editCombo) {
                        await updateCombo(editCombo.comboId, data);
                      } else {
                        await addCombo(data);
                      }
                      setShowAddComboModal(false);
                      setEditCombo(null);
                    } catch {
                      Alert.alert("خطأ", "تعذّر حفظ الوجبة");
                    } finally {
                      setComboLoading(false);
                    }
                  }}
                  disabled={comboLoading}
                  style={{ paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: "#82B1FF" }}
                >
                  {comboLoading
                    ? <ActivityIndicator color="#0A1A2A" />
                    : <Text style={{ color: "#0A1A2A", fontFamily: F.bold, fontSize: 15 }}>{editCombo ? "حفظ التعديلات" : "إضافة الوجبة"}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowAddComboModal(false); setEditCombo(null); }}
                  style={{ paddingVertical: 12, borderRadius: 14, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Modal */}
      <Modal
        visible={showAddModal || editItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowAddModal(false); setEditItem(null); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: F.extra }]}>
              {editItem ? "تعديل الصنف" : "إضافة صنف جديد"}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>اسم الصنف (عربي) *</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="مثال: مندي دجاج كامل"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.regular }]}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>Item Name (English)</Text>
            <TextInput
              value={newNameEn}
              onChangeText={setNewNameEn}
              placeholder="e.g. Whole Chicken Mandi"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.regular }]}
              textAlign="left"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>السعر (ريال)</Text>
            <TextInput
              value={newPrice}
              onChangeText={setNewPrice}
              placeholder="مثال: 44"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, fontFamily: F.regular }]}
              textAlign="right"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>التصنيف</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catPicker}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setNewCategory(cat.id)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: newCategory === cat.id ? colors.gold : colors.secondary,
                      borderColor: newCategory === cat.id ? colors.gold : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.catChipText, { color: newCategory === cat.id ? "#1A1008" : colors.foreground, fontFamily: F.bold }]}>
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>صورة الصنف (اختياري)</Text>
            {newImageUrl ? (
              <View style={{ marginBottom: 10 }}>
                <Image
                  source={{ uri: newImageUrl }}
                  style={{ width: "100%", height: 140, borderRadius: 12, backgroundColor: colors.secondary }}
                  resizeMode="cover"
                />
                <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8 }}>
                  {/* تغيير الصورة — يمسح المحلي فقط ليتيح رفع صورة جديدة */}
                  <TouchableOpacity
                    onPress={() => setNewImageUrl("")}
                    disabled={menuImageDeleting}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.secondary }}
                  >
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>↩ تغيير الصورة</Text>
                  </TouchableOpacity>
                  {/* حذف نهائي — يحذف من Storage وقاعدة البيانات */}
                  <TouchableOpacity
                    onPress={handleDeleteMenuImagePermanently}
                    disabled={menuImageDeleting}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#ef444466", alignItems: "center", backgroundColor: "#1c0606", flexDirection: "row", justifyContent: "center", gap: 6 }}
                  >
                    {menuImageDeleting
                      ? <ActivityIndicator size="small" color="#ef4444" />
                      : <>
                          <Feather name="trash-2" size={13} color="#ef4444" />
                          <Text style={{ color: "#ef4444", fontFamily: F.semi, fontSize: 13 }}>حذف الصورة نهائياً</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handlePickMenuImage}
                disabled={menuImageUploading}
                style={[styles.input, {
                  backgroundColor: colors.background,
                  borderColor: colors.gold,
                  borderStyle: "dashed",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  paddingVertical: 16,
                  marginBottom: 4,
                }]}
              >
                {menuImageUploading ? (
                  <ActivityIndicator color={colors.gold} />
                ) : (
                  <>
                    <Feather name="image" size={18} color={colors.gold} />
                    <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 13 }}>اختر صورة من الاستيديو</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => { setShowAddModal(false); setEditItem(null); }}
                style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground, fontFamily: F.bold }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={editItem ? handleSaveEdit : handleAdd}
                disabled={loading === "add" || loading === editItem?.itemId}
                style={[styles.modalBtn, { backgroundColor: colors.gold, flex: 1.5 }]}
              >
                {loading === "add" || loading === editItem?.itemId ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff", fontFamily: F.bold }]}>
                    {editItem ? "حفظ التعديلات" : "إضافة الصنف"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Commission Rate Edit Modal ── */}
      <Modal
        visible={commissionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCommissionModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: 280 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: F.extra, textAlign: "right" }]}>
              🤝 تعديل نسبة عمولة علاء الباسطي
            </Text>
            <View style={{ gap: 12 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "right" }}>
                أدخل النسبة المئوية الجديدة (0 - 100)
              </Text>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", backgroundColor: colors.secondary, borderRadius: 12, borderWidth: 1, borderColor: colors.gold, paddingHorizontal: 14, gap: 8 }}>
                <TextInput
                  value={commissionInput}
                  onChangeText={setCommissionInput}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, color: colors.foreground, fontFamily: F.bold, fontSize: 22, paddingVertical: 12, textAlign: "center" }}
                  selectTextOnFocus
                  maxLength={5}
                />
                <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 22 }}>%</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={saveCommissionRate}
                disabled={commissionSaving}
                style={{ flex: 1, backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: commissionSaving ? 0.6 : 1 }}
              >
                <Text style={{ color: "#1A1008", fontFamily: F.extra, fontSize: 14 }}>
                  {commissionSaving ? "جارٍ الحفظ..." : "حفظ"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCommissionModalVisible(false)}
                style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 14 }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Stock Management Modal */}
      <Modal
        visible={stockItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setStockItem(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: F.extra }]}>
              📦 إدارة مخزون
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.gold, fontFamily: F.bold, fontSize: 15, textAlign: "center", marginBottom: 4 }]}>
              {stockItem?.name}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>الكمية المتوفرة في المطعم</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, fontFamily: F.extra, textAlign: "center", fontSize: 28, letterSpacing: 4 }]}
              value={stockInput}
              onChangeText={setStockInput}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "center", marginTop: -8 }]}>
              اتركه فارغاً = غير محدود ∞ | 0 = نافد (يُخفى من العميل)
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {[0, 1, 2, 3, 5, 10, 15, 20].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setStockInput(String(n))}
                  style={[styles.catChip, {
                    backgroundColor: stockInput === String(n) ? colors.gold : colors.secondary,
                    borderColor: stockInput === String(n) ? colors.gold : colors.border,
                    paddingHorizontal: 14,
                  }]}
                >
                  <Text style={[styles.catChipText, { color: stockInput === String(n) ? "#1A1008" : colors.foreground, fontFamily: F.bold }]}>
                    {n === 0 ? "نافد 0" : n}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setStockInput("")}
                style={[styles.catChip, {
                  backgroundColor: stockInput === "" ? colors.gold : colors.secondary,
                  borderColor: stockInput === "" ? colors.gold : colors.border,
                  paddingHorizontal: 14,
                }]}
              >
                <Text style={[styles.catChipText, { color: stockInput === "" ? "#1A1008" : colors.foreground, fontFamily: F.bold }]}>∞</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.modalBtns, { marginTop: 16 }]}>
              <TouchableOpacity
                onPress={() => setStockItem(null)}
                style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground, fontFamily: F.bold }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSetStock}
                disabled={loading?.startsWith("stock-")}
                style={[styles.modalBtn, { backgroundColor: "#7B1FA2", flex: 1.5 }]}
              >
                {loading?.startsWith("stock-") ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff", fontFamily: F.bold }]}>حفظ الكمية</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add / Edit Occasion Modal */}
      <Modal
        visible={showAddOccasionModal || editOccasion !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowAddOccasionModal(false); setEditOccasion(null); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: F.extra }]}>
              {editOccasion ? "تعديل المناسبة" : "إضافة مناسبة جديدة"}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>اسم المناسبة</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, fontFamily: F.regular, textAlign: "right" }]}
              value={occName}
              onChangeText={setOccName}
              placeholder="مثال: عروض رمضان الكريم"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>الوصف (اختياري)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, fontFamily: F.regular, textAlign: "right" }]}
              value={occDesc}
              onChangeText={setOccDesc}
              placeholder="مثال: أسعار مميزة طوال الشهر الكريم"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>صورة المناسبة (اختياري)</Text>

            {occImageUrl ? (
              <View style={{ alignItems: "center", marginBottom: 10 }}>
                <Image
                  source={{ uri: occImageUrl }}
                  style={{ width: "100%", height: 160, borderRadius: 12, backgroundColor: colors.secondary }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => setOccImageUrl("")}
                  style={{ marginTop: 6 }}
                >
                  <Text style={{ color: "#ef4444", fontFamily: F.semi, fontSize: 13 }}>✕ إزالة الصورة</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handlePickImage}
                disabled={occImageUploading}
                style={[styles.input, {
                  backgroundColor: colors.background,
                  borderColor: colors.gold,
                  borderStyle: "dashed",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  paddingVertical: 18,
                }]}
              >
                {occImageUploading ? (
                  <ActivityIndicator color={colors.gold} />
                ) : (
                  <>
                    <Feather name="image" size={20} color={colors.gold} />
                    <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 14 }}>اختر صورة من الاستيديو</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => { setShowAddOccasionModal(false); setEditOccasion(null); }}
                style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground, fontFamily: F.bold }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveOccasion}
                disabled={loading === "occ-save"}
                style={[styles.modalBtn, { backgroundColor: colors.gold, flex: 1.5 }]}
              >
                {loading === "occ-save" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff", fontFamily: F.bold }]}>
                    {editOccasion ? "حفظ التعديلات" : "إضافة المناسبة"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── تأكيد حذف المندوب ── */}
      <Modal visible={!!driverToDelete} transparent animationType="fade" onRequestClose={() => setDriverToDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "#000000AA", justifyContent: "center", alignItems: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 24, width: "100%", gap: 16, borderWidth: 1, borderColor: "#E5737355" }}>
            <Text style={{ fontSize: 28, textAlign: "center" }}>🗑️</Text>
            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16, textAlign: "center" }}>
              حذف المندوب
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center" }}>
              هل تريد حذف <Text style={{ color: "#E57373", fontFamily: F.bold }}>{driverToDelete?.name}</Text> بشكل نهائي؟
            </Text>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity
                onPress={async () => {
                  if (!driverToDelete) return;
                  setDriverDeleteLoading(true);
                  try {
                    await apiDelete(`/drivers/${driverToDelete.id}`);
                    await loadAdminDrivers();
                    setDriverToDelete(null);
                  } catch {
                    Alert.alert("خطأ", "تعذّر حذف المندوب، حاول مرة أخرى.");
                  }
                  setDriverDeleteLoading(false);
                }}
                disabled={driverDeleteLoading}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#E57373", opacity: driverDeleteLoading ? 0.7 : 1 }}
              >
                {driverDeleteLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14 }}>نعم، احذف</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDriverToDelete(null)}
                style={{ paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── تأكيد حذف البنر ── */}
      <Modal visible={!!bannerToDelete} transparent animationType="fade" onRequestClose={() => setBannerToDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "#000000AA", justifyContent: "center", alignItems: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 24, width: "100%", gap: 16, borderWidth: 1, borderColor: "#E5737355" }}>
            {bannerToDelete?.imageUrl && (
              <Image source={{ uri: bannerToDelete.imageUrl }} style={{ width: "100%", height: 100, borderRadius: 10 }} resizeMode="cover" />
            )}
            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16, textAlign: "center" }}>
              حذف البنر
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center" }}>
              هل تريد حذف هذه الصورة بشكل نهائي؟
            </Text>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity
                onPress={async () => {
                  if (!bannerToDelete) return;
                  setBannerDeleteLoading(true);
                  try {
                    await apiDelete(`/banners/${bannerToDelete.bannerId}`);
                    await refreshBanners();
                    setBannerToDelete(null);
                  } catch {
                    Alert.alert("خطأ", "تعذّر حذف البنر، حاول مرة أخرى.");
                  }
                  setBannerDeleteLoading(false);
                }}
                disabled={bannerDeleteLoading}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#E57373", opacity: bannerDeleteLoading ? 0.7 : 1 }}
              >
                {bannerDeleteLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14 }}>نعم، احذف</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBannerToDelete(null)}
                style={{ paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Print Revenue Modal ── */}
      <Modal visible={printModalVisible} transparent animationType="slide" onRequestClose={() => setPrintModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 8, borderWidth: 1, borderColor: colors.border, maxHeight: "90%" }}>
            {/* Header */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16 }}>🖨 إعدادات الطباعة</Text>
              <TouchableOpacity onPress={() => setPrintModalVisible(false)} style={{ padding: 6 }}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
              {/* ── Period ── */}
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>📅 الفترة الزمنية</Text>
              <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                {([
                  { key: "today",     label: "اليوم" },
                  { key: "yesterday", label: "أمس" },
                  { key: "daybefore", label: "أول أمس" },
                  { key: "week",      label: "آخر 7 أيام" },
                  { key: "month",     label: "هذا الشهر" },
                  { key: "lastmonth", label: "الشهر الماضي" },
                  { key: "year",      label: "هذه السنة" },
                  { key: "custom",    label: "📆 مخصص" },
                ] as const).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      setPrintPreset(key);
                      if (key === "today")     { setPrintFromDate(getSaudiDateStr(0)); setPrintToDate(getSaudiDateStr(0)); }
                      else if (key === "yesterday")  { setPrintFromDate(getSaudiDateStr(1)); setPrintToDate(getSaudiDateStr(1)); }
                      else if (key === "daybefore")  { setPrintFromDate(getSaudiDateStr(2)); setPrintToDate(getSaudiDateStr(2)); }
                      else if (key === "week")        { setPrintFromDate(getSaudiDateStr(6)); setPrintToDate(getSaudiDateStr(0)); }
                      else if (key === "month") {
                        const nl = new Date(Date.now() + 3 * 3600 * 1000);
                        const ms = `${nl.getUTCFullYear()}-${String(nl.getUTCMonth() + 1).padStart(2, "0")}-01`;
                        setPrintFromDate(ms); setPrintToDate(getSaudiDateStr(0));
                      }
                      else if (key === "year") {
                        const yr = new Date(Date.now() + 3 * 3600 * 1000).getUTCFullYear();
                        setPrintFromDate(`${yr}-01-01`); setPrintToDate(getSaudiDateStr(0));
                      }
                    }}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                      backgroundColor: printPreset === key ? colors.gold : colors.secondary,
                      borderWidth: 1, borderColor: printPreset === key ? colors.gold : colors.border }}
                  >
                    <Text style={{ color: printPreset === key ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Custom date range ── */}
              {printPreset === "custom" && (
                <View style={{ gap: 10, backgroundColor: colors.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>اختر نطاق التاريخ</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>من</Text>
                      {Platform.OS === "web" ? (
                        // @ts-ignore
                        <input type="date" value={printFromDate} onChange={(e: any) => setPrintFromDate(e.target.value)}
                          style={{ fontSize: 13, padding: "8px", borderRadius: "8px", border: `1px solid #333`, backgroundColor: "#1A1008", color: "#fff", direction: "ltr", width: "100%", fontFamily: "Cairo, sans-serif" }} />
                      ) : (
                        <TextInput value={printFromDate} onChangeText={setPrintFromDate} placeholder="2026-05-01"
                          placeholderTextColor={colors.mutedForeground}
                          style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 13, textAlign: "center" }} />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>إلى</Text>
                      {Platform.OS === "web" ? (
                        // @ts-ignore
                        <input type="date" value={printToDate} onChange={(e: any) => setPrintToDate(e.target.value)}
                          style={{ fontSize: 13, padding: "8px", borderRadius: "8px", border: `1px solid #333`, backgroundColor: "#1A1008", color: "#fff", direction: "ltr", width: "100%", fontFamily: "Cairo, sans-serif" }} />
                      ) : (
                        <TextInput value={printToDate} onChangeText={setPrintToDate} placeholder="2026-05-28"
                          placeholderTextColor={colors.mutedForeground}
                          style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 13, textAlign: "center" }} />
                      )}
                    </View>
                  </View>
                  {(printFromDate && printToDate) && (
                    <Text style={{ color: colors.gold, fontFamily: F.semi, fontSize: 11, textAlign: "center" }}>
                      {printFromDate} → {printToDate}
                    </Text>
                  )}
                </View>
              )}

              {/* ── Sections ── */}
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>📄 محتويات التقرير</Text>
              {([
                { key: "kpi"     as const, label: "الأرقام الرئيسية",  desc: "الإيرادات، الضريبة، الطلبات المكتملة والملغاة" },
                { key: "payment" as const, label: "طريقة الدفع",       desc: "مقارنة نقدي مقابل إلكتروني" },
                { key: "summary" as const, label: "الملخص المالي",     desc: "تفاصيل كاملة بالأرقام" },
              ]).map(({ key, label, desc }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setPrintSections(s => ({ ...s, [key]: !s[key] }))}
                  style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12,
                    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
                    borderWidth: 1, borderColor: printSections[key] ? "#4CAF5055" : colors.border }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6,
                    backgroundColor: printSections[key] ? "#4CAF50" : "transparent",
                    borderWidth: 2, borderColor: printSections[key] ? "#4CAF50" : colors.mutedForeground,
                    alignItems: "center", justifyContent: "center" }}>
                    {printSections[key] && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 13 }}>{label}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* ── Print Button ── */}
              <TouchableOpacity
                onPress={executePrint}
                disabled={printFetching || (printPreset === "custom" && (!printFromDate || !printToDate))}
                style={{ backgroundColor: "#4CAF50", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4,
                  opacity: (printFetching || (printPreset === "custom" && (!printFromDate || !printToDate))) ? 0.5 : 1 }}
              >
                {printFetching
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontFamily: F.extra, fontSize: 15 }}>🖨 طباعة التقرير</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Custom Sound URL Modal ── */}
      <Modal visible={customSoundModalVisible} transparent animationType="fade" onRequestClose={() => setCustomSoundModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)" }} behavior="padding">
          <View style={{ width: "88%", backgroundColor: "#1A1008", borderRadius: 18, padding: 24, borderWidth: 1, borderColor: "#3A2410", gap: 16 }}>
            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 16, textAlign: "right" }}>🎵 صوت مخصص</Text>
            <Text style={{ color: "#9A7A5A", fontFamily: F.regular, fontSize: 13, textAlign: "right" }}>
              أدخل رابط ملف صوتي (MP3 أو WAV) ليُحدَّث على جميع الأجهزة
            </Text>
            <TextInput
              value={customSoundUrlInput}
              onChangeText={setCustomSoundUrlInput}
              placeholder="https://example.com/sound.mp3"
              placeholderTextColor="#5A4A3A"
              autoCapitalize="none"
              keyboardType="url"
              style={{
                backgroundColor: "#0F0A05",
                borderWidth: 1,
                borderColor: "#3A2410",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: "#E8C87A",
                fontFamily: F.regular,
                fontSize: 13,
                textAlign: "left",
              }}
            />
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity
                onPress={confirmCustomSoundUrl}
                disabled={!customSoundUrlInput.trim()}
                style={{ flex: 1, backgroundColor: "#C8171A", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: customSoundUrlInput.trim() ? 1 : 0.45 }}
              >
                <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 15 }}>✓ حفظ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCustomSoundModalVisible(false)}
                style={{ flex: 1, backgroundColor: "#2A1A0A", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#3A2410" }}
              >
                <Text style={{ color: "#9A7A5A", fontFamily: F.bold, fontSize: 15 }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Discount Code Usages Modal ────────────────────── */}
      <Modal
        visible={showDcUsagesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDcUsagesModal(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000099" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, maxHeight: "90%" }}>
            {/* Header */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 22 }}>🏷️</Text>
                <View>
                  <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 17, textAlign: "right" }}>
                    {discountCodes.find((d) => d.id === selectedDcId)?.code ?? ""}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "right" }}>
                    سجل الاستخدام
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <TouchableOpacity
                  onPress={exportDcUsagesCsv}
                  style={{ padding: 6, borderRadius: 8, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
                >
                  <Feather name="download" size={18} color={colors.gold} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowDcUsagesModal(false)} style={{ padding: 6 }}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Period Filter */}
            <View style={{ flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {([
                { key: "7d" as const, label: "7 أيام" },
                { key: "30d" as const, label: "30 يوم" },
                { key: "all" as const, label: "الكل" },
              ]).map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    if (key === dcUsagePeriod) return;
                    setDcUsagePeriod(key);
                    if (selectedDcId != null) loadDcUsages(selectedDcId, key);
                  }}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: dcUsagePeriod === key ? colors.gold : colors.secondary,
                    borderWidth: 1, borderColor: dcUsagePeriod === key ? colors.gold : colors.border,
                  }}
                >
                  <Text style={{ color: dcUsagePeriod === key ? "#1A0A00" : colors.mutedForeground, fontFamily: F.bold, fontSize: 12 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {dcUsagesLoading ? (
              <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64 }}>
                <ActivityIndicator size="large" color={colors.gold} />
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                {/* Summary Cards */}
                <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 4 }}>
                  <View style={{ flex: 1, backgroundColor: "#1A2A3A", borderRadius: 12, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#64B5F633" }}>
                    <Text style={{ color: "#64B5F6", fontFamily: F.extra, fontSize: 22 }}>{dcUsages.length}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>مرة استُخدم</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "#1A3A1A", borderRadius: 12, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#4CAF5033" }}>
                    <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 22 }}>
                      {(dcTotalSavings / 100) % 1 === 0 ? dcTotalSavings / 100 : (dcTotalSavings / 100).toFixed(2)}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>ر.س إجمالي الخصم</Text>
                  </View>
                </View>

                {/* Chart */}
                {dcChartData.length > 1 && (() => {
                  const chartW = Math.min(Dimensions.get("window").width - 48, 360);
                  const chartH = 110;
                  const padL = 6;
                  const padR = 6;
                  const padT = 10;
                  const padB = 32;
                  const plotW = chartW - padL - padR;
                  const plotH = chartH - padT - padB;
                  const values = dcChartData.map((d) => dcChartMetric === "count" ? d.count : d.savings / 100);
                  const maxVal = Math.max(...values, 1);
                  const barCount = dcChartData.length;
                  const barW = Math.max(4, Math.floor(plotW / barCount) - 2);
                  const slotW = plotW / barCount;

                  return (
                    <View style={{ gap: 8 }}>
                      {/* Metric toggle */}
                      <View style={{ flexDirection: "row-reverse", gap: 6, justifyContent: "center" }}>
                        {([
                          { key: "count" as const, label: "عدد الاستخدامات" },
                          { key: "savings" as const, label: "قيمة الخصم (ر.س)" },
                        ]).map(({ key, label }) => (
                          <TouchableOpacity
                            key={key}
                            onPress={() => setDcChartMetric(key)}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
                              backgroundColor: dcChartMetric === key ? colors.primary : colors.secondary,
                              borderWidth: 1, borderColor: dcChartMetric === key ? colors.primary : colors.border,
                            }}
                          >
                            <Text style={{ color: dcChartMetric === key ? "#fff" : colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* SVG bar chart (captured for share) */}
                      <View
                        ref={dcChartRef}
                        collapsable={false}
                        style={{ alignSelf: "center", backgroundColor: colors.secondary, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border }}
                      >
                        <Svg width={chartW} height={chartH}>
                          {/* Baseline */}
                          <Line
                            x1={padL} y1={padT + plotH}
                            x2={padL + plotW} y2={padT + plotH}
                            stroke={colors.border} strokeWidth={1}
                          />
                          {dcChartData.map((d, i) => {
                            const val = dcChartMetric === "count" ? d.count : d.savings / 100;
                            const barH = Math.max(3, (val / maxVal) * plotH);
                            const x = padL + i * slotW + (slotW - barW) / 2;
                            const y = padT + plotH - barH;
                            const isLast = i === barCount - 1;
                            const isFirst = i === 0;
                            const showLabel = barCount <= 10 || isFirst || isLast || i === Math.floor(barCount / 2);
                            const dateParts = d.date.split("-");
                            const dayLabel = barCount <= 7 ? `${parseInt(dateParts[2])}/${parseInt(dateParts[1])}` : `${parseInt(dateParts[2])}`;
                            return (
                              <React.Fragment key={d.date}>
                                <Rect
                                  x={x} y={y} width={barW} height={barH}
                                  fill={colors.gold} rx={2}
                                  opacity={0.9}
                                />
                                {/* Value label on top of bar if bar is tall enough */}
                                {barH > 18 && barW >= 12 && (
                                  <SvgText
                                    x={x + barW / 2} y={y + 10}
                                    textAnchor="middle" fontSize={9}
                                    fill={colors.background} fontWeight="bold"
                                  >
                                    {dcChartMetric === "count" ? String(val) : val % 1 === 0 ? String(val) : val.toFixed(1)}
                                  </SvgText>
                                )}
                                {showLabel && (
                                  <SvgText
                                    x={x + barW / 2} y={chartH - 4}
                                    textAnchor="middle" fontSize={8}
                                    fill={colors.mutedForeground}
                                  >
                                    {dayLabel}
                                  </SvgText>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </Svg>
                      </View>

                      {/* Share chart button */}
                      <TouchableOpacity
                        onPress={shareDcChart}
                        disabled={dcChartSharing}
                        style={{
                          flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
                          gap: 6, alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8,
                          borderRadius: 20, backgroundColor: colors.secondary,
                          borderWidth: 1, borderColor: colors.border,
                          opacity: dcChartSharing ? 0.6 : 1,
                        }}
                      >
                        {dcChartSharing
                          ? <ActivityIndicator size="small" color={colors.gold} />
                          : <Feather name="share-2" size={14} color={colors.gold} />
                        }
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                          {dcChartSharing ? "جاري الالتقاط…" : "مشاركة المخطط"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}

                {/* Usage List */}
                {dcUsages.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                    <Text style={{ fontSize: 36 }}>📭</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>لم يُستخدم هذا الكود بعد</Text>
                  </View>
                ) : (
                  dcUsages.map((u, idx) => {
                    const date = new Date(u.usedAt);
                    const dateStr = date.toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });
                    const timeStr = date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                    const rowBg = idx % 2 === 0 ? colors.background : colors.card;
                    return (
                      <View key={u.id} style={{ backgroundColor: rowBg, borderRadius: 10, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>
                            📱 {u.phone}
                          </Text>
                          {u.orderId && (
                            <View style={{ backgroundColor: colors.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ color: colors.mutedForeground, fontFamily: F.bold, fontSize: 11 }}>طلب #{u.orderId}</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                            {dateStr} · {timeStr}
                          </Text>
                          {u.discountAmount != null && u.discountAmount > 0 && (
                            <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>
                              -{(u.discountAmount / 100) % 1 === 0 ? u.discountAmount / 100 : (u.discountAmount / 100).toFixed(2)} ر.س
                            </Text>
                          )}
                        </View>
                        {u.orderTotal != null && (
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>
                            إجمالي الطلب: {(u.orderTotal / 100) % 1 === 0 ? u.orderTotal / 100 : (u.orderTotal / 100).toFixed(2)} ر.س
                          </Text>
                        )}
                      </View>
                    );
                  })
                )}
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Date/Time Picker Modal */}
      <Modal
        visible={dcPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDcPickerVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000099" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: colors.border, paddingBottom: 32, paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
            {/* Header */}
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 16 }}>
                {dcPickerStep === "date" ? "تاريخ انتهاء الصلاحية" : "وقت انتهاء الصلاحية"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {/* Step indicator */}
                <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dcPickerStep === "date" ? colors.gold : colors.border }} />
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dcPickerStep === "time" ? colors.gold : colors.border }} />
                </View>
                <TouchableOpacity onPress={() => setDcPickerVisible(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Step 1: Date picker */}
            {dcPickerStep === "date" && (
              <>
                <View style={{ alignItems: "center" }}>
                  <DateTimePicker
                    value={dcPickerDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "calendar"}
                    onChange={(_event, date) => {
                      if (date) {
                        // Preserve the existing time when changing date
                        const combined = new Date(date);
                        combined.setHours(dcPickerDate.getHours(), dcPickerDate.getMinutes(), 0, 0);
                        setDcPickerDate(combined);
                      }
                    }}
                    minimumDate={new Date()}
                    style={{ width: "100%" }}
                    themeVariant="dark"
                  />
                </View>
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "center" }}>
                  {dcPickerDate.toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </Text>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setDcPickerStep("time")}
                    style={{ flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.gold }}
                  >
                    <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>التالي — اختر الوقت</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDcPickerVisible(false)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Step 2: Time picker */}
            {dcPickerStep === "time" && (
              <>
                <View style={{ alignItems: "center" }}>
                  <DateTimePicker
                    value={dcPickerDate}
                    mode="time"
                    display="spinner"
                    onChange={(_event, date) => { if (date) setDcPickerDate(date); }}
                    style={{ width: "100%" }}
                    themeVariant="dark"
                    minuteInterval={5}
                  />
                </View>
                {/* Preview */}
                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "center" }}>
                  {dcPickerDate.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
                  {" — "}
                  {String(dcPickerDate.getHours()).padStart(2, "0")}:{String(dcPickerDate.getMinutes()).padStart(2, "0")}
                </Text>
                {/* Action buttons */}
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      if (dcPickerDate.getTime() <= Date.now()) {
                        Alert.alert("تنبيه", "وقت الانتهاء يجب أن يكون في المستقبل. اختر وقتاً لاحقاً.");
                        return;
                      }
                      const iso = dcPickerDate.toISOString();
                      if (dcPickerContext === "edit" && dcPickerEditId != null) {
                        try {
                          await updateCode(dcPickerEditId, { expiresAt: iso });
                        } catch { Alert.alert("خطأ", "تعذّر تحديث تاريخ الانتهاء"); }
                      } else {
                        setDcExpiresAt(new Date(dcPickerDate));
                      }
                      setDcPickerVisible(false);
                    }}
                    style={{ flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.gold }}
                  >
                    <Text style={{ color: "#1A0A00", fontFamily: F.bold, fontSize: 14 }}>حفظ</Text>
                  </TouchableOpacity>
                  {(dcPickerContext === "edit"
                    ? discountCodes.find((d) => d.id === dcPickerEditId)?.expiresAt
                    : dcExpiresAt) ? (
                    <TouchableOpacity
                      onPress={async () => {
                        if (dcPickerContext === "edit" && dcPickerEditId != null) {
                          try {
                            await updateCode(dcPickerEditId, { expiresAt: null });
                          } catch { Alert.alert("خطأ", "تعذّر إزالة تاريخ الانتهاء"); }
                        } else {
                          setDcExpiresAt(null);
                        }
                        setDcPickerVisible(false);
                      }}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#2A0A08", borderWidth: 1, borderColor: "#E5737355" }}
                    >
                      <Text style={{ color: "#E57373", fontFamily: F.semi, fontSize: 13 }}>إزالة</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setDcPickerStep("date")}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>رجوع</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 20, textAlign: "center" },
  tabRow: { flex: 1, flexDirection: "row", gap: 6, paddingHorizontal: 4 },
  tabBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 16, alignItems: "center" },
  tabBtnText: { fontSize: 14 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13 },
  list: { padding: 12, gap: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  cardLeft: { width: 48, alignItems: "center" },
  cardInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 15, textAlign: "right" },
  itemMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemCat: { fontSize: 12 },
  itemPrice: { fontSize: 16 },
  unavailBadge: { alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
  unavailText: { color: "#E57373", fontSize: 11 },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, alignSelf: "flex-start" },
  stockText: { fontSize: 11 },
  cardActions: { flexDirection: "row", borderTopWidth: 1, gap: 0 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, gap: 6 },
  actionText: { fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  modalTitle: { fontSize: 20, textAlign: "center", marginBottom: 4 },
  fieldLabel: { fontSize: 13, textAlign: "right" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  catPicker: { gap: 8, paddingVertical: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 13 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  modalBtnText: { fontSize: 15 },
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
  pinConfirmBtn: { width: "100%", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 6 },
  pinConfirmText: { fontSize: 18 },
});
