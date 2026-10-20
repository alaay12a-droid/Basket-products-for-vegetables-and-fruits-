import { useState, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiGet } from "@/constants/api";

export interface ApiOccasion {
  id: number;
  occasionId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export function useOccasions() {
  const [occasions, setOccasions] = useState<ApiOccasion[]>([]);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const data = await apiGet<ApiOccasion[]>("/occasions");
      if (version === requestVersion.current) {
        setOccasions(data.filter((o) => o.active === true));
      }
    } catch {
      // Never retain an offer whose current activation cannot be verified.
      if (version === requestVersion.current) setOccasions([]);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    const revalidate = () => {
      setOccasions([]);
      setLoading(true);
      void refresh();
    };
    revalidate();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") revalidate();
      else {
        requestVersion.current++;
        setOccasions([]);
        setLoading(true);
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 30_000);
    return () => {
      requestVersion.current++;
      clearInterval(timer);
      subscription.remove();
      setOccasions([]);
      setLoading(true);
    };
  }, [refresh]));

  return { occasions, loading, refresh };
}
