import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ── Settings keys ─────────────────────────────────────────────────────────────
const S = {
  ENABLED:         "sms_otp_enabled",
  API_KEY:         "sms_otp_api_key",
  SENDER:          "sms_otp_sender",
  PROVIDER:        "sms_otp_provider",
  METHOD:          "sms_otp_method",
  VERIFIED_PHONES: "sms_verified_phones",
};

// Strip leading country codes (966, 967, 974, 965, 970, 963, 964) and leading zeros
// so "966510531741", "+966510531741", "0510531741", "510531741" all compare equal
function normalizePhone(p: string): string {
  const digits = p.replace(/[\s+\-()]/g, "");
  return digits.replace(/^(966|967|974|965|970|963|964|0)/, "");
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return rows[0]?.value ?? null;
}
async function setSetting(key: string, value: string) {
  await db.insert(appSettingsTable).values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}
async function deleteSetting(key: string) {
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
}

// ── DB-backed OTP store (survives server restarts) ────────────────────────────
async function storeOtp(phone: string, code: string): Promise<void> {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  await setSetting(`otp_${phone}`, JSON.stringify({ code, expiresAt }));
}

async function getOtp(phone: string): Promise<{ code: string; expiresAt: number } | null> {
  const raw = await getSetting(`otp_${phone}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as { code: string; expiresAt: number }; } catch { return null; }
}

async function clearOtp(phone: string): Promise<void> {
  await deleteSetting(`otp_${phone}`);
}

// ── Verified phones ───────────────────────────────────────────────────────────
async function getVerifiedPhones(): Promise<Set<string>> {
  const raw = await getSetting(S.VERIFIED_PHONES);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw) as string[]); } catch { return new Set(); }
}

async function isPhoneVerified(phone: string): Promise<boolean> {
  const set = await getVerifiedPhones();
  const norm = normalizePhone(phone);
  if (set.has(phone)) return true;
  for (const stored of set) {
    if (normalizePhone(stored) === norm) return true;
  }
  return false;
}

async function markPhoneVerifiedServer(phone: string): Promise<void> {
  const set = await getVerifiedPhones();
  const norm = normalizePhone(phone);
  for (const stored of set) {
    if (normalizePhone(stored) === norm) return;
  }
  set.add(phone);
  await setSetting(S.VERIFIED_PHONES, JSON.stringify([...set]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider send implementations
// ─────────────────────────────────────────────────────────────────────────────

async function sendViaMsegat(apiKey: string, sender: string, phone: string, msg: string) {
  // Format: "username:apikey" or just "apikey" (apikey used as username too)
  const [userName, key] = apiKey.includes(":") ? apiKey.split(":") : [apiKey, apiKey];
  const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName, apiKey: key, numbers: phone, userSender: sender, msg, lang: "3" }),
  });
  const text = await res.text();
  let success = false;
  try { const j = JSON.parse(text); success = j.code === "M0000" || j.code === "1" || j.code === 1; } catch { success = res.ok; }
  return { success, response: text };
}

async function sendViaTaqnyat(apiKey: string, sender: string, phone: string, msg: string) {
  const res = await fetch("https://api.taqnyat.sa/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ recipients: [phone], body: msg, sender }),
  });
  const text = await res.text();
  let success = false;
  try { const j = JSON.parse(text); success = res.status === 201 || j.statusCode === 201 || j.code === 201 || res.ok; } catch { success = res.ok; }
  return { success, response: text };
}

async function sendVia4Jawaly(apiKey: string, sender: string, phone: string, msg: string) {
  const [key, secret] = apiKey.includes(":") ? apiKey.split(":") : [apiKey, ""];
  const b64 = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch("https://api-sms.4jawaly.com/api/v1/account/area/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Basic ${b64}` },
    body: JSON.stringify({ messages: [{ text: msg, numbers: phone }], sender }),
  });
  const text = await res.text();
  let success = false;
  try { const j = JSON.parse(text); success = j.success === true || j.status === "success" || res.ok; } catch { success = res.ok; }
  return { success, response: text };
}

async function sendViaUnifonic(apiKey: string, sender: string, phone: string, msg: string) {
  const body = new URLSearchParams({ AppSid: apiKey, SenderID: sender, Body: msg, Recipient: phone });
  const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  });
  const text = await res.text();
  let success = false;
  try { const j = JSON.parse(text); success = j.Success === "True" || j.success === true || res.ok; } catch { success = res.ok; }
  return { success, response: text };
}

