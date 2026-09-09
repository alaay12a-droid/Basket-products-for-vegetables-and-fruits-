import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useCartActions } from "@/context/CartContext";
import { MenuItem, FOOD_IMAGES } from "@/constants/menu";
import { itemNeedsCustomization } from "@/components/ProductDetailSheet";
import { isExplicitChickenSizeProduct } from "@/utils/chickenSizeVariants";

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};

interface Props {
  item: MenuItem & { available?: boolean; nameEn?: string; descriptionEn?: string; stock?: number | null };
  quantity: number;
  onPress?: () => void;
  // Lifted props — avoids 3 hook subscriptions per card instance
  isEn: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  whatsapp: string;
  modern?: boolean;
}

function MenuItemCardInner({ item, quantity, onPress, isEn, isFavorite: faved, onToggleFavorite, whatsapp, modern = false }: Props) {
  const colors = useColors();
  const cardColor = modern && colors.isLight ? "#FFFFFF" : colors.card;
  const borderColor = modern && colors.isLight ? "#DDE7E0" : colors.border;
  const primaryColor = modern ? "#0F3D2E" : colors.primary;
  const accentColor = modern ? "#1E7A44" : colors.gold;
  const foregroundColor = modern && colors.isLight ? "#17231D" : colors.foreground;
  const mutedColor = modern && colors.isLight ? "#66736B" : colors.mutedForeground;
  const { addItem, updateQuantity } = useCartActions();

  const inCart = quantity > 0;
  const isDhabiha = item.price === 0;
  const isUnavailable = item.available === false;

  const stockLimit = (item.stock !== null && item.stock !== undefined) ? item.stock : null;
  const atStockLimit = stockLimit !== null && quantity >= stockLimit;
  const lowStock = stockLimit !== null && stockLimit > 0 && stockLimit <= 3;

  const displayName = isEn && item.nameEn ? item.nameEn : item.name;
  const displayDesc = isEn && item.descriptionEn ? item.descriptionEn : item.description;

  // Item needs detail sheet if it has configurable sizes or option groups
  const hasOptions =
    itemNeedsCustomization(item) ||
    isExplicitChickenSizeProduct(item.id) ||
    (item.sizes?.some(size => size.enabled) ?? false) ||
    (item.options?.some(g => g.choices.some(c => c.available)) ?? false) ||
    (item.riceTypes?.some(choice => choice.available) ?? false) ||
    (item.additions?.some(choice => choice.available) ?? false);

  const handleAdd = useCallback(() => {
    if (isUnavailable || atStockLimit) return;
    if (isDhabiha) {
      const msg = isEn
        ? `Hello, I would like to inquire about: ${displayName}`
        : `السلام عليكم، أرغب في الاستفسار عن: ${item.name}`;
      Linking.openURL(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`);
      return;
    }
    // If item has sizes/options, open detail sheet instead of adding directly
    if (hasOptions) {
      onPress?.();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem(item);
  }, [isUnavailable, atStockLimit, isDhabiha, isEn, displayName, item, whatsapp, addItem, hasOptions, onPress]);

  const handleDecrease = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(item.id, quantity - 1);
  }, [updateQuantity, item.id, quantity]);

  const handleToggleFav = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleFavorite();
  }, [onToggleFavorite]);

  const priceStr = item.price % 1 === 0 ? item.price.toString() : item.price.toFixed(1);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={isUnavailable ? undefined : onPress}
      style={[
        styles.card,
        {
          backgroundColor: isUnavailable ? (colors.isLight ? (modern ? "#F3F6F3" : "#F5F0EA") : "#1A1008") : cardColor,
          borderColor: inCart ? accentColor : borderColor,
          borderWidth: inCart ? 1.5 : 0.8,
          opacity: isUnavailable ? 0.7 : 1,
        },
      ]}
    >
      {isUnavailable && (
        <View style={[styles.statusBanner, { backgroundColor: colors.isLight ? "#F0D8D8" : "#4A1A1A" }]}>
          <Text style={[styles.statusText, { color: colors.isLight ? "#C8171A" : "#E57373", fontFamily: F.bold }]}>
            {isEn ? "Out of Stock" : "نافد"}
          </Text>
        </View>
      )}
      {!isUnavailable && lowStock && (
        <View style={[styles.statusBanner, { backgroundColor: colors.isLight ? "#FFF3E0" : "#3A2000" }]}>
          <Text style={[styles.statusText, { color: "#E8920C", fontFamily: F.bold }]}>
            {isEn ? `Only ${stockLimit} left` : `متبقي ${stockLimit} فقط`}
          </Text>
        </View>
      )}

      <View style={styles.inner}>
        {(item.imageUrl || (item.imageKey && FOOD_IMAGES[item.imageKey])) ? (
          <Image
            source={item.imageUrl ? { uri: item.imageUrl } : FOOD_IMAGES[item.imageKey!]}
            style={styles.itemImg}
            contentFit="cover"
            recyclingKey={item.imageUrl ?? item.imageKey ?? item.id}
            transition={0}
            cachePolicy="memory-disk"
          />
        ) : null}

        <View style={[styles.infoBlock, { alignItems: isEn ? "flex-start" : "flex-end" }]}>
          <View style={{ flexDirection: isEn ? "row" : "row-reverse", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
            <Text
              style={[styles.name, { color: foregroundColor, fontFamily: F.bold, textAlign: isEn ? "left" : "right", flex: 1 }]}
              numberOfLines={2}
            >
              {displayName}
            </Text>
            <TouchableOpacity
              onPress={handleToggleFav}
              style={[styles.heartBtn, { backgroundColor: faved ? (modern ? "#1E7A4422" : "#C8171A22") : "transparent" }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="heart" size={14} color={faved ? (modern ? accentColor : "#C8171A") : mutedColor} />
            </TouchableOpacity>
          </View>
          {displayDesc ? (
            <Text
              style={[styles.desc, { color: mutedColor, fontFamily: F.regular, textAlign: isEn ? "left" : "right" }]}
              numberOfLines={2}
            >
              {displayDesc}
            </Text>
          ) : null}

          <View style={styles.bottomRow}>
            {isUnavailable ? (
              <View style={[styles.addBtn, { backgroundColor: colors.isLight ? "#E0D0C0" : "#3A2A1A" }]}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </View>
            ) : isDhabiha ? (
              <TouchableOpacity
                onPress={handleAdd}
                style={[styles.addBtn, { backgroundColor: "#1DBF47" }]}
                activeOpacity={0.8}
              >
                <Feather name="phone" size={16} color="#fff" />
              </TouchableOpacity>
            ) : quantity === 0 ? (
              <TouchableOpacity
                onPress={handleAdd}
                style={[styles.addBtn, { backgroundColor: atStockLimit ? (colors.isLight ? "#E0D0C0" : "#3A2A1A") : primaryColor }]}
                activeOpacity={atStockLimit ? 1 : 0.8}
                disabled={atStockLimit}
              >
                <Feather name="plus" size={18} color={atStockLimit ? colors.mutedForeground : "#fff"} />
              </TouchableOpacity>
            ) : hasOptions ? (
              <View style={styles.qtyGroup}>
                <TouchableOpacity
                  onPress={handleAdd}
                  style={[styles.qtyRound, { backgroundColor: atStockLimit ? (colors.isLight ? "#E0D0C0" : "#2A1A0A") : primaryColor }]}
                  disabled={atStockLimit}
                >
                  <Feather name="plus" size={13} color={atStockLimit ? colors.mutedForeground : "#fff"} />
                </TouchableOpacity>
                <View style={[styles.qtyNumBox, { backgroundColor: accentColor }]}>
                  <Text style={[styles.qtyNumText, { fontFamily: F.extra }]}>{quantity}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.qtyGroup}>
                <TouchableOpacity
                  onPress={handleAdd}
                  style={[styles.qtyRound, { backgroundColor: atStockLimit ? (colors.isLight ? "#E0D0C0" : "#2A1A0A") : primaryColor }]}
                  disabled={atStockLimit}
                >
                  <Feather name="plus" size={13} color={atStockLimit ? colors.mutedForeground : "#fff"} />
                </TouchableOpacity>
                <View style={[styles.qtyNumBox, { backgroundColor: accentColor }]}>
                  <Text style={[styles.qtyNumText, { fontFamily: F.extra }]}>{quantity}</Text>
                </View>
                <TouchableOpacity
                  onPress={handleDecrease}
                  style={[styles.qtyRound, { backgroundColor: colors.isLight ? "#E0D0C0" : "#2A1A0A" }]}
                >
                  <Feather name="minus" size={13} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.priceBlock}>
              {isDhabiha ? (
                <View style={[styles.callBadge, { backgroundColor: "#1DBF4722", borderColor: "#1DBF47" }]}>
                  <Text style={[styles.callText, { color: "#1DBF47", fontFamily: F.bold }]}>
                    {isEn ? "Call for price" : "اتصل للسعر"}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.price, { color: modern ? accentColor : (inCart ? colors.gold : colors.accent), fontFamily: F.extra }]}>
                    {priceStr}
                  </Text>
                  <Text style={[styles.currency, { color: mutedColor, fontFamily: F.semi }]}>
                    {isEn ? "SAR" : "ر.س"}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const MenuItemCard = React.memo(MenuItemCardInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    marginBottom: 10,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  itemImg: {
    width: 80,
    height: 80,
    borderRadius: 12,
    flexShrink: 0,
  },
  heartBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 6,
  },
  infoBlock: {
    flex: 1,
    gap: 5,
  },
  name: {
    fontSize: 15,
    lineHeight: 23,
  },
  desc: {
    fontSize: 12,
    lineHeight: 18,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyRound: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNumBox: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNumText: {
    color: "#fff",
    fontSize: 14,
  },
  priceBlock: {
    alignItems: "flex-end",
  },
  price: {
    fontSize: 22,
    lineHeight: 26,
  },
  currency: {
    fontSize: 11,
  },
  callBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  callText: {
    fontSize: 12,
  },
  statusBanner: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    alignItems: "flex-end",
  },
  statusText: {
    fontSize: 12,
  },
});
