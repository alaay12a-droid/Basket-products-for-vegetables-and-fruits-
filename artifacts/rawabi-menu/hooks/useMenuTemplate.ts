import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { apiGet } from "@/constants/api";

export type MenuTemplate = "classic" | "modern";

export function useMenuTemplate() {
  const [menuTemplate, setMenuTemplate] = useState<MenuTemplate>("classic");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<{ menuTemplate: MenuTemplate }>("/settings/menu-template");
      setMenuTemplate(result.menuTemplate === "modern" ? "modern" : "classic");
    } catch {
      setMenuTemplate("classic");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { menuTemplate, loading, refresh };
}