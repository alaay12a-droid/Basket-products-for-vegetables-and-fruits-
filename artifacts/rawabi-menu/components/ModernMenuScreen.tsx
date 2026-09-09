import React, { useState, useMemo, useCallback, useDeferredValue, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Platform,
  Linking,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";

import { useMenu } from "@/hooks/useMenu";
import { useCartActions, useCartState } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBranchStatus } from "@/hooks/useBranchStatus";
import { useColors } from "@/hooks/useColors";
import { useAppTexts } from "@/hooks/useAppTexts";

import { ProductDetailSheet, itemNeedsCustomization } from "@/components/ProductDetailSheet";
import { CartBar } from "@/components/CartBar";
import { FOOD_IMAGES, type MenuItem } from "@/constants/menu";
import { isExplicitChickenSizeProduct } from "@/utils/chickenSizeVariants";

// Types
type RawItem = MenuItem & { available?: boolean; nameEn?: string; descriptionEn?: string; stock?: number | null };

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

const CAT_COLORS = [
  { bg: "#E3F3E7", text: "#1E7A44" },
  { bg: "#FBE7E5", text: "#C2402F" },
  { bg: "#FBF1DD", text: "#A9781E" },
  { bg: "#E5F0FB", text: "#2F69C2" },
  { bg: "#F3E5FB", text: "#602FC2" },
];

function checkHasOptions(item: RawItem) {
  return (
    itemNeedsCustomization(item) ||
    isExplicitChickenSizeProduct(item.id) ||
    (item.sizes?.some((size) => size.enabled) ?? false) ||
    (item.options?.some((g) => g.choices.some((c) => c.available)) ?? false) ||
    (item.riceTypes?.some((choice) => choice.available) ?? false) ||
    (item.additions?.some((choice) => choice.available) ?? false)
  );
}

