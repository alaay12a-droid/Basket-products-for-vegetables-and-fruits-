import { Router } from "express";
import { db, menuItemsTable, appSettingsTable } from "@workspace/db";
import { eq, asc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

const router = Router();

const MENU_CATEGORIES_SETTING_KEY = "menu_categories";

type MenuCategoryConfig = {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  isCustom?: boolean;
};

const DEFAULT_MENU_CATEGORIES: MenuCategoryConfig[] = [
  { id: "chicken",  name: "الدجاج",           nameEn: "Chicken",     icon: "🍗" },
  { id: "meat",     name: "اللحوم",           nameEn: "Meat",        icon: "🥩" },
  { id: "mains",    name: "الأطباق الرئيسية", nameEn: "Main Dishes", icon: "🍽️" },
  { id: "sides",    name: "الإيدامات",        nameEn: "Sides",       icon: "🥘" },
  { id: "salads",   name: "السلطات",          nameEn: "Salads",      icon: "🥗" },
  { id: "desserts", name: "الحلويات",         nameEn: "Desserts",    icon: "🍮" },
  { id: "drinks",   name: "المشروبات",        nameEn: "Drinks",      icon: "🥤" },
  { id: "extras",   name: "إضافات",           nameEn: "Extras",      icon: "✨" },
];

function normalizeMenuCategories(value: unknown): MenuCategoryConfig[] {
  if (!Array.isArray(value)) return DEFAULT_MENU_CATEGORIES;

  const seen = new Set<string>();
  const stored = value.filter((category): category is Partial<MenuCategoryConfig> =>
    typeof category === "object" && category !== null &&
    typeof (category as Partial<MenuCategoryConfig>).id === "string" &&
    typeof (category as Partial<MenuCategoryConfig>).name === "string" &&
    ((category as Partial<MenuCategoryConfig>).name?.trim().length ?? 0) > 0
  );

  const categories: MenuCategoryConfig[] = [];
  for (const category of stored) {
    if (seen.has(category.id!)) continue;
    const defaultCategory = DEFAULT_MENU_CATEGORIES.find(item => item.id === category.id);
    categories.push({
      id: category.id!,
      name: category.name!.trim(),
      nameEn: typeof category.nameEn === "string" && category.nameEn.trim()
        ? category.nameEn.trim()
        : category.name!.trim(),
      icon: typeof category.icon === "string" && category.icon.trim() ? category.icon : "🍽️",
      ...(defaultCategory ? {} : { isCustom: true }),
    });
    seen.add(category.id!);
  }

  // Keep legacy/default sections available if the settings record predates them.
  for (const category of DEFAULT_MENU_CATEGORIES) {
    if (!seen.has(category.id)) categories.push(category);
  }

  return categories;
}

async function getMenuCategories(): Promise<MenuCategoryConfig[]> {
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, MENU_CATEGORIES_SETTING_KEY))
    .limit(1);
  let categories = [...DEFAULT_MENU_CATEGORIES];
  if (row) {
    try {
      categories = [...normalizeMenuCategories(JSON.parse(row.value))];
    } catch {
      categories = [...DEFAULT_MENU_CATEGORIES];
    }
  }

  // Preserve any legacy category already used by an item even if it predates
  // the configurable category list.
  const existingCategories = await db
    .select({ id: menuItemsTable.category })
    .from(menuItemsTable)
    .groupBy(menuItemsTable.category);
  const configuredIds = new Set(categories.map(category => category.id));
  for (const existing of existingCategories) {
    if (configuredIds.has(existing.id)) continue;
    categories.push({
      id: existing.id,
      name: existing.id,
      nameEn: existing.id,
      icon: "🍽️",
      isCustom: true,
    });
  }

  return categories;
}

async function saveMenuCategories(categories: MenuCategoryConfig[]) {
  await db
    .insert(appSettingsTable)
    .values({
      key: MENU_CATEGORIES_SETTING_KEY,
      value: JSON.stringify(categories),
    })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: JSON.stringify(categories), updatedAt: new Date() },
    });
}

