import { readFile } from "node:fs/promises";
import { database, verifyBasketDatabase } from "../server/database";

// Never called by dev/build/start or by an APK.
// Explicit operator command, requiring separate target confirmation.
if (process.env.MERCHANT_SCHEMA_CONFIRM !== "BASKET_ONLY") {
  throw new Error("يلزم تأكيد قاعدة السلة صراحة قبل تثبيت الجداول الإضافية");
}
await verifyBasketDatabase();
try {
  await database().query(await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"));
  console.log("Merchant-only tables installed. No existing tables altered.");
} finally {
  await database().end();
}
