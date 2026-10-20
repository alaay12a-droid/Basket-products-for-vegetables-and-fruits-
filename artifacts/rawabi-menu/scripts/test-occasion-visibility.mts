import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const slots: any[] = [];
let cursor = 0;
let focus: () => () => void;
let appListener: (state: string) => void;
let poll: () => void;
let appState = "active";
let removed = false;
let timerCleared = false;
const pending: { resolve: (data: any) => void; reject: (error: Error) => void }[] = [];
const react = {
  useState(initial: any) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], (value: any) => { slots[i] = value; }];
  },
  useRef(initial: any) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: initial };
    return slots[i];
  },
  useCallback: (callback: any) => callback,
};
const module = { exports: {} as any };
const hookSource = readFileSync(new URL("../hooks/useOccasions.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  module, exports: module.exports,
  require(id: string) {
    if (id === "react") return react;
    if (id === "expo-router") return { useFocusEffect: (callback: any) => { focus = callback; } };
    if (id === "react-native") return {
      AppState: {
        get currentState() { return appState; },
        addEventListener(_: string, callback: any) {
          appListener = callback;
          return { remove() { removed = true; } };
        },
      },
    };
    if (id === "@/constants/api") return {
      apiGet(path: string) {
        assert.equal(path, "/occasions");
        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      },
    };
    throw new Error(`Unexpected dependency: ${id}`);
  },
  setInterval(callback: any, delay: number) {
    assert.equal(delay, 30_000);
    poll = callback;
    return 1;
  },
  clearInterval() { timerCleared = true; },
});
const render = () => { cursor = 0; return module.exports.useOccasions(); };
const settle = async () => { await new Promise<void>((resolve) => setImmediate(resolve)); };
const disabled = { occasionId: "disabled", active: false };
const enabled = { occasionId: "enabled", active: true };
assert.equal(render().occasions.length, 0);
const blur = focus!();
assert.equal(render().loading, true);
pending.shift()!.resolve([disabled]);
await settle();
assert.equal(render().occasions.length, 0);
assert.equal(render().loading, false);

void render().refresh();
pending.shift()!.resolve([enabled, disabled, { active: "false" }, { active: 1 }]);
await settle();
assert.equal(render().occasions.map((o: any) => o.occasionId).join(","), "enabled");
poll!();
pending.shift()!.resolve([disabled]);
await settle();
assert.equal(render().occasions.length, 0, "Remote deactivation removes visible offers");
poll!();
pending.shift()!.resolve([enabled]);
await settle();
appState = "background";
appListener!(appState);
assert.equal(render().occasions.length, 0, "No stale offers retained in background");
poll!();
assert.equal(pending.length, 0, "No background polling requests");
appState = "active";
appListener!(appState);
assert.equal(render().loading, true);
pending.shift()!.resolve([enabled]);
await settle();
void render().refresh();
pending.shift()!.reject(new Error("offline"));
await settle();
assert.equal(render().occasions.length, 0, "Failed verification hides previous offers");

void render().refresh();
void render().refresh();
const older = pending.shift()!;
const newer = pending.shift()!;
newer.resolve([disabled]);
await settle();
older.resolve([enabled]);
await settle();
assert.equal(render().occasions.length, 0, "Older responses cannot restore disabled offers");
void render().refresh();
const inFlight = pending.shift()!;
blur();
inFlight.resolve([enabled]);
await settle();
assert.equal(render().occasions.length, 0);
assert.ok(removed && timerCleared, "Focus cleanup removes listeners and timer");

// Exercise the real dashboard toggle, rather than a rewritten approximation.
const adminSource = readFileSync(new URL("../../dashboard/src/pages/admin.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("admin.tsx", adminSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let toggleInitializer = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleToggleOccasion") {
    toggleInitializer = node.initializer!.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(toggleInitializer);
let dashboardRows = [{ id: 7, occasionId: "oc-special", active: true }];
const calls: any[] = [];
const toggleModule = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(`exports.toggle = ${toggleInitializer};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: toggleModule.exports,
  encodeURIComponent,
  async apiPut(path: string, body: any) {
    calls.push({ path, active: body.active, legacyField: "isActive" in body });
    return { ...dashboardRows[0], active: body.active };
  },
  setOccasions(update: any) { dashboardRows = update(dashboardRows); },
  toast() { throw new Error("Unexpected dashboard error"); },
});
await toggleModule.exports.toggle(dashboardRows[0]);
assert.equal(calls[0].path, "/occasions/oc-special");
assert.equal(calls[0].active, false);
assert.equal(calls[0].legacyField, false);
assert.equal(dashboardRows[0].active, false);
await toggleModule.exports.toggle(dashboardRows[0]);
assert.equal(dashboardRows[0].active, true);

const menuSource = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
const menuAst = ts.createSourceFile("index.tsx", menuSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let categoryBuilder = "";
function visitMenu(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(menuAst) === "categories" &&
      node.initializer && ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(menuAst) === "useMemo") {
    categoryBuilder = node.initializer.arguments[0].getText(menuAst);
  }
  ts.forEachChild(node, visitMenu);
}
visitMenu(menuAst);
assert.ok(categoryBuilder);
const categoryContext: any = {
  exports: {},
  menuCategories: [{ id: "fruit", items: [] }, { id: "old-special", isOccasions: true, items: [] }],
  occasions: [],
};
vm.runInNewContext(`exports.build = ${categoryBuilder};`, categoryContext);
assert.equal(categoryContext.exports.build().length, 1, "No occasion category during loading/disabled state");
categoryContext.occasions = [enabled];
const visibleCategories = categoryContext.exports.build();
assert.equal(visibleCategories.length, 2);
assert.equal(visibleCategories[1].isOccasions, true);
assert.equal(visibleCategories[1].id, "__occasion_offers__");
categoryContext.occasions = [];
assert.equal(categoryContext.exports.build().length, 1, "Disabling last offer hides its category again");
console.log("PASS: occasion visibility, refresh, deactivation, failure/race handling, and dashboard activation contract");