const ModernItemCard = React.memo(({
  item,
  quantity,
  isEn,
  catColor,
  catIcon,
  onPress,
  onAdd,
  onDecrease,
}: {
  item: RawItem;
  quantity: number;
  isEn: boolean;
  catColor: { bg: string; text: string };
  catIcon: string;
  onPress: () => void;
  onAdd: () => void;
  onDecrease: () => void;
}) => {
  const isUnavailable = item.available === false;
  const isDhabiha = item.price === 0;
  const displayName = isEn && item.nameEn ? item.nameEn : item.name;
  const displayDesc = isEn && item.descriptionEn ? item.descriptionEn : item.description;
  const priceStr = item.price % 1 === 0 ? item.price.toString() : item.price.toFixed(1);
  const stockLimit = item.stock !== null && item.stock !== undefined ? item.stock : null;
  const atStockLimit = stockLimit !== null && quantity >= stockLimit;
  
  const colors = useColors();
  const CARD_BG = !colors.isLight ? colors.card : "#F6F7F5";
  const BORDER = !colors.isLight ? colors.border : "#E4E7E2";
  const TEXT_MAIN = !colors.isLight ? colors.foreground : "#1A1A1A";
  const TEXT_SEC = !colors.isLight ? colors.mutedForeground : "#6B7268";

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={isUnavailable ? undefined : onPress}
      style={[
        styles.card,
        {
          backgroundColor: CARD_BG,
          borderColor: quantity > 0 ? "#0F3D2E" : BORDER,
          opacity: isUnavailable ? 0.6 : 1,
        },
      ]}
    >
      <View style={[styles.cardImageContainer, { backgroundColor: catColor.bg }]}>
        {item.imageUrl || (item.imageKey && FOOD_IMAGES[item.imageKey]) ? (
          <Image
            source={item.imageUrl ? { uri: item.imageUrl } : FOOD_IMAGES[item.imageKey!]}
            style={styles.cardImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <Text style={{ fontSize: 32 }}>{catIcon || "📦"}</Text>
        )}
      </View>
      
      <View style={styles.cardInfo}>
        <Text style={[styles.cardName, { color: TEXT_MAIN, textAlign: isEn ? "left" : "right" }]} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={[styles.cardDesc, { color: TEXT_SEC, textAlign: isEn ? "left" : "right" }]} numberOfLines={1}>
          {displayDesc || (isEn ? "1 Piece" : "١ قطعة")}
        </Text>

        <View style={[styles.cardRow, { flexDirection: isEn ? "row" : "row-reverse" }]}>
          {isDhabiha ? (
            <Text style={[styles.cardPrice, { color: TEXT_MAIN, fontSize: 13, marginTop: 4 }]}>
              {isEn ? "Call for price" : "حسب الطلب"}
            </Text>
          ) : (
            <Text style={[styles.cardPrice, { color: TEXT_MAIN }]}>
              {priceStr} <Text style={{ fontSize: 10, fontFamily: F.semi, color: TEXT_SEC }}>{isEn ? "SAR" : "ر.س"}</Text>
            </Text>
          )}

          {isUnavailable ? (
            <View style={[styles.addBtn, { backgroundColor: BORDER }]}>
              <Feather name="x" size={16} color={TEXT_SEC} />
            </View>
          ) : isDhabiha ? (
            <TouchableOpacity onPress={onAdd} style={[styles.addBtn, { backgroundColor: "#1DBF47", width: "auto", paddingHorizontal: 12, borderRadius: 14 }]}>
              <Feather name="phone" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12, fontFamily: F.bold, marginHorizontal: 4 }}>
                {isEn ? "Call" : "اتصل"}
              </Text>
            </TouchableOpacity>
          ) : quantity > 0 ? (
            <View style={[styles.qtyControl, { flexDirection: isEn ? "row" : "row-reverse" }]}>
              <TouchableOpacity onPress={onDecrease} style={styles.qtyBtn}>
                <Feather name="minus" size={14} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{quantity}</Text>
              <TouchableOpacity onPress={onAdd} style={styles.qtyBtn} disabled={atStockLimit}>
                <Feather name="plus" size={14} color={atStockLimit ? "#8FD9B8" : "#fff"} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
              <Feather name="plus" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function ModernMenuScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language } = useLanguage();
  const isEn = language === "en";
  const { categories, loading, refreshIfStale } = useMenu();
  const { isOpen, message: closedMessage } = useBranchStatus();
  const info = useAppTexts();

  const { items: cartItems } = useCartState();
  const { addItem, updateQuantity } = useCartActions();
  
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
  const [selectedItem, setSelectedItem] = useState<RawItem | null>(null);

  useFocusEffect(useCallback(() => {
    refreshIfStale();
  }, [refreshIfStale]));

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const qtyMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const ci of cartItems) {
      m.set(ci.item.id, (m.get(ci.item.id) ?? 0) + ci.quantity);
    }
    return m;
  }, [cartItems]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  const displayItems = useMemo(() => {
    if (deferredSearch.trim().length > 0) {
      const q = deferredSearch.toLowerCase();
      return allItems.filter(
        (item) =>
          item.name.includes(q) ||
          (item.nameEn || "").toLowerCase().includes(q) ||
          (item.description || "").includes(q)
      );
    }
    return categories.find((c) => c.id === activeCategory)?.items || [];
  }, [deferredSearch, activeCategory, categories, allItems]);

  const handleAdd = useCallback((item: RawItem) => {
    if (item.price === 0) {
      const msg = isEn
        ? `Hello, I would like to inquire about: ${item.nameEn || item.name}`
        : `السلام عليكم، أرغب في الاستفسار عن: ${item.name}`;
      Linking.openURL(`https://wa.me/${info.whatsapp}?text=${encodeURIComponent(msg)}`);
      return;
    }
    if (checkHasOptions(item)) {
      setSelectedItem(item);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      addItem(item);
    }
  }, [isEn, info.whatsapp, addItem]);

  const handleDecrease = useCallback((item: RawItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = qtyMap.get(item.id) || 0;
    if (current > 0) {
      updateQuantity(item.id, current - 1);
    }
  }, [updateQuantity, qtyMap]);

  const handleCardPress = useCallback((item: RawItem) => {
    if (item.price === 0) return;
    setSelectedItem(item);
  }, []);

  const isDark = !colors.isLight;
  const PAGE_BG = isDark ? colors.background : "#FFFFFF";
  const CARD_BG = isDark ? colors.card : "#F6F7F5";
  const BORDER = isDark ? colors.border : "#E4E7E2";
  const TEXT_MAIN = isDark ? colors.foreground : "#1A1A1A";
  const TEXT_SEC = isDark ? colors.mutedForeground : "#6B7268";

  const activeCatObj = categories.find(c => c.id === activeCategory);

  return (
    <View style={[styles.root, { backgroundColor: PAGE_BG }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0F3D2E" />

      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, Platform.OS === "android" ? 30 : 20) + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarLabel}>{isEn ? "Delivering to" : "التوصيل إلى"}</Text>
          <Text style={styles.topBarValue} numberOfLines={1}>
            {isEn ? info.locationEn || info.location : info.location} {isOpen ? "" : `· ${closedMessage}`}
          </Text>
        </View>
        <Feather name="map-pin" size={20} color="#8FD9B8" />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: PAGE_BG }]}>
        <View style={[styles.searchBox, { backgroundColor: CARD_BG, borderColor: BORDER, flexDirection: isEn ? "row" : "row-reverse" }]}>
          <Feather name="search" size={18} color={TEXT_SEC} />
          <TextInput
            style={[styles.searchInput, { color: TEXT_MAIN, textAlign: isEn ? "left" : "right" }]}
            placeholder={isEn ? "Search vegetables, fruits..." : "دور على خضرة، فاكهة..."}
            placeholderTextColor={TEXT_SEC}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlashList
          data={displayItems}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const catIndex = categories.findIndex((c) => c.id === item.category);
            const fallbackIndex = catIndex >= 0 ? catIndex : 0;
            const catColor = CAT_COLORS[fallbackIndex % CAT_COLORS.length];
            const catObj = categories[fallbackIndex];

            return (
              <View
                style={{
                  paddingLeft: index % 2 === 0 ? 16 : 5,
                  paddingRight: index % 2 === 0 ? 5 : 16,
                  paddingTop: 10,
                }}
              >
                <ModernItemCard
                  item={item}
                  quantity={qtyMap.get(item.id) || 0}
                  isEn={isEn}
                  catColor={catColor}
                  catIcon={catObj?.icon || "📦"}
                  onPress={() => handleCardPress(item)}
                  onAdd={() => handleAdd(item)}
                  onDecrease={() => handleDecrease(item)}
                />
              </View>
            );
          }}
          ListHeaderComponent={
            <View style={{ paddingBottom: 6 }}>
              {deferredSearch.trim().length === 0 && categories.length > 0 && (
                <View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.categoriesScroll, { flexDirection: isEn ? "row" : "row-reverse" }]}
                  >
                    {categories.map((cat, index) => {
                      const active = activeCategory === cat.id;
                      const catColor = CAT_COLORS[index % CAT_COLORS.length];
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={styles.categoryBtn}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setActiveCategory(cat.id);
                          }}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.catIconCircle,
                              { backgroundColor: active ? "#0F3D2E" : catColor.bg },
                            ]}
                          >
                            <Text style={styles.catEmoji}>{cat.icon}</Text>
                          </View>
                          <Text
                            style={[
                              styles.catName,
                              {
                                color: active ? TEXT_MAIN : TEXT_SEC,
                                fontFamily: active ? F.bold : F.semi,
                              },
                            ]}
                          >
                            {isEn ? cat.nameEn || cat.name : cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  
                  {activeCatObj && (
                    <Text style={[styles.sectionTitle, { color: TEXT_MAIN, textAlign: isEn ? "left" : "right" }]}>
                      {isEn ? activeCatObj.nameEn || activeCatObj.name : activeCatObj.name}
                    </Text>
                  )}
                </View>
              )}
              {deferredSearch.trim().length > 0 && (
                <Text style={[styles.sectionTitle, { color: TEXT_MAIN, textAlign: isEn ? "left" : "right", marginTop: 8 }]}>
                  {isEn ? "Search Results" : "نتائج البحث"}
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center", marginTop: 40 }}>
              <Feather name="search" size={48} color={BORDER} style={{ marginBottom: 16 }} />
              <Text style={{ color: TEXT_SEC, fontFamily: F.semi, fontSize: 16 }}>
                {isEn ? "No items found" : "لم يتم العثور على نتائج"}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 130 }}
        />
      </View>

      <CartBar />

      <ProductDetailSheet
        item={selectedItem}
        menuItems={allItems}
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    backgroundColor: "#0F3D2E",
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarLabel: {
    fontFamily: F.semi,
    fontSize: 12,
    color: "#8FD9B8",
    marginBottom: 2,
  },
  topBarValue: {
    fontFamily: F.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  searchBox: {
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: F.semi,
    fontSize: 14,
    height: "100%",
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  categoryBtn: {
    alignItems: "center",
    gap: 8,
  },
  catIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  catEmoji: {
    fontSize: 26,
  },
  catName: {
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: F.bold,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardImageContainer: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardInfo: {
    padding: 12,
  },
  cardName: {
    fontFamily: F.bold,
    fontSize: 14,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: F.semi,
    fontSize: 11,
    marginBottom: 10,
  },
  cardRow: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardPrice: {
    fontFamily: F.extra,
    fontSize: 15,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0F3D2E",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  qtyControl: {
    alignItems: "center",
    backgroundColor: "#0F3D2E",
    borderRadius: 16,
    height: 32,
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    color: "#fff",
    fontFamily: F.bold,
    fontSize: 13,
    marginHorizontal: 4,
  },
});