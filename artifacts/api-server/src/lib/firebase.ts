import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { logger } from "./logger.js";

let _messaging: Messaging | null = null;
const FCM_PROJECT_ID = "basket-products";
const FCM_APP_NAME = "basket-products-fcm";

export function getFCMMessaging(): Messaging | null {
  if (_messaging) return _messaging;

  const raw = process.env.FCM_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    logger.warn("FCM_FIREBASE_SERVICE_ACCOUNT not set — FCM disabled");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.project_id !== FCM_PROJECT_ID) {
      logger.error("FCM service account project mismatch — FCM disabled");
      return null;
    }
    const app =
      getApps().find((existingApp) => existingApp.name === FCM_APP_NAME) ??
      initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: FCM_PROJECT_ID,
        },
        FCM_APP_NAME,
      );
    _messaging = getMessaging(app);
    logger.info("Firebase Admin SDK initialised for basket-products — FCM ready");
    return _messaging;
  } catch (err) {
    logger.error("Failed to initialise Firebase Admin SDK");
    return null;
  }
}
