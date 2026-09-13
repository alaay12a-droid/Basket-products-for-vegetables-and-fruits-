import React, { useRef, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  PanResponder,
  Alert,
  LayoutChangeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiPut } from "@/constants/api";
import {
  useAppConfig,
  DEFAULT_CONFIG,
  AppConfig,
  ACCENT_COLORS,
  BG_THEME_META,
  BG_THEMES,
  BgThemeKey,
} from "@/context/AppConfigContext";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

/* ──────────────────────────────────────────────
   Custom Slider
────────────────────────────────────────────── */
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onValueChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, unit = "", onValueChange }: SliderProps) {
  const colors = useColors();
  const trackWidth = useRef(0);
  const currentValue = useRef(value);
  const [display, setDisplay] = useState(value);

  const clamp = useCallback(
    (x: number) => Math.min(max, Math.max(min, Math.round(x / step) * step)),
    [min, max, step]
  );
  const fromPx = useCallback(
    (px: number) => clamp(min + (px / trackWidth.current) * (max - min)),
    [min, max, clamp]
  );

  const pct = ((display - min) / (max - min)) * 100;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        const v = fromPx(x);
        currentValue.current = v;
        setDisplay(v);
        onValueChange(v);
      },
      onPanResponderMove: (evt) => {
        const x = Math.max(0, Math.min(evt.nativeEvent.locationX, trackWidth.current));
        const v = fromPx(x);
        if (v !== currentValue.current) {
          currentValue.current = v;
          setDisplay(v);
          onValueChange(v);
        }
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  return (
    <View style={slStyles.row}>
      <View style={slStyles.labelRow}>
        <Text style={[slStyles.value, { color: colors.gold, fontFamily: F.bold }]}>
          {display}{unit}
        </Text>
        <Text style={[slStyles.label, { color: colors.foreground, fontFamily: F.semi }]}>
          {label}
        </Text>
      </View>
      <View
        style={[slStyles.track, { backgroundColor: colors.secondary }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        <View style={[slStyles.fill, { width: `${pct}%`, backgroundColor: colors.gold }]} />
        <View style={[slStyles.thumb, { left: `${pct}%`, backgroundColor: colors.gold, borderColor: colors.card }]} />
      </View>
      <View style={slStyles.minMax}>
        <Text style={[slStyles.bound, { color: colors.mutedForeground, fontFamily: F.regular }]}>{max}{unit}</Text>
        <Text style={[slStyles.bound, { color: colors.mutedForeground, fontFamily: F.regular }]}>{min}{unit}</Text>
      </View>
    </View>
  );
}

const slStyles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 10 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 14 },
  value: { fontSize: 14 },
  track: { height: 36, borderRadius: 18, justifyContent: "center", position: "relative" },
  fill: { height: "100%", borderRadius: 18, position: "absolute", left: 0, top: 0 },
  thumb: {
    position: "absolute",
    width: 28, height: 28, borderRadius: 14, borderWidth: 3,
    marginLeft: -14, top: 4,
    elevation: 4,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  minMax: { flexDirection: "row", justifyContent: "space-between" },
  bound: { fontSize: 11 },
});

/* ──────────────────────────────────────────────
   Section header
────────────────────────────────────────────── */
function SectionHeader({ title, icon }: { title: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 15 }}>{title}</Text>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
    </View>
  );
}

/* ──────────────────────────────────────────────
   Section card
────────────────────────────────────────────── */
function SectionCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
});

function Div() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />;
}

/* ──────────────────────────────────────────────
   Live Preview Card
────────────────────────────────────────────── */
function PreviewCard({ config }: { config: AppConfig }) {
  const colors = useColors();
  return (
    <View
      style={{
        marginHorizontal: 16,
        borderRadius: config.borderRadius,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: config.cardPadding,
        gap: config.sectionGap / 2,
      }}
    >
      <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: config.captionSize, textAlign: "right" }}>
        معاينة مباشرة
      </Text>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: config.imageSize * 0.7,
            height: config.imageSize * 0.7,
            borderRadius: config.borderRadius - 4,
            backgroundColor: colors.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 24 }}>🍗</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: config.bodySize, textAlign: "right" }}>
            مندي دجاج كامل
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: config.captionSize, textAlign: "right" }}>
            وجبة للأسرة • مع الرز
          </Text>
          <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: config.priceSize }}>
            44 ر.س
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={{
          backgroundColor: colors.gold,
          borderRadius: config.borderRadius - 4,
          paddingVertical: 10,
          alignItems: "center",
        }}
        activeOpacity={0.8}
      >
        <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: config.bodySize }}>
          أضف للسلة
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ──────────────────────────────────────────────
   Color Swatch
