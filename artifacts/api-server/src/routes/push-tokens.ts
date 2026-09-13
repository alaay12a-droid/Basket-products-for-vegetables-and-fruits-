import { Router } from "express";
import {
  db,
  pushTokensTable,
  appSettingsTable,
  ordersTable,
  walletsTable,
  walletTransactionsTable,
  referralsTable,
  discountCodeUsagesTable,
  deletedAccountsTable,
} from "@workspace/db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { sendPushToToken } from "../lib/sendPushNotification.js";
import { z } from "zod";

const router = Router();

const tokenSchema = z.object({
  token: z.string().min(1),
  fcmToken: z.string().min(1).optional(),
  role: z.enum(["cashier", "customer", "driver"]).default("cashier"),
  driverId: z.number().int().positive().optional(),
});

router.post("/push-tokens", async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "رمز غير صحيح" });
    return;
  }
  try {
    const { token, fcmToken, role, driverId } = parsed.data;
    const values = { token, fcmToken: fcmToken ?? null, role, driverId: driverId ?? null };
    if (fcmToken) {
      await db
        .insert(pushTokensTable)
        .values(values)
        .onConflictDoUpdate({
          target: pushTokensTable.token,
          set: { fcmToken, role, driverId: driverId ?? null },
        });
    } else {
      // Diagnostic and older app builds may only send the Expo token. Preserve
      // any native FCM token already registered for this device.
      await db
        .insert(pushTokensTable)
        .values(values)
        .onConflictDoUpdate({
          target: pushTokensTable.token,
          set: { role, driverId: driverId ?? null },
        });
    }
    const [stored] = await db
      .select({
        token: pushTokensTable.token,
        role: pushTokensTable.role,
        driverId: pushTokensTable.driverId,
        fcmToken: pushTokensTable.fcmToken,
      })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.token, token))
      .limit(1);
    req.log.info(
      {
        token: token.slice(0, 30),
        role: stored?.role,
        driverId: stored?.driverId,
        hasFcmToken: !!stored?.fcmToken,
        persisted: stored?.token === token,
      },
      "Push token persisted and verified",
    );
    res.json({ ok: true, persisted: stored?.token === token, hasFcmToken: !!stored?.fcmToken });
  } catch (err) {
    req.log.error({ err }, "Failed to persist push token");
    res.status(500).json({ error: "تعذر حفظ الرمز" });
  }
});

router.get("/push-tokens/driver/:driverId/status", async (req, res) => {
  const driverId = Number(req.params.driverId);
  if (!Number.isInteger(driverId) || driverId <= 0) {
    res.status(400).json({ error: "معرّف المندوب غير صحيح" });
    return;
  }

  const rows = await db
    .select({
      token: pushTokensTable.token,
      fcmToken: pushTokensTable.fcmToken,
      createdAt: pushTokensTable.createdAt,
      lastActiveAt: pushTokensTable.lastActiveAt,
    })
    .from(pushTokensTable)
    .where(and(eq(pushTokensTable.role, "driver"), eq(pushTokensTable.driverId, driverId)))
    .orderBy(desc(pushTokensTable.createdAt));

  res.json({
    registered: rows.length > 0,
    tokenCount: rows.length,
    expoTokenCount: rows.filter((row) => row.token.startsWith("ExponentPushToken[")).length,
    fcmTokenCount: rows.filter((row) => Boolean(row.fcmToken)).length,
    latestCreatedAt: rows[0]?.createdAt ?? null,
    latestActiveAt: rows[0]?.lastActiveAt ?? null,
  });
});

const heartbeatSchema = z.object({
  token: z.string().min(1),
  name: z.string().optional(),
});

router.post("/push-tokens/heartbeat", async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  try {
    const { token, name } = parsed.data;
    const now = new Date();
    const setPayload: Record<string, unknown> = {
      lastActiveAt: now,
      reEngagementSentAt: null,
    };
    if (name?.trim()) setPayload.customerName = name.trim();

    await db
      .update(pushTokensTable)
      .set(setPayload)
      .where(eq(pushTokensTable.token, token));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "تعذر تحديث النشاط" });
  }
});

router.get("/settings/reengagement", async (_req, res) => {
  try {
    const [row] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "reengagement_days"));
    res.json({ days: parseInt(row?.value ?? "30", 10) || 30 });
  } catch {
    res.status(500).json({ error: "تعذر جلب الإعداد" });
  }
});

router.put("/settings/reengagement", async (req, res) => {
  const schema = z.object({ days: z.number().int().min(1).max(365) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "قيمة غير صحيحة" });
    return;
  }
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: "reengagement_days", value: String(parsed.data.days) })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: String(parsed.data.days), updatedAt: new Date() },
      });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "تعذر حفظ الإعداد" });
  }
});

router.delete("/push-tokens/:token", async (req, res) => {
  try {
    await db.delete(pushTokensTable).where(eq(pushTokensTable.token, req.params.token));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "تعذر الحذف" });
  }
});

// ── Hard account deletion ──────────────────────────────────────────────────────
// Permanently removes the customer's personal data from every table.
// Orders are anonymised (not deleted) so accounting records remain intact.
// A minimal tombstone row (phone + timestamp) is written to deleted_accounts
// to enforce the 30-day re-registration cooldown.
const deleteAccountSchema = z.object({
  token: z.string().min(1),
  phone: z.string().min(1),
});

