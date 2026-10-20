import { rows } from "./database";
import { defaultHours, defaultSettings, isOpenAt } from "./defaults";

export interface Actor { id: number; username: string; role: string; branchIds: number[] }
export async function setting<T>(key: string, fallback: T): Promise<T> {
  const result = await rows("SELECT value FROM merchant_settings WHERE key=$1", [key]);
  return result[0]?.value as T ?? fallback;
}
export async function saveSetting(key: string, value: unknown) {
  await rows("INSERT INTO merchant_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()", [key, JSON.stringify(value)]);
}
export async function effectiveHours() {
  const configured = await setting<typeof defaultHours | null>("hours", null);
  if (configured) return configured;
  const record = (await rows("SELECT value FROM app_settings WHERE key='branch_hours'"))[0];
  const legacy = record ? JSON.parse(record.value) : { enabled: false };
  if (!legacy.enabled) return defaultHours.map(day => ({ ...day, periods: [{ open: "00:00", close: "00:00" }] }));
  if (!Array.isArray(legacy.days) || legacy.days.length !== 7) throw new Error("تعذّر قراءة ساعات المتجر الحالية؛ لم تُستبدل بساعات افتراضية");
  return legacy.days.map((day: any, index: number) => ({
    day: index, periods: day.enabled ? [{ open: day.open, close: day.close }] : [],
  })) as typeof defaultHours;
}
export async function authorizeOrder(actor: Actor, id: number) {
  const order = (await rows("SELECT id,branch_id,status FROM orders WHERE id=$1", [id]))[0];
  if (!order || (actor.role !== "admin" && !actor.branchIds.includes(order.branchId))) {
    throw Object.assign(new Error("الطلب غير موجود أو غير مصرح لهذا الفرع"), { status: 404 });
  }
  return order;
}
export interface ArchiveFilter { search?: string; date?: string; status?: string; before?: number }
export async function snapshot(actor: Actor, archive?: ArchiveFilter) {
  const branchIds = actor.role === "admin" ? null : actor.branchIds;
  const orders = await rows(`
    SELECT o.*, d.name AS driver_name, a.driver_id, m.preparation_minutes,m.rejection_reason
    FROM orders o
    LEFT JOIN order_driver_assignments a ON a.order_id=o.id
    LEFT JOIN delivery_drivers d ON d.id=a.driver_id
    LEFT JOIN merchant_order_details m ON m.order_id=o.id
    WHERE ($1::int[] IS NULL OR o.branch_id=ANY($1))
      AND ($2::text IS NULL OR o.daily_number::text=$2 OR o.id::text=$2 OR o.customer_name ILIKE '%'||$2||'%' OR o.customer_phone ILIKE '%'||$2||'%' OR o.items::text ILIKE '%'||$2||'%')
      AND ($3::date IS NULL OR (o.created_at + interval '3 hours')::date=$3)
      AND ($4::text IS NULL OR o.status::text=$4 OR ($4='ready' AND o.status::text='out_for_delivery'))
      AND ($5::int IS NULL OR o.id<$5)
      AND ($6::boolean OR o.status::text IN ('pending','preparing','ready','out_for_delivery') OR o.id IN (
        SELECT id FROM orders WHERE ($1::int[] IS NULL OR branch_id=ANY($1)) ORDER BY id DESC LIMIT 1000
      ))
    ORDER BY o.id DESC ${archive ? "LIMIT 250" : ""}`, [branchIds, archive?.search || null, archive?.date || null, archive?.status || null, archive?.before ?? null, !!archive]);
  for (const order of orders) {
    delete order.customerPushToken;
    // The three-stage merchant board keeps dispatched deliveries in the ready tab.
    if (order.status === "out_for_delivery") order.status = "ready";
    // Legacy order totals are halalas; nested order items already store SAR.
    order.totalPrice = Number(order.totalPrice) / 100;
    order.deliveryFee = Number(order.deliveryFee) / 100;
    if (order.discountAmount != null) order.discountAmount = Number(order.discountAmount) / 100;
    order.taxAmount = Math.round(Number(order.totalPrice) * 15 / 115 * 100) / 100;
  }
  const ids = orders.map(order => order.id);
  const [products, storedCategories, drivers, messages, refunds, assignmentHistory, notifications, settings, hours, closure] = await Promise.all([
    rows("SELECT i.*,a.restore_at AS unavailable_until FROM menu_items i LEFT JOIN merchant_availability a ON a.item_id=i.item_id ORDER BY i.sort_order,i.id"),
    rows("SELECT value FROM app_settings WHERE key='menu_categories'"),
    rows("SELECT DISTINCT d.id,d.name,d.phone,d.active,d.is_online,d.photo_url FROM delivery_drivers d LEFT JOIN driver_branch_memberships b ON b.driver_id=d.id AND b.active=true WHERE ($1::int[] IS NULL OR b.branch_id=ANY($1)) ORDER BY d.name", [branchIds]),
    rows("SELECT id,order_id,text,from_cashier,created_at,read_at FROM messages WHERE order_id=ANY($1::int[]) AND driver_id IS NULL ORDER BY created_at", [ids]),
    rows("SELECT * FROM merchant_refunds WHERE order_id=ANY($1::int[]) ORDER BY created_at DESC", [ids]),
    rows("SELECT h.*,d.name AS driver_name FROM merchant_assignment_history h JOIN delivery_drivers d ON d.id=h.driver_id WHERE h.order_id=ANY($1::int[]) ORDER BY h.created_at DESC", [ids]),
    rows("SELECT e.*,r.read_at FROM merchant_events e LEFT JOIN merchant_notification_reads r ON r.event_id=e.id AND r.user_id=$1 WHERE ($2::int[] IS NULL OR e.branch_id=ANY($2)) ORDER BY e.created_at DESC LIMIT 500", [actor.id, branchIds]),
    setting("settings", defaultSettings),
    effectiveHours(),
    setting("closure", { closed: false, forceOpen: false, until: null as string | null }),
  ]);
  let categories: unknown[] = [];
  for (const product of products) {
    product.price = Number(product.price) / 100;
    product.sizes = (product.sizes ?? []).map((size: any) => ({ ...size, price: Number(size.price) / 100 }));
    product.options = (product.options ?? []).map((group: any) => ({
      ...group, choices: group.choices.map((choice: any) => ({ ...choice, extraPrice: Number(choice.extraPrice) / 100 })),
    }));
  }
  try { categories = storedCategories[0] ? JSON.parse(storedCategories[0].value) : []; } catch { throw new Error("تعذّر قراءة أقسام المتجر؛ لم يتم استبدالها بأقسام افتراضية"); }
  return {
    user: { id: actor.id, username: actor.username, role: actor.role },
    orders, products, categories, drivers, messages, refunds, assignmentHistory, notifications,
    settings: { ...defaultSettings, ...settings }, hours,
    storeOpen: isOpenAt(hours, closure.until, closure.closed, new Date(), closure.forceOpen), closedUntil: closure.until,
    serverTime: new Date().toISOString(),
  };
}
