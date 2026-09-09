import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const F = {
  regular: "Cairo_400Regular",
  semi:    "Cairo_600SemiBold",
  bold:    "Cairo_700Bold",
  extra:   "Cairo_800ExtraBold",
};

const SECTIONS = [
  {
    number: "1",
    title: "استخدام التطبيق",
    body: "يُسمح باستخدام التطبيق لطلب الوجبات فقط، ويجب استخدامه بطريقة قانونية وعدم إساءة استخدام الخدمات.",
  },
  {
    number: "2",
    title: "الطلبات والدفع",
    bullets: [
      "جميع الطلبات تخضع للتوفر.",
      "يتم تأكيد الطلب بعد إتمام عملية الدفع أو تأكيد الطلب من قبل المطعم.",
      "الأسعار قابلة للتغيير دون إشعار مسبق.",
    ],
  },
  {
    number: "3",
    title: "سياسة الإلغاء",
    bullets: [
      "يمكن إلغاء الطلب خلال فترة محددة قبل بدء التحضير.",
      "لا يمكن إلغاء الطلب بعد بدء تحضيره.",
    ],
  },
  {
    number: "4",
    title: "التوصيل",
    bullets: [
      "يتم تحديد وقت التوصيل بشكل تقديري.",
      "قد تحدث تأخيرات خارجة عن إرادتنا (ازدحام، ظروف الطقس، إلخ).",
    ],
  },
  {
    number: "5",
    title: "المسؤولية",
    bullets: [
      "نحن نسعى لتقديم أفضل خدمة، ولكن لا نتحمل مسؤولية أي أضرار ناتجة عن سوء استخدام التطبيق.",
      "يتحمل المستخدم مسؤولية إدخال بيانات صحيحة.",
    ],
  },
  {
    number: "6",
    title: "الخصوصية",
    body: "نحترم خصوصيتك، ويتم استخدام بياناتك فقط لمعالجة الطلبات وتحسين الخدمة.",
  },
  {
    number: "7",
    title: "التعديلات",
    body: "يحق لنا تعديل هذه الشروط في أي وقت، وسيتم نشر التحديث داخل التطبيق.",
  },
  {
    number: "8",
    title: "التواصل",
    body: "لأي استفسار، يرجى التواصل معنا عبر وسائل الاتصال داخل التطبيق.",
  },
];

export default function TermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 8, backgroundColor: "#130B04", borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.secondary }]}>
          <Feather name="arrow-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.extra }]}>الشروط والأحكام</Text>
          <Text style={[styles.headerSub, { color: colors.gold, fontFamily: F.bold }]}>منتجات السلة للخضار والفواكه</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 32, gap: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Creator badge */}
        <View style={[styles.creatorBadge, { backgroundColor: "#1A1008", borderColor: colors.gold + "44" }]}>
          <Text style={[styles.creatorText, { color: colors.gold, fontFamily: F.bold }]}>منتجات السلة للخضار والفواكه</Text>
          <Text style={[styles.creatorSub, { color: colors.mutedForeground, fontFamily: F.regular }]}>
            منشأ من قبل{" "}
            <Text style={{ color: "#82B1FF", fontFamily: F.semi }}>@ala738120</Text>
          </Text>
        </View>

        {/* Intro */}
        <View style={[styles.introBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.introText, { color: colors.foreground, fontFamily: F.semi }]}>
            مرحبًا بك في تطبيق "منتجات السلة للخضار والفواكه". باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بالشروط والأحكام التالية:
          </Text>
        </View>

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <View key={sec.number} style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.numberBadge, { backgroundColor: colors.gold + "22", borderColor: colors.gold + "55" }]}>
                <Text style={[styles.numberText, { color: colors.gold, fontFamily: F.bold }]}>{sec.number}</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: colors.gold, fontFamily: F.bold }]}>{sec.title}</Text>
            </View>

            {"body" in sec && sec.body ? (
              <Text style={[styles.bodyText, { color: colors.foreground, fontFamily: F.regular }]}>{sec.body}</Text>
            ) : null}

            {"bullets" in sec && sec.bullets ? (
              <View style={styles.bulletList}>
                {sec.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: colors.gold }]} />
                    <Text style={[styles.bulletText, { color: colors.foreground, fontFamily: F.regular }]}>{b}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        {/* Footer agreement */}
        <View style={[styles.agreementBox, { backgroundColor: "#1A1008", borderColor: colors.gold + "55" }]}>
          <Feather name="check-circle" size={22} color={colors.gold} />
          <Text style={[styles.agreementText, { color: colors.foreground, fontFamily: F.semi }]}>
            باستخدامك التطبيق، فإنك توافق على هذه الشروط والأحكام.
          </Text>
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground, fontFamily: F.regular }]}>
          منتجات السلة للخضار والفواكه • نسخة 1.0{"\n"}منشأ من قبل @ala738120
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 12 },
  creatorBadge: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 4,
    marginBottom: 14,
  },
  creatorText: { fontSize: 22 },
  creatorSub: { fontSize: 13 },
  introBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  introText: { fontSize: 14, textAlign: "right", lineHeight: 24 },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  numberBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 14 },
  sectionTitle: { fontSize: 15, flex: 1, textAlign: "right" },
  bodyText: { fontSize: 14, textAlign: "right", lineHeight: 24 },
  bulletList: { gap: 8 },
  bulletRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    flexShrink: 0,
  },
  bulletText: { flex: 1, fontSize: 14, textAlign: "right", lineHeight: 22 },
  agreementBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
    marginBottom: 20,
  },
  agreementText: { flex: 1, fontSize: 14, textAlign: "right", lineHeight: 22 },
  version: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 20,
  },
});
