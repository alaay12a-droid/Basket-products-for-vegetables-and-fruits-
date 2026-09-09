import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useOrderBadge } from "@/context/OrderBadgeContext";
import { useAppConfig } from "@/context/AppConfigContext";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const { config, loaded } = useAppConfig();
  const { activeCount } = useOrderBadge();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!loaded) return null;

  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;
  const h = Platform.OS === "web" ? config.tabHeight : config.tabHeight + 10 + bottomInset;
  const pb = Platform.OS === "web" ? config.tabPaddingBottom : config.tabPaddingBottom + 8 + bottomInset;

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: h,
          paddingBottom: pb,
          paddingTop: 8,
        },
        tabBarActiveTintColor: config.menuTemplate === "modern" ? "#0F3D2E" : config.accentColor,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: {
          fontFamily: "Cairo_700Bold",
          fontSize: config.tabFontSize,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "القائمة",
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: "العروض",
          tabBarIcon: ({ color, size }) => (
            <Feather name="tag" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "الطلبات",
          tabBarIcon: ({ color, size }) => (
            <Feather name="shopping-bag" size={size - 2} color={color} />
          ),
          tabBarBadge: activeCount > 0 ? activeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#E8920C", color: "#fff", fontSize: 10, fontFamily: "Cairo_700Bold" },
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "المزيد",
          tabBarIcon: ({ color, size }) => (
            <Feather name="menu" size={size - 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
