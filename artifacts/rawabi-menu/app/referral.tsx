import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Share, ScrollView, Alert, StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { API_BASE, apiPost } from "@/constants/api";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

interface ReferralStats {
  total: number;
  rewarded: number;
  totalRewardSAR: number;
  rate: number;
  enabled: boolean;
}

export default function ReferralScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useUser();

  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const phone = user?.phone ?? "";

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const [codeRes, statsRes] = await Promise.all([
        apiPost<{ code: string }>("/referrals/publish-code", { phone, name: user?.name ?? "" }),
        fetch(`${API_BASE}/api/referrals/stats?phone=${encodeURIComponent(phone)}`).then((r) => r.json()) as Promise<ReferralStats>,
      ]);
      setCode(codeRes.code);
      setStats(statsRes);
    } catch {
      Alert.alert("خطأ", "تعذّر تحميل بيانات الإحالة");
    } finally {
      setLoading(false);
    }
  }, [phone, user?.name]);

  useEffect(() => { load(); }, [load]);

  const handleShare = async () => {
    if (!code) return;
    const base = API_BASE.replace(/\/+$/, "");
    const appLink = `${base}?ref=${code}`;
    const msg = `🥬 جرّب سلة الخضار — خضار طازجة تصلك إلى بابك!\n\nحمّل التطبيق الآن واستمتع بتجربة الطلب:\n${appLink}\n\nكود الإحالة الخاص بك: ${code}`;
    try {
      await Share.share({ message: msg, url: appLink });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.bold }]}>برنامج الإحالة</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      ) : !stats?.enabled ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 15 }}>برنامج الإحالة غير مفعّل حالياً</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>

          {/* How it works */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.gold, fontFamily: F.bold }]}>🎁 كيف يعمل البرنامج؟</Text>
            <View style={styles.step}>
              <Text style={[styles.stepNum, { backgroundColor: "#C8171A", color: "#fff", fontFamily: F.bold }]}>١</Text>
              <Text style={[styles.stepText, { color: colors.foreground, fontFamily: F.regular }]}>شارك رابطك الخاص مع أصدقائك</Text>
            </View>
            <View style={styles.step}>
              <Text style={[styles.stepNum, { backgroundColor: "#C8171A", color: "#fff", fontFamily: F.bold }]}>٢</Text>
              <Text style={[styles.stepText, { color: colors.foreground, fontFamily: F.regular }]}>يحمّل صديقك التطبيق عبر رابطك</Text>
            </View>
            <View style={styles.step}>
              <Text style={[styles.stepNum, { backgroundColor: "#C8171A", color: "#fff", fontFamily: F.bold }]}>٣</Text>
              <Text style={[styles.stepText, { color: colors.foreground, fontFamily: F.regular }]}>
                عند أول طلب له — تحصل على {stats.rate > 0 ? `${stats.rate} ر.س` : "مكافأة"} في محفظتك 🎉
              </Text>
            </View>
          </View>

          {/* Code & Share */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground, fontFamily: F.semi }]}>كودك الخاص</Text>
            <View style={[styles.codeBox, { backgroundColor: colors.secondary, borderColor: colors.gold }]}>
              <Text style={[styles.codeText, { color: colors.gold, fontFamily: F.extra }]}>{code}</Text>
            </View>
            <TouchableOpacity onPress={handleShare} style={[styles.shareBtn, { backgroundColor: "#C8171A" }]}>
              <Feather name="share-2" size={18} color="#fff" />
              <Text style={[styles.shareBtnText, { fontFamily: F.bold }]}>شارك الرابط</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground, fontFamily: F.semi }]}>إحصائياتك</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.gold, fontFamily: F.extra }]}>{stats.total}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: F.regular }]}>إجمالي الإحالات</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: "#4CAF50", fontFamily: F.extra }]}>{stats.rewarded}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: F.regular }]}>طلبوا وكسبت</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: "#E8920C", fontFamily: F.extra }]}>{stats.totalRewardSAR.toFixed(0)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: F.regular }]}>ر.س كُسبت</Text>
              </View>
            </View>
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 14, marginBottom: 4 },
  step: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  stepNum: { width: 26, height: 26, borderRadius: 13, textAlign: "center", lineHeight: 26, fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 22, textAlign: "right" },
  codeBox: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderStyle: "dashed",
  },
  codeText: { fontSize: 22, letterSpacing: 3 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareBtnText: { color: "#fff", fontSize: 15 },
  statsRow: { flexDirection: "row-reverse", alignItems: "center" },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statDivider: { width: 1, height: 40 },
  statNum: { fontSize: 22 },
  statLabel: { fontSize: 11, textAlign: "center" },
});
