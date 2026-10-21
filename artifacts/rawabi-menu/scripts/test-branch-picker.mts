import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const branches = [
  { id: 1, name: "الفرع الأول", address: "العنوان الأول", mapsUrl: null, lat: 28.4, lng: 36.5, active: true },
  { id: 2, name: "</script><script>alert(1)</script>", address: null, mapsUrl: null, lat: 28.5, lng: 36.6, active: true },
  { id: 3, name: "بدون إحداثيات", address: null, mapsUrl: null, lat: null, lng: null, active: true },
];

let platform = "android";
let states: unknown[] = [];
let stateIndex = 0;
const react = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) =>
    ({ type, props: { ...props, children } }),
  useMemo: (factory: () => unknown) => factory(),
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const i = stateIndex++;
    if (!(i in states)) states[i] = initial;
    return [states[i], (value: unknown) => { states[i] = value; }];
  },
};
const native = {
  Modal: "Modal", View: "View", Text: "Text", TouchableOpacity: "TouchableOpacity",
  ScrollView: "ScrollView", Pressable: "Pressable", StatusBar: "StatusBar",
  ActivityIndicator: "ActivityIndicator",
  Platform: { get OS() { return platform; } },
  I18nManager: { isRTL: true },
  Dimensions: { get: () => ({ height: 800, width: 400 }) },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1 },
};

function loadComponent(name: string, extra: Record<string, unknown> = {}) {
  const path = fileURLToPath(new URL(`../components/${name}.tsx`, import.meta.url));
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: (id: string) => {
      const mocks: Record<string, unknown> = {
        react, "react-native": native,
        "react-native-webview": { WebView: "WebView" },
        "react-native-maps": { __esModule: true, default: "NativeMap", Marker: "NativeMarker" },
        "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
        ...extra,
      };
      assert.ok(id in mocks, `Unexpected component dependency: ${id}`);
      return mocks[id];
    },
  }, { filename: path });
  return module.exports;
}

const android = loadComponent("AndroidBranchMap");
const picker = loadComponent("BranchPickerModal", { "./AndroidBranchMap": android });
function nodes(tree: any, predicate: (node: any) => boolean): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const colors = {
  background: "#fff", card: "#fff", foreground: "#111", mutedForeground: "#555",
  border: "#ddd", primary: "#237A3B", secondary: "#eee", gold: "#E8920C",
};
let selectedId: number | null = null;
let confirmedId: number | null = null;
let closed = false;
const props = {
  visible: true, branches, selected: branches[0], userLat: 28.4, userLng: 36.5,
  onSelect: (branch: typeof branches[number]) => { selectedId = branch.id; },
  onConfirm: (branch: typeof branches[number]) => { confirmedId = branch.id; },
  onClose: () => { closed = true; },
  colors, fontFamily: { regular: "regular", semi: "semi", bold: "bold" }, isEn: false,
};

for (const os of ["android", "ios"]) {
  platform = os;
  const tree = picker.default(props);
  assert.equal(nodes(tree, n => n.type === "NativeMap").length, os === "ios" ? 1 : 0);
  assert.equal(nodes(tree, n => n.type === android.default).length, os === "android" ? 1 : 0);
  const touches = nodes(tree, n => n.type === "TouchableOpacity");
  assert.equal(touches.length, branches.length + 1, "All branches and confirmation must remain available");
  touches[1].props.onPress();
  assert.equal(selectedId, 2);
  touches.at(-1).props.onPress();
  assert.equal(confirmedId, 1, "Confirm must use the current selected branch");
  tree.props.onRequestClose();
  assert.equal(closed, true, "Android back / modal dismiss must still close the picker");
  const unselected = picker.default({ ...props, selected: null });
  confirmedId = null;
  nodes(unselected, n => n.type === "TouchableOpacity").at(-1).props.onPress();
  assert.equal(confirmedId, null, "No branch must be silently selected or submitted");
  assert.equal(nodes(picker.default({ ...props, branches: [] }), n => n.type === android.default || n.type === "NativeMap").length, 0);
}
platform = "android";
assert.equal(nodes(picker.default({ ...props, visible: false }), n => n.type === android.default).length, 0);

states = []; stateIndex = 0;
const mapProps = { ...props, textColor: "#555", backgroundColor: "#fff", fontFamily: "regular" };
const androidTree = android.default(mapProps);
const webview = nodes(androidTree, n => n.type === "WebView")[0];
selectedId = null;
webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: "select", id: 2 }) } });
assert.equal(selectedId, 2, "A map marker must select the actual branch");
selectedId = null;
for (const data of ["not json", '{"type":"select","id":999}', '{"type":"select","id":"2"}']) {
  webview.props.onMessage({ nativeEvent: { data } });
}
assert.equal(selectedId, null, "Untrusted or unknown branch IDs must be ignored");
webview.props.onError();
stateIndex = 0;
const failedTree = android.default(mapProps);
assert.equal(nodes(failedTree, n => n.type === "WebView").length, 0);
assert.ok(nodes(failedTree, n => n.type === "Text").some(n =>
  n.props.children.join("").includes("اختر الفرع من القائمة أدناه")));
assert.equal(webview.props.onShouldStartLoadWithRequest({ url: "https://unexpected.example" }), false);

// Run the generated map JS without network or native modules.
const html = android.buildAndroidBranchMapHtml([...branches,
  { ...branches[0], id: 4, lat: 999 },
  { ...branches[0], id: 5, lat: Number.NaN },
], 0, 0);
assert.ok(!html.includes("</script><script>alert(1)"), "Branch names must not escape the inline script");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const messages: any[] = [];
const markers: any[] = [];
const views: any[] = [];
const window: any = { ReactNativeWebView: { postMessage: (value: string) => messages.push(JSON.parse(value)) } };
const leaflet = {
  map: () => ({ setView: (...args: any[]) => { views.push(args); return leafletMap; } }),
  tileLayer: () => ({ addTo: () => {} }),
  circleMarker: (coords: any, style: any) => {
    const marker: any = {
      coords, style, addTo() { return this; }, bindTooltip() { return this; },
      on(_name: string, fn: () => void) { this.click = fn; return this; },
      setStyle(update: any) { Object.assign(this.style, update); },
      getLatLng() { return this.coords; },
    };
    markers.push(marker);
    return marker;
  },
};
const leafletMap = { setView: (...args: any[]) => views.push(args) };
vm.runInNewContext(script, { L: leaflet, window, document: { createElement: () => ({ textContent: "" }) } });
assert.equal(markers.length, 3, "Only valid branch coordinates and the user marker should be rendered");
assert.equal(messages[0].type, "ready");
window.selectBranch(2);
assert.equal(markers[1].style.fillColor, "#E8920C");
assert.equal(markers[0].style.fillColor, "#999");
assert.deepEqual([...views.at(-1)[0]], [28.5, 36.6]);
markers[1].click();
assert.equal(messages.at(-1).type, "select");
assert.equal(messages.at(-1).id, 2);
vm.runInNewContext(script, { window, document: {} });
assert.equal(messages.at(-1).type, "error", "Map initialization failure must be reported rather than blocking the picker");

console.log("Branch picker regression checks passed: Android map isolation, unchanged iOS native map, branch select/confirm/close, map failure, marker events, safe map data.");