const INITIAL_ITEMS = [
  { itemId: "c1",   name: "مندي دجاج حبة كاملة مع الرز",    nameEn: "Whole Chicken Mandi with Rice",       category: "chicken",  price: 4400,   imageKey: "chicken_mandi_new",  sortOrder: 1  },
  { itemId: "c2",   name: "مندي دجاج نص حبة مع الرز",       nameEn: "Half Chicken Mandi with Rice",        category: "chicken",  price: 2200,   imageKey: "chicken_mandi_new",  sortOrder: 2  },
  { itemId: "ma1",  name: "مضغوط دجاج حبة كاملة مع الرز",   nameEn: "Whole Chicken Maqbous with Rice",     category: "chicken",  price: 4400,   imageKey: "maqbous_chicken",    sortOrder: 3  },
  { itemId: "ma2",  name: "مضغوط دجاج نص حبة مع الرز",      nameEn: "Half Chicken Maqbous with Rice",      category: "chicken",  price: 2200,   imageKey: "maqbous_half",       sortOrder: 4  },
  { itemId: "ma3",  name: "دجاج مدفون حبة كاملة مع الرز",   nameEn: "Whole Buried Chicken with Rice",      category: "chicken",  price: 4400,   imageKey: "mdfoon_chicken",     sortOrder: 5  },
  { itemId: "ma4",  name: "دجاج مدفون نص حبة مع الرز",      nameEn: "Half Buried Chicken with Rice",       category: "chicken",  price: 2200,   imageKey: "mdfoon_chicken",     sortOrder: 6  },
  { itemId: "c5",   name: "نص حبة على الفحم مع الرز",        nameEn: "Half Grilled Chicken with Rice",      category: "chicken",  price: 2200,   imageKey: "chicken_grill",      sortOrder: 7  },
  { itemId: "c6",   name: "حبة على الفحم مع الرز",           nameEn: "Whole Grilled Chicken with Rice",     category: "chicken",  price: 4400,   imageKey: "chicken_grill",      sortOrder: 8  },
  { itemId: "c7",   name: "نص حبة على الفحم سادة",           nameEn: "Half Grilled Chicken Plain",          category: "chicken",  price: 1500,   imageKey: "chicken_grill",      sortOrder: 9  },
  { itemId: "c8",   name: "حبة على الفحم سادة",              nameEn: "Whole Grilled Chicken Plain",         category: "chicken",  price: 3000,   imageKey: "chicken_grill",      sortOrder: 10 },
  { itemId: "c3",   name: "رز مندي",                         nameEn: "Mandi Rice",                          category: "chicken",  price: 700,    imageKey: "rice_mandi",         sortOrder: 11 },
  { itemId: "c4",   name: "رز بشاور",                        nameEn: "Peshawar Rice",                       category: "chicken",  price: 700,    imageKey: "rice",               sortOrder: 12 },
  { itemId: "m1",   name: "لحم مندي بلدي - تيس كامل",        nameEn: "Local Lamb Mandi - Whole Goat",       category: "meat",     price: 140000, imageKey: "goat_mandi",         sortOrder: 1  },
  { itemId: "m2",   name: "لحم مندي بلدي - نص تيس",          nameEn: "Local Lamb Mandi - Half Goat",        category: "meat",     price: 70000,  imageKey: "goat_mandi",         sortOrder: 2  },
  { itemId: "m3",   name: "لحم مندي بلدي - ربع تيس",         nameEn: "Local Lamb Mandi - Quarter Goat",     category: "meat",     price: 35000,  imageKey: "goat_mandi",         sortOrder: 3  },
  { itemId: "m4",   name: "لحم مندي - نفر",                  nameEn: "Lamb Mandi - Per Person",             category: "meat",     price: 9000,   imageKey: "meat_mandi_nfar",    sortOrder: 4  },
  { itemId: "h1",   name: "حنيذ بلدي - كامل",                nameEn: "Local Haneeth - Whole",               category: "meat",     price: 140000, imageKey: "goat_mandi",         sortOrder: 5  },
  { itemId: "h2",   name: "حنيذ بلدي - نفر",                 nameEn: "Local Haneeth - Per Person",          category: "meat",     price: 9000,   imageKey: "meat_mandi_nfar",    sortOrder: 6  },
  { itemId: "s1",   name: "إيدام ملوخية صغير",               nameEn: "Mulukhiyah Stew Small",               category: "sides",    price: 400,    imageKey: "molokhia",           sortOrder: 1  },
  { itemId: "s2",   name: "إيدام ملوخية كبير",               nameEn: "Mulukhiyah Stew Large",               category: "sides",    price: 600,    imageKey: "molokhia",           sortOrder: 2  },
  { itemId: "e6",   name: "إيدام مصقعة صغير",                nameEn: "Masoqa Stew Small",                   category: "sides",    price: 400,    imageKey: "masqaa",             sortOrder: 3  },
  { itemId: "e7",   name: "إيدام مصقعة كبير",                nameEn: "Masoqa Stew Large",                   category: "sides",    price: 600,    imageKey: "masqaa",             sortOrder: 4  },
  { itemId: "e4",   name: "باميه صغير",                      nameEn: "Okra Small",                          category: "sides",    price: 500,    imageKey: "bamya",              sortOrder: 5  },
  { itemId: "e5",   name: "باميه كبير",                      nameEn: "Okra Large",                          category: "sides",    price: 700,    imageKey: "bamya",              sortOrder: 6  },
  { itemId: "s5",   name: "إيدام فرن كبير",                  nameEn: "Oven Stew Large",                     category: "sides",    price: 600,    imageKey: null,                 sortOrder: 7  },
  { itemId: "sa1",  name: "سلطة خيار باللبن",                nameEn: "Cucumber Yogurt Salad",               category: "salads",   price: 300,    imageKey: "salad_laban",        sortOrder: 1  },
  { itemId: "sa2",  name: "سلطة خضراء",                      nameEn: "Green Salad",                         category: "salads",   price: 300,    imageKey: "salad_green",        sortOrder: 2  },
  { itemId: "sa3",  name: "طحينة سائلة",                     nameEn: "Tahini Sauce",                        category: "salads",   price: 300,    imageKey: "tahini",             sortOrder: 3  },
  { itemId: "d1",   name: "حلا أوريو",                       nameEn: "Oreo Dessert",                        category: "desserts", price: 400,    imageKey: "oreo_dessert",       sortOrder: 1  },
  { itemId: "d2",   name: "حلا تطلي",                        nameEn: "Tatli Dessert",                       category: "desserts", price: 400,    imageKey: "tatli",              sortOrder: 2  },
  { itemId: "d3",   name: "حلا مهلبية",                      nameEn: "Muhalabia",                           category: "desserts", price: 400,    imageKey: "muhalabia",          sortOrder: 3  },
  { itemId: "d4",   name: "كنافة قشطة",                      nameEn: "Kunafa with Cream",                   category: "desserts", price: 800,    imageKey: "kunafa",             sortOrder: 4  },
  { itemId: "dr1",  name: "بيبسي عائلي 2.25 لتر",           nameEn: "Pepsi Family 2.25L",                  category: "drinks",   price: 900,    imageKey: "pepsi_family",       sortOrder: 1  },
  { itemId: "dr2",  name: "بيبسي وسط 1 لتر",               nameEn: "Pepsi Medium 1L",                     category: "drinks",   price: 500,    imageKey: "pepsi",              sortOrder: 2  },
  { itemId: "dr3",  name: "بيبسي علبة",                     nameEn: "Pepsi Can",                           category: "drinks",   price: 250,    imageKey: "pepsi_can",          sortOrder: 3  },
  { itemId: "dr9",  name: "بيبسي دايت علبة",               nameEn: "Pepsi Diet Can",                      category: "drinks",   price: 250,    imageKey: "pepsi_diet_can",     sortOrder: 4  },
  { itemId: "dr5",  name: "ديو عائلي",                      nameEn: "Mountain Dew Family",                 category: "drinks",   price: 900,    imageKey: "dew",                sortOrder: 5  },
  { itemId: "dr6",  name: "ميرندا برتقال عائلي",            nameEn: "Mirinda Orange Family",               category: "drinks",   price: 900,    imageKey: "mirinda_orange",     sortOrder: 6  },
  { itemId: "dr7",  name: "ميرندا حمضيات عائلي",            nameEn: "Mirinda Citrus Family",               category: "drinks",   price: 900,    imageKey: "mirinda_citrus",     sortOrder: 7  },
  { itemId: "dr11", name: "ميرندا حمضيات علبة",             nameEn: "Mirinda Citrus Can",                  category: "drinks",   price: 250,    imageKey: "mirinda_citrus_can", sortOrder: 8  },
  { itemId: "dr8",  name: "سفن أب عائلي",                   nameEn: "7UP Family",                          category: "drinks",   price: 900,    imageKey: "sevenup",            sortOrder: 9  },
  { itemId: "dr10", name: "سفن أب فري علبة",                nameEn: "7UP Free Can",                        category: "drinks",   price: 250,    imageKey: "sevenup_can",        sortOrder: 10 },
  { itemId: "dr4",  name: "لبن المراعي علبة",               nameEn: "Almarai Laban Can",                   category: "drinks",   price: 250,    imageKey: "laban",              sortOrder: 11 },
  { itemId: "dr12", name: "لبن القرية حجم كبير",            nameEn: "Al-Qariah Laban Large",               category: "drinks",   price: 900,    imageKey: "laban_qariah_lg",    sortOrder: 12 },
  { itemId: "dr13", name: "لبن القرية حجم صغير",            nameEn: "Al-Qariah Laban Small",               category: "drinks",   price: 300,    imageKey: "laban_qariah_sm",    sortOrder: 13 },
  { itemId: "dr14", name: "لبن المراعي 2 لتر",              nameEn: "Almarai Laban 2L",                    category: "drinks",   price: 1100,   imageKey: "laban_almarai_lg",   sortOrder: 14 },
  { itemId: "dr15", name: "لبن المراعي 1 لتر",              nameEn: "Almarai Laban 1L",                    category: "drinks",   price: 600,    imageKey: "laban_almarai_1l",   sortOrder: 15 },
  { itemId: "e2",   name: "قرصان صغير",                     nameEn: "Qursan Small",                        category: "extras",   price: 400,    imageKey: "qursan",             sortOrder: 1  },
  { itemId: "e3",   name: "قرصان كبير",                     nameEn: "Qursan Large",                        category: "extras",   price: 600,    imageKey: "qursan",             sortOrder: 2  },
  { itemId: "e11",  name: "جريش صغير",                      nameEn: "Jareesh Small",                       category: "extras",   price: 400,    imageKey: "jareesh",            sortOrder: 3  },
  { itemId: "e12",  name: "جريش كبير",                      nameEn: "Jareesh Large",                       category: "extras",   price: 600,    imageKey: "jareesh",            sortOrder: 4  },
  { itemId: "e8",   name: "سلطة خيار باللبن",               nameEn: "Cucumber Yogurt Salad",               category: "extras",   price: 300,    imageKey: "salad_laban",        sortOrder: 5  },
  { itemId: "e9",   name: "سلطة خضراء",                     nameEn: "Green Salad",                         category: "extras",   price: 300,    imageKey: "salad_green",        sortOrder: 6  },
  { itemId: "e10",  name: "طحينية سائلة",                   nameEn: "Tahini Sauce",                        category: "extras",   price: 300,    imageKey: "tahini",             sortOrder: 7  },
];

