import pg from "pg";
import { createHash } from "node:crypto";

let pool: pg.Pool | undefined;
export function database() {
  // Never fall back to the workspace database: it can belong to another store.
  // The existing connection is used only when explicitly selected by the owner.
  const source = process.env.MERCHANT_DATABASE_SOURCE ?? "MERCHANT_DATABASE_URL";
  if (!["MERCHANT_DATABASE_URL", "SCHEMA_BOOTSTRAP_DATABASE_URL"].includes(source)) {
    throw new Error("مصدر اتصال التاجر غير صالح؛ لم يتم استخدام اتصال بديل");
  }
  const connectionString = process.env[source];
  let valid = false;
  try { valid = ["postgres:", "postgresql:"].includes(new URL(connectionString ?? "").protocol); } catch {}
  if (!valid) throw new Error("يلزم إعداد رابط PostgreSQL صالح لقاعدة السلة في مصدر اتصال التاجر المختار");
  return pool ??= new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    max: 5,
  });
}
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const enabled = () => process.env.MERCHANT_ENABLED === "true";
export async function verifyBasketDatabase() {
  const result = await database().query(
    "SELECT EXISTS (SELECT 1 FROM app_settings WHERE value LIKE $1) AS matches",
    ["%السلة%"],
  );
  if (!result.rows[0]?.matches) throw new Error("قاعدة البيانات لم تُثبت هويتها كمتجر السلة؛ تم إيقاف الربط لحماية البيانات");
}
export async function verifySchema() {
  const { rows } = await database().query("SELECT to_regclass('merchant_sessions') IS NOT NULL AS ready");
  if (!rows[0]?.ready) throw new Error("جداول خدمة التاجر غير مثبتة؛ يلزم تفعيل الربط بعد مراجعة قاعدة البيانات");
}
export function camelRow(row: Record<string, unknown>): Record<string, any> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
    value instanceof Date ? value.toISOString() : value,
  ]));
}
export async function rows(sql: string, params: unknown[] = []) {
  return (await database().query(sql, params)).rows.map(camelRow);
}
