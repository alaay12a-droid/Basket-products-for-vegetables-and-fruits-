import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet, STORAGE_BASE_URL } from "@/constants/api";
import { FOOD_IMAGES, type MenuItem } from "@/constants/menu";

const OFFLINE_RETRY_MS = 30_000; // retry every 30 s while offline
// Never reuse the old, unscoped restaurant caches.
const MENU_CACHE_KEY = `@basket_menu_v1:${STORAGE_BASE_URL || "web"}`;
const LEGACY_MENU_CACHE_KEYS = [
  "@rawabi_menu_cache_v1",
  "@rawabi_menu_cache_v2",
  "@rawabi_menu_cache_v3",
  "@rawabi_menu_cache_v4",
];

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
  imageUrl?:     string | null;
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
  imageUrl?: string | null;
  isCustom?: boolean;
}

// Category labels are server-owned. Never recreate removed restaurant
// categories from bundled metadata when the category request fails.
const CATEGORY_META: Record<string, { name: string; nameEn: string; icon: string }> = {};

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
      imageUrl: category.imageUrl,
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

  return result;
}

// ── Lightweight freshness hash ───────────────────────────────────────────────
// Covers every field the customer can see: name, price, availability, image, order.
// Changing any of these in the dashboard produces a different hash → UI updates.
function computeHash(items: ApiMenuItem[], categories: ApiMenuCategory[] = []): string {
  const sorted = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId));
  let h = 5381;
  for (const it of sorted) {
    const sig = [
      it.itemId,
      it.category,
      it.nameEn ?? "",
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
    const sig = `${category.id}|${category.name}|${category.nameEn}|${category.icon}|${category.isCustom ?? false}|${category.imageUrl ?? ""}`;
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
  const [offline, setOffline] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<boolean> | null>(null);

  // Hash of the data currently rendered — used to skip no-op re-renders
  const lastHashRef = useRef<string | null>(null);
  // Retry timer when offline
  const retryRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRetry = useCallback(() => {
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
  }, []);

  /**
   * Fetch fresh menu from the server.
   * - On success: updates state only if data changed (hash mismatch), stops retry.
   * - On failure: returns false — caller decides fallback behaviour.
   */
  const doFetch = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // A stalled connection must not leave the first-launch screen loading forever.
      const [data, categoryData] = await Promise.race([
        Promise.all([
          apiGet<ApiMenuItem[]>("/menu"),
          apiGet<ApiMenuCategory[]>("/menu-categories"),
        ]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Menu request timed out")), 15000);
        }),
      ]);
      if (!Array.isArray(data) || !Array.isArray(categoryData)) throw new Error("Invalid menu response");
      if (!mounted.current) return false;
      const hash = computeHash(data, categoryData);

      if (hash !== lastHashRef.current) {
        // Something changed (price, name, availability, image, new/removed item)
        lastHashRef.current = hash;
        setApiItems(data);
        setCategories(buildCategories(data, categoryData));
      }

      setOffline(false);
      setLoading(false);
      // Storage failures must never prevent the live menu from being displayed.
      void AsyncStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ items: data, categories: categoryData }))
        .catch(() => {});
      stopRetry(); // we're online — cancel any retry loop
      return true;
    } catch {
      if (mounted.current) {
        setOffline(true);
        setLoading(false);
        if (!retryRef.current) retryRef.current = setInterval(() => { void doFetch(); }, OFFLINE_RETRY_MS);
      }
      return false; // offline or server error
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    })();
    inFlight.current = request;
    void request.finally(() => { inFlight.current = null; });
    return request;
  }, [stopRetry]);

  // ── Mount: hydrate this server's cache, then revalidate in the background ──
  useEffect(() => {
    let alive = true;
    mounted.current = true;

    (async () => {
      AsyncStorage.multiRemove(LEGACY_MENU_CACHE_KEYS).catch(() => {});
      try {
        const raw = await AsyncStorage.getItem(MENU_CACHE_KEY);
        if (raw && alive && lastHashRef.current === null) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached.items) && Array.isArray(cached.categories)) {
            // Build before committing state so corrupt storage is ignored safely.
            const restored = buildCategories(cached.items, cached.categories);
            const hash = computeHash(cached.items, cached.categories);
            if (lastHashRef.current === null) {
              lastHashRef.current = hash;
              setApiItems(cached.items);
              setCategories(restored);
              setLoading(false);
            }
          }
        }
      } catch { /* Corrupt/unavailable storage: fetch the live menu instead. */ }
      if (!alive) return;
      void doFetch();
    })();

    return () => {
      alive = false;
      mounted.current = false;
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

  return { categories, loading, offline, refresh: doFetch, refreshIfStale: doFetch, apiItems, FOOD_IMAGES };
}
