import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet, apiPut } from "@/constants/api";
import { SOUND_KEYS } from "@/constants/appSounds";

const STORAGE_KEY = "@rawabi_app_config_v2";

export type BgThemeKey = "dark-brown" | "dark-gray" | "dark-blue" | "dark-green" | "dark-red" | "dark-purple" | "light" | "light-warm";

export interface BgTheme {
  background: string;
  card: string;
  secondary: string;
  border: string;
  surface: string;
  foreground?: string;
  mutedForeground?: string;
  isLight?: boolean;
}

export const BG_THEMES: Record<BgThemeKey, BgTheme> = {
  "dark-brown": {
    background: "#0F0A05",
    card: "#1A1008",
    secondary: "#2A1A0A",
    border: "#3A2410",
    surface: "#1F130A",
  },
  "dark-gray": {
    background: "#0A0A0A",
    card: "#161616",
    secondary: "#222222",
    border: "#2E2E2E",
    surface: "#121212",
  },
  "dark-blue": {
    background: "#05080F",
    card: "#0A1020",
    secondary: "#0F1830",
    border: "#1A2840",
    surface: "#080D18",
  },
  "dark-green": {
    background: "#050A05",
    card: "#0D180D",
    secondary: "#152015",
    border: "#1E2E1E",
    surface: "#0A120A",
  },
  "dark-red": {
    background: "#0A0505",
    card: "#180A0A",
    secondary: "#2A1010",
    border: "#3A1818",
    surface: "#130808",
  },
  "dark-purple": {
    background: "#080510",
    card: "#120A20",
    secondary: "#1A1030",
    border: "#281840",
    surface: "#0D0818",
  },
  "light": {
    background: "#FFFFFF",
    card: "#F5F5F5",
    secondary: "#EBEBEB",
    border: "#DEDEDE",
    surface: "#F0F0F0",
    foreground: "#1A0A00",
    mutedForeground: "#777777",
    isLight: true,
  },
  "light-warm": {
    background: "#FFF8F0",
    card: "#FFF0E0",
    secondary: "#FFE5CC",
    border: "#E8D0B8",
    surface: "#FAEBD7",
    foreground: "#3A1A00",
    mutedForeground: "#8B6040",
    isLight: true,
  },
};

export const ACCENT_COLORS = [
  { label: "ذهبي",    value: "#E8920C" },
  { label: "عنبري",   value: "#F59E0B" },
  { label: "برتقالي", value: "#F97316" },
  { label: "أخضر",   value: "#22C55E" },
  { label: "أزرق",   value: "#3B82F6" },
  { label: "سماوي",  value: "#06B6D4" },
  { label: "بنفسجي", value: "#A855F7" },
  { label: "وردي",   value: "#EC4899" },
  { label: "أحمر",   value: "#EF4444" },
  { label: "ذهبي كلاسيك", value: "#D4AF37" },
];

export const BG_THEME_META: Record<BgThemeKey, { label: string; preview: string }> = {
  "dark-brown":  { label: "بني داكن",    preview: "#1A1008" },
  "dark-gray":   { label: "رمادي داكن",  preview: "#161616" },
  "dark-blue":   { label: "أزرق داكن",   preview: "#0A1020" },
  "dark-green":  { label: "أخضر داكن",   preview: "#0D180D" },
  "dark-red":    { label: "أحمر داكن",   preview: "#180A0A" },
  "dark-purple": { label: "بنفسجي داكن", preview: "#120A20" },
  "light":       { label: "أبيض",        preview: "#FFFFFF" },
  "light-warm":  { label: "كريمي",       preview: "#FFF8F0" },
};

export interface AppConfig {
  cardPadding: number;
  sectionGap: number;
  itemPaddingV: number;
  borderRadius: number;
  horizontalMargin: number;
  imageSize: number;

  titleSize: number;
  bodySize: number;
  captionSize: number;
  priceSize: number;

  tabHeight: number;
  tabPaddingBottom: number;
  tabFontSize: number;

  accentColor: string;
  bgTheme: BgThemeKey;
  logoBg: string;
  minOrderAmount: number;
  deliveryEnabled: boolean;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  menuTemplate: "classic" | "modern";
}

export const DEFAULT_CONFIG: AppConfig = {
  cardPadding: 16,
  sectionGap: 12,
  itemPaddingV: 14,
  borderRadius: 14,
  horizontalMargin: 16,
  imageSize: 80,

  titleSize: 20,
  bodySize: 15,
  captionSize: 12,
  priceSize: 16,

  tabHeight: 70,
  tabPaddingBottom: 10,
  tabFontSize: 12,

  accentColor: "#E8920C",
  bgTheme: "light-warm",
  logoBg: "#FFFFFF",
  minOrderAmount: 0,
  deliveryEnabled: false,
  deliveryFee: 0,
  freeDeliveryThreshold: 0,
  menuTemplate: "classic",
};