export async function seedMenu() {
  // Only seed when the table is completely empty (first-time setup).
  // This prevents re-inserting items that were intentionally deleted from the dashboard.
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(menuItemsTable);
  if (countRow && Number(countRow.count) > 0) {
    return; // Table already has data — skip seeding entirely
  }
  for (const item of INITIAL_ITEMS) {
    await db
      .insert(menuItemsTable)
      .values({ ...item, available: true })
      .onConflictDoNothing();
  }
}

const sizeOptionSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0),
  enabled: z.boolean(),
});

const optionChoiceSchema = z.object({
  name: z.string().min(1),
  extraPrice: z.number().min(0),
  available: z.boolean(),
});

const simpleChoiceSchema = z.object({
  name: z.string().min(1),
  extraPrice: z.number().min(0),
  available: z.boolean(),
});

const optionGroupSchema = z.object({
  groupName: z.string().min(1),
  required: z.boolean(),
  choices: z.array(optionChoiceSchema),
});

const createSchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  category: z.string().min(1),
  price: z.number().positive(),
  imageKey: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  sizes: z.array(sizeOptionSchema).optional(),
  options: z.array(optionGroupSchema).optional(),
  riceTypes: z.array(simpleChoiceSchema).optional(),
  additions: z.array(simpleChoiceSchema).optional(),
  calories: z.number().int().min(0).nullable().optional(),
  walkingMinutes: z.number().int().min(0).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  category: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  available: z.boolean().optional(),
  imageKey: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  sizes: z.array(sizeOptionSchema).optional(),
  options: z.array(optionGroupSchema).optional(),
  riceTypes: z.array(simpleChoiceSchema).optional(),
  additions: z.array(simpleChoiceSchema).optional(),
  calories: z.number().int().min(0).nullable().optional(),
  walkingMinutes: z.number().int().min(0).nullable().optional(),
});