async function sendViaTwilio(apiKey: string, _sender: string, phone: string, msg: string) {
  const parts = apiKey.split(":");
  if (parts.length < 3) return { success: false, response: "صيغة المفتاح: accountSid:authToken:fromNumber" };
  const [accountSid, authToken, fromNumber] = parts;
  const b64 = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({ From: fromNumber, To: phone, Body: msg });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${b64}` },
    body: body.toString(),
  });
  const text = await res.text();
  return { success: res.ok, response: text };
}

// Authentica: THEY manage OTP generation & verification
// Requires E.164 format (+9665XXXXXXXX)
function toE164(phone: string): string {
  const clean = phone.replace(/[\s-]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.startsWith("966")) return `+${clean}`;
  if (clean.startsWith("0"))   return `+966${clean.slice(1)}`;
  return `+966${clean}`;
}

async function sendViaAuthentica(apiKey: string, phone: string, method: string) {
  const e164 = toE164(phone);
  const res = await fetch("https://api.authentica.sa/api/v2/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Authorization": apiKey },
    body: JSON.stringify({ method: method === "whatsapp" ? "whatsapp" : "sms", phone: e164 }),
  });
  const text = await res.text();
  return { success: res.ok, response: text };
}

async function verifyViaAuthentica(apiKey: string, phone: string, otp: string) {
  const e164 = toE164(phone);
  const res = await fetch("https://api.authentica.sa/api/v2/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Authorization": apiKey },
    body: JSON.stringify({ phone: e164, otp }),
  });
  const text = await res.text();
  let verified = false;
  try { const j = JSON.parse(text); verified = j.verified === true || j.status === true; } catch {}
  return { success: res.ok, verified, response: text };
}

type Provider = "msegat" | "taqnyat" | "4jawaly" | "unifonic" | "twilio" | "authentica";

async function sendSmsViaProvider(provider: Provider, apiKey: string, sender: string, phone: string, msg: string, method: string) {
  switch (provider) {
    case "msegat":     return sendViaMsegat(apiKey, sender, phone, msg);
    case "taqnyat":    return sendViaTaqnyat(apiKey, sender, phone, msg);
    case "4jawaly":    return sendVia4Jawaly(apiKey, sender, phone, msg);
    case "unifonic":   return sendViaUnifonic(apiKey, sender, phone, msg);
    case "twilio":     return sendViaTwilio(apiKey, sender, phone, msg);
    case "authentica": return sendViaAuthentica(apiKey, phone, method);
    default:           return sendViaMsegat(apiKey, sender, phone, msg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.get("/sms-settings", async (_req, res) => {
  const [enabled, apiKey, sender, provider, method] = await Promise.all([
    getSetting(S.ENABLED), getSetting(S.API_KEY), getSetting(S.SENDER),
    getSetting(S.PROVIDER), getSetting(S.METHOD),
  ]);
  res.json({
    enabled: enabled === "true",
    apiKey:  apiKey ? "***" : "",
    hasApiKey: !!apiKey,
    sender:  sender ?? "سلة الخضار",
    provider: (provider ?? "msegat") as Provider,
    method:   method ?? "sms",
  });
});

router.put("/sms-settings", async (req, res) => {
  const schema = z.object({
    enabled:  z.boolean().optional(),
    apiKey:   z.string().optional(),
    sender:   z.string().optional(),
    provider: z.enum(["msegat","taqnyat","4jawaly","unifonic","twilio","authentica"]).optional(),
    method:   z.enum(["sms","whatsapp"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  const { enabled, apiKey, sender, provider, method } = parsed.data;
  if (enabled  !== undefined) await setSetting(S.ENABLED,  String(enabled));
  if (apiKey   !== undefined && apiKey !== "***") await setSetting(S.API_KEY, apiKey);
  if (sender   !== undefined) await setSetting(S.SENDER,   sender);
  if (provider !== undefined) await setSetting(S.PROVIDER, provider);
  if (method   !== undefined) await setSetting(S.METHOD,   method);
  res.json({ ok: true });
});

router.post("/sms/send-otp", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(9) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رقم غير صحيح" }); return; }

  const enabled = await getSetting(S.ENABLED);
  if (enabled !== "true") { res.json({ ok: true, skipped: true }); return; }

  // Already verified from any device → skip OTP (only for checkout, not onboarding)
  const phone = parsed.data.phone.replace(/[\s+]/g, "");
  const isOnboarding = (req.body as Record<string, unknown>).onboarding === true;
  if (!isOnboarding) {
    if (await isPhoneVerified(phone)) { res.json({ ok: true, skipped: true }); return; }
  }

  const [apiKey, sender, providerRaw, methodRaw] = await Promise.all([
    getSetting(S.API_KEY), getSetting(S.SENDER), getSetting(S.PROVIDER), getSetting(S.METHOD),
  ]);

  const provider = (providerRaw ?? "msegat") as Provider;
  const method   = methodRaw ?? "sms";

  if (!apiKey) {
    // Dev mode: generate code locally for testing (no real SMS sent)
    const code = String(Math.floor(1000 + Math.random() * 9000));
    await storeOtp(phone, code);
    req.log.warn({ phone, code }, "SMS OTP dev-mode: no API key configured — code stored in DB but not sent");
    res.json({ ok: true, devCode: code, otpLength: 4 });
    return;
  }

  // Authentica manages OTP itself — no local code needed
  if (provider === "authentica") {
    req.log.info({ phone, method }, "Sending OTP via Authentica");
    const { success, response } = await sendViaAuthentica(apiKey, phone, method);
    if (success) {
      req.log.info({ phone, method }, "Authentica send-otp OK");
    } else {
      req.log.error({ phone, method, response }, "Authentica send-otp FAILED");
    }
    res.json({ ok: true, otpLength: 4, ...(success ? {} : { warning: response }) });
    return;
  }

  // Other providers: generate code and persist in DB (survives server restarts)
  const code = String(Math.floor(1000 + Math.random() * 9000));
  await storeOtp(phone, code);

  const senderName = sender ?? "سلة الخضار";
  const message = `${code} رمز التحقق الخاص بطلبك في سلة الخضار. صالح 5 دقائق.`;

  req.log.info({ phone, provider, senderName }, "Sending OTP");
  const { success, response } = await sendSmsViaProvider(provider, apiKey, senderName, phone, message, method);

  if (success) {
    req.log.info({ phone, provider }, "OTP sent successfully");
  } else {
    req.log.error({ phone, provider, response }, "OTP send FAILED — provider returned error");
  }

  res.json({ ok: true, otpLength: 4, ...(success ? {} : { warning: response }) });
});

router.post("/sms/verify-otp", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(9), code: z.string().min(4).max(6) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }

  const enabled = await getSetting(S.ENABLED);
  if (enabled !== "true") { res.json({ ok: true, skipped: true }); return; }

  const phone    = parsed.data.phone.replace(/[\s+]/g, "");
  const provider = (await getSetting(S.PROVIDER) ?? "msegat") as Provider;
  const apiKey   = await getSetting(S.API_KEY);

  // Authentica verifies on their side
  if (provider === "authentica") {
    if (!apiKey) { res.status(400).json({ error: "لم يتم إعداد API Key" }); return; }
    req.log.info({ phone, code: parsed.data.code }, "Calling Authentica verify-otp");
    const { verified, response } = await verifyViaAuthentica(apiKey, phone, parsed.data.code);
    if (verified) {
      req.log.info({ phone }, "Authentica verify-otp OK");
    } else {
      req.log.error({ phone, response }, "Authentica verify-otp FAILED");
    }
    if (!verified) { res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية", detail: response }); return; }
    await markPhoneVerifiedServer(phone);
    res.json({ ok: true });
    return;
  }

  // Other providers: check DB-backed OTP store
  const entry = await getOtp(phone);
  if (!entry) {
    req.log.warn({ phone }, "verify-otp: no OTP found in DB for this phone (may have expired or server restarted before DB fix)");
    res.status(400).json({ error: "لم يتم طلب رمز لهذا الرقم أو انتهت صلاحيته، أعد الإرسال" });
    return;
  }
  if (Date.now() > entry.expiresAt) {
    await clearOtp(phone);
    req.log.warn({ phone }, "verify-otp: OTP expired");
    res.status(400).json({ error: "انتهت صلاحية الرمز، أعد الإرسال" });
    return;
  }
  if (entry.code !== parsed.data.code) {
    req.log.warn({ phone, submitted: parsed.data.code }, "verify-otp: wrong code");
    res.status(400).json({ error: "الرمز غير صحيح" });
    return;
  }

  await clearOtp(phone);
  await markPhoneVerifiedServer(phone);
  req.log.info({ phone }, "OTP verified successfully");
  res.json({ ok: true });
});

// ── POST /sms/mark-verified — called when user skips OTP or verifies ─────────
router.post("/sms/mark-verified", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(9) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رقم غير صحيح" }); return; }
  const phone = parsed.data.phone.replace(/[\s+]/g, "");
  await markPhoneVerifiedServer(phone);
  res.json({ ok: true });
});

router.post("/sms/test", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(9) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رقم غير صحيح" }); return; }

  const [apiKey, sender, providerRaw, methodRaw] = await Promise.all([
    getSetting(S.API_KEY), getSetting(S.SENDER), getSetting(S.PROVIDER), getSetting(S.METHOD),
  ]);
  if (!apiKey) { res.status(400).json({ error: "لم يتم إعداد API Key بعد" }); return; }

  const provider   = (providerRaw ?? "msegat") as Provider;
  const method     = methodRaw ?? "sms";
  const phone      = parsed.data.phone.replace(/[\s+]/g, "");
  const senderName = sender ?? "سلة الخضار";

  req.log.info({ phone, provider, senderName }, "Test SMS requested");

  let success: boolean, response: string;
  if (provider === "authentica") {
    ({ success, response } = await sendViaAuthentica(apiKey, phone, method));
  } else {
    ({ success, response } = await sendSmsViaProvider(provider, apiKey, senderName, phone, "اختبار — سلة الخضار. نظام الرسائل يعمل ✅", method));
  }

  if (success) {
    req.log.info({ phone, provider }, "Test SMS sent successfully");
  } else {
    req.log.error({ phone, provider, response }, "Test SMS FAILED");
  }

  res.json({ ok: success, response });
});

export default router;
