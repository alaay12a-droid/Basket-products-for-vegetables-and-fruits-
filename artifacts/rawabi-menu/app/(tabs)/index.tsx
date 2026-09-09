import React, { useState, useRef, useCallback, useEffect, useMemo, useDeferredValue } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  StatusBar,
  Linking,
  Modal,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAppTexts } from "@/hooks/useAppTexts";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ProductDetailSheet } from "@/components/ProductDetailSheet";
import { CartBar } from "@/components/CartBar";
import { useMenu } from "@/hooks/useMenu";
import { useOccasions } from "@/hooks/useOccasions";
import { useBanners } from "@/hooks/useBanners";
import { BannerCarousel } from "@/components/BannerCarousel";
import { useCombos, type ApiCombo } from "@/hooks/useCombos";
import { useCartActions, useCartState } from "@/context/CartContext";
import { useBranchStatus } from "@/hooks/useBranchStatus";
import { useLanguage } from "@/context/LanguageContext";
import { useFavorites } from "@/hooks/useFavorites";
import { apiGet } from "@/constants/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUser } from "@/context/UserContext";
import ModernMenuScreen from "@/components/ModernMenuScreen";
import { useMenuTemplate } from "@/hooks/useMenuTemplate";
import {
  OCCASION_KEY,
  OCCASION_THEMES,
  detectCurrentOccasion,
  type OccasionId,
} from "@/constants/occasions";

// ── MenuItemRow: fully prop-driven — zero context subscriptions ───────────
// quantity is passed from parent's qtyMapRef so this component NEVER
// subscribes to CartContext.  Only the parent (MenuScreen) subscribes once.
type _RawItem = import("@/constants/menu").MenuItem & {
  available?: boolean; nameEn?: string; descriptionEn?: string; stock?: number | null;
};
const MenuItemRow = React.memo(function MenuItemRow({
  item, quantity, onSelect, isEn, whatsapp, isFavoriteFn, onToggleFav,
}: {
  item: _RawItem;
  quantity: number;
  onSelect: (item: _RawItem) => void;
  isEn: boolean;
  whatsapp: string;
  isFavoriteFn: (id: string) => boolean;
  onToggleFav: (id: string) => void;
}) {
  const itemIsFav = isFavoriteFn(item.id);
  const handlePress = useCallback(() => onSelect(item), [onSelect, item]);
  const handleToggleFav = useCallback(() => onToggleFav(item.id), [onToggleFav, item.id]);
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
      <MenuItemCard
        item={item}
        quantity={quantity}
        onPress={handlePress}
        isEn={isEn}
        isFavorite={itemIsFav}
        onToggleFavorite={handleToggleFav}
        whatsapp={whatsapp}
      />
    </View>
  );
});

// ── FlashList data types ─────────────────────────────────────────────────────
type RawMenuItem = import("@/constants/menu").MenuItem & {
  available?: boolean;
  nameEn?: string;
  descriptionEn?: string;
  stock?: number | null;
};
type SectionEntry = { id: string; icon: string; name: string; count: number; data: RawMenuItem[] };
type MenuListItem =
  | { _t: "anchor"; sectionId: string }
  | { _t: "head"; section: SectionEntry }
  | { _t: "row"; item: RawMenuItem };

// Wrap FlashList so Reanimated's useAnimatedScrollHandler can attach to it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList as any) as any;

const logo = require("@/assets/images/sallat-alkhodar-logo.png");
const deliveryCar = require("@/assets/images/delivery_car.jpg");
const dhabihaImg = require("@/assets/images/dhabiha.png");
const dhabihaPoster = require("@/assets/images/dhabiha_poster.jpg");

const F = {
  regular: "Cairo_400Regular",
  semi: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
  extra: "Cairo_800ExtraBold",
};


const ORDER_TYPE_KEY = "rawabi_order_type";

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "صباح الخير ☀️";
  if (h >= 12 && h < 17) return "مساء الخير 🌤️";
  if (h >= 17 && h < 21) return "مساء النور 🌙";
  return "ليلة طيبة 🌟";
}

export default function MenuScreen() {
  const { menuTemplate } = useMenuTemplate();
  return menuTemplate === "modern" ? <ModernMenuScreen /> : <ClassicMenuScreen />;
}

function ClassicMenuScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { categories, loading: menuLoading, refresh: refreshMenu, refreshIfStale } = useMenu();
  const { occasions } = useOccasions();
  const { banners, refresh: refreshBanners } = useBanners();
  const { combos } = useCombos();
  const { addItem } = useCartActions();
  const { items: cartItems } = useCartState();
  const qtyMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const ci of cartItems) {
      m.set(ci.item.id, (m.get(ci.item.id) ?? 0) + ci.quantity);
    }
    return m;
  }, [cartItems]);
  // Stable ref — updated every render so renderMenuListItem reads fresh quantities
  // without needing qtyMap in its dependency array (keeps the callback stable).
  const qtyMapRef = useRef(qtyMap);
  qtyMapRef.current = qtyMap;
  const { isOpen, message: closedMessage } = useBranchStatus();
  const { language } = useLanguage();
  const { favorites, isFavorite: isFavoriteFn, toggleFavorite } = useFavorites();
  const isEn = language === "en";
  const info = useAppTexts();
  const timeGreeting = getTimeGreeting();

  // ── Order type & search ──────────────────────────────────────────────
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(ORDER_TYPE_KEY).then(v => {
      if (v === "pickup" || v === "delivery") setOrderType(v);
    });
  }, []);

  const handleOrderType = useCallback(async (t: "delivery" | "pickup") => {
    setOrderType(t);
    await AsyncStorage.setItem(ORDER_TYPE_KEY, t);
  }, []);

  // ── Seasonal occasion theme ──────────────────────────────────────────
  const [occasionId, setOccasionId] = useState<OccasionId>("none");

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(OCCASION_KEY).then(v => {
      if (v === "auto" || v === null) {
        setOccasionId(detectCurrentOccasion());
      } else {
        setOccasionId((v as OccasionId) ?? "none");
      }
    });
  }, []));

  // ── Secret 3-tap to open staff picker ──────────────────────────────
  const logoTapCount = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoTap = () => {
    logoTapCount.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    if (logoTapCount.current >= 3) {
      logoTapCount.current = 0;
      setShowStaffPicker(true);
    } else {
      logoTapTimer.current = setTimeout(() => { logoTapCount.current = 0; }, 1200);
    }
  };
  const availableCombos = useMemo(() => combos.filter((c) => c.available), [combos]);
  const [activeCategory, setActiveCategory] = useState("chicken");
  const [driversEnabled, setDriversEnabled] = useState(false);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  // Single shared detail sheet — replaces per-item modals for 50× less memory usage
  const [selectedItem, setSelectedItem] = useState<RawMenuItem | null>(null);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/settings/drivers-enabled")
      .then((r) => setDriversEnabled(r.enabled))
      .catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { refreshIfStale(); }, [refreshIfStale]));

  useEffect(() => { refreshBanners(); }, [refreshBanners]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuFlashListRef = useRef<any>(null);
  const tabsScrollRef = useRef<ScrollView>(null);
  const isScrollingProgrammatically = useRef(false);
  const sectionYs = useRef<Record<string, number>>({});
  // ── Tab positions (x offset) for auto-scrolling the tabs bar ──────
  const tabPositions = useRef<Record<string, number>>({});
  const listHeaderH = useRef(0);

  // ── Scroll tracking ──
  const lastY = useSharedValue(0);
  const lastCatUpdateY = useSharedValue(-999); // throttle runOnJS category updates
  const headerVisible = useSharedValue(1); // 1=expanded 0=collapsed
  const collapsibleH = useSharedValue(-1); // -1 = not yet measured

  // ── Banner: only visible at absolute top ─────────────────────────────
  const bannerH = useSharedValue(0);
  const bannerAnim = useSharedValue(1); // 1=visible 0=hidden

  // ── Left scroll indicator ────────────────────────────────────────────
  const scrollContentH = useSharedValue(0);
  const scrollViewportH = useSharedValue(0);

  const headerTopStyle = useAnimatedStyle(() => {
    if (collapsibleH.value <= 0) {
      return { overflow: "hidden" };
    }
    return {
      height: interpolate(headerVisible.value, [0, 1], [0, collapsibleH.value], Extrapolation.CLAMP),
      opacity: interpolate(headerVisible.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
      overflow: "hidden",
    };
  });

  const bannerStyle = useAnimatedStyle(() => {
    if (bannerH.value <= 0) return {};
    return {
      height: interpolate(bannerAnim.value, [0, 1], [0, bannerH.value], Extrapolation.CLAMP),
      opacity: interpolate(bannerAnim.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
      overflow: "hidden",
    };
  });

  // Runs entirely on UI thread — no JS bridge, zero lag
  const scrollThumbStyle = useAnimatedStyle(() => {
    const total = scrollContentH.value;
    const viewport = scrollViewportH.value;
    if (total <= viewport || viewport === 0) return { opacity: 0, height: 40 };

    const thumbH = Math.max(40, (viewport / total) * viewport);
    const maxY = Math.max(0, viewport - thumbH - 16);
    const ratio = Math.min(1, Math.max(0, lastY.value / (total - viewport)));

    return {
      height: thumbH,
      opacity: interpolate(lastY.value, [0, 24], [0, 0.85], Extrapolation.CLAMP),
      transform: [{ translateY: 8 + ratio * maxY }],
    };
  });

  const regularCats = useMemo(() => categories.filter((c) => !c.isDelivery && !c.isDhabiha && !c.isOccasions), [categories]);
  const specialCat = categories.find((c) => c.id === activeCategory && (c.isDelivery || c.isDhabiha || c.isOccasions));
  const activeCat = categories.find((c) => c.id === activeCategory) ?? categories[0];
  const topInset = Platform.OS === "web" ? 60 : insets.top;

  // ── Sections data ────────────────────────────────────────────────────
  const sections = useMemo(() => regularCats.map((cat) => ({
    id: cat.id,
    icon: cat.icon,
    name: isEn ? (cat.nameEn ?? cat.name) : cat.name,
    count: cat.items.length,
    data: cat.items,
  })), [regularCats, isEn]);

  // ── Keep a stable ref to sections so the worklet never sees stale data ─
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  // ── Invalidate sectionYs when sections change ─────────────────────────
  // When categories load from the API, sections can gain/lose entries
  // (e.g. "mains" has 0 items in the DB so it disappears after API fetch).
  // The onLayout anchors fire with updated Y positions after re-render, but
  // there is a brief window where sectionYs still holds static-data values.
  // Clearing on every sections change forces scrollToSection to wait for the
  // fresh onLayout measurements before scrolling.
  useEffect(() => {
    sectionYs.current = {};
  }, [sections]); // sections is memoized — ref only changes when API data changes

  // ── Re-sync active category when dynamic header content loads ────────
  // When banners, combos, or favorites load/change, section Y positions
  // shift downward (content is inserted above the sections).  The anchor
  // Views' onLayout callbacks will update sectionYs automatically, but we
  // also need to re-evaluate which category is "active" at the current
  // scroll position so the tab highlight stays correct.
  // We wait 300 ms to let React finish re-layout and onLayout callbacks fire.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!isScrollingProgrammatically.current) {
        updateActiveCategoryFromScroll(lastY.value, true);
      }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banners.length, combos.length, favorites.length]);

  // ── Active category update from manual scroll (JS thread, stable ref) ─
  // Threshold +10: section becomes "active" when its anchor is within 10px
  // of the current scroll position — i.e. the section header is just about
  // to stick at the top of the viewport.  The old value of +80 was too large
  // and caused the highlighted tab to jump ahead of the visible content.
  const updateActiveCategoryFromScroll = useCallback((y: number, force = false) => {
    if (!force && isScrollingProgrammatically.current) return;
    let found = "";
    for (const sec of sectionsRef.current) {
      const secY = sectionYs.current[sec.id];
      if (secY !== undefined && secY <= y + 10) found = sec.id;
    }
    if (found) setActiveCategory(found);
  }, []); // stable — uses refs, never stale

  // ── Scroll handler: header collapse + banner + active tracking ───────
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      const y = event.contentOffset.y;
      const diff = y - lastY.value;
      lastY.value = y;
      bannerAnim.value = y <= 8 ? withTiming(1, { duration: 280 }) : withTiming(0, { duration: 200 });
      if (y <= 10) {
        headerVisible.value = withTiming(1, { duration: 200 });
      } else if (diff > 5) {
        headerVisible.value = withTiming(0, { duration: 250 });
      } else if (diff < -5) {
        headerVisible.value = withTiming(1, { duration: 250 });
      }
      // Throttle JS-thread category tracking: only fire when scroll moves >40px
      if (Math.abs(y - lastCatUpdateY.value) > 40) {
        lastCatUpdateY.value = y;
        runOnJS(updateActiveCategoryFromScroll)(y);
      }
    },
  });

  // ── Scroll to section ─────────────────────────────────────────────────
  // Uses FlashList's scrollToIndex so the scroll target is always exact —
  // no Y-coordinate estimation needed.  The anchor for section[sectionIdx]
  // sits at a fixed offset inside menuData: 2 items (anchor + head) plus all
  // rows of every preceding section.
  const scrollToSection = useCallback((sectionIdx: number, _catId: string, animated = true) => {
    let anchorDataIdx = 0;
    for (let i = 0; i < sectionIdx; i++) {
      anchorDataIdx += 2 + sectionsRef.current[i].data.length; // anchor + head + rows
    }
    requestAnimationFrame(() => {
      (menuFlashListRef.current as any)?.scrollToIndex({ index: anchorDataIdx, animated, viewPosition: 0 });
    });
  }, []);

  // ── Tab press: update active + scroll ───────────────────────────────
  const handleTabPress = useCallback((catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (cat?.isDelivery || cat?.isDhabiha || cat?.isOccasions) {
      setActiveCategory(catId);
      return;
    }

    const sectionIdx = sections.findIndex((s) => s.id === catId);
    if (sectionIdx === -1) {
      setActiveCategory(catId);
      return;
    }

    setActiveCategory(catId);
    isScrollingProgrammatically.current = true;
    scrollToSection(sectionIdx, catId);
    setTimeout(() => {
      isScrollingProgrammatically.current = false;
      // Don't call updateActiveCategoryFromScroll here: sectionYs values can be
      // inaccurate before all anchors have rendered, so re-computing the active
      // section at this point often overrides the correct catId the user just
      // tapped. The scroll-event handler will sync the active tab correctly
      // once the user resumes manual scrolling.
    }, 750);
  }, [categories, sections, scrollToSection]);

  // ── Auto-scroll tabs bar to keep active tab in view ─────────────────
  useEffect(() => {
    const x = tabPositions.current[activeCategory];
    if (x !== undefined) {
      tabsScrollRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
    }
  }, [activeCategory]);

  const handleWhatsApp = (msg: string) => {
    Linking.openURL(`https://wa.me/${info.whatsapp}?text=${encodeURIComponent(msg)}`);
  };

  const handleCall = () => {
    Linking.openURL(`tel:${info.phone}`);
  };

  // ── Fix #3: debounced search via useDeferredValue + useMemo ──────────
  // useDeferredValue lets React defer the search computation to a lower
  // priority, keeping the TextInput responsive on every keystroke.
  const deferredSearch = useDeferredValue(searchQuery);
  const searchResults = useMemo(() => {
    if (deferredSearch.trim().length < 1) return [];
    const q = deferredSearch.toLowerCase();
    return categories.flatMap((c) => c.items).filter((item) =>
      item.name.includes(deferredSearch) ||
      (item.nameEn ?? "").toLowerCase().includes(q) ||
      (item.description ?? "").includes(deferredSearch)
    );
  }, [deferredSearch, categories]);

  // ── Memoised list header (banner + favorites + combos) — rendered above virtualized rows ──
  const allMenuItems = useMemo(() => sections.flatMap((s) => s.data), [sections]);
  const favItems = useMemo(() => allMenuItems.filter((it) => favorites.includes(it.id)), [allMenuItems, favorites]);
  const occ = OCCASION_THEMES[occasionId];

  const renderHeader = useCallback(() => (
    <View onLayout={(e) => {
      const h = e.nativeEvent.layout.height;
      if (h > 10 && Math.abs(h - listHeaderH.current) > 20) {
        listHeaderH.current = h;
        let y = h;
        for (const section of sectionsRef.current) {
          sectionYs.current[section.id] = y;
          y += 6;
          y += 44;
          y += section.data.length * 96;
        }
      }
    }}>
      {occasionId !== "none" && (
        <View style={{ backgroundColor: occ.bg, overflow: "hidden" }}>
          <View style={{ height: 3, backgroundColor: occ.textColor + "55" }} />
          <View style={{ paddingVertical: 10, paddingHorizontal: 8, backgroundColor: occ.secondBg + "AA" }}>
            <Text style={{ fontSize: 20, textAlign: "center", letterSpacing: 4 }}>{occ.decorRow}</Text>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 30 }}>{occ.emoji}</Text>
            <Text style={{ color: occ.textColor, fontFamily: F.extra, fontSize: 20, textAlign: "center" }}>{occ.name}</Text>
            <Text style={{ color: occ.subColor, fontFamily: F.semi, fontSize: 13, textAlign: "center" }}>{occ.greeting}</Text>
          </View>
          <View style={{ paddingVertical: 8, paddingHorizontal: 8, backgroundColor: occ.secondBg + "AA" }}>
            <Text style={{ fontSize: 18, textAlign: "center", letterSpacing: 6, opacity: 0.7 }}>{occ.decorRow}</Text>
          </View>
          <View style={{ height: 3, backgroundColor: occ.textColor + "55" }} />
        </View>
      )}
      <Animated.View style={bannerStyle} onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > bannerH.value) bannerH.value = h; }}>
        <BannerCarousel banners={banners} />
      </Animated.View>
      {favItems.length > 0 && (
        <View style={{ paddingBottom: 4 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 16 }}>❤️ {isEn ? "Favourites" : "المفضلة"}</Text>
            <Text style={{ color: "#9A7A5A", fontFamily: F.semi, fontSize: 12 }}>({favItems.length})</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 12, gap: 10, flexDirection: "row-reverse" }}>
            {favItems.map((item) => (
              <View key={`fav-${item.id}`} style={{ width: 130, backgroundColor: "#1A0D05", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#C8171A33" }}>
                <View style={{ padding: 8, gap: 4 }}>
                  <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 12, textAlign: "right" }} numberOfLines={2}>{isEn && item.nameEn ? item.nameEn : item.name}</Text>
                  <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 14, textAlign: "right" }}>
                    {item.price} <Text style={{ fontSize: 10, fontFamily: F.regular, color: "#9A7A5A" }}>{isEn ? "SAR" : "ر.س"}</Text>
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      {availableCombos.length > 0 && (
        <View style={{ paddingBottom: 8 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <Text style={{ color: "#82B1FF", fontFamily: F.extra, fontSize: 16 }}>🎁 {isEn ? "Meal Combos" : "الوجبات المجمعة"}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 12, gap: 10, flexDirection: "row-reverse" }}>
            {availableCombos.map((combo) => (
              <View key={`combo-${combo.comboId}`} style={{ width: 200, backgroundColor: "#0F1A2A", borderRadius: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: "#82B1FF33" }}>
                <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 14, textAlign: "right" }} numberOfLines={2}>{combo.name}</Text>
                <View style={{ gap: 3 }}>
                  {combo.components.map((comp, i) => (
                    <Text key={i} style={{ color: "#82B1FF99", fontFamily: F.regular, fontSize: 11, textAlign: "right" }}>{"×" + comp.quantity + " " + comp.name}</Text>
                  ))}
                </View>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={{ color: "#FFD700", fontFamily: F.bold, fontSize: 15 }}>{combo.price.toFixed(2)} ر.س</Text>
                  <TouchableOpacity
                    onPress={() => addItem({ id: `combo-${combo.comboId}`, name: combo.name, price: combo.price, category: "combo", description: combo.components.map(c => `×${c.quantity} ${c.name}`).join(" | "), imageUrl: combo.imageUrl ?? undefined })}
                    style={{ backgroundColor: "#82B1FF22", borderWidth: 1, borderColor: "#82B1FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row-reverse", alignItems: "center", gap: 4 }}
                  >
                    <Feather name="plus" size={14} color="#82B1FF" />
                    <Text style={{ color: "#82B1FF", fontFamily: F.bold, fontSize: 12 }}>{isEn ? "Add" : "أضف"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [occasionId, banners, favItems, availableCombos, isEn, addItem, bannerStyle, bannerH, occ]);

  // ── Memoised FlashList data — anchors + sticky headers + rows ──────────
  // No ReactNodes here — only plain data objects. FlashList recycles views
  // exactly like RecyclerView, rendering only what is visible.
  const { menuData, menuStickyHeaders } = useMemo(() => {
    const data: MenuListItem[] = [];
    const stickyHeaderIndices: number[] = [];

    // ── Sections: anchor → sticky header → item rows ─────────────
    // IMPORTANT: onLayout lives on the NON-sticky anchor, not the sticky
    // header. Sticky headers are repositioned by the native layer which
    // fires onLayout with the wrong (sticky) Y, corrupting sectionYs.
    for (const section of sections) {
      data.push({ _t: "anchor", sectionId: section.id });
      stickyHeaderIndices.push(data.length); // next item will be the header
      data.push({ _t: "head", section });
      for (const item of section.data) {
        data.push({ _t: "row", item });
      }
    }

    return { menuData: data, menuStickyHeaders: stickyHeaderIndices };
  }, [sections]);

  // ── Pre-compute approximate section Y positions ───────────────────────
  // FlashList virtualises off-screen items, so onLayout on anchor views won't
  // fire until that row is scrolled into view.  Pre-seeding sectionYs with
  // estimates lets tab-press scrolling work immediately; actual onLayout
  // callbacks will correct the values once each section is rendered.
  useEffect(() => {
    const TOP_ESTIMATE = listHeaderH.current > 10 ? listHeaderH.current : 260;
    let y = TOP_ESTIMATE;
    for (const section of sections) {
      sectionYs.current[section.id] = y;
      y += 6;   // anchor height
      y += 44;  // section header height
      y += section.data.length * 96; // ~96 px per row (no image)
    }
  }, [sections]);

  const handleSelectItem = useCallback((item: RawMenuItem) => setSelectedItem(item), []);
  const handleCloseDetail = useCallback(() => setSelectedItem(null), []);

  // ── renderItem for FlashList ─────────────────────────────────────────
  const renderMenuListItem = useCallback(({ item }: { item: MenuListItem }) => {
    if (item._t === "anchor") {
      return (
        <View
          style={{ height: 6 }}
          onLayout={(e) => { sectionYs.current[item.sectionId] = e.nativeEvent.layout.y; }}
        />
      );
    }
    if (item._t === "head") {
      const s = item.section;
      return (
        <View style={[styles.sectionRow, { backgroundColor: colors.background, borderBottomColor: colors.border, borderTopColor: colors.border }]}>
          <Text style={[styles.itemCount, { color: colors.mutedForeground, fontFamily: F.semi }]}>
            {s.count} {isEn ? "items" : "أصناف"}
          </Text>
          <View style={styles.sectionTitle}>
            <Text style={[styles.sectionName, { color: colors.foreground, fontFamily: F.extra }]}>{s.name}</Text>
            <Text style={styles.sectionIcon}>{s.icon}</Text>
          </View>
        </View>
      );
    }
    // _t === "row"
    return (
      <MenuItemRow
        item={item.item}
        quantity={qtyMapRef.current.get(item.item.id) ?? 0}
        onSelect={handleSelectItem}
        isEn={isEn}
        whatsapp={info.whatsapp}
        isFavoriteFn={isFavoriteFn}
        onToggleFav={toggleFavorite}
      />
    );
  }, [colors, isEn, handleSelectItem, info.whatsapp, isFavoriteFn, toggleFavorite, qtyMapRef]);

  const menuKeyExtractor = useCallback((item: MenuListItem) => {
    if (item._t === "anchor") return `a-${item.sectionId}`;
    if (item._t === "head")   return `h-${item.section.id}`;
    return `r-${item.item.id}`;
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isLight ? "dark-content" : "light-content"} backgroundColor={colors.background} />

      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: topInset, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Animated.View style={headerTopStyle}>
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 10) collapsibleH.value = h;
            }}
          >

          {/* Row 1: Greeting + icons */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 }}>
            {/* Left: action icons */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={handleLogoTap}
                style={[styles.iconBtn, { backgroundColor: colors.isLight ? "#EDE0CE" : "#2A1508" }]}
              >
                <Feather name="monitor" size={18} color={colors.gold} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: colors.isLight ? "#EDE0CE" : "#2A1508" }]}
                onPress={() => menuFlashListRef.current?.scrollToOffset({ offset: 0, animated: true })}
              >
                <Feather name="heart" size={18} color={colors.gold} />
              </TouchableOpacity>
            </View>
            {/* Right: greeting */}
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: F.extra, fontSize: 17, color: colors.foreground }}>
                مرحباً، {user?.name ? user.name.split(" ")[0] : "زائر"} 👋
              </Text>
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                {timeGreeting}
              </Text>
            </View>
          </View>

          {/* Row 2: Search bar */}
          <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 8, marginBottom: 8, backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: searchQuery ? colors.primary : colors.border, paddingHorizontal: 14, paddingVertical: 10 }}>
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} style={{ marginLeft: 4 }}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            <TextInput
              style={{ flex: 1, fontFamily: F.regular, fontSize: 14, color: colors.foreground, textAlign: "right", marginRight: 8, paddingVertical: 0 }}
              placeholder="ابحث عن صنف..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Feather name="search" size={16} color={searchQuery ? colors.primary : colors.mutedForeground} />
          </View>
          </View>{/* end measure wrapper */}
        </Animated.View>

        {/* ── CATEGORY TABS ── */}
        <ScrollView
          ref={tabsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          style={styles.tabsScroll}
        >
          {categories.filter((c) => !c.isOccasions).map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => handleTabPress(cat.id)}
                onLayout={(e) => { tabPositions.current[cat.id] = e.nativeEvent.layout.x; }}
                activeOpacity={0.75}
                style={[
                  styles.tab,
                  active
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.isLight ? "#EDE0CE" : "#1A1008", borderColor: colors.isLight ? "#D4C4A8" : "#3A2410" },
                ]}
              >
                <Text style={styles.tabIcon}>{cat.icon}</Text>
                <Text style={[styles.tabLabel, { color: active ? "#fff" : colors.mutedForeground, fontFamily: F.bold }]}>
                  {isEn ? (cat.nameEn ?? cat.name) : cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── CONTENT ── */}
      {searchResults.length > 0 || (searchQuery.trim().length >= 1 && searchResults.length === 0) ? (
        /* ── SEARCH RESULTS ── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 130, gap: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {searchResults.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 16, color: colors.mutedForeground, textAlign: "center" }}>
                لا توجد نتائج لـ "{searchQuery}"
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontFamily: F.semi, fontSize: 13, color: colors.mutedForeground, textAlign: "right", marginBottom: 4 }}>
                {searchResults.length} نتيجة
              </Text>
              {searchResults.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  quantity={qtyMap.get(item.id) ?? 0}
                  onPress={() => handleSelectItem(item)}
                  isEn={isEn}
                  isFavorite={isFavoriteFn(item.id)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                  whatsapp={info.whatsapp}
                />
              ))}
            </>
          )}
        </ScrollView>
      ) : specialCat?.isDelivery ? (
        /* ── DELIVERY SECTION ── */
        <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} onScroll={scrollHandler} scrollEventThrottle={100} decelerationRate="fast" overScrollMode="never">
          <BannerCarousel banners={banners} />
          <View style={[styles.deliveryCard, { backgroundColor: colors.card, borderColor: colors.gold }]}>
            <Image source={deliveryCar} style={styles.carImage} contentFit="cover" />
            <View style={[styles.deliveryOverlay, { backgroundColor: "#0F0A05EE" }]}>
              <Text style={[styles.deliveryTitle, { color: colors.gold, fontFamily: F.extra }]}>
                {isEn ? "Delivery Service" : "خدمة التوصيل"}
              </Text>
              <Text style={[styles.deliverySubtitle, { color: colors.foreground, fontFamily: F.bold }]}>
                {isEn ? "We deliver to your door" : "نوصل طلبك لباب بيتك"}
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL("https://maps.app.goo.gl/DiAZzzLKBAmGNv19A")}>
                <Text style={[styles.deliveryLocation, { color: colors.mutedForeground, fontFamily: F.semi }]}>
                  📍 {isEn ? info.locationEn : info.deliveryArea}
                </Text>
              </TouchableOpacity>
              <View style={styles.deliveryBtns}>
                <TouchableOpacity
                  onPress={() => handleWhatsApp(isEn ? "Hello, I would like to order delivery" : "السلام عليكم، أرغب في طلب توصيل")}
                  style={[styles.deliveryBtn, { backgroundColor: "#1DBF47" }]}
                >
                  <Feather name="message-circle" size={18} color="#fff" />
                  <Text style={[styles.deliveryBtnText, { fontFamily: F.bold }]}>
                    {isEn ? "Order via WhatsApp" : "اطلب توصيل واتساب"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCall}
                  style={[styles.deliveryBtn, { backgroundColor: colors.primary }]}
                >
                  <Feather name="phone" size={18} color="#fff" />
                  <Text style={[styles.deliveryBtnText, { fontFamily: F.bold }]}>{info.phone}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.ScrollView>
      ) : specialCat?.isDhabiha ? (
        /* ── DHABIHA SECTION ── */
        <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} onScroll={scrollHandler} scrollEventThrottle={100} decelerationRate="fast" overScrollMode="never">
          <BannerCarousel banners={banners} />
          <View style={[styles.dhabihaHero, { borderColor: "#E8920C" }]}>
            <Image source={dhabihaPoster} style={styles.dhabihaImg} contentFit="cover" />
          </View>

          {activeCat.items.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              quantity={qtyMap.get(item.id) ?? 0}
              onPress={() => handleSelectItem(item)}
              isEn={isEn}
              isFavorite={isFavoriteFn(item.id)}
              onToggleFavorite={() => toggleFavorite(item.id)}
              whatsapp={info.whatsapp}
            />
          ))}

          <View style={[styles.bookBox, { backgroundColor: "#1F130A", borderColor: "#E8920C" }]}>
            <Text style={[styles.bookTitle, { color: colors.gold, fontFamily: F.extra }]}>
              {isEn ? "Book a Whole Animal" : "حجز الذبائح"}
            </Text>
            <Text style={[styles.bookDesc, { color: colors.mutedForeground, fontFamily: F.regular }]}>
              {isEn ? "Contact us for reservations and pricing" : "للحجز والاستفسار عن الأسعار تواصل معنا على الرقم المخصص"}
            </Text>
            <View style={[styles.dhabihaPhoneRow, { borderColor: colors.gold }]}>
              <Feather name="phone" size={16} color={colors.gold} />
              <Text style={[styles.dhabihaPhoneNum, { color: colors.gold, fontFamily: F.extra }]}>
                {info.dhabihaPhone}
              </Text>
            </View>
            <View style={styles.bookBtns}>
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://wa.me/${info.dhabihaWhatsapp}?text=${encodeURIComponent(isEn ? "Hello, I would like to inquire about a whole animal reservation and pricing" : "السلام عليكم، أرغب في حجز ذبيحة والاستفسار عن الأسعار")}`)}
                style={[styles.bookBtn, { backgroundColor: "#1DBF47" }]}
              >
                <Feather name="message-circle" size={16} color="#fff" />
                <Text style={[styles.bookBtnText, { fontFamily: F.bold }]}>{isEn ? "WhatsApp" : "واتساب"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${info.dhabihaPhone}`)}
                style={[styles.bookBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="phone" size={16} color="#fff" />
                <Text style={[styles.bookBtnText, { fontFamily: F.bold }]}>{isEn ? "Call Now" : "اتصل الآن"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.ScrollView>
      ) : specialCat?.isOccasions ? (
        /* ── OCCASIONS SECTION ── */
        <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} onScroll={scrollHandler} scrollEventThrottle={100} decelerationRate="fast" overScrollMode="never">
          <BannerCarousel banners={banners} />
          <View style={[styles.occasionsHeader, { backgroundColor: "#1A0D00", borderColor: colors.gold }]}>
            <Text style={[styles.occasionsTitle, { color: colors.gold, fontFamily: F.extra }]}>
              🎉 {isEn ? "Special Offers" : "عروض المناسبات"}
            </Text>
            <Text style={[styles.occasionsSub, { color: colors.mutedForeground, fontFamily: F.semi }]}>
              {isEn ? "Special deals for every occasion — contact us for details" : "عروض خاصة لكل مناسبة — تواصل معنا لمعرفة التفاصيل"}
            </Text>
          </View>

          {occasions.map((occ) => (
            <TouchableOpacity
              key={occ.occasionId}
              activeOpacity={0.85}
              onPress={() => handleWhatsApp(isEn ? `Hello, I would like to inquire about: ${occ.name}` : `السلام عليكم، أرغب في الاستفسار عن: ${occ.name}`)}
              style={[styles.occasionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.occasionOverlay, { backgroundColor: "#0F0A05CC" }]}>
                <View style={[styles.occasionBadge, { backgroundColor: colors.gold }]}>
                  <Text style={[styles.occasionBadgeText, { fontFamily: F.bold }]}>
                    {isEn ? "Special Offer" : "عرض خاص"}
                  </Text>
                </View>
                <Text style={[styles.occasionName, { color: "#FFFFFF", fontFamily: F.extra }]}>{occ.name}</Text>
                {occ.description ? (
                  <Text style={[styles.occasionDesc, { color: "#FFFFFF99", fontFamily: F.semi }]}>{occ.description}</Text>
                ) : null}
                <View style={[styles.occasionBtn, { backgroundColor: "#1DBF47" }]}>
                  <Feather name="message-circle" size={15} color="#fff" />
                  <Text style={[styles.occasionBtnText, { fontFamily: F.bold }]}>
                    {isEn ? "Inquire via WhatsApp" : "استفسر عبر واتساب"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </Animated.ScrollView>
      ) : menuLoading ? (
        /* ── LOADING SKELETON — shown while fresh menu data is fetched ── */
        /* Prevents stale cached data (e.g. deleted items) from flashing   */
        <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 10 }}>
          {[90, 90, 90, 90, 90, 70].map((h, i) => (
            <View
              key={i}
              style={{
                height: h,
                borderRadius: 16,
                backgroundColor: colors.card,
                marginBottom: 10,
                opacity: 0.55,
              }}
            />
          ))}
        </View>
      ) : (
        /* ── REGULAR MENU — FlashList (RecyclerView virtualization) ── */
        <View
          style={{ flex: 1 }}
          onLayout={(e) => { scrollViewportH.value = e.nativeEvent.layout.height; }}
        >
          <AnimatedFlashList
            ref={menuFlashListRef}
            data={menuData}
            renderItem={renderMenuListItem}
            keyExtractor={menuKeyExtractor}
            extraData={qtyMap}
            estimatedItemSize={96}
            stickyHeaderIndices={menuStickyHeaders}
            ListHeaderComponent={renderHeader}
            ListFooterComponent={<View style={{ height: Platform.OS === "web" ? 130 : 110 }} />}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            decelerationRate="fast"
            overScrollMode="never"
            keyboardDismissMode="on-drag"
            onContentSizeChange={(_: number, h: number) => { scrollContentH.value = h; }}
          />

          {/* Left scroll indicator — runs on UI thread, zero lag */}
          <View pointerEvents="none" style={styles.scrollTrack}>
            <Animated.View style={[styles.scrollThumb, scrollThumbStyle]} />
          </View>
        </View>

      )}

      <CartBar />

      {/* ── Single shared product detail sheet (replaces per-item modals) ── */}
      {selectedItem && (
        <ProductDetailSheet
          item={selectedItem}
          menuItems={allMenuItems}
          visible={!!selectedItem}
          onClose={handleCloseDetail}
        />
      )}

      {/* ── Staff picker modal ── */}
      <Modal
        visible={showStaffPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStaffPicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowStaffPicker(false)}
        >
          <View style={{ backgroundColor: "#1A1008", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, paddingBottom: Platform.OS === "web" ? 24 : 40 }}>
            <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 16, textAlign: "center", marginBottom: 4 }}>
              دخول الموظفين
            </Text>

            <TouchableOpacity
              onPress={() => { setShowStaffPicker(false); router.push("/cashier"); }}
              style={{ backgroundColor: "#2A1A08", borderRadius: 16, padding: 18, flexDirection: "row-reverse", alignItems: "center", gap: 14, borderWidth: 1, borderColor: "#E8920C44" }}
              activeOpacity={0.8}
            >
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#3A2208", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#E8920C" }}>
                <Feather name="monitor" size={22} color="#E8920C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontFamily: F.extra, fontSize: 17 }}>الكاشير</Text>
                <Text style={{ color: "#9E8060", fontFamily: F.regular, fontSize: 13, marginTop: 2 }}>استقبال الطلبات وإدارة المبيعات</Text>
              </View>
              <Feather name="chevron-left" size={18} color="#9E8060" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setShowStaffPicker(false); router.push("/mandoob"); }}
              style={{ backgroundColor: "#0A1F0A", borderRadius: 16, padding: 18, flexDirection: "row-reverse", alignItems: "center", gap: 14, borderWidth: 1, borderColor: "#4CAF5044" }}
              activeOpacity={0.8}
            >
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#122012", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#4CAF50" }}>
                <Text style={{ fontSize: 24 }}>🛵</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontFamily: F.extra, fontSize: 17 }}>المندوب</Text>
                <Text style={{ color: "#5A8A5A", fontFamily: F.regular, fontSize: 13, marginTop: 2 }}>استلام الطلبات وتوصيلها للعملاء</Text>
              </View>
              <Feather name="chevron-left" size={18} color="#5A8A5A" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowStaffPicker(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: "#9E8060", fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsScroll: { paddingBottom: 14 },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
    marginLeft: 4,
  },
  tabIcon: { fontSize: 15, fontFamily: Platform.OS === "web" ? "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif" : undefined },
  tabLabel: { fontSize: 13 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 0,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionName: { fontSize: 20 },
  sectionIcon: { fontSize: 22, fontFamily: Platform.OS === "web" ? "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif" : undefined },
  itemCount: { fontSize: 12 },
  list: { padding: 14 },

  /* Delivery */
  deliveryCard: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1.5,
    marginBottom: 16,
  },
  carImage: { width: "100%", height: 200 },
  deliveryOverlay: {
    padding: 20,
    gap: 10,
  },
  deliveryTitle: { fontSize: 26, textAlign: "right" },
  deliverySubtitle: { fontSize: 16, textAlign: "right" },
  deliveryLocation: { fontSize: 14, textAlign: "right", marginBottom: 6 },
  deliveryBtns: { gap: 10, marginTop: 6 },
  deliveryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  deliveryBtnText: { color: "#fff", fontSize: 16 },

  /* Dhabiha */
  dhabihaHero: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    marginBottom: 14,
  },
  dhabihaImg: {
    width: "100%",
    height: 480,
  },
  dhabihaOverlay: {
    padding: 18,
    gap: 6,
    alignItems: "flex-end",
  },
  dhabihaTagBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dhabihaTagText: { color: "#fff", fontSize: 13 },
  dhabihaHeroTitle: { fontSize: 22, textAlign: "right" },
  dhabihaHeroSub: { fontSize: 15, textAlign: "right" },
  bookBox: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    gap: 8,
    marginTop: 6,
    alignItems: "flex-end",
  },
  bookTitle: { fontSize: 20 },
  bookDesc: { fontSize: 14, textAlign: "right", lineHeight: 22 },
  dhabihaPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: "flex-end",
    marginVertical: 4,
  },
  dhabihaPhoneNum: { fontSize: 18, letterSpacing: 1 },
  bookBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    width: "100%",
  },
  bookBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  bookBtnText: { color: "#fff", fontSize: 15 },

  /* Occasions */
  occasionsHeader: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    alignItems: "center",
    marginBottom: 14,
    gap: 6,
  },
  occasionsTitle: { fontSize: 22, textAlign: "center" },
  occasionsSub: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  occasionCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
    height: 200,
  },
  occasionImg: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  occasionOverlay: {
    flex: 1,
    padding: 16,
    justifyContent: "flex-end",
    gap: 6,
    alignItems: "flex-end",
  },
  occasionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  occasionBadgeText: { color: "#0F0A05", fontSize: 11 },
  occasionName: { fontSize: 18, textAlign: "right" },
  occasionDesc: { fontSize: 13, textAlign: "right" },
  occasionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  occasionBtnText: { color: "#fff", fontSize: 13 },

  scrollTrack: {
    position: "absolute",
    left: 3,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  scrollThumb: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#E8920C",
  },
});
