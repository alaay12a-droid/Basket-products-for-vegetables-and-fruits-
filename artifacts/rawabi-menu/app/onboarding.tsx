import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useRef, useState, useEffect } from "react";
import { MapPickerModal } from "@/components/MapPickerModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@/context/UserContext";
import { apiPost } from "@/constants/api";
import { useColors } from "@/hooks/useColors";

type Country = { dialCode: string; flag: string; name: string; localLength: number; hint: string; };
const COUNTRIES: Country[] = [
  { dialCode: "966", flag: "🇸🇦", name: "السعودية",  localLength: 9,  hint: "5XXXXXXXX" },
  { dialCode: "967", flag: "🇾🇪", name: "اليمن",     localLength: 9,  hint: "7XXXXXXXX" },
  { dialCode: "974", flag: "🇶🇦", name: "قطر",       localLength: 8,  hint: "3XXXXXXX" },
  { dialCode: "965", flag: "🇰🇼", name: "الكويت",    localLength: 8,  hint: "5XXXXXXX" },
  { dialCode: "970", flag: "🇵🇸", name: "فلسطين",    localLength: 10, hint: "05XXXXXXXX" },
  { dialCode: "963", flag: "🇸🇾", name: "سوريا",     localLength: 10, hint: "09XXXXXXXX" },
  { dialCode: "964", flag: "🇮🇶", name: "العراق",    localLength: 11, hint: "07XXXXXXXXX" },
];


const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

type Step = "name" | "phone" | "location";

