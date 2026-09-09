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
import { useLanguage } from "@/context/LanguageContext";

const F = {
  regular: "Cairo_400Regular",
  semi:    "Cairo_600SemiBold",
  bold:    "Cairo_700Bold",
  extra:   "Cairo_800ExtraBold",
};

interface Section {
  number: string;
  title: { ar: string; en: string };
  body?: { ar: string; en: string };
  bullets?: { ar: string; en: string }[];
  table?: { headers: { ar: string; en: string }[]; rows: { ar: string; en: string }[][] };
  rights?: { title: { ar: string; en: string }; desc: { ar: string; en: string } }[];
  contact?: boolean;
}

const CONTACT_EMAIL = "alaay12a@gmail.com";
const CONTACT_WHATSAPP_AR = "واتساب: 0530 707 042";
const CONTACT_WHATSAPP_EN = "WhatsApp: +966 53 070 7042";

const SECTIONS: Section[] = [
  {
    number: "1",
    title: { ar: "من نحن", en: "Who We Are" },
    body: {
      ar: "نحن \"منتجات السلة للخضار والفواكه\"، نقدم خدمات طلب المنتجات والتوصيل عبر تطبيقنا وموقعنا الإلكتروني في المملكة العربية السعودية. نحن الجهة المسؤولة عن معالجة بياناتك الشخصية (\"مراقب البيانات\").",
      en: "منتجات السلة للخضار والفواكه provides product ordering and delivery services through our app and website within Saudi Arabia. We are the data controller responsible for processing your personal data.",
    },
    contact: true,
  },
  {
    number: "2",
    title: { ar: "البيانات التي نقوم بجمعها", en: "Data We Collect" },
    body: {
      ar: "قد نقوم بجمع ومعالجة الفئات التالية من بياناتك:",
      en: "We may collect and process the following categories of data:",
    },
    bullets: [
      {
        ar: "بيانات الحساب: الاسم، رقم الهاتف، البريد الإلكتروني، تاريخ الميلاد، الجنس، كلمة المرور، رمز التحقق (OTP)، معرف المستخدم.",
        en: "Account data: name, phone number, email address, date of birth, gender, password, one-time verification code (OTP), user ID.",
      },
      {
        ar: "بيانات الطلب: نوع الطلب، رقم الطلب، الفرع، محتوى الطلب، الأصناف والكميات، الإضافات، الملاحظات، المبلغ الإجمالي.",
        en: "Order data: order type, order number, branch, order contents, item names and quantities, add-ons, notes, total amount.",
      },
      {
        ar: "بيانات التوصيل: العنوان، الحي، المدينة، الرمز البريدي، الإحداثيات الجغرافية، معلومات المركبة عند التوصيل للسيارة.",
        en: "Delivery data: address, neighborhood, city, postal code, geolocation coordinates, vehicle details for car delivery.",
      },
      {
        ar: "معلومات الجهاز: نوع الجهاز، نظام التشغيل، عنوان IP، معرف الجهاز، معلومات الجلسة.",
        en: "Device information: device type, operating system, IP address, device identifier, session information.",
      },
      {
        ar: "بيانات التفاعل: العناصر المضافة للسلة أو المفضلة، سجل التصفح داخل التطبيق، ملفات تعريف الارتباط (Cookies).",
        en: "Interaction data: items added to cart or favorites, in-app browsing activity, cookies.",
      },
      {
        ar: "بيانات الدفع: طريقة الدفع، مبلغ الدفع، تفاصيل الاسترداد، إيصالات الدفع (لا نقوم بتخزين بيانات البطاقة الكاملة؛ تتم معالجتها عبر بوابة دفع معتمدة).",
        en: "Payment data: payment method, amount paid, refund details, payment receipts (full card details are not stored by us; payments are processed through a licensed payment gateway).",
      },
      {
        ar: "بيانات دعم العملاء: محتوى استفساراتك ومراسلاتك مع فريق الدعم.",
        en: "Customer support data: content of your inquiries and correspondence with our support team.",
      },
    ],
  },
  {
    number: "3",
    title: { ar: "أغراض معالجة البيانات والأساس القانوني", en: "Purposes of Processing and Legal Basis" },
    table: {
      headers: [
        { ar: "الغرض", en: "Purpose" },
        { ar: "البيانات المستخدمة", en: "Data Used" },
        { ar: "الأساس القانوني", en: "Legal Basis" },
      ],
      rows: [
        [{ ar: "إنشاء الحساب وإدارته", en: "Account creation and management" }, { ar: "بيانات الحساب", en: "Account data" }, { ar: "المادة 6(4)", en: "Article 6(4)" }],
        [{ ar: "تنفيذ وتوصيل الطلبات", en: "Order fulfillment and delivery" }, { ar: "بيانات الطلب والتوصيل", en: "Order and delivery data" }, { ar: "المادة 6(2)", en: "Article 6(2)" }],
        [{ ar: "معالجة المدفوعات والفواتير", en: "Payment processing and invoicing" }, { ar: "بيانات الدفع", en: "Payment data" }, { ar: "المادة 6(2)", en: "Article 6(2)" }],
        [{ ar: "دعم العملاء", en: "Customer support" }, { ar: "بيانات الحساب والطلب والمراسلات", en: "Account, order and correspondence data" }, { ar: "المادة 6(2)", en: "Article 6(2)" }],
        [{ ar: "تحسين تجربة الاستخدام والتحليلات", en: "Improving user experience & analytics" }, { ar: "معلومات الجهاز والتفاعل", en: "Device and interaction data" }, { ar: "المادة 6(4)", en: "Article 6(4)" }],
        [{ ar: "كشف الاحتيال وحماية أمن المنصة", en: "Fraud detection and security" }, { ar: "بيانات الحساب والدفع والجهاز", en: "Account, payment, device data" }, { ar: "المادة 6(4)", en: "Article 6(4)" }],
        [{ ar: "التسويق والعروض (بموافقتك)", en: "Marketing (with consent)" }, { ar: "بيانات الحساب والموقع", en: "Account and location data" }, { ar: "المادة 6(1)", en: "Article 6(1)" }],
        [{ ar: "الامتثال للالتزامات القانونية", en: "Legal compliance" }, { ar: "حسب الطلب النظامي", en: "As required by law" }, { ar: "المادة 6(2)", en: "Article 6(2)" }],
      ],
    },
    bullets: [],
  },
  {
    number: "4",
    title: { ar: "مشاركة البيانات", en: "Data Sharing" },
    body: {
      ar: "لن نقوم ببيع أو تأجير بياناتك الشخصية لأي طرف ثالث. قد نشارك بياناتك، بالقدر الضروري فقط، مع: مزودي خدمات تقنية (استضافة سحابية، تحليلات، إشعارات) يعالجون البيانات نيابة عنا وبناءً على تعليماتنا فقط، بوابات الدفع الإلكتروني المرخصة، مندوبي/شركات التوصيل (الاسم ورقم الهاتف والعنوان فقط)، فروعنا التابعة لتحضير الطلب، الجهات الحكومية أو القضائية عند الالتزام النظامي، والمستشارين القانونيين والماليين بموجب عقود سرية.\n\nجميع الأطراف المذكورة ملزمة تعاقديًا بالحفاظ على سرية بياناتك واستخدامها فقط للغرض المتفق عليه.",
      en: "We do not sell or rent your personal data to any third party. We may share your data, only to the extent necessary, with: technical service providers (cloud hosting, analytics, notifications) processing data strictly on our instructions, licensed payment gateways, delivery personnel/companies (name, phone number, and address only), our affiliated branches to prepare your order, government or judicial authorities where legally required, and legal/financial advisors under confidentiality agreements.\n\nAll parties listed above are contractually bound to keep your data confidential and to use it only for the agreed purpose.",
    },
  },
  {
    number: "5",
    title: { ar: "الاحتفاظ بالبيانات", en: "Data Retention" },
    body: {
      ar: "نحتفظ ببياناتك الشخصية طالما كان حسابك نشطًا، ونقوم بحذفها أو إخفاء هويتها عند حذف الحساب، إلا إذا استلزم النظام الاحتفاظ بها لفترة أطول (مثل بيانات الفواتير والمعاملات المالية، أو النزاعات القانونية العالقة).",
      en: "We retain your personal data for as long as your account remains active, and delete or anonymize it upon account deletion, unless the law requires a longer retention period (e.g., billing and transaction records, or pending legal disputes).",
    },
  },
  {
    number: "6",
    title: { ar: "أمن المعلومات", en: "Information Security" },
    body: {
      ar: "نتخذ إجراءات تقنية وتنظيمية معقولة لحماية بياناتك من الفقدان أو الوصول غير المصرح به أو التعديل أو الإفصاح، بما في ذلك التشفير، وجدران الحماية، والوصول المقيّد للموظفين المخولين فقط. مع ذلك، لا يمكن ضمان أمان نقل البيانات عبر الإنترنت بشكل مطلق، وباستخدامك لخدماتنا فإنك تقر بهذا الأمر.",
      en: "We implement reasonable technical and organizational measures to protect your data from loss, unauthorized access, alteration, or disclosure, including encryption, firewalls, and restricted access limited to authorized personnel. However, no transmission of data over the internet can be guaranteed to be completely secure, and by using our services you acknowledge this.",
    },
  },
  {
    number: "7",
    title: { ar: "ملفات تعريف الارتباط", en: "Cookies" },
    body: {
      ar: "قد نستخدم ملفات تعريف الارتباط وتقنيات مشابهة لتحسين أداء التطبيق/الموقع، وفهم كيفية استخدامك له، وتخصيص المحتوى. يمكنك التحكم في إعدادات ملفات تعريف الارتباط من خلال إعدادات جهازك أو المتصفح.",
      en: "We may use cookies and similar technologies to improve app/website performance, understand how you use our services, and personalize content. You can manage cookie preferences through your device or browser settings.",
    },
  },
  {
    number: "8",
    title: { ar: "حقوقك القانونية", en: "Your Legal Rights" },
    body: {
      ar: "بموجب نظام حماية البيانات الشخصية السعودي، يحق لك:",
      en: "Under the Saudi Personal Data Protection Law, you have the right to:",
    },
    rights: [
      { title: { ar: "الوصول", en: "Access" }, desc: { ar: "الاطلاع على بياناتك وطلب نسخة منها.", en: "View your data and request a copy." } },
      { title: { ar: "التصحيح", en: "Correction" }, desc: { ar: "تعديل أي بيانات غير دقيقة.", en: "Correct any inaccurate data." } },
      { title: { ar: "الحذف", en: "Deletion" }, desc: { ar: "طلب حذف بياناتك الشخصية.", en: "Request deletion of your data." } },
      { title: { ar: "التقييد والاعتراض", en: "Restriction & Objection" }, desc: { ar: "تقييد أو الاعتراض على المعالجة في حالات معينة.", en: "Restrict or object to processing in certain cases." } },
      { title: { ar: "نقل البيانات", en: "Portability" }, desc: { ar: "الحصول على بياناتك بصيغة قابلة للقراءة آليًا.", en: "Receive your data in a machine-readable format." } },
      { title: { ar: "سحب الموافقة", en: "Withdraw Consent" }, desc: { ar: "سحب موافقتك في أي وقت للمعالجة القائمة على الموافقة.", en: "Withdraw consent at any time for consent-based processing." } },
    ],
  },
  {
    number: "9",
    title: { ar: "خصوصية الأطفال", en: "Children's Privacy" },
    body: {
      ar: "خدماتنا موجهة للبالغين. لا نقوم بجمع بيانات الأطفال عن قصد، وإذا تبين لنا حدوث ذلك سنقوم بحذفها فورًا.",
      en: "Our services are intended for adults. We do not knowingly collect data from children, and any such data identified will be deleted promptly.",
    },
  },
  {
    number: "10",
    title: { ar: "التعديلات على هذه السياسة", en: "Changes to This Policy" },
    body: {
      ar: "قد نقوم بتحديث هذه السياسة من وقت لآخر لمواكبة التغييرات في خدماتنا أو التزاماتنا القانونية. سيتم نشر أي تحديثات على هذه الصفحة، وننصح بمراجعتها بشكل دوري.",
      en: "We may update this Privacy Policy from time to time to reflect changes in our services or legal obligations. Updates will be posted on this page, and we recommend reviewing it periodically.",
    },
  },
  {
    number: "11",
    title: { ar: "التواصل معنا", en: "Contact Us" },
    contact: true,
  },
];

