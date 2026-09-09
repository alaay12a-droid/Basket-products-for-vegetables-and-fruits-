import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

const router = Router();
const MENU_TEMPLATE_KEY = "menu_template";

const KEY_PREFIX = "appearance_";
const DEFAULTS: Record<string, string> = {
  appearance_bgTheme:        "light-warm",
  appearance_accentColor:    "#E8920C",
  appearance_logoBg:         "#FFFFFF",
  appearance_minOrderAmount: "0",
  appearance_deliveryEnabled:        "false",
  appearance_deliveryFee:            "0",
  appearance_freeDeliveryThreshold:  "0",
  appearance_cashierPin:             "Aa@000",
  appearance_adminPin:        "Aa@000",
};

router.get("/settings/menu-template", async (_req, res) => {
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, MENU_TEMPLATE_KEY))
    .limit(1);
  const menuTemplate = row?.value === "modern" ? "modern" : "classic";
  res.json({ menuTemplate });
});

router.put("/settings/menu-template", async (req, res) => {
  const menuTemplate = req.body?.menuTemplate;
  if (menuTemplate !== "classic" && menuTemplate !== "modern") {
    res.status(400).json({ error: "menuTemplate must be classic or modern" });
    return;
  }
  await db
    .insert(appSettingsTable)
    .values({ key: MENU_TEMPLATE_KEY, value: menuTemplate })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: menuTemplate, updatedAt: new Date() },
    });
  res.json({ menuTemplate });
});

// ── GET /settings/appearance ──────────────────────────────────────────────────
router.get("/settings/appearance", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable).where(like(appSettingsTable.key, `${KEY_PREFIX}%`));
  const result = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json({
    bgTheme:         result.appearance_bgTheme,
    accentColor:     result.appearance_accentColor,
    logoBg:          result.appearance_logoBg,
    minOrderAmount:  parseFloat(result.appearance_minOrderAmount) || 0,
    deliveryEnabled:           result.appearance_deliveryEnabled === "true",
    deliveryFee:               parseFloat(result.appearance_deliveryFee) || 0,
    freeDeliveryThreshold:     parseFloat(result.appearance_freeDeliveryThreshold) || 0,
  });
});

// ── PUT /settings/appearance ──────────────────────────────────────────────────
router.put("/settings/appearance", async (req, res) => {
  const { bgTheme, accentColor, logoBg, minOrderAmount, deliveryEnabled, deliveryFee, freeDeliveryThreshold } = req.body as {
    bgTheme?: string;
    accentColor?: string;
    logoBg?: string;
    minOrderAmount?: number;
    deliveryEnabled?: boolean;
    deliveryFee?: number;
    freeDeliveryThreshold?: number;
  };
  const updates: Record<string, string> = {};
  if (bgTheme !== undefined)         updates.appearance_bgTheme         = bgTheme;
  if (accentColor !== undefined)     updates.appearance_accentColor     = accentColor;
  if (logoBg !== undefined)          updates.appearance_logoBg          = logoBg;
  if (minOrderAmount !== undefined)  updates.appearance_minOrderAmount  = String(minOrderAmount);
  if (deliveryEnabled !== undefined)        updates.appearance_deliveryEnabled       = String(deliveryEnabled);
  if (deliveryFee !== undefined)            updates.appearance_deliveryFee           = String(deliveryFee);
  if (freeDeliveryThreshold !== undefined)  updates.appearance_freeDeliveryThreshold = String(freeDeliveryThreshold);
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(appSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

// ── GET /settings/pins ────────────────────────────────────────────────────────
router.get("/settings/pins", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable).where(like(appSettingsTable.key, `${KEY_PREFIX}%`));
  const result = { ...DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  res.json({
    cashier: result.appearance_cashierPin,
    admin:   result.appearance_adminPin,
  });
});

// ── PUT /settings/pins ────────────────────────────────────────────────────────
router.put("/settings/pins", async (req, res) => {
  const { cashier, admin } = req.body as { cashier?: string; admin?: string };
  const updates: Record<string, string> = {};
  if (cashier !== undefined) updates.appearance_cashierPin = cashier;
  if (admin   !== undefined) updates.appearance_adminPin   = admin;
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(appSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

// ── GET /settings/payment ──────────────────────────────────────────────────
const PAYMENT_PREFIX = "payment_";
const PAYMENT_DEFAULTS: Record<string, string> = {
  payment_cash:       "true",
  payment_electronic: "false",
  payment_wallet:     "false",
};

router.get("/settings/payment", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable).where(like(appSettingsTable.key, `${PAYMENT_PREFIX}%`));
  const result = { ...PAYMENT_DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  res.json({
    cash:       result.payment_cash       === "true",
    electronic: result.payment_electronic === "true",
    wallet:     result.payment_wallet     === "true",
  });
});

// ── PUT /settings/payment ──────────────────────────────────────────────────
router.put("/settings/payment", async (req, res) => {
  const { cash, electronic, wallet } = req.body as { cash?: boolean; electronic?: boolean; wallet?: boolean };
  const updates: Record<string, string> = {};
  if (cash       !== undefined) updates.payment_cash       = String(cash);
  if (electronic !== undefined) updates.payment_electronic = String(electronic);
  if (wallet     !== undefined) updates.payment_wallet     = String(wallet);
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(appSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

// ── GET /settings/sounds ──────────────────────────────────────────────────
const SOUND_PREFIX = "sound_";
const SOUND_DEFAULTS: Record<string, string> = {
  sound_muted:            "false",
  sound_order:            "default",
  sound_message:          "default",
  sound_delivery:         "default",
  sound_customOrderUrl:   "",
  sound_customMessageUrl: "",
  sound_customDeliveryUrl: "",
};

router.get("/settings/sounds", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable).where(like(appSettingsTable.key, `${SOUND_PREFIX}%`));
  const result = { ...SOUND_DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  res.json({
    muted:             result.sound_muted === "true",
    order:             result.sound_order,
    message:           result.sound_message,
    delivery:          result.sound_delivery,
    customOrderUrl:    result.sound_customOrderUrl    || null,
    customMessageUrl:  result.sound_customMessageUrl  || null,
    customDeliveryUrl: result.sound_customDeliveryUrl || null,
  });
});

// ── PUT /settings/sounds ──────────────────────────────────────────────────
router.put("/settings/sounds", async (req, res) => {
  const { muted, order, message, delivery, customOrderUrl, customMessageUrl, customDeliveryUrl } = req.body as {
    muted?: boolean;
    order?: string;
    message?: string;
    delivery?: string;
    customOrderUrl?: string | null;
    customMessageUrl?: string | null;
    customDeliveryUrl?: string | null;
  };
  const updates: Record<string, string> = {};
  if (muted    !== undefined) updates.sound_muted    = String(muted);
  if (order    !== undefined) updates.sound_order    = order;
  if (message  !== undefined) updates.sound_message  = message;
  if (delivery !== undefined) updates.sound_delivery = delivery;
  if (customOrderUrl    !== undefined) updates.sound_customOrderUrl    = customOrderUrl    ?? "";
  if (customMessageUrl  !== undefined) updates.sound_customMessageUrl  = customMessageUrl  ?? "";
  if (customDeliveryUrl !== undefined) updates.sound_customDeliveryUrl = customDeliveryUrl ?? "";
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(appSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

export default router;