async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`,
      { headers: { "User-Agent": "SallatAlKhodar/1.0" } }
    );
    const data = await res.json();
    const a = data?.address ?? {};
    const road = a.road || a.street || a.residential || a.pedestrian
                 || a.footway || a.path || a.service || a.motorway
                 || a.trunk || a.primary || a.secondary || a.tertiary;
    const neighbourhood = a.neighbourhood || a.suburb || a.quarter || a.hamlet;
    const city = a.city || a.town || a.village || a.county || a.state_district;
    const parts = [road, neighbourhood, city].filter(Boolean);
    if (parts.length > 0) return parts.join("، ");
    const displayParts = (data?.display_name ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
    return displayParts.slice(0, 3).join("، ") || "";
  } catch {
    return "";
  }
}

const PENDING_REFERRAL_KEY = "@rawabi_pending_referral";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { saveUser } = useUser();
  const cl = useColors();
  const params = useLocalSearchParams<{ ref?: string }>();

  // Persist referral code from deep link so it survives the onboarding flow
  useEffect(() => {
    const ref = params.ref;
    if (ref) {
      AsyncStorage.setItem(PENDING_REFERRAL_KEY, ref.toUpperCase()).catch(() => {});
    }
  }, [params.ref]);

  const C = {
    bg:      cl.background,
    surface: cl.surface,
    card:    cl.card,
    primary: cl.primary,
    gold:    cl.gold,
    fg:      cl.foreground,
    muted:   cl.mutedForeground,
    border:  cl.border,
    green:   "#1DBF47",
  };
  const isModern = cl.primary === "#0F3D2E";

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("5");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [locLoading, setLocLoading] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [otpStep, setOtpStep] = useState<"idle" | "sent">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpLength, setOtpLength] = useState(4);
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const phoneRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const otpRef = useRef<TextInput>(null);

  const stepIndex = step === "name" ? 0 : step === "phone" ? 1 : 2;

  const steps: { id: Step; icon: string; title: string; subtitle: string }[] = [
    { id: "name",     icon: "user",    title: "ما اسمك؟",          subtitle: "حتى نخاطبك بالاسم في طلبك" },
    { id: "phone",   icon: "phone",   title: "رقم جوالك",         subtitle: "للتواصل معك عند التوصيل" },
    { id: "location", icon: "map-pin", title: "موقعك أو عنوانك",   subtitle: "لنوصل طلبك بسرعة" },
  ];

  const current = steps[stepIndex];

  const goToLocation = () => {
    setStep("location");
    autoDetectLocation();
    setTimeout(() => addressRef.current?.focus(), 300);
  };

  // Build full international number: strip leading zeros, prepend +dialCode
  const buildIntlPhone = () => {
    const local = phone.trim().replace(/\D/g, "");
    const stripped = local.replace(/^0+/, "");
    return `+${country.dialCode}${stripped}`;
  };

  const [devCode, setDevCode] = useState<string | null>(null);

  const handleSendOtp = async () => {
    const local = phone.trim().replace(/\D/g, "");
    if (local.length !== country.localLength) {
      Alert.alert("", `رقم الجوال يجب أن يكون ${country.localLength} أرقام لـ ${country.name}`);
      return;
    }
    setOtpLoading(true);
    try {
      const intlPhone = buildIntlPhone();
      const r = await apiPost<{ ok: boolean; skipped?: boolean; devCode?: string; otpLength?: number }>("/sms/send-otp", { phone: intlPhone, onboarding: true });
      if (r.skipped) { goToLocation(); return; }
      setOtpStep("sent");
      setOtpCode("");
      setOtpLength(r.otpLength ?? 4);
      // Dev mode: no API key configured → code returned directly
      if (r.devCode) {
        setDevCode(r.devCode);
        setOtpCode(r.devCode);
      } else {
        setDevCode(null);
      }
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال رمز التحقق، تأكد من الرقم وحاول مرة أخرى");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length < otpLength) return;
    setOtpLoading(true);
    try {
      const intlPhone = buildIntlPhone();
      await apiPost("/sms/verify-otp", { phone: intlPhone, code: otpCode });
      // Mark phone as permanently verified so checkout never asks again
      apiPost("/sms/mark-verified", { phone: intlPhone }).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goToLocation();
    } catch (e: any) {
      Alert.alert("خطأ", e?.message || "الرمز غير صحيح أو منتهي الصلاحية");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleNext = () => {
    if (step === "name") {
      if (!name.trim()) { Alert.alert("", "يرجى إدخال اسمك"); return; }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep("phone");
      setTimeout(() => phoneRef.current?.focus(), 300);
    } else if (step === "phone") {
      if (otpStep === "sent") { handleVerifyOtp(); return; }
      const local = phone.trim().replace(/\D/g, "");
      if (local.length !== country.localLength) {
        Alert.alert("", `رقم الجوال يجب أن يكون ${country.localLength} أرقام لـ ${country.name}`);
        return;
      }
      handleSendOtp();
    } else {
      if (!address.trim()) { Alert.alert("", "يرجى إدخال عنوانك أو تحديد موقعك"); return; }
      handleSave();
    }
  };

  const autoDetectLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      const addr = await reverseGeocodeArabic(loc.coords.latitude, loc.coords.longitude);
      setAddress(addr || `${loc.coords.latitude.toFixed(5)}، ${loc.coords.longitude.toFixed(5)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // silent — user can enter manually
    }
    setLocLoading(false);
  };

  const handleDetectLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("تنبيه", "لم يتم منح صلاحية الموقع. يمكنك كتابة عنوانك يدوياً.");
        setLocLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      const addr = await reverseGeocodeArabic(loc.coords.latitude, loc.coords.longitude);
      setAddress(addr || `${loc.coords.latitude.toFixed(5)}، ${loc.coords.longitude.toFixed(5)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("خطأ", "تعذر تحديد موقعك. يمكنك كتابة عنوانك يدوياً.");
    }
    setLocLoading(false);
  };

  const handleSave = async () => {
    const trimmedPhone = phone.trim();
    const trimmedName = name.trim();
    await saveUser({ name: trimmedName, phone: trimmedPhone, address: address.trim(), lat, lng });

    // Register pending referral (fire and forget — don't block onboarding)
    AsyncStorage.getItem(PENDING_REFERRAL_KEY).then((refCode) => {
      if (refCode) {
        apiPost("/referrals/register", {
          referralCode: refCode,
          referredPhone: trimmedPhone,
          referredName: trimmedName,
        }).catch(() => {});
        AsyncStorage.removeItem(PENDING_REFERRAL_KEY).catch(() => {});
      }
    }).catch(() => {});

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Text style={[styles.brandTitle, { color: C.primary }]}>منتجات السلة للخضار والفواكه</Text>
          <Text style={[styles.brandSub, { color: C.gold }]}>خضار طازجة كل يوم</Text>
        </View>

        <View style={styles.dots}>
          {steps.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.dot,
                { backgroundColor: C.border },
                i === stepIndex && [styles.dotActive, { backgroundColor: C.primary }],
                i < stepIndex && { backgroundColor: C.gold },
              ]}
            />
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border, borderRadius: isModern ? 24 : 20 }]}>
          <View style={[styles.cardAccent, { backgroundColor: C.gold }]} />

          <Image
            source={require("@/assets/images/sallat-alkhodar-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={[styles.stepTitle, { color: C.fg }]}>{current.title}</Text>
          <Text style={[styles.stepSub, { color: C.muted }]}>{current.subtitle}</Text>

          {step === "name" && (
            <TextInput
              style={[styles.input, { backgroundColor: C.surface, borderColor: C.border, color: C.fg, borderRadius: isModern ? 16 : 12 }]}
              placeholder="اكتب اسمك هنا"
              placeholderTextColor={C.muted}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={handleNext}
              textAlign="right"
            />
          )}

          {step === "phone" && otpStep === "idle" && (
            <>
              {/* Country + Phone row */}
              <View style={{ flexDirection: "row-reverse", gap: 8, alignItems: "center" }}>
                {/* Country picker button */}
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(true)}
                  style={{
                    flexDirection: "row-reverse", alignItems: "center", gap: 4,
                    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
                    borderColor: C.border, paddingHorizontal: 10, paddingVertical: 14,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{country.flag}</Text>
                  <Text style={{ fontFamily: F.regular, color: C.muted, fontSize: 12 }}>+{country.dialCode}</Text>
                  <Feather name="chevron-down" size={12} color={C.muted} />
                </TouchableOpacity>

                {/* Phone input */}
                <TextInput
                  ref={phoneRef}
                  style={[styles.input, {
                    flex: 1, marginBottom: 0,
                    backgroundColor: C.surface, color: C.fg, borderRadius: isModern ? 16 : 12,
                    borderColor: phone.replace(/\D/g,"").length === country.localLength ? C.green : phone.length > 0 ? C.border : C.border,
                  }]}
                  placeholder={country.hint}
                  placeholderTextColor={C.muted}
                  value={phone}
                  onChangeText={(t) => {
                    const digits = t.replace(/\D/g, "");
                    if (digits.length <= country.localLength) setPhone(digits);
                  }}
                  keyboardType="phone-pad"
                  maxLength={country.localLength}
                  returnKeyType="next"
                  onSubmitEditing={handleNext}
                  textAlign="right"
                />
              </View>

              {phone.length > 0 && (
                <Text style={{
                  color: phone.replace(/\D/g,"").length === country.localLength ? C.green : "#EF4444",
                  fontFamily: F.regular, fontSize: 12, textAlign: "right", marginTop: -4,
                }}>
                  {phone.replace(/\D/g,"").length === country.localLength
                    ? `✓ ${country.name} — ${buildIntlPhone()}`
                    : `${phone.replace(/\D/g,"").length}/${country.localLength} أرقام`}
                </Text>
              )}
            </>
          )}

          {step === "phone" && otpStep === "sent" && (
            <>
              {/* Phone badge */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8,
                backgroundColor: C.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 18 }}>{country.flag}</Text>
                <Text style={{ fontFamily: F.regular, color: C.muted, fontSize: 13 }}>{buildIntlPhone()}</Text>
                <TouchableOpacity onPress={() => { setOtpStep("idle"); setOtpCode(""); }} style={{ marginRight: "auto" }}>
                  <Text style={{ fontFamily: F.regular, color: C.primary, fontSize: 12 }}>تعديل</Text>
                </TouchableOpacity>
              </View>

              {devCode ? (
                <View style={{ backgroundColor: "#1a3a1a", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#2d6a2d" }}>
                  <Text style={{ fontFamily: F.bold, color: "#4ade80", fontSize: 12, textAlign: "center" }}>
                    وضع التطوير — الرمز: {devCode}
                  </Text>
                  <Text style={{ fontFamily: F.regular, color: "#86efac", fontSize: 11, textAlign: "center", marginTop: 2 }}>
                    لا يوجد API key — الرمز ظهر هنا للاختبار فقط
                  </Text>
                </View>
              ) : (
                <Text style={{ fontFamily: F.regular, color: C.muted, fontSize: 13, textAlign: "right", lineHeight: 20 }}>
                  {`أُرسل رمز مكوّن من ${otpLength} أرقام إلى هاتفك`}
                </Text>
              )}

              {/* OTP boxes */}
              <View style={{ flexDirection: "row", justifyContent: "center", gap: otpLength === 6 ? 8 : 12 }}>
                {Array.from({ length: otpLength }, (_, i) => (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={1}
                    onPress={() => otpRef.current?.focus()}
                    style={{
                      width: otpLength === 6 ? 44 : 54, height: 60, borderRadius: 12, borderWidth: 2,
                      borderColor: otpCode[i] ? C.gold : C.border,
                      backgroundColor: C.surface,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: F.bold, fontSize: otpLength === 6 ? 20 : 24, color: C.gold }}>
                      {otpCode[i] ?? ""}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* hidden input capturing digits — opacity 0.01 (not 0) so iOS allows focus */}
                <TextInput
                  ref={otpRef}
                  value={otpCode}
                  onChangeText={(t) => {
                    const d = t.replace(/\D/g, "");
                    if (d.length <= otpLength) setOtpCode(d);
                  }}
                  keyboardType="number-pad"
                  maxLength={otpLength}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  caretHidden
                  style={{ position: "absolute", opacity: 0.01, width: "100%", height: "100%" }}
                  onSubmitEditing={handleVerifyOtp}
                />
              </View>
              <TouchableOpacity onPress={() => { setOtpStep("idle"); setOtpCode(""); }} style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: F.regular, color: C.muted, fontSize: 12 }}>
                  ما وصل الرمز؟ <Text style={{ color: C.gold }}>إعادة الإرسال</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={goToLocation} style={{ alignItems: "center", paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.regular, color: C.muted, fontSize: 12 }}>
                  تخطي التحقق ←
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "location" && (
            <View style={styles.locationBlock}>
              {/* Auto + Map picker buttons */}
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.gpsBtn, { flex: 1, borderColor: C.gold, backgroundColor: C.gold + "18" }]}
                  onPress={handleDetectLocation}
                  activeOpacity={0.75}
                  disabled={locLoading}
                >
                  {locLoading ? (
                    <ActivityIndicator color={C.gold} size="small" />
                  ) : (
                    <Feather name="crosshair" size={16} color={C.gold} />
                  )}
                  <Text style={[styles.gpsBtnText, { color: C.gold, fontSize: 13 }]}>
                    {locLoading ? "جاري..." : "تلقائي"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.gpsBtn, { flex: 1, borderColor: C.primary, backgroundColor: C.primary + "18" }]}
                  onPress={() => setMapPickerVisible(true)}
                  activeOpacity={0.75}
                >
                  <Feather name="map-pin" size={16} color={C.primary} />
                  <Text style={[styles.gpsBtnText, { color: C.primary, fontSize: 13 }]}>
                    خريطة دقيقة
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.orRow}>
                <View style={[styles.orLine, { backgroundColor: C.border }]} />
                <Text style={[styles.orText, { color: C.muted }]}>أو اكتب</Text>
                <View style={[styles.orLine, { backgroundColor: C.border }]} />
              </View>

              <TextInput
                ref={addressRef}
                style={[styles.input, styles.addressInput, { backgroundColor: C.surface, borderColor: C.border, color: C.fg, borderRadius: isModern ? 16 : 12 }]}
                placeholder="اكتب اسم الحي أو الشارع..."
                placeholderTextColor={C.muted}
                value={address}
                onChangeText={setAddress}
                multiline
                textAlignVertical="top"
                textAlign="right"
                returnKeyType="done"
              />

              {lat && lng && (
                <TouchableOpacity
                  onPress={() => setMapPickerVisible(true)}
                  style={[
                    styles.locBadge,
                    { backgroundColor: C.green + "22", borderColor: C.green + "44", alignSelf: "stretch", justifyContent: "space-between" },
                  ]}
                >
                  <Feather name="edit-2" size={12} color={C.green} />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.locBadgeText, { color: C.green }]}>
                      تم تحديد الموقع بدقة ✓
                    </Text>
                    <Feather name="check-circle" size={14} color={C.green} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.nextBtn, {
              backgroundColor:
                otpStep === "sent" && otpCode.length < otpLength ? C.border :
                C.primary,
              opacity: otpLoading ? 0.6 : 1,
            }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={otpLoading || (otpStep === "sent" && otpCode.length < otpLength)}
          >
            {otpLoading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <>
                  <Text style={styles.nextBtnText}>
                    {step === "location"
                      ? "ابدأ الطلب 🍗"
                      : otpStep === "sent"
                        ? "تحقق من الرمز"
                        : "التالي"}
                  </Text>
                  {step !== "location" && <Feather name="arrow-left" size={18} color="#FFF" />}
                </>
            }
          </TouchableOpacity>
        </View>

        {step === "phone" && otpStep === "idle" && (
          <TouchableOpacity onPress={goToLocation} style={{ alignItems: "center", paddingVertical: 4 }}>
            <Text style={[styles.skipText, { color: C.muted }]}>تخطي التحقق</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* ── Country Picker Modal ── */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000088" }}
          activeOpacity={1}
          onPress={() => setShowCountryPicker(false)}
        />
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingBottom: 40, paddingTop: 16,
        }}>
          <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
          <Text style={{ fontFamily: F.bold, color: C.gold, fontSize: 16, textAlign: "center", marginBottom: 12 }}>
            اختر الدولة
          </Text>
          <FlatList
            data={COUNTRIES}
            keyExtractor={(c) => c.dialCode}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setCountry(item);
                  setPhone(item.dialCode === "966" ? "5" : "");
                  setShowCountryPicker(false);
                  setTimeout(() => phoneRef.current?.focus(), 200);
                }}
                style={{
                  flexDirection: "row-reverse", alignItems: "center", gap: 12,
                  paddingHorizontal: 24, paddingVertical: 14,
                  backgroundColor: item.dialCode === country.dialCode ? C.gold + "18" : "transparent",
                  borderBottomWidth: 1, borderBottomColor: C.border + "44",
                }}
              >
                <Text style={{ fontSize: 28 }}>{item.flag}</Text>
                <Text style={{ fontFamily: F.semi, color: C.fg, fontSize: 15, flex: 1 }}>{item.name}</Text>
                <Text style={{ fontFamily: F.regular, color: C.muted, fontSize: 13 }}>+{item.dialCode}</Text>
                {item.dialCode === country.dialCode && (
                  <Feather name="check" size={16} color={C.gold} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* ── Map Picker Modal ── */}
      <MapPickerModal
        visible={mapPickerVisible}
        initialLat={lat}
        initialLng={lng}
        onConfirm={(pickedLat, pickedLng, _url) => {
          setLat(pickedLat);
          setLng(pickedLng);
          setAddress(`${pickedLat.toFixed(5)}، ${pickedLng.toFixed(5)}`);
          setMapPickerVisible(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onClose={() => setMapPickerVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: "center", paddingHorizontal: 24, gap: 24 },
  brand: { alignItems: "center", gap: 4 },
  brandTitle: { fontSize: 28, fontFamily: "Cairo_800ExtraBold", color: "#C8171A", letterSpacing: 0.5 },
  brandSub: { fontSize: 15, fontFamily: "Cairo_600SemiBold", color: "#E8920C" },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2E1F0E" },
  dotActive: { backgroundColor: "#C8171A", width: 24 },
  dotDone: { backgroundColor: "#E8920C" },
  card: {
    width: "100%",
    backgroundColor: "#1A1008",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 16,
  },
  cardAccent: { width: "100%", height: 4, marginBottom: 8 },
  logo: { width: 160, height: 100, marginBottom: 4 },
  stepTitle: { fontSize: 22, fontFamily: "Cairo_800ExtraBold", color: "#F5ECD7", textAlign: "center" },
  stepSub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: "#8A7560", textAlign: "center", marginTop: -8 },
  input: {
    width: "100%",
    backgroundColor: "#231508",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E1F0E",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    fontFamily: "Cairo_700Bold",
    color: "#F5ECD7",
    textAlign: "right",
  },
  locationBlock: { width: "100%", gap: 12 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  gpsBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 13, fontFamily: "Cairo_400Regular" },
  addressInput: { minHeight: 80, paddingTop: 14 },
  locBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  locBadgeText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  nextBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 4,
  },
  nextBtnText: { fontSize: 17, fontFamily: "Cairo_800ExtraBold", color: "#FFFFFF" },
  skipText: { fontSize: 13, fontFamily: "Cairo_400Regular", textDecorationLine: "underline", marginTop: -8 },
});
