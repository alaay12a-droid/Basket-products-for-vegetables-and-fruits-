import { useMemo } from "react";
import { useAppConfig, BG_THEMES } from "@/context/AppConfigContext";
import colors from "@/constants/colors";
import { modernTokens } from "@/constants/modernTokens";

export function useColors() {
  const { config, loaded } = useAppConfig();
  const palette = colors.light;

  return useMemo(() => {
    if (!loaded) {
      return {
        ...palette,
        radius: colors.radius,
        isLight: false,
        logoBg: "#1F130A",
        isModern: false,
        success: "#4CAF50",
        successBg: "#1A3A1A",
        danger: "#E57373",
        dangerBg: "#3A1A1A",
        warning: "#E8920C",
        warningBg: "#3A2000",
        info: "#64B5F6",
        infoBg: "#1A2A3A",
        purple: "#CE93D8",
        purpleBg: "#1A1A3A",
      };
    }
    const themeColors = BG_THEMES[config.bgTheme] ?? BG_THEMES["dark-brown"];
    const modern = config.menuTemplate === "modern";
    const produceAccent = config.bgTheme === "light-warm" ? "#237A3B" : config.accentColor;

    if (modern) {
      return {
        ...palette,
        background: modernTokens.colors.background,
        card: modernTokens.colors.card,
        secondary: modernTokens.colors.secondary,
        border: modernTokens.colors.border,
        surface: modernTokens.colors.surface,
        foreground: modernTokens.colors.foreground,
        mutedForeground: modernTokens.colors.mutedForeground,
        primary: modernTokens.colors.primary,
        tint: modernTokens.colors.primary,
        gold: modernTokens.colors.successText,
        accent: modernTokens.colors.successText,
        cardShadow: modernTokens.colors.cardShadow,
        contrastText: modernTokens.colors.contrastText,
        radius: modernTokens.radii.card,
        isLight: true,
        logoBg: config.logoBg,
        isModern: true,
        success: modernTokens.colors.successText,
        successBg: modernTokens.colors.successBg,
        danger: modernTokens.colors.dangerText,
        dangerBg: modernTokens.colors.dangerBg,
        warning: modernTokens.colors.warningText,
        warningBg: modernTokens.colors.warningBg,
        info: modernTokens.colors.blueText,
        infoBg: modernTokens.colors.blueBg,
        purple: modernTokens.colors.purpleText,
        purpleBg: modernTokens.colors.purpleBg,
      };
    }

    return {
      ...palette,
      ...themeColors,
      foreground: themeColors.foreground ?? palette.foreground,
      mutedForeground: themeColors.mutedForeground ?? palette.mutedForeground,
      primary: palette.primary,
      tint: palette.tint,
      gold: produceAccent,
      accent: produceAccent,
      cardShadow: palette.cardShadow,
      radius: colors.radius,
      isLight: themeColors.isLight ?? false,
      logoBg: config.logoBg,
      isModern: false,
      success: "#4CAF50",
      successBg: "#1A3A1A",
      danger: "#E57373",
      dangerBg: "#3A1A1A",
      warning: "#E8920C",
      warningBg: "#3A2000",
      info: "#64B5F6",
      infoBg: "#1A2A3A",
      purple: "#CE93D8",
      purpleBg: "#1A1A3A",
    };
  }, [config, loaded]); // palette is a module constant — always stable
}
