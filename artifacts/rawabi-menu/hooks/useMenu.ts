import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet } from "@/constants/api";
import { MENU_CATEGORIES, FOOD_IMAGES, type MenuItem } from "@/constants/menu";

// ── Cache key (unchanged — backward compatible) ─────────────────────────────
const MENU_CACHE_KEY   = "@rawabi_menu_cache_v3";
const OFFLINE_RETRY_MS = 30_000; // retry every 30 s while offline

interface MenuCache {
  items:     ApiMenuItem[];
  categories?: ApiMenuCategory[];
  savedAt:   number;
  dataHash?: string; // lightweight freshness signature added in v2
}

// ── Interfaces (unchanged) ──────────────────────────────────────────────────

export interface ApiMenuItemSize {
  name:    string;
  price:   number;
  enabled: boolean;
}

export interface ApiMenuItemOptionChoice {
  name:       string;
  extraPrice: number;
  available:  boolean;
}

export interface ApiMenuItemOptionGroup {
  groupName: string;
  required:  boolean;
  choices:   ApiMenuItemOptionChoice[];
}

export interface ApiMenuItemSimpleChoice {
  name:       string;
  extraPrice: number;
  available:  boolean;
}

export interface ApiMenuItem {
  id:             number;
  itemId:         string;
  name:           string;
  nameEn:         string | null;
  category:       string;
  price:          number;
  available:      boolean;
  imageKey:       string | null;
  imageUrl:       string | null;
  stock:          number | null;
  sizes:          ApiMenuItemSize[];
  options:        ApiMenuItemOptionGroup[];
  riceTypes:      ApiMenuItemSimpleChoice[];
  additions:      ApiMenuItemSimpleChoice[];
  calories:       number | null;
  walkingMinutes: number | null;
  sortOrder:      number;
  createdAt:      string;
}

export interface MenuCategoryWithApi {
  id:            string;
  name:          string;
  nameEn:        string;
  icon:          string;
  isDelivery?:   boolean;
  isDhabiha?:    boolean;
  isOccasions?:  boolean;
  items: (MenuItem & { available: boolean; nameEn?: string; stock?: number | null })[];
}

export interface ApiMenuCategory {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  isCustom?: boolean;
}

// ── Category metadata (unchanged) ──────────────────────────────────────────

const CATEGORY_META: Record<string, { name: string; nameEn: string; icon: string; isDelivery?: boolean; isDhabiha?: boolean; isOccasions?: boolean }> = {
  chicken:  { name: "الدجاج",              nameEn: "Chicken",        icon: "🍗" },
  meat:     { name: "اللحوم",              nameEn: "Meat",           icon: "🥩" },
  mains:    { name: "الأطباق الرئيسية",    nameEn: "Main Dishes",    icon: "🍽️" },
  sides:    { name: "الإيدامات",           nameEn: "Sides",          icon: "🥘" },
  salads:   { name: "السلطات",             nameEn: "Salads",         icon: "🥗" },
  desserts: { name: "الحلويات",            nameEn: "Desserts",       icon: "🍮" },
  drinks:   { name: "المشروبات",           nameEn: "Drinks",         icon: "🥤" },
  extras:   { name: "إضافات",              nameEn: "Extras",         icon: "✨" },
};

// ── Helpers (unchanged) ─────────────────────────────────────────────────────

function buildCategories(apiItems: ApiMenuItem[], apiCategories?: ApiMenuCategory[]): MenuCategoryWithApi[] {
  const categoryMap = new Map<string, (MenuItem & { available: boolean; nameEn?: string })[]>();

  for (const item of apiItems) {
    const existing = categoryMap.get(item.category) ?? [];
    existing.push({
      id:            item.itemId,
      name:          item.name,
      nameEn:        item.nameEn ?? undefined,
      price:         item.price / 100,
      category:      item.category,
      imageKey:      item.imageKey ?? undefined,
      imageUrl:      item.imageUrl ?? undefined,
      available:     item.available,
      stock:         item.stock,
      sizes:         (item.sizes ?? []).map(s => ({ ...s, price: s.price / 100 })),
      options:       (item.options ?? []).map(g => ({
        ...g,
        choices: g.choices.map(c => ({ ...c, extraPrice: c.extraPrice / 100 })),
      })),
      riceTypes:     (item.riceTypes ?? []).map(r => ({ ...r, extraPrice: r.extraPrice / 100 })),
      additions:     (item.additions ?? []).map(a => ({ ...a, extraPrice: a.extraPrice / 100 })),
      calories:      item.calories ?? undefined,
      walkingMinutes: item.walkingMinutes ?? undefined,
    });
    categoryMap.set(item.category, existing);
  }

  const result: MenuCategoryWithApi[] = [];
  const configuredCategories: ApiMenuCategory[] = apiCategories?.length
    ? apiCategories
    : Object.entries(CATEGORY_META).map(([id, meta]) => ({ id, ...meta }));
  const configuredIds = new Set(configuredCategories.map(category => category.id));

  for (const category of configuredCategories) {
    const items = categoryMap.get(category.id) ?? [];
    // Preserve the old behavior for empty built-in sections, while allowing a
    // newly created custom section to appear before its first item is added.
    if (items.length === 0 && !category.isCustom) continue;
    result.push({
      id: category.id,
      name: category.name,
      nameEn: category.nameEn,
      icon: category.icon,
      items,
    });
  }

  // Keep any legacy category that exists in menu_items but is not yet present
  // in the saved category configuration.
  for (const [catId, items] of categoryMap.entries()) {
    if (configuredIds.has(catId)) continue;
    const meta = CATEGORY_META[catId] ?? { name: catId, nameEn: catId, icon: "🍽️" };
    result.push({ id: catId, ...meta, items });
  }

  const staticSpecial = MENU_CATEGORIES.filter(
    (c) => c.isDelivery || c.isDhabiha || c.isOccasions
  ).map((c) => ({
    ...c,
    nameEn: c.nameEn ?? c.name,
    items:  c.items.map((i) => ({ ...i, available: true })),
  })) as MenuCategoryWithApi[];

  return [...result, ...staticSpecial];
}

