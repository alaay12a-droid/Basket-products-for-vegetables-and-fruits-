import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { like } from "drizzle-orm";

const router = Router();

const DEFAULTS: Record<string, string> = {
  txt_name:             "منتجات السلة للخضار والفواكه",
  txt_name_en:          "Basket Vegetables and Fruits",
  txt_tagline:          "خضار وفواكه طازجة كل يوم",
  txt_tagline_en:       "Fresh vegetables and fruits every day",
  txt_phone:            "0596548325",
  txt_whatsapp:         "966596548325",
  txt_location:         "تبوك - حي الصفا",
  txt_location_en:      "Tabuk - Al Safa District",
  txt_instagram:        "",
  txt_dhabiha_phone:    "",
  txt_dhabiha_whatsapp: "",
  txt_announcement:     "",
  txt_delivery_area:    "تبوك - حي الصفا وما حولها",
  txt_snapchat:         "",
  txt_tiktok:           "",
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