router.get("/menu", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const items = await db
    .select()
    .from(menuItemsTable)
    .orderBy(asc(menuItemsTable.category), asc(menuItemsTable.sortOrder));
  res.json(items);
});

router.get("/menu-categories", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getMenuCategories());
});

const reorderItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
});

router.put("/menu/reorder", async (req, res) => {
  const parsed = reorderItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ترتيب الأصناف غير صحيح" });
    return;
  }

  const itemIds = [...new Set(parsed.data.itemIds)];
  if (itemIds.length !== parsed.data.itemIds.length) {
    res.status(400).json({ error: "لا يمكن تكرار الصنف في الترتيب" });
    return;
  }

  const existingItems = await db
    .select({ itemId: menuItemsTable.itemId, category: menuItemsTable.category })
    .from(menuItemsTable)
    .where(inArray(menuItemsTable.itemId, itemIds));

  if (existingItems.length !== itemIds.length || new Set(existingItems.map(item => item.category)).size !== 1) {
    res.status(400).json({ error: "يجب ترتيب أصناف القسم نفسه فقط" });
    return;
  }

  const category = existingItems[0].category;
  const allCategoryItems = await db
    .select({ itemId: menuItemsTable.itemId })
    .from(menuItemsTable)
    .where(eq(menuItemsTable.category, category));
  if (allCategoryItems.length !== itemIds.length) {
    res.status(409).json({ error: "تم تحديث القسم، أعد تحميل القائمة وحاول مرة أخرى" });
    return;
  }

  await db.transaction(async tx => {
    for (const [index, itemId] of itemIds.entries()) {
      await tx
        .update(menuItemsTable)
        .set({ sortOrder: index + 1 })
        .where(eq(menuItemsTable.itemId, itemId));
    }
  });

  res.json({ ok: true });
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

router.post("/menu-categories", async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "اسم القسم غير صحيح" });
    return;
  }

  const categories = await getMenuCategories();
  if (categories.some(category => category.name.localeCompare(parsed.data.name, undefined, { sensitivity: "accent" }) === 0)) {
    res.status(409).json({ error: "يوجد قسم بهذا الاسم بالفعل" });
    return;
  }

  const category: MenuCategoryConfig = {
    id: `custom-${randomUUID()}`,
    name: parsed.data.name,
    nameEn: parsed.data.name,
    icon: "🍽️",
    isCustom: true,
  };
  const updatedCategories = [...categories, category];
  await saveMenuCategories(updatedCategories);
  res.status(201).json(category);
});

const reorderCategoriesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

router.put("/menu-categories/reorder", async (req, res) => {
  const parsed = reorderCategoriesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ترتيب الأقسام غير صحيح" });
    return;
  }

  const categories = await getMenuCategories();
  const knownIds = new Set(categories.map(category => category.id));
  const requestedIds = [...new Set(parsed.data.ids)];
  if (
    requestedIds.length !== parsed.data.ids.length ||
    requestedIds.some(id => !knownIds.has(id))
  ) {
    res.status(400).json({ error: "الأقسام المحددة غير صحيحة" });
    return;
  }

  const requestedSet = new Set(requestedIds);
  const reordered = [
    ...requestedIds.map(id => categories.find(category => category.id === id)!),
    ...categories.filter(category => !requestedSet.has(category.id)),
  ];
  await saveMenuCategories(reordered);
  res.json(reordered);
});

router.post("/menu", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const [item] = await db.insert(menuItemsTable).values({
    itemId: randomUUID(),
    name: data.name,
    nameEn: data.nameEn ?? null,
    category: data.category,
    price: Math.round(data.price * 100),
    available: true,
    imageKey: data.imageKey ?? null,
    imageUrl: data.imageUrl ?? null,
    sizes: (data.sizes ?? []).map(s => ({ ...s, price: Math.round(s.price * 100) })),
    options: (data.options ?? []).map(g => ({
      ...g,
      choices: g.choices.map(c => ({ ...c, extraPrice: Math.round(c.extraPrice * 100) })),
    })),
    riceTypes: (data.riceTypes ?? []).map(r => ({ ...r, extraPrice: Math.round(r.extraPrice * 100) })),
    additions: (data.additions ?? []).map(a => ({ ...a, extraPrice: Math.round(a.extraPrice * 100) })),
    calories: data.calories ?? null,
    walkingMinutes: data.walkingMinutes ?? null,
    sortOrder: 999,
  }).returning();
  req.log.info({ itemId: item.itemId }, "Menu item created");
  res.status(201).json(item);
});