interface AppConfigContextValue {
  config: AppConfig;
  loaded: boolean;
  update: (partial: Partial<AppConfig>) => Promise<void>;
  reset: () => Promise<void>;
}

export const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULT_CONFIG,
  loaded: false,
  update: async () => {},
  reset: async () => {},
});

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      // 1. Load local config (layout/size prefs stay local)
      let local: Partial<AppConfig> = {};
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) local = JSON.parse(raw);
      } catch {}

      // 2. Load appearance (colors + logoBg) from server — overrides local for these keys
      try {
        const remote = await apiGet<{ bgTheme: string; accentColor: string; logoBg: string; minOrderAmount: number; deliveryEnabled: boolean; deliveryFee: number; freeDeliveryThreshold: number }>("/settings/appearance");
        if (remote.bgTheme)                             local.bgTheme                = remote.bgTheme as BgThemeKey;
        if (remote.accentColor)                         local.accentColor            = remote.accentColor;
        if (remote.logoBg)                              local.logoBg                 = remote.logoBg;
        if (remote.minOrderAmount !== undefined)         local.minOrderAmount          = remote.minOrderAmount;
        if (remote.deliveryEnabled !== undefined)        local.deliveryEnabled         = remote.deliveryEnabled;
        if (remote.deliveryFee !== undefined)            local.deliveryFee             = remote.deliveryFee;
        if (remote.freeDeliveryThreshold !== undefined)  local.freeDeliveryThreshold   = remote.freeDeliveryThreshold;
      } catch {}

      try {
        const template = await apiGet<{ menuTemplate: "classic" | "modern" }>("/settings/menu-template");
        local.menuTemplate = template.menuTemplate === "modern" ? "modern" : "classic";
      } catch {}

      // 3. Load global sound settings from server → write into AsyncStorage so useAppSound picks them up
      try {
        const sounds = await apiGet<{
          muted: boolean; order: string; message: string; delivery: string;
          customOrderUrl: string | null; customMessageUrl: string | null; customDeliveryUrl: string | null;
        }>("/settings/sounds");
        await AsyncStorage.setItem(SOUND_KEYS.muted,    String(sounds.muted));
        await AsyncStorage.setItem(SOUND_KEYS.order,    sounds.order);
        await AsyncStorage.setItem(SOUND_KEYS.message,  sounds.message);
        await AsyncStorage.setItem(SOUND_KEYS.delivery, sounds.delivery);
        if (sounds.customOrderUrl)    await AsyncStorage.setItem(SOUND_KEYS.customOrder,   sounds.customOrderUrl);
        if (sounds.customMessageUrl)  await AsyncStorage.setItem(SOUND_KEYS.customMessage, sounds.customMessageUrl);
        if (sounds.customDeliveryUrl) await AsyncStorage.setItem(SOUND_KEYS.customDelivery, sounds.customDeliveryUrl);
      } catch {}

      setConfig({ ...DEFAULT_CONFIG, ...local });
      setLoaded(true);
    };
    load();
  }, []);

  const update = useCallback(async (partial: Partial<AppConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      // Save full config locally
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      // If color/theme/logoBg changed, push to server so all users see it
      if (
        partial.bgTheme !== undefined ||
        partial.accentColor !== undefined ||
        partial.logoBg !== undefined ||
        partial.minOrderAmount !== undefined ||
        partial.deliveryEnabled !== undefined ||
        partial.deliveryFee !== undefined
      ) {
        apiPut("/settings/appearance", {
          bgTheme:         next.bgTheme,
          accentColor:     next.accentColor,
          logoBg:          next.logoBg,
          minOrderAmount:  next.minOrderAmount,
          deliveryEnabled: next.deliveryEnabled,
          deliveryFee:     next.deliveryFee,
        }).catch(() => {});
      }
      return next;
    });
  }, []);

  const reset = useCallback(async () => {
    setConfig(DEFAULT_CONFIG);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    await apiPut("/settings/appearance", {
      bgTheme:     DEFAULT_CONFIG.bgTheme,
      accentColor: DEFAULT_CONFIG.accentColor,
      logoBg:      DEFAULT_CONFIG.logoBg,
    }).catch(() => {});
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, loaded, update, reset }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