────────────────────────────────────────────── */
function ColorSwatch({
  color,
  label,
  selected,
  onPress,
}: {
  color: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity style={swatchStyles.item} onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          swatchStyles.circle,
          { backgroundColor: color },
          selected && { borderWidth: 3, borderColor: colors.foreground },
        ]}
      >
        {selected && <Feather name="check" size={16} color="#fff" />}
      </View>
      <Text style={[swatchStyles.label, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const swatchStyles = StyleSheet.create({
  item: { alignItems: "center", gap: 6, minWidth: 52 },
  circle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    elevation: 3,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: { fontSize: 10, textAlign: "center" },
});

/* ──────────────────────────────────────────────
   Background theme swatch
────────────────────────────────────────────── */
function BgSwatch({
  themeKey,
  accent,
  selected,
  onPress,
}: {
  themeKey: BgThemeKey;
  accent: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const meta = BG_THEME_META[themeKey];
  const theme = BG_THEMES[themeKey];
  const isLightTheme = theme.isLight ?? false;

  return (
    <TouchableOpacity style={bgSwatchStyles.item} onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          bgSwatchStyles.preview,
          { backgroundColor: theme.background },
          selected
            ? { borderWidth: 3, borderColor: isLightTheme ? "#333" : colors.foreground }
            : { borderWidth: 1, borderColor: theme.border },
        ]}
      >
        <View style={[bgSwatchStyles.previewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: accent, marginBottom: 3, alignSelf: "flex-end" }} />
          <View style={{ width: "100%", height: 3, borderRadius: 1, backgroundColor: theme.secondary }} />
          <View style={{ width: "70%", height: 3, borderRadius: 1, backgroundColor: theme.secondary, alignSelf: "flex-end" }} />
        </View>
        {selected && (
          <View style={[bgSwatchStyles.checkWrap, { backgroundColor: accent }]}>
            <Feather name="check" size={10} color={isLightTheme ? "#333" : "#fff"} />
          </View>
        )}
      </View>
      <Text style={[bgSwatchStyles.label, { color: colors.mutedForeground, fontFamily: F.regular }]}>
        {meta.label}
      </Text>
    </TouchableOpacity>
  );
}

const bgSwatchStyles = StyleSheet.create({
  item: { alignItems: "center", gap: 6 },
  preview: {
    width: 64, height: 48, borderRadius: 10, borderWidth: 1,
    padding: 6, justifyContent: "center",
    borderColor: "transparent",
    position: "relative",
  },
  previewCard: {
    borderRadius: 5, borderWidth: 1,
    padding: 5, gap: 3,
  },
  checkWrap: {
    position: "absolute", top: 3, left: 3,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  label: { fontSize: 10, textAlign: "center" },
});

/* ──────────────────────────────────────────────
   Main Settings Screen
────────────────────────────────────────────── */
export default function AppSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, update, reset } = useAppConfig();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const confirmReset = () => {
    Alert.alert(
      "إعادة الضبط",
      "هل تريد إعادة جميع الإعدادات إلى القيم الافتراضية؟",
      [
        { text: "إلغاء", style: "cancel" },
        { text: "إعادة ضبط", style: "destructive", onPress: () => reset() },
      ]
    );
  };

  const selectMenuTemplate = async (menuTemplate: "classic" | "modern") => {
    if (config.menuTemplate === menuTemplate) return;
    try {
      await apiPut("/settings/menu-template", { menuTemplate });
      await update({ menuTemplate });
    } catch {
      Alert.alert("تعذّر تغيير الواجهة", "تحقق من الاتصال وحاول مرة أخرى.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isLight ? "dark-content" : "light-content"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.card, paddingTop: topInset + 10, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={confirmReset} style={styles.headerSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="refresh-ccw" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.bold }]}>
          إعدادات التطبيق
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 40, paddingTop: 16, gap: 16 }}
      >
        {/* Live Preview */}
        <PreviewCard config={config} />

        {/* ── Menu Template ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="شكل واجهة التطبيق" icon="▦" />
        </View>
        <SectionCard>
          <Text style={[styles.colorHint, { color: colors.mutedForeground, fontFamily: F.regular }]}>
            اختر الشكل البصري الذي يظهر للعملاء في كامل التطبيق
          </Text>
          <View style={styles.templateGrid}>
            {([
              {
                key: "modern" as const,
                title: "حديث",
                subtitle: "واجهة الخضار الرسمية",
                icon: "grid" as const,
              },
              {
                key: "classic" as const,
                title: "كلاسيكي",
                subtitle: "التصميم القديم",
                icon: "list" as const,
              },
            ]).map((option) => {
              const selected = config.menuTemplate === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => selectMenuTemplate(option.key)}
                  activeOpacity={0.82}
                  style={[
                    styles.templateOption,
                    {
                      backgroundColor: selected ? colors.secondary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.templateIcon,
                      { backgroundColor: selected ? colors.primary : colors.card },
                    ]}
                  >
                    <Feather
                      name={option.icon}
                      size={21}
                      color={selected ? "#FFFFFF" : colors.mutedForeground}
                    />
                  </View>
                  <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>
                    {option.title}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                    {option.subtitle}
                  </Text>
                  {selected && (
                    <View style={[styles.templateCheck, { backgroundColor: colors.primary }]}>
                      <Feather name="check" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </SectionCard>

        {/* ── Colors: Accent ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="لون التطبيق الرئيسي" icon="🎨" />
        </View>
        <SectionCard>
          <Text style={[styles.colorHint, { color: colors.mutedForeground, fontFamily: F.regular }]}>
            اضغط على اللون لتطبيقه فوراً
          </Text>
          <View style={styles.colorGrid}>
            {ACCENT_COLORS.map((c) => (
              <ColorSwatch
                key={c.value}
                color={c.value}
                label={c.label}
                selected={config.accentColor === c.value}
                onPress={() => update({ accentColor: c.value })}
              />
            ))}
          </View>
        </SectionCard>

        {/* ── Colors: Background Theme ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="سمة الخلفية" icon="🌑" />
        </View>
        <SectionCard>
          <Text style={[styles.colorHint, { color: colors.mutedForeground, fontFamily: F.regular }]}>
            اختر لون خلفية التطبيق
          </Text>
          <View style={styles.bgGrid}>
            {(Object.keys(BG_THEMES) as BgThemeKey[]).map((key) => (
              <BgSwatch
                key={key}
                themeKey={key}
                accent={config.accentColor}
                selected={config.bgTheme === key}
                onPress={() => update({ bgTheme: key })}
              />
            ))}
          </View>
        </SectionCard>

        {/* ── Spacing ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="المسافات" icon="📐" />
        </View>
        <SectionCard>
          <SliderRow label="حشو الكرت" value={config.cardPadding} min={8} max={28} step={1} unit="px" onValueChange={(v) => update({ cardPadding: v })} />
          <Div />
          <SliderRow label="مسافة بين الأقسام" value={config.sectionGap} min={4} max={28} step={1} unit="px" onValueChange={(v) => update({ sectionGap: v })} />
          <Div />
          <SliderRow label="حشو الصف الرأسي" value={config.itemPaddingV} min={6} max={26} step={1} unit="px" onValueChange={(v) => update({ itemPaddingV: v })} />
          <Div />
          <SliderRow label="الهامش الأفقي" value={config.horizontalMargin} min={8} max={28} step={1} unit="px" onValueChange={(v) => update({ horizontalMargin: v })} />
          <Div />
          <SliderRow label="انحناء الزوايا" value={config.borderRadius} min={4} max={28} step={1} unit="px" onValueChange={(v) => update({ borderRadius: v })} />
          <Div />
          <SliderRow label="حجم الصورة" value={config.imageSize} min={50} max={140} step={5} unit="px" onValueChange={(v) => update({ imageSize: v })} />
        </SectionCard>

        {/* ── Font Sizes ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="الخطوط" icon="✍️" />
        </View>
        <SectionCard>
          <SliderRow label="حجم العنوان" value={config.titleSize} min={14} max={28} step={1} unit="pt" onValueChange={(v) => update({ titleSize: v })} />
          <Div />
          <SliderRow label="النص الأساسي" value={config.bodySize} min={11} max={20} step={1} unit="pt" onValueChange={(v) => update({ bodySize: v })} />
          <Div />
          <SliderRow label="النص الثانوي" value={config.captionSize} min={9} max={16} step={1} unit="pt" onValueChange={(v) => update({ captionSize: v })} />
          <Div />
          <SliderRow label="حجم السعر" value={config.priceSize} min={12} max={26} step={1} unit="pt" onValueChange={(v) => update({ priceSize: v })} />
        </SectionCard>

        {/* ── Tab Bar ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="الشريط السفلي" icon="📱" />
        </View>
        <SectionCard>
          <SliderRow label="ارتفاع الشريط" value={config.tabHeight} min={50} max={100} step={2} unit="px" onValueChange={(v) => update({ tabHeight: v })} />
          <Div />
          <SliderRow label="الحشو السفلي" value={config.tabPaddingBottom} min={0} max={28} step={1} unit="px" onValueChange={(v) => update({ tabPaddingBottom: v })} />
          <Div />
          <SliderRow label="حجم خط التبويب" value={config.tabFontSize} min={9} max={16} step={1} unit="pt" onValueChange={(v) => update({ tabFontSize: v })} />
        </SectionCard>

        {/* ── Minimum Order ── */}
        <View style={{ gap: 8, marginHorizontal: 16 }}>
          <SectionHeader title="إعدادات الطلبات" icon="🛒" />
        </View>
        <SectionCard>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: "right" }}>
              الحد الأدنى للطلب
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
              {config.minOrderAmount === 0 ? "لا يوجد حد أدنى" : `${config.minOrderAmount} ر.س`}
            </Text>
          </View>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => update({ minOrderAmount: Math.max(0, (config.minOrderAmount ?? 0) - 5) })}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 20 }}>−</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 10 }}>
              <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 22 }}>
                {config.minOrderAmount ?? 0}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>ريال سعودي</Text>
            </View>

            <TouchableOpacity
              onPress={() => update({ minOrderAmount: (config.minOrderAmount ?? 0) + 5 })}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary }}
            >
              <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 20 }}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row-reverse", justifyContent: "center", gap: 8, marginTop: 8 }}>
            {[0, 10, 15, 20, 25, 30].map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => update({ minOrderAmount: v })}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: config.minOrderAmount === v ? colors.primary : colors.border, backgroundColor: config.minOrderAmount === v ? colors.primary : colors.surface }}
              >
                <Text style={{ color: config.minOrderAmount === v ? "#fff" : colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                  {v === 0 ? "بدون" : `${v}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        {/* Reset */}
        <TouchableOpacity
          onPress={confirmReset}
          style={[styles.resetBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Feather name="refresh-ccw" size={18} color={colors.destructive} />
          <Text style={[styles.resetText, { color: colors.destructive, fontFamily: F.bold }]}>
            إعادة ضبط جميع الإعدادات
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, justifyContent: "space-between",
  },
  headerSide: { width: 36, alignItems: "center" },
  headerTitle: { fontSize: 18, textAlign: "center" },
  colorHint: { fontSize: 12, textAlign: "right", marginBottom: 10 },
  templateGrid: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  templateOption: {
    flex: 1,
    minHeight: 128,
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    position: "relative",
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  templateCheck: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  colorGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "flex-start",
  },
  bgGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "flex-start",
  },
  resetBtn: {
    marginHorizontal: 16,
    borderRadius: 14, borderWidth: 1,
    padding: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  resetText: { fontSize: 15 },
});
