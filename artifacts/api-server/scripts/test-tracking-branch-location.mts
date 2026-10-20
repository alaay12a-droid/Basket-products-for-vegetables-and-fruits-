import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Evaluate the real route and its generated map script without importing the
// server, connecting to a database, sending pushes, or touching real orders.
const source = readFileSync(new URL("../src/routes/drivers.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("drivers.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let handlerSource = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "router.get" &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/map/:orderId") {
    handlerSource = node.arguments[1].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handlerSource);
assert.ok(!handlerSource.includes("28.410769") && !handlerSource.includes("36.532353"));
const compiled = ts.transpileModule(`exports.handler = ${handlerSource};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function table(name: string, columns: string[]) {
  return Object.fromEntries(columns.map(column => [column, `${name}.${column}`]));
}
const ordersTable = table("orders", ["id", "branchId", "customerAddress", "customerName", "dailyNumber"]);
const branchesTable = table("branches", ["id", "lat", "lng", "name"]);
const orderDriverAssignmentsTable = table("assignments", ["orderId", "driverId", "driverLat", "driverLng"]);
const deliveryDriversTable = table("drivers", ["id", "name"]);
const branches: any[] = [
  { id: 1, name: "فرع الطلب الأول", lat: 24.6, lng: 46.7 },
  { id: 2, name: "فرع الطلب الثاني", lat: 26.1, lng: 43.9 },
];
const orders = [
  { id: 101, branchId: 1, customerAddress: "https://maps.google.com/?q=24.7,46.8" },
  { id: 102, branchId: 2, customerAddress: "https://maps.google.com/?q=26.2,44" },
  { id: 103, branchId: null, customerAddress: "" },
  { id: 104, branchId: 999, customerAddress: "https://maps.google.com/?q=24.7,46.8" },
];
let failQuery = false;
const db = {
  select(selection: Record<string, string>) {
    let condition: any;
    let joinedBranch = false;
    const query: any = {
      from(t: unknown) { assert.equal(t, ordersTable); return query; },
      leftJoin(t: unknown, on: any) {
        if (t === branchesTable) {
          assert.equal(on.left, branchesTable.id);
          assert.equal(on.right, ordersTable.branchId, "Join branch by order assignment, not driver/nearest branch");
          joinedBranch = true;
        }
        return query;
      },
      where(value: any) { condition = value; return query; },
      async limit(value: number) {
        assert.equal(value, 1);
        assert.equal(condition.left, ordersTable.id);
        if (failQuery) throw new Error("Simulated database unavailable");
        const order = orders.find(o => o.id === condition.right);
        if (!order) return [];
        const branch = joinedBranch ? branches.find(b => b.id === order.branchId) : undefined;
        const values: Record<string, any> = {
          [ordersTable.customerAddress]: order.customerAddress,
          [ordersTable.customerName]: "عميل الاختبار",
          [ordersTable.dailyNumber]: order.id,
          [deliveryDriversTable.name]: "مندوب الاختبار",
          [branchesTable.lat]: branch?.lat ?? null,
          [branchesTable.lng]: branch?.lng ?? null,
          [branchesTable.name]: branch?.name ?? null,
        };
        return [Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, values[column] ?? null]))];
      },
    };
    return query;
  },
};
const module = { exports: {} as any };
vm.runInNewContext(compiled, {
  exports: module.exports, db, ordersTable, branchesTable,
  orderDriverAssignmentsTable, deliveryDriversTable,
  eq: (left: unknown, right: unknown) => ({ left, right }),
});
async function render(orderId: string) {
  const response = {
    code: 200, html: "", headers: {} as Record<string, string>,
    status(code: number) { this.code = code; return this; },
    setHeader(key: string, value: string) { this.headers[key] = value; },
    send(html: string) { this.html = html; },
  };
  await module.exports.handler({ params: { orderId } }, response);
  return response;
}

async function runMap(html: string, driverLat: number | null = 24.65, driverLng: number | null = 46.75) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const script = scripts.at(-1)![1];
  new vm.Script(script); // Also catches invalid inline JS/escaping.
  const markers: any[] = [];
  const bounds: any[] = [];
  const maps: any[] = [];
  const timers: { callback: () => void; delay: number }[] = [];
  const elements: Record<string, any> = {};
  const element = (id: string) => elements[id] ??= {
    style: {}, textContent: "", classList: { add() {}, remove() {} },
  };
  let onLoad: () => void = () => {};
  let routeCount = 0;
  const context: any = {
    document: {
      getElementById: element,
      createElement: () => ({ style: {}, textContent: "" }),
      querySelector: () => element("dot"),
    },
    window: { addEventListener(_: string, callback: () => void) { onLoad = callback; } },
    L: {
      divIcon: (options: any) => options,
      map() {
        const map = { fitBounds(points: any) { bounds.push(points); } };
        maps.push(map);
        return map;
      },
      tileLayer: () => ({ addTo() {} }),
      marker(point: any, options: any) {
        assert.ok(point.every((v: any) => typeof v === "number" && Number.isFinite(v)));
        const marker = {
          point, icon: options.icon, popup: null as any,
          addTo() { markers.push(marker); return marker; },
          bindPopup(popup: any) { marker.popup = popup; },
          setLatLng() {},
        };
        return marker;
      },
      latLngBounds(points: any) {
        assert.ok(points.length > 0);
        for (const point of points) assert.ok(point.every((v: any) => typeof v === "number" && Number.isFinite(v)));
        return points;
      },
      polyline: () => ({ addTo() { routeCount++; return this; }, setLatLngs() {} }),
    },
    async fetch(path: string) {
      assert.match(path, /^\/api\/orders\/\d+\/assignment$/);
      return { ok: true, async json() { return { assignment: { driverLat, driverLng, status: "assigned" } }; } };
    },
    setInterval(_: unknown, delay: number) { assert.equal(delay, 10000); return 1; },
    clearInterval() {},
    setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); },
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
  };
  vm.runInNewContext(script, context);
  await new Promise<void>(resolve => setImmediate(resolve));
  onLoad();
  timers.find(t => t.delay === 3000)?.callback();
  const stores = markers.filter(m => m.icon.html.includes("restaurant-marker"));
  return { context, markers, stores, bounds, maps, routeCount, elements };
}

const first = await render("101");
assert.equal(first.headers["Cache-Control"], "no-store");
const firstMap = await runMap(first.html);
assert.equal(JSON.stringify(firstMap.stores[0].point), "[24.6,46.7]");
assert.equal(firstMap.stores[0].popup.textContent, "🏪 فرع الطلب الأول");
assert.equal(firstMap.routeCount, 1, "Driver-to-customer route remains intact");
assert.equal(firstMap.markers.length, 3);
assert.equal(firstMap.bounds[0].length, 3);
assert.ok(!first.html.includes('id="branchLocationNotice"'));
const secondMap = await runMap((await render("102")).html);
assert.equal(JSON.stringify(secondMap.stores[0].point), "[26.1,43.9]");
assert.notEqual(JSON.stringify(firstMap.stores[0].point), JSON.stringify(secondMap.stores[0].point));
const staticMap = await runMap(first.html, null, null);
assert.equal(staticMap.stores.length, 1, "Assigned branch remains visible before GPS starts");
assert.equal(staticMap.markers.length, 2);

for (const coords of [
  [null, 46.7], [24.6, null], [NaN, 46.7], [24.6, Infinity],
  [91, 46.7], [24.6, 181], ["24.6", 46.7],
]) {
  [branches[0].lat, branches[0].lng] = coords;
  const response = await render("101");
  assert.ok(response.html.includes('id="branchLocationNotice"'));
  const page = await runMap(response.html);
  assert.equal(page.stores.length, 0, "Never substitute another branch for missing/invalid coordinates");
  assert.equal(page.markers.length, 2, "Driver and customer remain visible");
  assert.equal(page.bounds[0].length, 2);
}
[branches[0].lat, branches[0].lng] = [0, 46.7];
assert.equal((await runMap((await render("101")).html)).stores.length, 1, "Zero is not treated as missing");
for (const orderId of ["103", "104", "999"]) {
  const response = await render(orderId);
  assert.equal((await runMap(response.html)).stores.length, 0);
}
const noCoordinates = await runMap((await render("103")).html, null, null);
assert.equal(noCoordinates.maps.length, 0, "No arbitrary map center when all locations are unavailable");
assert.equal(noCoordinates.elements.noLoc.style.display, "block");
failQuery = true;
assert.equal((await runMap((await render("101")).html)).stores.length, 0);
failQuery = false;
assert.equal((await render("invalid")).code, 400);
[branches[0].lat, branches[0].lng] = [24.6, 46.7];
branches[0].name = '</script><script>alert("branch")</script>';
const hostile = await render("101");
assert.ok(!hostile.html.includes(branches[0].name), "Branch name must not break out of inline script");
assert.equal((await runMap(hostile.html)).stores[0].popup.textContent, "🏪 " + branches[0].name);

if (process.argv.includes("--write-fixture")) {
  branches[0].name = "فرع الطلب الأول";
  const html = (await render("101")).html;
  const mock = '<script>window.fetch=async function(){return {ok:true,json:async function(){return {assignment:{driverLat:24.65,driverLng:46.75,status:"assigned"}}}}};</script>';
  const directory = new URL("../../../node_modules/.cache/tracking-branch-test/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL("map.html", directory), html.replace("<head>", "<head>" + mock));
}
console.log("PASS: assigned-branch join, distinct branches, missing/invalid coordinates, no fallback, safe branch names, unchanged GPS polling and driver/customer markers");
