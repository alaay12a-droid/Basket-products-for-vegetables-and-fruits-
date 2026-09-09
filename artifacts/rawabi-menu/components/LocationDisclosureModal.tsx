import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";

const C = {
  background: "#0F0A05",
  card: "#1A1208",
  foreground: "#F5DEB3",
  mutedForeground: "#888877",
  border: "#2A1E0F",
  gold: "#E8920C",
} as const;

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

interface Props {
  visible: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

export function LocationDisclosureModal({ visible, onContinue, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.titleAr}>تتبع الموقع في الخلفية</Text>
            <Text style={styles.sectionAr}>لماذا نطلب هذا الإذن؟</Text>
            <Text style={styles.bodyAr}>
              يستخدم تطبيق منتجات السلة للخضار والفواكه موقعك الجغرافي أثناء تشغيل التطبيق وفي الخلفية فقط عندما تكون مسجلًا كمندوب وتقوم بتنفيذ طلب توصيل نشط.
            </Text>
            <Text style={styles.bodyAr}>يُستخدم الموقع من أجل:</Text>
            <Text style={styles.bulletAr}>• عرض موقع المندوب المباشر للعميل وإدارة المطعم.</Text>
            <Text style={styles.bulletAr}>• متابعة حالة التوصيل وتحسين دقة وقت الوصول.</Text>
            <Text style={styles.bulletAr}>• ضمان تنفيذ طلبات التوصيل بكفاءة.</Text>
            <Text style={styles.bodyAr}>
              لن يتم استخدام موقعك لأي أغراض إعلانية أو تسويقية، ولن يتم تتبع موقعك بعد انتهاء مهمة التوصيل أو عند إيقاف التتبع.
            </Text>
            <Text style={styles.bodyAr}>
              بالضغط على "متابعة" فإنك توافق على طلب إذن الموقع اللازم لتقديم خدمة التوصيل.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.titleEn}>Background Location Tracking</Text>
            <Text style={styles.sectionEn}>Why do we need this permission?</Text>
            <Text style={styles.bodyEn}>
              منتجات السلة للخضار والفواكه uses your location while the app is in use and in the background only when you are logged in as a delivery driver and actively delivering an order.
            </Text>
            <Text style={styles.bodyEn}>Your location is used to:</Text>
            <Text style={styles.bulletEn}>• Show the driver's live location to customers and restaurant management.</Text>
            <Text style={styles.bulletEn}>• Track delivery progress and improve estimated arrival times.</Text>
            <Text style={styles.bulletEn}>• Ensure efficient and reliable delivery service.</Text>
            <Text style={styles.bodyEn}>
              Your location will not be used for advertising or marketing purposes, and background tracking stops automatically when the delivery is completed or when driver tracking is turned off.
            </Text>
            <Text style={styles.bodyEn}>
              By tapping Continue, you agree to allow the app to request the location permission required to provide delivery tracking.
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.continueText}>متابعة  •  Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
            <Text style={styles.cancelText}>إلغاء  •  Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
  },
  titleAr: { color: C.gold, fontFamily: F.extra, fontSize: 18, textAlign: "right", marginBottom: 10 },
  sectionAr: { color: C.foreground, fontFamily: F.bold, fontSize: 15, textAlign: "right", marginBottom: 6 },
  bodyAr: { color: C.foreground, fontFamily: F.regular, fontSize: 13.5, textAlign: "right", lineHeight: 20, marginBottom: 8 },
  bulletAr: { color: C.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: "right", lineHeight: 19, marginBottom: 4 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  titleEn: { color: C.gold, fontFamily: F.extra, fontSize: 17, textAlign: "left", marginBottom: 10 },
  sectionEn: { color: C.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "left", marginBottom: 6 },
  bodyEn: { color: C.foreground, fontFamily: F.regular, fontSize: 13, textAlign: "left", lineHeight: 19, marginBottom: 8 },
  bulletEn: { color: C.mutedForeground, fontFamily: F.regular, fontSize: 12.5, textAlign: "left", lineHeight: 18, marginBottom: 4 },
  continueBtn: {
    backgroundColor: C.gold,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 12,
  },
  continueText: { color: "#1A1208", fontFamily: F.bold, fontSize: 15 },
  cancelBtn: {
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelText: { color: C.mutedForeground, fontFamily: F.semi, fontSize: 14 },
});
