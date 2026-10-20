import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { merchantService } from "../server/service";
import { isOpenAt, defaultHours } from "../server/defaults";

// Tests never connect to a database or send real notifications.
assert.equal(process.env.MERCHANT_ENABLED, undefined, "Run this suite without activating the live merchant service");
const service = merchantService("/basket-merchant/", 0);
const server = createServer(service.app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
try {
  const status = await fetch(`${origin}/basket-merchant/api/merchant/status`);
  const ready = await status.json() as { enabled: boolean; message: string };
  assert.equal(ready.enabled, false);
  assert.ok(ready.message.includes("غير مفعّلة"));
  for (const path of ["state", "login", "actions"]) {
    const response = await fetch(`${origin}/basket-merchant/api/merchant/${path}`, path === "state" ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 503, `disabled ${path} must never reach a database`);
  }
  const malicious = await fetch(`${origin}/basket-merchant/api/merchant/actions`, {
    method: "POST", headers: { origin: "https://untrusted.invalid", "content-type": "application/json" }, body: "{}",
  });
  assert.equal(malicious.status, 403);
  assert.equal((await fetch(`${origin}/basket-merchant/_core/api/orders`)).status, 404);
} finally { server.close(); await once(server, "close"); }

const hours = defaultHours.map(day => ({ ...day, periods: day.day === 2 ? [{ open: "09:00", close: "12:00" }, { open: "16:00", close: "23:00" }] : [] }));
assert.equal(isOpenAt(hours, null, false, new Date("2026-10-20T07:00:00Z")), true);
assert.equal(isOpenAt(hours, null, false, new Date("2026-10-20T10:00:00Z")), false);
assert.equal(isOpenAt(hours, null, false, new Date("2026-10-20T14:00:00Z")), true);
assert.equal(isOpenAt(hours, "2026-10-20T20:00:00Z", true, new Date("2026-10-20T14:00:00Z")), false);
assert.equal(isOpenAt(hours, "2026-10-20T13:00:00Z", true, new Date("2026-10-20T14:00:00Z")), true);
const overnight = defaultHours.map(day => ({ ...day, periods: day.day === 1 ? [{ open: "22:00", close: "02:00" }] : [] }));
assert.equal(isOpenAt(overnight, null, false, new Date("2026-10-19T22:00:00Z")), true);
assert.equal(isOpenAt(overnight, null, false, new Date("2026-10-19T23:30:00Z")), false);
assert.equal(isOpenAt(defaultHours, null, false), false, "all days explicitly closed must not become always-open");
assert.equal(isOpenAt(defaultHours, null, false, new Date(), true), true, "open-now override must work outside scheduled hours");

// Execute actual command implementation with isolated in-memory boundaries.
const source = await readFile(new URL("../server/commands.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("commands.ts", source, ts.ScriptTarget.Latest, true);
const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join("\n").replace(/^export /gm, "");
const js = ts.transpileModule(body + "\nglobalThis.runCommand=runCommand;", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const actor = { id: 1, username: "isolated-test", role: "admin", branchIds: [] };
let currentOrder: Record<string, unknown> = { id: 42, status: "pending", branchId: 1 };
const calls: { path: string; method: string; data?: any }[] = [];
const writes: string[] = [];
const ctx = vm.createContext({
  z, crypto: { randomUUID },
  authorizeOrder: async () => currentOrder,
  rows: async (query: string) => { writes.push(query); return query.startsWith("SELECT * FROM merchant_refunds") ? [{ id: 7, orderId: 42, status: "pending" }] : [{ id: 7 }]; },
  saveSetting: async () => {}, defaultSettings: {},
});
vm.runInContext(js, ctx);
const core = async (_actor: unknown, path: string, method: string, data?: unknown) => { calls.push({ path, method, data }); return {}; };
await ctx.runCommand(actor, "accept", "42", { minutes: 20 }, core);
assert.equal(calls.at(-1)?.path, "/orders/42/status");
assert.equal(calls.at(-1)?.data.status, "preparing");
assert.ok(writes.some(query => query.includes("preparation_minutes")));
await assert.rejects(() => ctx.runCommand(actor, "accept", "42", { minutes: 0 }, core));
currentOrder = { ...currentOrder, status: "preparing" };
await assert.rejects(() => ctx.runCommand(actor, "reject", "42", { reason: "late" }, core), /الجديدة/);
await ctx.runCommand(actor, "ready", "42", {}, core);
assert.equal(calls.at(-1)?.data.status, "ready");
currentOrder = { ...currentOrder, status: "ready" };
await ctx.runCommand(actor, "deliver", "42", {}, core);
assert.equal(calls.at(-1)?.data.status, "done");
const before = calls.length;
await ctx.runCommand(actor, "refund-decide", "7", { decision: "accepted", reason: "approved" }, core);
assert.equal(calls.length, before, "refund decisions must not pretend a payment-provider refund occurred");
await assert.rejects(() => ctx.runCommand({ ...actor, role: "employee" }, "item-delete", "item-1", {}, core), /مدير/);
await assert.rejects(() => ctx.runCommand(actor, "driver-save", undefined, { name: "Test", phone: "0500000000", active: true }, core), /رمز/);
await ctx.runCommand(actor, "message-send", "42", { text: "طلبك جاهز" }, core);
assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1)?.data)), { text: "طلبك جاهز", fromCashier: true });
console.log("PASS: isolated service safety, CSRF, protected core bridge, multi-period and overnight hours, order transitions, validation, role guards and no fake financial refund.");
