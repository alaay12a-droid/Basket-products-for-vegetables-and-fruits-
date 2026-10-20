import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const routes = new Map<string, Function[]>();
const itemsTable = { table: "items", itemId: "itemId", category: "category" };
const settingsTable = { table: "settings", key: "key", value: "value" };
let settings: { key: string; value: string }[] = [];
let items: any[] = [];
let saves = 0;
let locks = 0;
let serial = Promise.resolve();

function select(fields?: Record<string, string>) {
  let table: any;
  let condition: any;
  const rows = () => {
    let result: any[] = table === settingsTable ? settings : items;
    if (condition) result = result.filter(row => row[condition.field] === condition.value);
    return fields ? result.map(row => Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, row[field]]))) : result;
  };
  const query = {
    from(value: unknown) { table = value; return query; },
    where(value: unknown) { condition = value; return query; },
    limit(count: number) { return Promise.resolve(rows().slice(0, count)); },
    groupBy() { return Promise.resolve([...new Map(rows().map(row => [JSON.stringify(row), row])).values()]); },
    orderBy() { return query; },
    then(resolve: Function, reject: Function) { return Promise.resolve(rows()).then(resolve as any, reject as any); },
  };
  return query;
}
const db: any = {
  select,
  insert: (table: unknown) => ({
    values: (value: any) => ({
      onConflictDoUpdate: async () => {
        assert.equal(table, settingsTable);
        settings = [{ ...value }];
        saves++;
      },
      returning: async () => {
        assert.equal(table, itemsTable);
        items.push(value);
        return [value];
      },
    }),
  }),
  update: () => ({
    set: (updates: any) => ({
      where: (condition: any) => ({
        returning: async () => {
          const item = items.find(row => row[condition.field] === condition.value);
          if (!item) return [];
          Object.assign(item, updates);
          return [item];
        },
      }),
    }),
  }),
  execute: async (query: string) => {
    assert.ok(query.includes("pg_advisory_xact_lock"), "Category mutations must use the same transaction lock");
    locks++;
  },
  transaction(action: Function) {
    const work = serial.then(async () => {
      const before = structuredClone({ settings, items });
      try { return await action(db); }
      catch (error) { settings = before.settings; items = before.items; throw error; }
    });
    serial = work.then(() => {}, () => {});
    return work;
  },
};
const auth = (req: any, res: any, next: Function) =>
  req.authenticated ? next() : res.status(401).json({ error: "غير مصرح" });
const router: any = {};
for (const method of ["get", "post", "put", "delete"]) {
  router[method] = (path: string, ...handlers: Function[]) => { routes.set(`${method} ${path}`, handlers); return router; };
}
const module = { exports: {} };
const source = readFileSync(new URL("../src/routes/menu.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, {
  module, exports: module.exports, Date, Set, Map,
  require: (name: string) => {
    const mocks: Record<string, unknown> = {
      express: { Router: () => router },
      "@workspace/db": { db, menuItemsTable: itemsTable, appSettingsTable: settingsTable },
      "drizzle-orm": {
        eq: (field: string, value: unknown) => ({ field, value }),
        asc: (value: unknown) => value,
        inArray: () => null,
        sql: (parts: TemplateStringsArray) => parts.join("?"),
      },
      "../lib/objectStorage": { ObjectStorageService: class {} },
      "./dashboard-auth": { requireDashboardUser: auth },
    };
    return name in mocks ? mocks[name] : require(name);
  },
});

