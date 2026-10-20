import { z } from "zod";
import { database, rows } from "./database";
import { authorizeOrder, saveSetting, type Actor } from "./snapshot";
import { defaultSettings } from "./defaults";

export type CoreRequest = (actor: Actor, path: string, method: string, data?: unknown) => Promise<any>;
const positiveId = z.coerce.number().int().positive();
const shortText = z.string().trim().min(1).max(1000);
const availability = z.object({
  available: z.boolean(),
  mode: z.enum(["manual", "today", "minutes"]).default("manual"),
  minutes: z.number().int().min(1).max(10080).optional(),
});
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hoursSchema = z.array(z.object({
  day: z.number().int().min(0).max(6),
  periods: z.array(z.object({ open: clock, close: clock })).max(6),
})).length(7).refine(days => new Set(days.map(day => day.day)).size === 7, "يجب إدخال الأيام السبعة دون تكرار");
export const settingsSchema = z.object({
  storeName: z.string().trim().min(1).max(150),
  storeAddress: z.string().max(300).default(""),
  taxNumber: z.string().max(30).default(""),
  supportPhone: z.string().max(30), supportWhatsapp: z.string().max(30),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  copies: z.number().int().min(1).max(5),
  kitchenCopy: z.boolean(), autoPrint: z.boolean(), soundEnabled: z.boolean(),
  keepAwake: z.boolean(), language: z.enum(["ar", "en"]),
  printerTransport: z.enum(["none", "tcp", "bluetooth", "sunmi", "vendor"]),
  printerAddress: z.string().max(255),
});
const itemInput = z.object({
  itemId: z.string().min(1).max(80).optional(), name: shortText, nameEn: z.string().max(150).optional(),
  category: z.string().min(1).max(80), price: z.number().min(0).max(100000),
  imageUrl: z.string().url().refine(url => url.startsWith("https://"), "رابط الصورة يجب أن يكون HTTPS").nullable().optional(),
  sizes: z.array(z.object({ name: shortText, price: z.number().nonnegative(), enabled: z.boolean() })).optional(),
  options: z.array(z.object({
    groupName: shortText, required: z.boolean(),
    choices: z.array(z.object({ name: shortText, extraPrice: z.number().nonnegative(), available: z.boolean() })),
  })).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
function admin(actor: Actor) {
  if (actor.role !== "admin") throw Object.assign(new Error("هذا الإجراء متاح لمدير المتجر فقط"), { status: 403 });
}
function conflict(message: string): never { throw Object.assign(new Error(message), { status: 409 }); }
export async function runCommand(actor: Actor, kind: string, id: string | undefined, input: unknown, core: CoreRequest) {
  const data = z.record(z.unknown()).parse(input);
  const orderKinds = ["accept", "reject", "ready", "deliver", "assign-driver", "message-send", "message-read"];
  const order = orderKinds.includes(kind) ? await authorizeOrder(actor, positiveId.parse(id)) : null;
  switch (kind) {
    case "accept": {
      if (order?.status !== "pending") conflict("الطلب لم يعد جديدًا؛ حدّث القائمة");
      const { minutes } = z.object({ minutes: z.number().int().min(5).max(180) }).parse(data);
      await rows("INSERT INTO merchant_order_details(order_id,preparation_minutes) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET preparation_minutes=$2,updated_at=now()", [order!.id, minutes]);
      await core(actor, `/orders/${id}/status`, "PATCH", { status: "preparing" });
      break;
    }
    case "reject": {
      if (!["pending", "preparing", "ready"].includes(order!.status)) conflict("يمكن إلغاء الطلب قبل التسليم فقط؛ الطلب مسلّم أو ملغى أو خرج للتوصيل");
      const { reason } = z.object({ reason: shortText }).parse(data);
      await rows("INSERT INTO merchant_order_details(order_id,rejection_reason) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET rejection_reason=$2,updated_at=now()", [order!.id, reason]);
      await core(actor, `/orders/${id}/status`, "PATCH", { status: "cancelled" });
      break;
    }
    case "ready":
      if (order?.status !== "preparing") conflict("يجب أن يكون الطلب قيد التحضير");
      await core(actor, `/orders/${id}/status`, "PATCH", { status: "ready" }); break;
    case "deliver":
      if (!["ready", "out_for_delivery"].includes(order!.status)) conflict("الطلب غير جاهز للتسليم");
      await core(actor, `/orders/${id}/status`, "PATCH", { status: "done" }); break;
    case "assign-driver": {
      if (["done", "cancelled"].includes(order!.status)) conflict("لا يمكن تعيين مندوب لطلب منتهٍ");
      const { driverId } = z.object({ driverId: positiveId }).parse(data);
      const previous = (await rows("SELECT driver_id FROM order_driver_assignments WHERE order_id=$1", [order!.id]))[0];
      await core(actor, `/orders/${id}/assign-driver`, "POST", { driverId });
      await rows("INSERT INTO merchant_assignment_history(order_id,driver_id,previous_driver_id,actor_id) VALUES($1,$2,$3,$4)", [order!.id, driverId, previous?.driverId ?? null, actor.id]);
      break;
    }
    case "driver-save": {
      admin(actor);
      const driver = z.object({ name: shortText, phone: z.string().regex(/^\+?\d{8,15}$/), active: z.boolean(), pin: z.string().regex(/^\d{4,8}$/).optional() }).parse(data);
      if (!id && !driver.pin) throw new Error("أدخل رمز دخول المندوب عند إضافته");
      await core(actor, id ? `/drivers/${positiveId.parse(id)}` : "/drivers", id ? "PUT" : "POST", driver); break;
    }
    case "message-send":
      await core(actor, `/messages/order/${id}`, "POST", { text: shortText.parse(data.text), fromCashier: true }); break;
    case "message-read":
      await core(actor, `/messages/order/${id}/read`, "PATCH", { fromCashier: true }); break;
    case "refund-create": {
      const refund = z.object({ orderId: positiveId, type: z.enum(["cancel", "refund"]), reason: shortText }).parse(data);
      await authorizeOrder(actor, refund.orderId);
      await rows("INSERT INTO merchant_refunds(order_id,type,reason,actor_id) VALUES($1,$2,$3,$4)", [refund.orderId, refund.type, refund.reason, actor.id]); break;
    }
    case "refund-decide": {
      const refund = (await rows("SELECT * FROM merchant_refunds WHERE id=$1", [positiveId.parse(id)]))[0];
      if (!refund) throw Object.assign(new Error("الطلب غير موجود"), { status: 404 });
      await authorizeOrder(actor, refund.orderId);
      const decision = z.object({ decision: z.enum(["accepted", "rejected"]), reason: shortText }).parse(data);
      const updated = await rows("UPDATE merchant_refunds SET status=$2,decision_reason=$3,decided_at=now(),actor_id=$4 WHERE id=$1 AND status='pending' RETURNING id", [id, decision.decision, decision.reason, actor.id]);
      if (!updated.length) conflict("تم اتخاذ قرار سابقًا");
      // Administrative approval only: never pretend money was sent by a payment provider.
      break;
    }
    case "item-save": {
      admin(actor);
      const item = itemInput.parse(data);
      const itemId = id ?? item.itemId ?? `merchant-${crypto.randomUUID()}`;
      await core(actor, id ? `/menu/${encodeURIComponent(itemId)}` : "/menu", id ? "PUT" : "POST", { ...item, itemId }); break;
    }
    case "item-delete":
      admin(actor); await core(actor, `/menu/${encodeURIComponent(z.string().min(1).parse(id))}`, "DELETE"); break;
    case "item-availability":
    case "category-availability": {
      admin(actor);
      const pause = availability.parse(data);
      const items = kind === "item-availability"
        ? await rows("SELECT item_id,available FROM menu_items WHERE item_id=$1", [z.string().min(1).parse(id)])
        : await rows("SELECT item_id,available FROM menu_items WHERE category=$1 ORDER BY item_id", [z.string().min(1).parse(id)]);
      if (!items.length) throw Object.assign(new Error("لا توجد أصناف مطابقة"), { status: 404 });
      let restoreAt: string | null = null;
      if (!pause.available && pause.mode === "minutes") {
        if (!pause.minutes) throw new Error("حدد مدة الإيقاف");
        restoreAt = new Date(Date.now() + pause.minutes * 60000).toISOString();
      }
      if (!pause.available && pause.mode === "today") {
        const saudiDate = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
        restoreAt = new Date(Date.parse(`${saudiDate}T21:00:00Z`)).toISOString();
      }
      for (const item of items) {
        await core(actor, `/menu/${encodeURIComponent(item.itemId)}`, "PUT", { available: pause.available });
        if (pause.available) await rows("DELETE FROM merchant_availability WHERE item_id=$1", [item.itemId]);
        else await rows("INSERT INTO merchant_availability(item_id,restore_at,original_available,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(item_id) DO UPDATE SET restore_at=excluded.restore_at,actor_id=excluded.actor_id,updated_at=now()", [item.itemId, restoreAt, item.available, actor.id]);
      }
      break;
    }
    case "category-save":
      admin(actor);
      if (id) {
        const category = z.object({ name: shortText, nameEn: z.string().default(""), icon: z.string().default("") }).parse(data);
        const client = await database().connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(hashtext('menu_categories'))");
          const result = await client.query("SELECT value FROM app_settings WHERE key='menu_categories' FOR UPDATE");
          const categories = JSON.parse(result.rows[0]?.value ?? "[]");
          if (!categories.some((entry: any) => entry.id === id)) conflict("القسم لم يعد موجودًا");
          if (categories.some((entry: any) => entry.id !== id && entry.name === category.name)) conflict("يوجد قسم بهذا الاسم");
          const revised = categories.map((entry: any) => entry.id === id ? { ...entry, ...category } : entry);
          await client.query("UPDATE app_settings SET value=$1,updated_at=now() WHERE key='menu_categories'", [JSON.stringify(revised)]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      } else await core(actor, "/menu-categories", "POST", z.object({ name: shortText, nameEn: z.string().default(""), icon: z.string().default("") }).parse(data));
      break;
    case "category-delete":
      admin(actor); await core(actor, `/menu-categories/${encodeURIComponent(z.string().min(1).parse(id))}`, "DELETE"); break;
    case "menu-reorder":
      admin(actor);
      if (Array.isArray(data.itemIds)) await core(actor, "/menu/reorder", "PUT", { itemIds: z.array(z.string()).parse(data.itemIds) });
      if (Array.isArray(data.categoryIds)) await core(actor, "/menu-categories/reorder", "PUT", { ids: z.array(z.string()).parse(data.categoryIds) });
      break;
    case "hours-save":
      admin(actor); await saveSetting("hours", hoursSchema.parse(data.hours));
      await saveSetting("closure", { closed: false, forceOpen: false, until: null });
      await saveSetting("hours-managed", true); break;
    case "store-toggle": {
      admin(actor);
      const closure = z.object({ open: z.boolean(), minutes: z.number().int().min(1).max(10080).optional() }).parse(data);
      await saveSetting("closure", { closed: !closure.open, forceOpen: closure.open, until: !closure.open && closure.minutes ? new Date(Date.now() + closure.minutes * 60000).toISOString() : null });
      await saveSetting("hours-managed", true);
      break;
    }
    case "notification-read":
      if (id === "all") {
        await rows("INSERT INTO merchant_notification_reads(event_id,user_id) SELECT id,$1 FROM merchant_events WHERE ($2::int[] IS NULL OR branch_id=ANY($2)) ON CONFLICT DO NOTHING", [actor.id, actor.role === "admin" ? null : actor.branchIds]);
      } else await rows("INSERT INTO merchant_notification_reads(event_id,user_id) SELECT id,$1 FROM merchant_events WHERE id=$2 AND ($3::int[] IS NULL OR branch_id=ANY($3)) ON CONFLICT DO NOTHING", [actor.id, positiveId.parse(id), actor.role === "admin" ? null : actor.branchIds]);
      break;
    case "settings-save":
      admin(actor); await saveSetting("settings", settingsSchema.parse({ ...defaultSettings, ...data })); break;
    default: throw Object.assign(new Error("إجراء غير مدعوم"), { status: 400 });
  }
}