router.put("/menu/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.nameEn !== undefined) updates.nameEn = data.nameEn;
  if (data.category !== undefined) updates.category = data.category;
  if (data.price !== undefined) updates.price = Math.round(data.price * 100);
  if (data.available !== undefined) updates.available = data.available;
  if (data.imageKey !== undefined) updates.imageKey = data.imageKey;
  if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
  if (data.sizes !== undefined) updates.sizes = data.sizes.map(s => ({ ...s, price: Math.round(s.price * 100) }));
  if (data.options !== undefined) updates.options = data.options.map(g => ({
    ...g,
    choices: g.choices.map(c => ({ ...c, extraPrice: Math.round(c.extraPrice * 100) })),
  }));
  if (data.riceTypes !== undefined) updates.riceTypes = data.riceTypes.map(r => ({ ...r, extraPrice: Math.round(r.extraPrice * 100) }));
  if (data.additions !== undefined) updates.additions = data.additions.map(a => ({ ...a, extraPrice: Math.round(a.extraPrice * 100) }));
  if (data.calories !== undefined) updates.calories = data.calories;
  if (data.walkingMinutes !== undefined) updates.walkingMinutes = data.walkingMinutes;
  if (data.stock !== undefined) {
    updates.stock = data.stock;
    if (data.stock === null) updates.available = true;
    else if (data.stock === 0) updates.available = false;
    else if (data.stock > 0) updates.available = true;
  }

  const [item] = await db
    .update(menuItemsTable)
    .set(updates)
    .where(eq(menuItemsTable.itemId, itemId))
    .returning();

  if (!item) {
    res.status(404).json({ error: "الصنف غير موجود" });
    return;
  }
  res.json(item);
});

router.delete("/menu/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const [item] = await db
    .delete(menuItemsTable)
    .where(eq(menuItemsTable.itemId, itemId))
    .returning();
  if (!item) {
    res.status(404).json({ error: "الصنف غير موجود" });
    return;
  }
  res.json({ success: true });
});

// DELETE /menu/:itemId/image — delete uploaded image from storage and clear DB reference
router.delete("/menu/:itemId/image", async (req, res) => {
  const { itemId } = req.params;
  const [item] = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.itemId, itemId));

  if (!item) {
    res.status(404).json({ error: "الصنف غير موجود" });
    return;
  }

  if (item.imageUrl) {
    try {
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(item.imageUrl);
      if (normalizedPath.startsWith("/objects/")) {
        const file = await objectStorageService.getObjectEntityFile(normalizedPath);
        await file.delete();
        req.log.info({ itemId, normalizedPath }, "Menu item image deleted from storage");
      }
    } catch (err) {
      req.log.warn({ err, itemId }, "Could not delete image from storage — clearing DB reference anyway");
    }
  }

  await db
    .update(menuItemsTable)
    .set({ imageUrl: null, imageKey: null })
    .where(eq(menuItemsTable.itemId, itemId));

  res.json({ success: true });
});

export default router;
