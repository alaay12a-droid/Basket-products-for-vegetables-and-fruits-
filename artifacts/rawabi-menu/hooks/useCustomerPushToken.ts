import { useState, useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiPost } from "@/constants/api";

export const TOKEN_KEY = "@rawabi_customer_push_token";
export const PUSH_DIAGNOSTICS_KEY = "@rawabi_push_diagnostics";

export const PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "";

export type PushDiagnosticStepId = "permission" | "apns" | "expo" | "post";
export type PushDiagnosticStatus = "idle" | "pending" | "success" | "error" | "skipped";

export interface PushDiagnosticStep {
  id: PushDiagnosticStepId;
  title: string;
  status: PushDiagnosticStatus;
  message: string;
  detail?: string;
}

export interface PushDiagnosticsReport {
  runAt: string;
  platform: string;
  projectId: string;
  tokenPreview: string | null;
  steps: PushDiagnosticStep[];
}

type PushDiagnosticListener = (report: PushDiagnosticsReport) => void;

const DIAGNOSTIC_STEP_TITLES: Record<PushDiagnosticStepId, string> = {
  permission: "صلاحية الإشعارات",
  apns: "تسجيل APNs",
  expo: "Expo Push Token",
  post: "إرسال التوكن إلى الخادم",
};

export function maskPushToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length <= 22) return `${token.slice(0, 12)}…`;
  return `${token.slice(0, 20)}…${token.slice(-6)}`;
}

export function createPushDiagnosticsReport(): PushDiagnosticsReport {
  return {
    runAt: new Date().toISOString(),
    platform: Platform.OS,
    projectId: PROJECT_ID,
    tokenPreview: null,
    steps: (Object.keys(DIAGNOSTIC_STEP_TITLES) as PushDiagnosticStepId[]).map((id) => ({
      id,
      title: DIAGNOSTIC_STEP_TITLES[id],
      status: "idle",
      message: "لم يبدأ الفحص",
    })),
  };
}

