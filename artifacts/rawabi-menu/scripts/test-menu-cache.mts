import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(readFileSync(new URL("../hooks/useMenu.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const item = { itemId: "lemon", name: "ليمون", nameEn: "Lemon", category: "fruit", price: 1200, available: true };
const cats = [{ id: "fruit", name: "فواكه", nameEn: "Fruit", icon: "🍋" }];
const cached = JSON.stringify({ items: [item], categories: cats });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

function harness(raw: string | null, fail = false) {
  const values: any[] = [];
  const refs: any[] = [];
  const effects: (() => void | (() => void))[] = [];
  let si = 0, ri = 0, initial = true;
  let rejectNetwork = fail;
  let liveItems = [{ ...item, price: 1500 }];
  let liveCats = cats;
  let paused = false;
  let resume: (() => void) | undefined;
  const gate = () => paused ? new Promise<void>(resolve => { resume = resolve; }) : Promise.resolve();
  const stored = new Map<string, string>();
  let foreground: ((state: string) => void) | undefined;
  let timeout: (() => void) | undefined;
  let reads = 0;
  let calls = 0;
  const mod = { exports: {} as any };
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console,
    setTimeout: (cb: () => void) => { timeout = cb; return 1; }, clearTimeout: () => {},
    setInterval: () => 2, clearInterval: () => {},
    require(id: string) {
      if (id === "react") return {
        useState(value: any) { const i = si++; if (!(i in values)) values[i] = value;
          return [values[i], (v: any) => { values[i] = v; }]; },
        useRef(value: any) { const i = ri++; return refs[i] ??= { current: value }; },
        useCallback: (fn: any) => fn,
        useEffect(fn: any) { if (initial) effects.push(fn); },
      };
      if (id === "react-native") return { AppState: { addEventListener(_: string, fn: any) {
        foreground = fn; return { remove() {} };
      } } };
      if (id.includes("async-storage")) return {
        getItem: async (key: string) => { reads++; assert.ok(key.includes("https://basket.test")); return raw; },
        setItem: async (key: string, value: string) => { stored.set(key, value); },
        multiRemove: async (keys: string[]) => { assert.ok(keys.every(k => k.startsWith("@rawabi_"))); },
      };
      if (id === "@/constants/api") return { STORAGE_BASE_URL: "https://basket.test", apiGet: async (path: string) => {
        calls++;
        // One gate per menu request, not per category request.
        if (path === "/menu") await gate();
        if (rejectNetwork) throw new Error("Offline");
        return path === "/menu" ? liveItems : liveCats;
      } };
      if (id === "@/constants/menu") return { FOOD_IMAGES: {} };
      throw new Error(`Unexpected import ${id}`);
    },
  });
  const render = () => { si = 0; ri = 0; return mod.exports.useMenu(); };
  const first = render();
  initial = false;
  const cleanups = effects.map(fn => fn());
  return { first, render, stored, get reads() { return reads; }, get calls() { return calls; },
    offline(v: boolean) { rejectNetwork = v; }, live(v: typeof liveItems) { liveItems = v; },
    categoryData(v: typeof cats) { liveCats = v; },
    pause() { paused = true; }, resume() { paused = false; resume?.(); },
    timeout() { timeout?.(); }, foreground() { foreground?.("active"); },
    close() { cleanups.forEach(fn => fn?.()); } };
}

// First install: never end loading before data has actually arrived.
const first = harness(null);
assert.equal(first.first.loading, true);
await tick();
assert.equal(first.render().loading, false);
assert.equal(first.render().categories[0].items[0].price, 15);
assert.equal(first.stored.size, 1);
first.close();

// Cache appears before the stalled network completes; live price then replaces it.
const saved = harness(cached);
saved.pause();
await tick();
assert.equal(saved.render().categories[0].items[0].price, 12);
assert.equal(saved.render().loading, false);
saved.resume();
await tick();
assert.equal(saved.render().categories[0].items[0].price, 15);
saved.close();

// Offline display is explicit, keeps saved products, and recovers on foreground.
const offline = harness(cached, true);
await tick();
assert.equal(offline.render().offline, true);
assert.equal(offline.render().categories[0].items[0].price, 12);
offline.offline(false);
offline.foreground();
await tick();
assert.equal(offline.render().offline, false);
assert.equal(offline.render().categories[0].items[0].price, 15);
const categoryPhoto = "data:image/jpeg;base64,AAAA";
offline.categoryData([{ ...cats[0], imageUrl: categoryPhoto } as typeof cats[number]]);
await offline.render().refresh();
assert.equal(offline.render().categories[0].imageUrl, categoryPhoto, "A photo-only update must refresh the category");
offline.categoryData(cats);
await offline.render().refresh();
assert.equal(offline.render().categories[0].imageUrl, undefined, "Removed category photos must not stick in cache");
// Server removals must remove cached products, not retain old stock.
offline.live([]);
await offline.render().refresh();
assert.equal(offline.render().categories.length, 0);
assert.equal(JSON.parse([...offline.stored.values()][0]).items.length, 0);
offline.close();

for (const bad of ["broken json", '{"items":[null],"categories":[]}', null]) {
  const broken = harness(bad, true);
  await tick();
  assert.equal(broken.render().loading, false);
  assert.equal(broken.render().offline, true);
  assert.equal(broken.render().categories.length, 0);
  broken.close();
}
const stalled = harness(null);
stalled.pause();
await tick();
stalled.timeout();
await tick();
assert.equal(stalled.render().loading, false);
assert.equal(stalled.render().offline, true);
stalled.resume();
stalled.close();
console.log("Menu cache checks passed: first launch, cache hydration, live refresh, offline recovery, removal, corrupt storage, timeout, server-scoped key.");

// Category images must preserve the emoji fallback and recover for a new URL.
const iconModule = { exports: {} as any };
let failedUrl: string | null = null;
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL("../components/CategoryIcon.tsx", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React } },
).outputText, {
  module: iconModule, exports: iconModule.exports,
  require(id: string) {
    if (id === "react") return {
      createElement: (type: string, props: any, ...children: any[]) => ({ type, props, children }),
      useState: () => [failedUrl, (v: string) => { failedUrl = v; }],
    };
    if (id === "react-native") return { Text: "Text" };
    if (id === "expo-image") return { Image: "Image" };
    throw new Error(id);
  },
});
const icon = iconModule.exports.default;
assert.equal(icon({ icon: "🍎" }).type, "Text");
const imageIcon = icon({ icon: "🍎", imageUrl: categoryPhoto });
assert.equal(imageIcon.type, "Image");
assert.equal(imageIcon.props.contentFit, "cover");
imageIcon.props.onError();
assert.equal(icon({ icon: "🍎", imageUrl: categoryPhoto }).type, "Text");
assert.equal(icon({ icon: "🍎", imageUrl: `${categoryPhoto}AA` }).type, "Image");
assert.equal(icon({ icon: "🍎", imageUrl: null }).type, "Text");
console.log("Category icon checks passed: image rendering, circular crop, missing/broken image fallback, changed image recovery.");