export default function PrivacyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useLanguage();
  const isEn = language === "en";
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  const ContactBox = () => (
    <View style={[styles.contactBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <View style={styles.contactRow}>
        <Feather name="mail" size={16} color={colors.gold} />
        <Text style={[styles.contactText, { color: colors.foreground, fontFamily: F.semi }]}>{CONTACT_EMAIL}</Text>
      </View>
      <View style={styles.contactRow}>
        <Feather name="phone" size={16} color={colors.gold} />
        <Text style={[styles.contactText, { color: colors.foreground, fontFamily: F.semi }]}>
          {isEn ? CONTACT_WHATSAPP_EN : CONTACT_WHATSAPP_AR}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 8, backgroundColor: "#130B04", borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.secondary }]}>
          <Feather name={isEn ? "arrow-left" : "arrow-right"} size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.extra }]}>
            {isEn ? "Privacy Policy" : "سياسة الخصوصية"}
          </Text>
          <Text style={[styles.headerSub, { color: colors.gold, fontFamily: F.bold }]}>
            منتجات السلة للخضار والفواكه
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={[styles.introBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.introTitle, { color: colors.gold, fontFamily: F.bold, textAlign: isEn ? "left" : "right" }]}>
            {isEn ? "Last updated: July 2026" : "آخر تحديث: يوليو 2026"}
          </Text>
          <Text style={[styles.introText, { color: colors.foreground, fontFamily: F.semi, textAlign: isEn ? "left" : "right" }]}>
            {isEn
              ? "At منتجات السلة للخضار والفواكه (\"we,\" \"us,\" \"the Platform,\" \"the App\"), we take the privacy of our customers and visitors seriously and are committed to protecting it in accordance with the Saudi Personal Data Protection Law (PDPL). This Privacy Policy explains what personal data we collect, why we process it, who we may share it with, and how you can exercise your legal rights. By using the منتجات السلة للخضار والفواكه app or website, you agree to the terms of this policy."
              : "نحن في \"منتجات السلة للخضار والفواكه\" (يشار إليها في هذه الوثيقة بـ \"نحن\" أو \"المنصة\" أو \"التطبيق\") نولي خصوصية عملائنا وزوارنا أهمية كبيرة، ونلتزم بحمايتها وفقًا لأحكام نظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL).\n\nتوضح هذه السياسة نوع البيانات التي نجمعها، وأسباب معالجتها، والجهات التي قد نشارك بياناتك معها، وكيف يمكنك ممارسة حقوقك القانونية بخصوصها. باستخدامك لتطبيق أو موقع منتجات السلة للخضار والفواكه فإنك توافق على الشروط الواردة في هذه السياسة."}
          </Text>
        </View>

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <View key={sec.number} style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sectionHeader, { flexDirection: isEn ? "row" : "row-reverse" }]}>
              <View style={[styles.numberBadge, { backgroundColor: colors.gold + "22", borderColor: colors.gold + "55" }]}>
                <Text style={[styles.numberText, { color: colors.gold, fontFamily: F.bold }]}>{sec.number}</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: colors.gold, fontFamily: F.bold, textAlign: isEn ? "left" : "right" }]}>
                {isEn ? sec.title.en : sec.title.ar}
              </Text>
            </View>

            {sec.body && (
              <Text style={[styles.bodyText, { color: colors.foreground, fontFamily: F.regular, textAlign: isEn ? "left" : "right" }]}>
                {isEn ? sec.body.en : sec.body.ar}
              </Text>
            )}

            {sec.bullets && sec.bullets.length > 0 && (
              <View style={styles.bulletList}>
                {sec.bullets.map((b, i) => (
                  <View key={i} style={[styles.bulletRow, { flexDirection: isEn ? "row" : "row-reverse" }]}>
                    <View style={[styles.bulletDot, { backgroundColor: colors.gold }]} />
                    <Text style={[styles.bulletText, { color: colors.foreground, fontFamily: F.regular, textAlign: isEn ? "left" : "right" }]}>
                      {isEn ? b.en : b.ar}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {sec.table && (
              <View style={[styles.table, { borderColor: colors.border }]}>
                <View style={[styles.tableRow, { backgroundColor: colors.secondary, flexDirection: isEn ? "row" : "row-reverse" }]}>
                  {sec.table.headers.map((h, i) => (
                    <Text key={i} style={[styles.tableCellHeader, { color: colors.gold, fontFamily: F.bold, textAlign: isEn ? "left" : "right" }]}>
                      {isEn ? h.en : h.ar}
                    </Text>
                  ))}
                </View>
                {sec.table.rows.map((row, ri) => (
                  <View key={ri} style={[styles.tableRow, { borderTopColor: colors.border, flexDirection: isEn ? "row" : "row-reverse" }]}>
                    {row.map((cell, ci) => (
                      <Text key={ci} style={[styles.tableCell, { color: colors.foreground, fontFamily: F.regular, textAlign: isEn ? "left" : "right" }]}>
                        {isEn ? cell.en : cell.ar}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {sec.rights && (
              <View style={styles.rightsGrid}>
                {sec.rights.map((r, i) => (
                  <View key={i} style={[styles.rightCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Text style={[styles.rightTitle, { color: colors.gold, fontFamily: F.bold, textAlign: isEn ? "left" : "right" }]}>
                      {isEn ? r.title.en : r.title.ar}
                    </Text>
                    <Text style={[styles.rightDesc, { color: colors.foreground, fontFamily: F.regular, textAlign: isEn ? "left" : "right" }]}>
                      {isEn ? r.desc.en : r.desc.ar}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {sec.contact && <ContactBox />}
          </View>
        ))}

        <Text style={[styles.version, { color: colors.mutedForeground, fontFamily: F.regular }]}>
          {isEn ? "منتجات السلة للخضار والفواكه — All rights reserved © 2026" : "منتجات السلة للخضار والفواكه — جميع الحقوق محفوظة © 2026"}
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
  introBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    gap: 8,
  },
  introTitle: { fontSize: 12 },
  introText: { fontSize: 14, lineHeight: 24 },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 10,
  },
  sectionHeader: {
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
  sectionTitle: { fontSize: 15, flex: 1 },
  bodyText: { fontSize: 14, lineHeight: 24 },
  bulletList: { gap: 8 },
  bulletRow: {
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
  bulletText: { flex: 1, fontSize: 14, lineHeight: 22 },
  table: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
  },
  tableRow: {
    borderTopWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 6,
  },
  tableCellHeader: { flex: 1, fontSize: 11, textTransform: "uppercase" },
  tableCell: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  rightsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  rightCard: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  rightTitle: { fontSize: 13.5 },
  rightDesc: { fontSize: 12.5, lineHeight: 18 },
  contactBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  contactRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  contactText: { fontSize: 13.5 },
  version: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 20,
    marginTop: 6,
  },
});
