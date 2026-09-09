import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiPost } from "@/constants/api";

const PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

// Must be wrapped in try/catch — throws in Expo Go and some emulators
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Not supported in this environment — safe to ignore
}

async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!PROJECT_ID) return;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("orders", {
        name: "طلبات جديدة",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: "#D4AF37",
        sound: "notification_loop",
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Get Expo push token (used as stable key per device)
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });

    // Get native FCM token for direct Firebase Admin SDK delivery.
    // iOS: skip this — without GoogleService-Info.plist, getDevicePushTokenAsync()
    // returns a raw APNs device token (not an FCM token). Sending that to Firebase
    // triggers invalid-registration-token errors. Expo Push API handles iOS natively.
    let fcmToken: string | null = null;
    if (Platform.OS === "android") {
      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        fcmToken = deviceToken.data as string;
      } catch {
        // FCM token unavailable (e.g. emulator without Play Services)
      }
    }

    // Register with server (cashier role = default)
    apiPost("/push-tokens", {
      token: expoToken,
      fcmToken: fcmToken ?? undefined,
    }).catch(() => {});
  } catch {
    // Silently ignore — notifications are non-critical for cashier flow
  }
}

export function useNotifications() {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Register on every mount so FCM token stays fresh on every session
    registerForPushNotifications();

    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
      responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});
    } catch {}

    return () => {
      try {
        notificationListener.current?.remove();
        responseListener.current?.remove();
      } catch {}
    };
  }, []);
}
