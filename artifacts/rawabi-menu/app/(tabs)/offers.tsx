import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useOccasions } from "@/hooks/useOccasions";
import { useDiscountCodes } from "@/hooks/useDiscountCodes";
import { useLanguage } from "@/context/LanguageContext";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

export default function OffersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const [activeTab, setActiveTab] = useState<"offers" | "codes">("offers");
  const { language } = useLanguage();
  const isEn = language === "en";

  const { occasions, loading: occasionsLoading } = useOccasions();
  const { activeCodes, loaded: codesLoaded } = useDiscountCodes();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isModern && colors.isLight ? "dark-content" : "light-content"} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: F.extra }]}>
          {isEn ? "Offers" : "العروض"}
        </Text>
      </View>

      {/* Sub-tabs */}
      <View style={[styles.subTabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.subTab, activeTab === "offers" && { borderBottomColor: colors.gold, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab("offers")}
        >
          <Text style={[styles.subTabText, { fontFamily: F.bold, color: activeTab === "offers" ? colors.gold : colors.mutedForeground }]}>
            {isEn ? "Offers" : "العروض"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTab, activeTab === "codes" && { borderBottomColor: colors.gold, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab("codes")}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.subTabText, { fontFamily: F.bold, color: activeTab === "codes" ? colors.gold : colors.mutedForeground }]}>
              {isEn ? "Discount Codes" : "أكواد الخصم"}
            </Text>
            {activeCodes.length > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.gold }]}>
                <Text style={{ color: colors.isModern ? colors.background : "#1A0A00", fontFamily: F.bold, fontSize: 10 }}>{activeCodes.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Offers Tab */}
      {activeTab === "offers" && (
        occasionsLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} size="large" />
          </View>
        ) : occasions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="tag" size={40} color={colors.border} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: F.bold }]}>
              {isEn ? "No Offers Right Now" : "لا توجد عروض حالياً"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>
              {isEn ? "Check back later for the latest deals." : "الرجاء زيارة هذه الصفحة لاحقاً لاستعراض أحدث العروض"}
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16 }}>
            {occasions.map((occ) => (
              <View key={occ.occasionId} style={[styles.occasionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {occ.imageUrl ? (
                  <Image source={{ uri: occ.imageUrl }} style={styles.occasionImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.occasionImagePlaceholder, { backgroundColor: colors.secondary }]}>
                    <Feather name="image" size={36} color={colors.border} />
                  </View>
                )}
                <View style={styles.occasionBody}>
                  <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 16, textAlign: isEn ? "left" : "right" }}>
                    {occ.name}
                  </Text>
                  {occ.description ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: isEn ? "left" : "right", lineHeight: 22 }}>
                      {occ.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        )
      )}

      {/* Codes Tab */}
      {activeTab === "codes" && (
        !codesLoaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} size="large" />
          </View>
        ) : activeCodes.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="percent" size={40} color={colors.border} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: F.bold }]}>
              {isEn ? "No Discount Codes" : "لا توجد أكواد خصم"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.semi }]}>
              {isEn ? "No discount codes available right now." : "لا توجد أكواد خصم متاحة حالياً"}
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: isEn ? "left" : "right" }}>
              {isEn
                ? "Use one of the codes below when confirming your order to get a discount 🎉"
                : "استخدم أحد الأكواد التالية عند تأكيد طلبك للحصول على خصم 🎉"}
            </Text>
            {activeCodes.map((dc) => (
              <View key={dc.id} style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.gold }]}>
                <View style={styles.codeTop}>
                  <View style={[styles.codeBadge, { backgroundColor: colors.isModern ? colors.surface : "#2A1A08", borderColor: colors.gold }]}>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 18, letterSpacing: 2 }}>
                      {dc.code}
                    </Text>
                  </View>
                  <View style={[styles.discountBadge, { backgroundColor: colors.gold }]}>
                    <Text style={{ color: colors.isModern ? colors.background : "#1A0A00", fontFamily: F.extra, fontSize: 15 }}>
                      {dc.type === "percentage"
                        ? isEn ? `${dc.value}% OFF` : `${dc.value}% خصم`
                        : isEn ? `${dc.value} SAR OFF` : `خصم ${dc.value} ر.س`}
                    </Text>
                  </View>
                </View>
                {dc.description ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13, textAlign: isEn ? "left" : "right", marginTop: 6 }}>
                    {dc.description}
                  </Text>
                ) : null}
                {dc.minOrder > 0 ? (
                  <View style={[styles.minOrderRow, { backgroundColor: colors.secondary }]}>
                    <Feather name="info" size={12} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                      {isEn ? `Min. order: ${dc.minOrder} SAR` : `الحد الأدنى للطلب: ${dc.minOrder} ر.س`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  title: { fontSize: 20 },
  subTabRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
  },
  subTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subTabText: { fontSize: 14 },
  badge: {
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 24 },
  occasionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  occasionImage: { width: "100%", height: 180 },
  occasionImagePlaceholder: {
    width: "100%",
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  occasionBody: { padding: 14, gap: 6 },
  codeCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 6,
  },
  codeTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  codeBadge: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  discountBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  minOrderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
});
