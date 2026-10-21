import React, { useState } from "react";
import { Text } from "react-native";
import { Image } from "expo-image";

export default function CategoryIcon({
  imageUrl, icon, size = 52,
}: { imageUrl?: string | null; icon: string; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return imageUrl && failedUrl !== imageUrl ? (
    <Image
      source={{ uri: imageUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      cachePolicy="disk"
      onError={() => setFailedUrl(imageUrl)}
      accessible={false}
    />
  ) : <Text style={{ fontSize: size > 30 ? 26 : 20 }}>{icon}</Text>;
}
