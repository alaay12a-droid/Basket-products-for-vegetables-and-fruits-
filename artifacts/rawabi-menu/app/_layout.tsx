import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/cairo";
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Modal, View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import Constants from "expo-constants";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CartProvider } from "@/context/CartContext";
import { DetailSheetProvider } from "@/context/DetailSheetContext";
import { UserProvider, useUser } from "@/context/UserContext";
import { OrderBadgeProvider } from "@/context/OrderBadgeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AppConfigProvider } from "@/context/AppConfigContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { MusicProvider } from "@/context/MusicContext";
import { registerCustomerNotifications, TOKEN_KEY } from "@/hooks/useCustomerPushToken";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiPost } from "@/constants/api";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

if (Platform.OS === "web" && typeof document !== "undefined") {
  document.documentElement.lang = "ar";
  document.documentElement.setAttribute("translate", "no");

  const meta = document.createElement("meta");
  meta.setAttribute("name", "google");
  meta.setAttribute("content", "notranslate");
  document.head.appendChild(meta);

  const metaTranslate = document.createElement("meta");
  metaTranslate.setAttribute("http-equiv", "Content-Language");
  metaTranslate.setAttribute("content", "ar");
  document.head.appendChild(metaTranslate);

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    html, body { direction: rtl; font-family: 'Cairo', sans-serif; }
    *:not(.emoji) { font-family: 'Cairo', sans-serif; }
    span.emoji { font-family: 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif !important; }
  `;
  document.head.appendChild(style);
}

function AuthGate() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const onOnboarding = segments[0] === "onboarding";
    if (!user && !onOnboarding) {
      router.replace("/onboarding");
    } else if (user && onOnboarding) {
      router.replace("/(tabs)/home");
    }
  }, [user, isLoading, segments]);

  return null;
}

function NotificationSetup() {
  const router = useRouter();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Request notification permissions immediately on app launch
    registerCustomerNotifications().catch(() => {});

    // Navigate to order-confirmed screen when customer taps a status notification
    try {
      responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const orderId = data?.orderId;
        if (orderId != null) {
          router.push(`/order-confirmed?orderId=${orderId}`);
        }
      });
    } catch {
      // Not supported in this environment — safe to ignore
    }

    return () => {
      try {
        responseListener.current?.remove();
      } catch {}
    };
  }, []);

  return null;
}

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
  : "";

function isNewer(latest: string, current: string): boolean {
  const p = (v: string) => v.split(".").map(Number);
  const [la, lb, lc] = p(latest);
  const [ca, cb, cc] = p(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

function UpdateChecker() {
  const [update, setUpdate] = useState<{ downloadUrl: string; forceUpdate: boolean } | null>(null);

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
    fetch(`${API_BASE}/api/version`)
      .then((r) => r.json())
      .then((data: { latestVersion: string; downloadUrl: string; forceUpdate: boolean }) => {
        if (data.latestVersion && isNewer(data.latestVersion, currentVersion)) {
          setUpdate({ downloadUrl: data.downloadUrl, forceUpdate: data.forceUpdate });
        }
      })
      .catch(() => {});
  }, []);

  if (!update) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={updateStyles.overlay}>
        <View style={updateStyles.card}>
          <Text style={updateStyles.title}>🎉 يوجد تحديث جديد</Text>
          <Text style={updateStyles.body}>
            يتوفر إصدار جديد من تطبيق منتجات السلة للخضار والفواكه يحتوي على تحسينات وميزات جديدة.
          </Text>
          {update.downloadUrl ? (
            <TouchableOpacity
              style={updateStyles.btn}
              onPress={() => Linking.openURL(update.downloadUrl)}
            >
              <Text style={updateStyles.btnText}>تحديث الآن</Text>
            </TouchableOpacity>
          ) : null}
          {!update.forceUpdate && (
            <TouchableOpacity onPress={() => setUpdate(null)}>
              <Text style={updateStyles.skip}>لاحقاً</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const updateStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1A1008",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8920C44",
  },
  title: {
    fontFamily: "Cairo_800ExtraBold",
    fontSize: 22,
    color: "#E8920C",
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "#E8D5B0",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: "#C8171A",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 14,
    width: "100%",
    alignItems: "center",
  },
  btnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  skip: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#888",
  },
});

function HeartbeatEffect() {
  const { user } = useUser();
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(TOKEN_KEY).then((token) => {
      if (!token) return;
      apiPost("/push-tokens/heartbeat", { token, name: user.name }).catch(() => {});
    });
  }, [user]);
  return null;
}

function RootLayoutNav() {
  return (
    <>
      <NotificationSetup />
      <UpdateChecker />
      <HeartbeatEffect />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="checkout" options={{ headerShown: false }} />
        <Stack.Screen name="order-confirmed" options={{ headerShown: false }} />
        <Stack.Screen name="cashier" options={{ headerShown: false }} />
        <Stack.Screen name="admin-menu" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="wallet" options={{ headerShown: false }} />
        <Stack.Screen name="app-settings" options={{ headerShown: false }} />
        <Stack.Screen name="push-diagnostics" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <AppConfigProvider>
              <UserProvider>
                <FavoritesProvider>
                <CartProvider>
                  <DetailSheetProvider>
                  <OrderBadgeProvider>
                    <MusicProvider>
                    <GestureHandlerRootView>
                        <RootLayoutNav />
                    </GestureHandlerRootView>
                    </MusicProvider>
                  </OrderBadgeProvider>
                  </DetailSheetProvider>
                </CartProvider>
                </FavoritesProvider>
              </UserProvider>
            </AppConfigProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
