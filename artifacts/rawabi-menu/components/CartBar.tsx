import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCart } from "@/context/CartContext";
import { useMenuTemplate } from "@/hooks/useMenuTemplate";

const F = {
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

export function CartBar() {
  const { totalItems, totalPrice } = useCart();
  const router = useRouter();
  const { menuTemplate } = useMenuTemplate();
  const modern = menuTemplate === "modern";

  if (totalItems === 0) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/cart");
  };

  const totalStr = totalPrice % 1 === 0 ? totalPrice.toString() : totalPrice.toFixed(1);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      style={[
        styles.fab,
        {
          bottom: Platform.OS === "web" ? 88 : 108,
          backgroundColor: modern ? "#0F3D2E" : "#C8171A",
          shadowColor: modern ? "#0F3D2E" : "#C8171A",
          borderRadius: modern ? 18 : 22,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <Feather name="shopping-cart" size={22} color="#fff" />
        <View style={[styles.badge, { backgroundColor: modern ? "#1E7A44" : "#E8920C" }]}>
          <Text style={[styles.badgeText, { fontFamily: F.extra }]}>{totalItems}</Text>
        </View>
      </View>
      <View style={styles.priceWrap}>
        <Text style={[styles.priceText, { fontFamily: F.extra }]}>{totalStr}</Text>
        <Text style={[styles.sarText, { fontFamily: F.bold }]}>ر.س</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 28,
    left: 18,
    backgroundColor: "#C8171A",
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: "#C8171A",
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -7,
    right: -8,
    backgroundColor: "#E8920C",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
  },
  priceWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  priceText: {
    color: "#FFFFFF",
    fontSize: 18,
  },
  sarText: {
    color: "#FFFFFF99",
    fontSize: 11,
  },
});
