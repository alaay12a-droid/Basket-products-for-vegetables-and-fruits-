import { useMemo } from "react";
import { useAppConfig, BG_THEMES } from "@/context/AppConfigContext";
import colors from "@/constants/colors";

export function useColors() {
  const { config, loaded } = useAppConfig();
  const palette = colors.light;

  return useMemo(() => {
    if (!loaded) {
      return { ...palette, radius: colors.radius, isLight: false, logoBg: "#1F130A" };
    }
    const themeColors = BG_THEMES[config.bgTheme] ?? BG_THEMES["dark-brown"];
    const modern = config.menuTemplate === "modern";
    const modernTheme = themeColors.isLight
      ? {
          background: "#F8FAF7",
          card: "#FFFFFF",
          secondary: "#EAF1EC",
          border: "#DDE7E0",
          surface: "#F0F5F1",
          foreground: "#17231D",
          mutedForeground: "#66736B",
        }
      : themeColors;
    return {
      ...palette,
      ...(modern ? modernTheme : themeColors),
      foreground: (modern ? modernTheme : themeColors).foreground ?? palette.foreground,
      mutedForeground: (modern ? modernTheme : themeColors).mutedForeground ?? palette.mutedForeground,
      primary: modern ? "#0F3D2E" : palette.primary,
      tint: modern ? "#0F3D2E" : palette.tint,
      gold: modern ? "#1E7A44" : config.accentColor,
      accent: modern ? "#1E7A44" : config.accentColor,
      cardShadow: modern ? "rgba(15, 61, 46, 0.14)" : palette.cardShadow,
      radius: colors.radius,
      isLight: themeColors.isLight ?? false,
      logoBg: config.logoBg,
    };
  }, [config, loaded]); // palette is a module constant — always stable
}
