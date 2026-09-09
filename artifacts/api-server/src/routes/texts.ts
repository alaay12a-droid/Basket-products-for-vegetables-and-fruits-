import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { like } from "drizzle-orm";

const router = Router();

const DEFAULTS: Record<string, string> = {
  txt_name:             "سلة الخضار",
  txt_name_en:          "Sallat Al Khodar",
  txt_tagline:          "للمذاق فن وأصول",
  txt_tagline_en:       "A Fine Art of Taste",
  txt_phone:            "0530707042",
  txt_whatsapp:         "966530707042",
  txt_location:         "تبوك - حي الروضة",
  txt_location_en:      "Tabuk - Al-Rawdah District",
  txt_instagram:        "@rwabi-almndi",
  txt_dhabiha_phone:    "0531555268",
  txt_dhabiha_whatsapp: "966531555268",
  txt_announcement:     "",
  txt_delivery_area:    "تبوك - حي الروضة وما حولها",
  txt_snapchat:         "rwabi-almndi",
  txt_tiktok:           "rwabialmndi",
};

// ── GET /app-texts ─────────────────────────────────────────────────────────────
router.get("/app-texts", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable).where(like(appSettingsTable.key, "txt_%"));
  const result = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json(result);
});

// ── PUT /app-texts ─────────────────────────────────────────────────────────────
router.put("/app-texts", async (req, res) => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!key.startsWith("txt_")) continue;
    await db
      .insert(appSettingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(value), updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

export default router;
