import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

/** Used only for initial loading and failed refreshes, never a false empty result. */
export default function MenuLoadStatus({
  loading, isEn, onRetry,
}: { loading: boolean; isEn: boolean; onRetry: () => unknown }) {
  const colors = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={{ padding: 16, gap: 12 }}>
      {loading ? (
        <>
          <ActivityIndicator color={colors.primary} />
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={{ height: 86, borderRadius: 12, backgroundColor: colors.secondary }} />
          ))}
        </>
      ) : (
        <TouchableOpacity onPress={() => { onRetry(); }} style={{ padding: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Cairo_600SemiBold", textAlign: "center" }}>
            {isEn
              ? "Could not refresh. Saved items may have changed. Tap to retry."
              : "تعذر التحديث. الأصناف المحفوظة قد تتغير أسعارها أو توفرها. اضغط لإعادة المحاولة."}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
