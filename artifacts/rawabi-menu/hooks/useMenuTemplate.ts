import { useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import { apiGet } from "@/constants/api";
import { useAppConfig } from "@/context/AppConfigContext";

export type MenuTemplate = "classic" | "modern";

export function useMenuTemplate() {
  const { config, loaded, update } = useAppConfig();

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<{ menuTemplate: MenuTemplate }>("/settings/menu-template");
      await update({ menuTemplate: result.menuTemplate === "modern" ? "modern" : "classic" });
    } catch {
      // Keep the last known value; DEFAULT_CONFIG remains classic.
    }
  }, [update]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { menuTemplate: config.menuTemplate, loading: !loaded, refresh };
}