import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  StatusBar,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { resolveCustomerCartItemName, resolveCustomizationParts } from "@/utils/cartItemName";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { getCartUnitPrice, useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useMenu } from "@/hooks/useMenu";
import { useAppConfig } from "@/context/AppConfigContext";
import { FOOD_IMAGES } from "@/constants/menu";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

// Categories to show as recommendations (sides, salads, extras, desserts, drinks)
const RECOMMENDED_CATS = ["salads", "sides", "extras", "desserts", "drinks"];

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, updateQuantity, removeItem, clearCart, addItem, totalItems, totalPrice } = useCart();
  const { language } = useLanguage();
  const { categories } = useMenu();
  const { config } = useAppConfig();
  const isModern = config.menuTemplate === "modern";
  const isEn = language === "en";

  const minOrder = config.minOrderAmount ?? 0;
  const belowMinOrder = minOrder > 0 && totalPrice < minOrder;
  const remaining = minOrder > 0 ? Math.max(0, minOrder - totalPrice) : 0;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // Build recommended items list — exclude items already in cart
  const cartItemIds = useMemo(() => new Set(items.map((ci) => ci.item.id)), [items]);

  const recommendedItems = useMemo(() => {
    const result: Array<{ id: string; name: string; nameEn?: string; price: number; imageKey?: string; imageUrl?: string; category: string }> = [];
    for (const cat of categories) {
      if (!RECOMMENDED_CATS.includes(cat.id)) continue;
      for (const item of cat.items) {
        if (item.available && !cartItemIds.has(item.id)) {
          result.push(item);
        }
      }
    }
    return result.slice(0, 12); // max 12 recommendations
  }, [categories, cartItemIds]);

  const confirmClear = () => {
    Alert.alert(
      isEn ? "Clear Cart" : "مسح السلة",
      isEn ? "Remove all items from cart?" : "هل تريد حذف جميع الأصناف؟",
      [
        { text: isEn ? "Cancel" : "إلغاء", style: "cancel" },
        { text: isEn ? "Clear" : "مسح", style: "destructive", onPress: () => clearCart() },
      ]
    );
  };

  const handleAddRecommended = (item: typeof recommendedItems[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      price: item.price,
      category: item.category,
      imageKey: item.imageKey,
      imageUrl: item.imageUrl,
    });
  };

  const getItemImage = (item: { imageUrl?: string; imageKey?: string }) => {
    if (item.imageUrl) return { uri: item.imageUrl };
    if (item.imageKey && FOOD_IMAGES[item.imageKey]) return FOOD_IMAGES[item.imageKey];
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isModern && colors.isLight ? "dark-content" : "light-content"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            paddingTop: topInset + 10,
            borderBottomColor: colors.border,
          },
        ]}
      >
        {items.length > 0 ? (
          <TouchableOpacity onPress={confirmClear} style={styles.headerSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="trash-2" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSide} />
        )}

        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: F.bold }]}>
          {isEn ? "My Cart" : "السلة"}
        </Text>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerSide}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
            <Feather name="shopping-cart" size={44} color={colors.border} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: F.bold }]}>
            {isEn ? "Cart is Empty" : "السلة فارغة"}
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: F.regular }]}>
            {isEn ? "Add some items from our menu" : "أضف بعض الأصناف من قائمتنا الشهية"}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.browseBtn, { backgroundColor: colors.gold }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.browseBtnText, { fontFamily: F.bold }]}>
              {isEn ? "Browse Menu" : "تصفح القائمة"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 200, paddingTop: 8 }}
          >
            {/* ── Cart items ── */}
            <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {items.map((cartItem, index) => {
                const unitPrice = getCartUnitPrice(cartItem.item, cartItem.customization, cartItem.unitPrice);
                const itemTotal = unitPrice * cartItem.quantity;
                const totalStr = itemTotal % 1 === 0 ? itemTotal.toString() : itemTotal.toFixed(1);
                const unitStr = unitPrice % 1 === 0 ? unitPrice.toString() : unitPrice.toFixed(1);
                const baseArabicName = resolveCustomerCartItemName(cartItem.item.name, cartItem.customization);
                const itemName = isEn && cartItem.item.nameEn ? cartItem.item.nameEn : baseArabicName;
                const customParts = resolveCustomizationParts(cartItem.customization, baseArabicName);

                const cartImg = getItemImage(cartItem.item);
                return (
                  <React.Fragment key={cartItem.cartKey}>
                    {index > 0 && (
                      <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />
                    )}
                    <View style={styles.itemRow}>
                      {/* Thumbnail image */}
                      <View style={[styles.itemThumb, { backgroundColor: colors.secondary }]}>
                        {cartImg ? (
                          <Image source={cartImg} style={styles.itemThumbImg} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: 22 }}>🍽️</Text>
                        )}
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, { color: colors.foreground, fontFamily: F.bold }]} numberOfLines={2}>
                          {itemName}
                        </Text>
                        {customParts.length > 0 && (
                          <Text style={{ color: colors.isModern ? colors.accent : "#E8920C", fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right", marginTop: 1 }}>
                            {customParts.join(" · ")}
                          </Text>
                        )}
                        <Text style={[styles.unitPrice, { color: colors.mutedForeground, fontFamily: F.regular }]}>
                          {unitStr} {isEn ? "SAR" : "ر.س"} {isEn ? "each" : "للوحدة"}
                        </Text>
                      </View>

                      <View style={styles.itemRight}>
                        <TouchableOpacity
                          onPress={() => removeItem(cartItem.cartKey)}
                          style={[styles.removeBtn, { backgroundColor: colors.secondary }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="x" size={14} color={colors.mutedForeground} />
                        </TouchableOpacity>

                        <Text style={[styles.itemTotal, { color: colors.gold, fontFamily: F.extra }]}>
                          {totalStr} {isEn ? "SAR" : "ر.س"}
                        </Text>

                        <View style={styles.qtyRow}>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              updateQuantity(cartItem.cartKey, cartItem.quantity + 1);
                            }}
                            style={[styles.qtyBtn, { backgroundColor: colors.gold }]}
                          >
                            <Feather name="plus" size={14} color="#FFFFFF" />
                          </TouchableOpacity>
                          <Text style={[styles.qtyNum, { color: colors.foreground, fontFamily: F.bold }]}>
                            {cartItem.quantity}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              updateQuantity(cartItem.cartKey, cartItem.quantity - 1);
                            }}
                            style={[styles.qtyBtn, { backgroundColor: colors.secondary }]}
                          >
                            <Feather name="minus" size={14} color={colors.foreground} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>

            {/* ── Recommended items ── */}
            {recommendedItems.length > 0 && (
              <View style={styles.recSection}>
                <Text style={[styles.recTitle, { color: colors.foreground, fontFamily: F.extra }]}>
                  {isEn ? "You might also like" : "أصناف مرغوبة"}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recScroll}
                  decelerationRate="fast"
                >
                  {recommendedItems.map((item) => {
                    const img = getItemImage(item);
                    const priceStr = item.price % 1 === 0 ? item.price.toString() : item.price.toFixed(1);
                    const name = isEn && item.nameEn ? item.nameEn : item.name;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => handleAddRecommended(item)}
                        activeOpacity={0.8}
                      >
                        {/* Image */}
                        <View style={[styles.recImageWrap, { backgroundColor: colors.secondary }]}>
                          {img ? (
                            <Image source={img} style={styles.recImage} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: 28 }}>🍽️</Text>
                          )}
                        </View>

                        {/* Name */}
                        <Text style={[styles.recName, { color: colors.foreground, fontFamily: F.bold }]} numberOfLines={2}>
                          {name}
                        </Text>

                        {/* Price + add button */}
                        <View style={styles.recBottom}>
                          <Text style={[styles.recPrice, { color: colors.gold, fontFamily: F.extra }]}>
                            {priceStr} {isEn ? "SAR" : "ر.س"}
                          </Text>
                          <View style={[styles.recAddBtn, { backgroundColor: colors.gold }]}>
                            <Feather name="plus" size={14} color="#FFFFFF" />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Summary card ── */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryValue, { color: colors.mutedForeground, fontFamily: F.bold }]}>
                  {totalItems} {isEn ? (totalItems === 1 ? "item" : "items") : "صنف"}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: F.semi }]}>
                  {isEn ? "Items" : "الأصناف"}
                </Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryTotal, { color: colors.gold, fontFamily: F.extra }]}>
                  {totalPrice % 1 === 0 ? totalPrice : totalPrice.toFixed(1)} {isEn ? "SAR" : "ر.س"}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.foreground, fontFamily: F.bold }]}>
                  {isEn ? "Total" : "الإجمالي"}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom bar */}
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: bottomInset + 16,
              },
            ]}
          >
            {/* Minimum order warning */}
            {belowMinOrder && (
              <View style={[styles.minOrderBanner, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                <Text style={[styles.minOrderText, { color: colors.primary, fontFamily: F.bold }]}>
                  {isEn
                    ? `Minimum order is ${minOrder} SAR — add ${remaining % 1 === 0 ? remaining : remaining.toFixed(1)} SAR more`
                    : `الحد الأدنى للطلب ${minOrder} ر.س — أضف ${remaining % 1 === 0 ? remaining : remaining.toFixed(1)} ر.س`}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => !belowMinOrder && router.push("/checkout")}
              style={[
                styles.checkoutBtn,
                { backgroundColor: belowMinOrder ? colors.border : colors.gold, shadowColor: colors.isModern ? colors.gold : "#E8920C" },
              ]}
              activeOpacity={belowMinOrder ? 1 : 0.85}
            >
              <View style={styles.checkoutBtnInner}>
                <Text style={[styles.checkoutTotal, { fontFamily: F.extra, color: belowMinOrder ? colors.mutedForeground : "#FFF" }]}>
                  {totalPrice % 1 === 0 ? totalPrice : totalPrice.toFixed(1)} {isEn ? "SAR" : "ر.س"}
                </Text>
                <Text style={[styles.checkoutText, { fontFamily: F.bold, color: belowMinOrder ? colors.mutedForeground : "#FFF" }]}>
                  {belowMinOrder
                    ? (isEn ? `Min. order: ${minOrder} SAR` : `الحد الأدنى: ${minOrder} ر.س`)
                    : (isEn ? "Proceed to Checkout" : "إتمام الطلب")}
                </Text>
                <Feather name="arrow-left" size={20} color={belowMinOrder ? colors.mutedForeground : "#FFFFFF"} />
              </View>
            </TouchableOpacity>
          </View>
        </>
      )}
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
  headerSide: { width: 36, alignItems: "center" },
  headerTitle: { fontSize: 20, textAlign: "center" },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 22 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  browseBtn: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 13,
    borderRadius: 14,
  },
  browseBtnText: { color: "#FFFFFF", fontSize: 16 },

  // Cart items card
  itemsCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  itemDivider: { height: 1, marginHorizontal: 16 },
  itemInfo: { flex: 1, alignItems: "flex-end", gap: 4 },
  itemName: { fontSize: 15, textAlign: "right", lineHeight: 22 },
  unitPrice: { fontSize: 12 },
  itemThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemThumbImg: { width: "100%", height: "100%" },
  itemRight: { alignItems: "center", gap: 8 },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTotal: { fontSize: 16 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNum: { fontSize: 16, minWidth: 20, textAlign: "center" },

  // Recommended section
  recSection: {
    marginTop: 20,
    gap: 12,
  },
  recTitle: {
    fontSize: 18,
    marginHorizontal: 16,
    textAlign: "right",
  },
  recScroll: {
    paddingHorizontal: 16,
    gap: 10,
    flexDirection: "row",
  },
  recCard: {
    width: 120,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    padding: 10,
    gap: 7,
  },
  recImageWrap: {
    width: "100%",
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  recImage: {
    width: "100%",
    height: "100%",
  },
  recName: {
    fontSize: 12,
    textAlign: "right",
    lineHeight: 17,
    minHeight: 34,
  },
  recBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recPrice: { fontSize: 13 },
  recAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // Summary card
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  summaryDivider: { height: 1 },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14 },
  summaryTotal: { fontSize: 22 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  minOrderBanner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  minOrderText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  checkoutBtn: {
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  checkoutBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkoutTotal: { color: "#FFFFFF", fontSize: 16 },
  checkoutText: { color: "#FFFFFF", fontSize: 17 },
});