async function call(method: string, path: string, params: any = {}, body: any = {}, authenticated = true) {
  const handlers = routes.get(`${method} ${path}`);
  assert.ok(handlers);
  const req = { params, body, authenticated, log: { info() {}, warn() {} } };
  const res: any = { code: 200, body: undefined, status(n: number) { this.code = n; return this; }, json(value: unknown) { this.body = value; return this; }, setHeader() {} };
  for (const handler of handlers) {
    let next = false;
    await handler(req, res, () => { next = true; });
    if (handlers.length > 1 && !next) break;
  }
  return res;
}
const fruit = { id: "fruit", name: "الفواكه", nameEn: "Fruit", icon: "🍎" };
const herbs = { id: "herbs", name: "الأعشاب", nameEn: "Herbs", icon: "🌿" };
function reset(categories: any[] | null, products: any[] = []) {
  settings = categories === null ? [] : [{ key: "menu_categories", value: JSON.stringify(categories) }];
  items = structuredClone(products);
  saves = 0;
}
const del = (id: string, authenticated = true) => call("delete", "/menu-categories/:categoryId", { categoryId: id }, {}, authenticated);

reset([fruit, herbs], [{ itemId: "apple", category: "fruit", available: false, stock: 0 }]);
assert.equal(routes.get("delete /menu-categories/:categoryId")?.[0], auth);
assert.equal((await del("herbs", false)).code, 401);
assert.equal(saves, 0);
assert.equal((await del("fruit")).code, 409, "Hidden/out-of-stock products must still prevent deletion");
assert.equal(saves, 0);
assert.equal(items.length, 1);
assert.equal((await del("missing")).code, 404);
assert.equal(saves, 0);
const removed = await del("herbs");
assert.equal(removed.code, 200);
assert.deepEqual(Array.from(removed.body, (c: any) => c.id), ["fruit"]);
assert.deepEqual(Array.from((await call("get", "/menu-categories")).body, (c: any) => c.id), ["fruit"]);
assert.equal(items[0].itemId, "apple");
assert.equal((await call("put", "/menu-categories/reorder", {}, { ids: ["herbs", "fruit"] })).code, 400);
assert.equal((await call("post", "/menu", {}, { name: "Test", price: 5, category: "herbs" })).code, 409);
assert.equal((await call("put", "/menu/:itemId", { itemId: "apple" }, { category: "herbs" })).code, 409);
assert.equal(items[0].category, "fruit");
assert.equal((await call("put", "/menu/:itemId", { itemId: "apple" }, { price: 7 })).code, 200);
assert.equal(items[0].price, 700, "Ordinary product edits still work");

reset([{ id: "drinks", name: "المشروبات", nameEn: "Drinks", icon: "🥤" }]);
assert.equal((await del("drinks")).code, 200);
assert.equal((await call("get", "/menu-categories")).body.length, 0, "Deleting the final default section must stay deleted");
assert.equal((await del("drinks")).code, 404);
assert.equal((await call("post", "/menu-categories", {}, { name: "قسم جديد" })).code, 201);
assert.equal((await call("get", "/menu-categories")).body.length, 1);

reset(null);
assert.equal((await call("get", "/menu-categories")).body.length, 8, "Legacy defaults remain for an unconfigured installation");
reset([fruit, herbs]);
const racing = await Promise.all([
  del("herbs"),
  call("post", "/menu", {}, { name: "Stale product", price: 5, category: "herbs" }),
]);
// Auth middleware may let either operation acquire the lock first. Both
// legitimate orderings must preserve the no-orphan / no-nonempty-delete rule.
if (racing[0].code === 200) {
  assert.equal(racing[1].code, 409);
  assert.equal(items.length, 0);
} else {
  assert.equal(racing[0].code, 409);
  assert.equal(racing[1].code, 201);
  assert.equal(items.length, 1);
  assert.ok(JSON.parse(settings[0].value).some((category: any) => category.id === "herbs"));
}
reset([fruit, herbs]);
const reverseRace = await Promise.all([
  call("post", "/menu", {}, { name: "Existing product", price: 5, category: "herbs" }),
  del("herbs"),
]);
assert.equal(reverseRace[0].code, 201);
assert.equal(reverseRace[1].code, 409);
assert.equal(items.length, 1);
assert.ok(locks > 0);
console.log("Empty-category deletion checks passed: authenticated deletion, nonempty protection, persistence, default/final category deletion, stale writes, serialized category assignment, ordinary product edits. No real database used.");