export async function loadPushDiagnostics(): Promise<PushDiagnosticsReport | null> {
  try {
    const stored = await AsyncStorage.getItem(PUSH_DIAGNOSTICS_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PushDiagnosticsReport;
    if (!parsed || !Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Runs a user-visible iOS delivery registration check.
 * The native APNs token is read only to confirm registration and is never
 * stored, sent to the API, or displayed without masking.
 */
export async function runPushDiagnostics(
  onUpdate?: PushDiagnosticListener,
): Promise<PushDiagnosticsReport> {
  const report = createPushDiagnosticsReport();

  const publish = async () => {
    const snapshot: PushDiagnosticsReport = {
      ...report,
      steps: report.steps.map((step) => ({ ...step })),
    };
    await AsyncStorage.setItem(PUSH_DIAGNOSTICS_KEY, JSON.stringify(snapshot));
    onUpdate?.(snapshot);
  };

  const setStep = async (
    id: PushDiagnosticStepId,
    status: PushDiagnosticStatus,
    message: string,
    detail?: string,
  ) => {
    const step = report.steps.find((item) => item.id === id);
    if (step) Object.assign(step, { status, message, detail });
    await publish();
  };

  const skipRemaining = async (after: PushDiagnosticStepId, message: string) => {
    const ids = (Object.keys(DIAGNOSTIC_STEP_TITLES) as PushDiagnosticStepId[]);
    const start = ids.indexOf(after) + 1;
    for (const id of ids.slice(start)) {
      await setStep(id, "skipped", message);
    }
  };

  await publish();

  await setStep("permission", "pending", "جارٍ فحص صلاحية الإشعارات");
  let permission: Notifications.NotificationPermissionsStatus["status"];
  try {
    const current = await Notifications.getPermissionsAsync();
    permission = current.status;
    if (permission !== "granted") {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
        },
      });
      permission = requested.status;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStep("permission", "error", "تعذر فحص أو طلب الصلاحية", message);
    await skipRemaining("permission", "توقف الفحص بسبب فشل الصلاحية");
    return report;
  }

  if (permission !== "granted") {
    await setStep("permission", "error", `الصلاحية الحالية: ${permission}`, "يجب السماح بالإشعارات من إعدادات iPhone");
    await skipRemaining("permission", "توقف الفحص لأن الصلاحية غير ممنوحة");
    return report;
  }
  await setStep("permission", "success", "تم السماح بالإشعارات", `status: ${permission}`);

  if (Platform.OS !== "ios") {
    await setStep("apns", "skipped", "هذه الخطوة مخصصة لأجهزة iPhone");
  } else {
    await setStep("apns", "pending", "جارٍ طلب تسجيل الجهاز لدى APNs");
    try {
      const nativeToken = await Notifications.getDevicePushTokenAsync();
      await setStep("apns", "success", "تم تسجيل الجهاز لدى APNs", `توكن APNs: ${maskPushToken(String(nativeToken.data)) ?? "غير متاح"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setStep("apns", "error", "فشل تسجيل الجهاز لدى APNs", message);
    }
  }

  await setStep("expo", "pending", "جارٍ استخراج Expo Push Token");
  let expoToken: string;
  try {
    if (!PROJECT_ID) throw new Error("لم يتم ربط التطبيق بمشروع إشعارات مستقل بعد");
    const result = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    expoToken = result.data;
    report.tokenPreview = maskPushToken(expoToken);
    await AsyncStorage.setItem(TOKEN_KEY, expoToken);
    await setStep("expo", "success", "تم استخراج Expo Push Token", `التوكن: ${report.tokenPreview ?? "غير متاح"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStep("expo", "error", "فشل استخراج Expo Push Token", message);
    await skipRemaining("expo", "توقف الفحص لعدم توفر Expo Push Token");
    return report;
  }

  await setStep("post", "pending", "جارٍ إرسال POST إلى خادم المشروع");
  try {
    await apiPost("/push-tokens", {
      token: expoToken,
      role: "customer",
    });
    await setStep("post", "success", "تم قبول التوكن من خادم المشروع", "POST /api/push-tokens — HTTP 2xx");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStep("post", "error", "فشل إرسال التوكن إلى خادم المشروع", message);
  }

  return report;
}

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

export async function registerCustomerNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!PROJECT_ID) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
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
    if (finalStatus !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("order-status", {
        name: "حالة طلبك",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 200, 100, 200],
        lightColor: "#D4AF37",
        showBadge: true,
      });
    }

    // Get Expo push token — retry up to 3 times with 2s delay on failure
    let expoToken: string | null = null;
    let lastTokenErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
        expoToken = result.data;
        break;
      } catch (err) {
        lastTokenErr = err;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }
    if (!expoToken) {
      // iOS-only: report the exact error to the server so it appears in Render logs
      if (Platform.OS === "ios") {
        const errMsg = lastTokenErr instanceof Error ? lastTokenErr.message : String(lastTokenErr);
        const errStack = lastTokenErr instanceof Error ? (lastTokenErr.stack ?? "").slice(0, 400) : "";
        apiPost("/push-token-error", {
          step: "getExpoPushTokenAsync",
          error: errMsg,
          stack: errStack,
          projectId: PROJECT_ID,
          attempts: 3,
        }).catch(() => {});
      }
      return null;
    }
    await AsyncStorage.setItem(TOKEN_KEY, expoToken);

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

    // Always register with server on every launch — keeps FCM token current
    apiPost("/push-tokens", {
      token: expoToken,
      fcmToken: fcmToken ?? undefined,
      role: "customer",
    }).catch((regErr) => {
      // iOS-only: report server registration failure to Render logs
      if (Platform.OS === "ios") {
        const msg = regErr instanceof Error ? regErr.message : String(regErr);
        apiPost("/push-token-error", {
          step: "POST /push-tokens",
          error: msg,
          token: expoToken.slice(0, 30),
          platform: "ios",
        }).catch(() => {});
      }
    });

    // iOS-only: log successful token retrieval so we can confirm the step
    if (Platform.OS === "ios") {
      apiPost("/push-token-error", {
        step: "SUCCESS",
        token: expoToken.slice(0, 30),
        platform: "ios",
      }).catch(() => {});
    }

    return expoToken;
  } catch {
    return null;
  }
}

export function useCustomerPushToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Serve cached Expo token immediately so checkout screen has it right away
    AsyncStorage.getItem(TOKEN_KEY).then((cached) => {
      if (cached) setToken(cached);
    });

    // Always refresh in background on every launch:
    // - refreshes the FCM token stored in the DB (FCM tokens can rotate)
    // - updates the server with the latest token pair
    registerCustomerNotifications().then((fresh) => {
      if (fresh) setToken(fresh);
    });
  }, []);

  return token;
}