const staticFallback = (): MenuCategoryWithApi[] =>
  MENU_CATEGORIES.map((c) => ({
    ...c,
    nameEn: c.nameEn ?? c.name,
    items:  c.items.map((i) => ({ ...i, available: true })),
  })) as MenuCategoryWithApi[];

// ── Lightweight freshness hash ───────────────────────────────────────────────
// Covers every field the customer can see: name, price, availability, image, order.
// Changing any of these in the dashboard produces a different hash → UI updates.
function computeHash(items: ApiMenuItem[], categories: ApiMenuCategory[] = []): string {
  const sorted = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId));
  let h = 5381;
  for (const it of sorted) {
    const sig = [
      it.itemId,
      it.price,
      it.available ? 1 : 0,
      it.name,
      it.imageUrl ?? "",
      it.sortOrder,
      it.stock ?? "",
      JSON.stringify(it.sizes ?? []),
      JSON.stringify(it.options ?? []),
      JSON.stringify(it.riceTypes ?? []),
      JSON.stringify(it.additions ?? []),
    ].join("|");
    for (let i = 0; i < sig.length; i++) {
      h = (Math.imul(31, h) + sig.charCodeAt(i)) | 0;
    }
  }
  for (const category of categories) {
    const sig = `${category.id}|${category.name}|${category.nameEn}|${category.icon}`;
    for (let i = 0; i < sig.length; i++) {
      h = (Math.imul(31, h) + sig.charCodeAt(i)) | 0;
    }
  }
  return String(h >>> 0);
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMenu() {
  const [categories, setCategories] = useState<MenuCategoryWithApi[]>([]);
  const [loading, setLoading]       = useState(true);
  const [apiItems, setApiItems]     = useState<ApiMenuItem[]>([]);

  // Hash of the data currently rendered — used to skip no-op re-renders
  const lastHashRef = useRef<string | null>(null);
  // Retry timer when offline
  const retryRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRetry = useCallback(() => {
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
  }, []);

  /**
   * Fetch fresh menu from the server.
   * - On success: updates state only if data changed (hash mismatch), persists cache, stops retry.
   * - On failure: returns false — caller decides fallback behaviour.
   */
  const doFetch = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<ApiMenuItem[]>("/menu");
      const categoryData = await apiGet<ApiMenuCategory[]>("/menu-categories").catch(() => undefined);
      const hash = computeHash(data, categoryData);

      if (hash !== lastHashRef.current) {
        // Something changed (price, name, availability, image, new/removed item)
        lastHashRef.current = hash;
        setApiItems(data);
        setCategories(buildCategories(data, categoryData));
      }

      // Always overwrite cache so savedAt stays current
      const cache: MenuCache = { items: data, categories: categoryData, savedAt: Date.now(), dataHash: hash };
      AsyncStorage.setItem(MENU_CACHE_KEY, JSON.stringify(cache)).catch(() => {});

      stopRetry(); // we're online — cancel any retry loop
      return true;
    } catch {
      return false; // offline or server error
    }
  }, [stopRetry]);

  // ── Mount: stale-while-revalidate ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    (async () => {
      // Step 1 — Hydrate from AsyncStorage immediately so the screen is never blank
      try {
        const raw = await AsyncStorage.getItem(MENU_CACHE_KEY);
        if (alive && raw) {
          const { items, categories: cachedCategories, dataHash } = JSON.parse(raw) as MenuCache;
          if (items?.length > 0) {
            lastHashRef.current = dataHash ?? computeHash(items, cachedCategories);
            setApiItems(items);
            setCategories(buildCategories(items, cachedCategories));
            setLoading(false); // show cached menu right away
          }
        }
      } catch { /* storage error — continue to network fetch */ }

      // Step 2 — Always fetch fresh data in the background
      if (!alive) return;
      const online = await doFetch();
      if (!alive) return;

      if (!online) {
        // Offline: keep whatever is displayed; schedule periodic retries
        retryRef.current = setInterval(() => { doFetch(); }, OFFLINE_RETRY_MS);
        // If cache was empty, show static bundle so menu is never blank
        setCategories(prev => prev.length > 0 ? prev : staticFallback());
      }

      setLoading(false); // clear spinner in all cases
    })();

    return () => {
      alive = false;
      stopRetry();
    };
  // doFetch and stopRetry are stable (useCallback with no changing deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Foreground: re-fetch when app becomes active (covers network-restored) ─
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") doFetch(); // always network-first, no TTL gate
    });
    return () => sub.remove();
  }, [doFetch]);

  return { categories, loading, refresh: doFetch, refreshIfStale: doFetch, apiItems, FOOD_IMAGES };
}
