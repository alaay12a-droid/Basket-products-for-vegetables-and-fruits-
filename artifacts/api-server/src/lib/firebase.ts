import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { logger } from "./logger.js";

let _messaging: Messaging | null = null;

export function getFCMMessaging(): Messaging | null {
  if (_messaging) return _messaging;

  const raw = process.env.PROJECT_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    logger.warn("PROJECT_FIREBASE_SERVICE_ACCOUNT not set — FCM disabled");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    _messaging = getMessaging();
    logger.info("Firebase Admin SDK initialised — FCM ready");
    return _messaging;
  } catch (err) {
    logger.error({ err }, "Failed to initialise Firebase Admin SDK");
    return null;
  }
}
