import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return rows[0]?.value ?? null;
}

function toE164(phone: string): string {
  const clean = phone.replace(/[\s-]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.startsWith("966")) return `+${clean}`;
  if (clean.startsWith("0"))   return `+966${clean.slice(1)}`;
  return `+966${clean}`;
}

export async function sendSms(phone: string, message: string): Promise<void> {
  try {
    const [enabled, apiKey, sender, providerRaw] = await Promise.all([
      getSetting("sms_otp_enabled"),
      getSetting("sms_otp_api_key"),
      getSetting("sms_otp_sender"),
      getSetting("sms_otp_provider"),
    ]);

    if (enabled !== "true" || !apiKey) return;

    const provider = (providerRaw ?? "msegat") as "msegat" | "taqnyat" | "4jawaly" | "unifonic" | "twilio" | "authentica";
    const senderName = sender ?? "سلة الخضار";
    const cleanPhone = phone.replace(/[\s+]/g, "");

    let success = false;
    let response = "";

    switch (provider) {
      case "msegat": {
        // Format: "username:apikey" or just "apikey" (apikey used as username too)
        const [userName, key] = apiKey.includes(":") ? apiKey.split(":") : [apiKey, apiKey];
        const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName, apiKey: key, numbers: cleanPhone, userSender: senderName, msg: message, lang: "3" }),
        });
        response = await res.text();
        try { const j = JSON.parse(response); success = j.code === "M0000" || j.code === "1" || j.code === 1; } catch { success = res.ok; }
        break;
      }
      case "taqnyat": {
        const res = await fetch("https://api.taqnyat.sa/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ recipients: [cleanPhone], body: message, sender: senderName }),
        });
        response = await res.text();
        try { const j = JSON.parse(response); success = res.status === 201 || j.statusCode === 201 || res.ok; } catch { success = res.ok; }
        break;
      }
      case "4jawaly": {
        const [key, secret] = apiKey.includes(":") ? apiKey.split(":") : [apiKey, ""];
        const b64 = Buffer.from(`${key}:${secret}`).toString("base64");
        const res = await fetch("https://api-sms.4jawaly.com/api/v1/account/area/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Basic ${b64}` },
          body: JSON.stringify({ messages: [{ text: message, numbers: cleanPhone }], sender: senderName }),
        });
        response = await res.text();
        try { const j = JSON.parse(response); success = j.success === true || j.status === "success" || res.ok; } catch { success = res.ok; }
        break;
      }
      case "unifonic": {
        const body = new URLSearchParams({ AppSid: apiKey, SenderID: senderName, Body: message, Recipient: cleanPhone });
        const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
        });
        response = await res.text();
        try { const j = JSON.parse(response); success = j.Success === "True" || j.success === true || res.ok; } catch { success = res.ok; }
        break;
      }
      case "twilio": {
        const parts = apiKey.split(":");
        if (parts.length < 3) {
          logger.warn({ phone }, "Twilio key format wrong — expected accountSid:authToken:fromNumber");
          return;
        }
        const [accountSid, authToken, fromNumber] = parts;
        const b64 = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const body = new URLSearchParams({ From: fromNumber, To: toE164(phone), Body: message });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${b64}` },
          body: body.toString(),
        });
        response = await res.text();
        success = res.ok;
        break;
      }
      case "authentica": {
        const e164 = toE164(phone);
        const res = await fetch("https://api.authentica.sa/api/v2/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Authorization": apiKey },
          body: JSON.stringify({ method: "sms", phone: e164 }),
        });
        response = await res.text();
        success = res.ok;
        break;
      }
    }

    if (success) {
      logger.info({ phone: cleanPhone, provider }, "Notification SMS sent successfully");
    } else {
      logger.error({ phone: cleanPhone, provider, response }, "Notification SMS FAILED");
    }
  } catch (err) {
    logger.error({ err, phone }, "Notification SMS send error (non-critical)");
  }
}