router.post("/account/delete", async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const { token, phone } = parsed.data;
  try {
    // 1. Anonymise orders — keep for business accounting, strip personal info
    await db
      .update(ordersTable)
      .set({
        customerName: "حساب محذوف",
        customerPhone: `deleted_${Date.now()}`,
        customerAddress: null,
        customerPushToken: null,
      })
      .where(eq(ordersTable.customerPhone, phone));

    // 2. Delete wallet balance (personal financial account)
    await db.delete(walletsTable).where(eq(walletsTable.phone, phone));

    // 3. Delete wallet transaction history
    await db.delete(walletTransactionsTable).where(eq(walletTransactionsTable.phone, phone));

    // 4. Delete referral records (contains name + phone of both parties)
    await db
      .delete(referralsTable)
      .where(
        or(eq(referralsTable.referrerPhone, phone), eq(referralsTable.referredPhone, phone))
      );

    // 5. Delete discount code usage history
    await db.delete(discountCodeUsagesTable).where(eq(discountCodeUsagesTable.phone, phone));

    // 6. Delete push token (device notification token + customer name)
    await db.delete(pushTokensTable).where(eq(pushTokensTable.token, token));

    // 7. Record tombstone for 30-day re-registration cooldown
    await db
      .insert(deletedAccountsTable)
      .values({ phone })
      .onConflictDoUpdate({
        target: deletedAccountsTable.phone,
        set: { deletedAt: new Date() },
      });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "account deletion failed");
    res.status(500).json({ error: "تعذر حذف الحساب" });
  }
});

// ── iOS push-token debug logger ───────────────────────────────────────────────
// Receives the error thrown by getExpoPushTokenAsync on the device and writes
// it to the server log so it appears in Render's log stream.
router.post("/push-token-error", (req, res) => {
  req.log.error({ payload: req.body }, "iOS push-token registration failed on device");
  res.json({ ok: true });
});

// ── Direct push test — for diagnosing iOS delivery without placing a real order ──
// POST /push-tokens/test-send  { token: "ExponentPushToken[...]", title?, body? }
// Uses the full sendPushToToken flow (FCM → Expo fallback + 60 s receipt check).
// Receipt result appears in server logs ~60 s after this call.
router.post("/push-tokens/test-send", async (req, res) => {
  const { token, title, body } = req.body as { token?: string; title?: string; body?: string };
  if (!token || !token.startsWith("ExponentPushToken[")) {
    res.status(400).json({ error: "Provide a valid ExponentPushToken" });
    return;
  }
  req.log.info({ token: token.slice(0, 30) }, "push-tokens/test-send — starting full delivery flow");
  res.json({ ok: true, message: "Push dispatched — receipt check fires in ~60 s, see server logs" });

  // Run after response so the caller doesn't wait for delivery
  sendPushToToken(token, {
    title: title ?? "🔔 اختبار إشعار",
    body: body ?? "وصل هذا الإشعار بنجاح إلى الجهاز — " + new Date().toISOString().slice(11, 19),
    sound: "default",
    data: { test: "true", ts: Date.now().toString() },
    channelId: "order-status",
  }).catch((err) => req.log.error({ err }, "push-tokens/test-send delivery error"));
});

// ── Diagnostic: send test push to the 5 most recently registered iOS tokens ──────
// POST /debug/push-latest-ios
// Queries the DB for the 5 newest iOS customer tokens (no fcm_token = iOS path),
// fires sendPushToToken for each. This covers both Expo Go tokens and App Store
// build tokens since they look identical in the DB.
// Receipts appear in server logs ~60 s later — each row logs its masked token.
router.post("/debug/push-latest-ios", async (req, res) => {
  try {
    const rows = await db
      .select({ token: pushTokensTable.token, createdAt: pushTokensTable.createdAt })
      .from(pushTokensTable)
      .where(
        and(
          eq(pushTokensTable.role, "customer"),
          isNull(pushTokensTable.fcmToken),
        ),
      )
      .orderBy(desc(pushTokensTable.createdAt))
      .limit(5);

    if (!rows.length) {
      res.status(404).json({ error: "No iOS customer token found in DB" });
      return;
    }

    const ts = new Date().toISOString().slice(11, 19);
    const summary = rows.map((r) => ({ masked: r.token.slice(0, 30) + "…", createdAt: r.createdAt }));
    req.log.info({ tokens: summary }, "debug/push-latest-ios — dispatching to all iOS tokens");

    res.json({ ok: true, count: rows.length, tokens: summary, message: "Pushed — receipt stored in DB in ~60 s, GET /debug/push-receipt-stored to read" });

    // Dispatch after response so caller doesn't wait
    for (const { token } of rows) {
      sendPushToToken(token, {
        title: "🔔 اختبار App Store iOS",
        body: "هذا إشعار تشخيصي — " + ts,
        sound: "default",
        data: { test: "true", ts: Date.now().toString() },
        channelId: "order-status",
      }).catch((err) => req.log.error({ err, masked: token.slice(0, 30) }, "debug/push-latest-ios delivery error"));
    }
  } catch (err) {
    req.log.error({ err }, "debug/push-latest-ios failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── Diagnostic: read last receipt result stored by checkExpoReceipts ───────────
// GET /debug/push-receipt-stored
// Returns the APNs delivery result written 60 s after the last debug push.
router.get("/debug/push-receipt-stored", async (_req, res) => {
  try {
    const [row] = await db
      .select({ value: appSettingsTable.value, updatedAt: appSettingsTable.updatedAt })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "push_debug_last_receipt"));
    if (!row) {
      res.status(404).json({ error: "No receipt stored yet — send a test push first and wait 60 s" });
      return;
    }
    res.json({ receipt: JSON.parse(row.value), storedAt: row.updatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
