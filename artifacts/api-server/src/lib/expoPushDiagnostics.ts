import { createHash } from "node:crypto";

export interface ExpoPushReceipt {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string; [key: string]: unknown };
}

export function pushTokenRef(token: string): string {
  // A stable identifier for correlation, not a fragment of the device credential.
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export function expoCredentialDiagnostic(receipt: ExpoPushReceipt) {
  const code = receipt.details?.error;
  if (code !== "InvalidCredentials" && code !== "MismatchSenderId") return {};
  const evidence = `${receipt.message ?? ""} ${JSON.stringify(receipt.details ?? {})}`;
  const apns = /apns|apple push|ios|iphone/i.test(evidence);
  const fcm = code === "MismatchSenderId" || /fcm|firebase|sender.?id|android/i.test(evidence);
  if (apns && !fcm) {
    return {
      credentialProvider: "APNs",
      hint: "iOS: verify the APNs key assigned in EAS, Apple Team ID, bundle identifier, and production push entitlement. Do not delete the token.",
    };
  }
  if (fcm && !apns) {
    return {
      credentialProvider: "FCM",
      hint: "Android: verify the EAS FCM V1 credential and matching Firebase sender/project. Do not delete the token.",
    };
  }
  return {
    credentialProvider: "unknown",
    hint: "Expo did not identify the platform. For iOS check APNs credentials in EAS; for Android check FCM V1 credentials. Do not delete the token.",
  };
}

interface DiagnosticLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export function logExpoReceipt(
  log: DiagnosticLogger,
  sendId: string,
  receiptId: string,
  token: string,
  receipt: ExpoPushReceipt,
  attempt: number,
) {
  const fields = {
    sendId, receiptId, tokenRef: pushTokenRef(token), attempt,
    status: receipt.status, errorCode: receipt.details?.error,
    message: receipt.message, details: receipt.details,
    ...expoCredentialDiagnostic(receipt),
  };
  if (receipt.status === "ok") {
    log.info(fields, "Expo receipt accepted by APNs/FCM; device display is not confirmed");
  } else {
    log.error(fields, "Expo receipt rejected by push provider");
  }
}

// These retries query existing tickets only: no push resend, DB writes, or
// device-token cleanup. The original sending/cleanup paths remain unchanged.
export async function retryPendingExpoReceipts(
  pending: Map<string, string>,
  sendId: string,
  log: DiagnosticLogger,
  dependencies: {
    fetch: typeof fetch;
    wait: (ms: number) => Promise<void>;
  },
): Promise<void> {
  const remaining = new Map(pending);
  const delays = [60_000, 120_000, 300_000, 480_000];
  for (const [index, delay] of delays.entries()) {
    if (remaining.size === 0) return;
    await dependencies.wait(delay);
    const attempt = index + 2;
    try {
      const response = await dependencies.fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ids: [...remaining.keys()] }),
      });
      if (!response.ok) {
        log.error({ sendId, attempt, status: response.status }, "Expo receipt retry HTTP error");
        continue;
      }
      const result = await response.json() as { data?: Record<string, ExpoPushReceipt> };
      if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
        log.error({ sendId, attempt }, "Expo receipt retry returned an invalid response");
        continue;
      }
      for (const [id, receipt] of Object.entries(result.data)) {
        const token = remaining.get(id);
        if (!token || (receipt.status !== "ok" && receipt.status !== "error")) continue;
        logExpoReceipt(log, sendId, id, token, receipt, attempt);
        remaining.delete(id);
      }
      log.info({ sendId, attempt, pending: remaining.size }, "Expo receipt retry complete");
    } catch (error) {
      log.error({ sendId, attempt, error: error instanceof Error ? error.message : String(error) },
        "Expo receipt retry failed");
    }
  }
  if (remaining.size > 0) {
    log.warn({ sendId, receiptIds: [...remaining.keys()], pending: remaining.size },
      "Expo receipts still pending after bounded retries; delivery is unknown");
  }
}
