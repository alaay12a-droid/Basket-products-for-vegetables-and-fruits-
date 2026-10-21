import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import {
  expoCredentialDiagnostic,
  logExpoReceipt,
  pushTokenRef,
  retryPendingExpoReceipts,
} from "../src/lib/expoPushDiagnostics.js";

const logs: { level: string; fields: Record<string, unknown>; message: string }[] = [];
const logger = Object.fromEntries(["info", "warn", "error"].map((level) => [
  level,
  (fields: Record<string, unknown>, message: string) => logs.push({ level, fields, message }),
])) as Record<"info" | "warn" | "error", (fields: Record<string, unknown>, message: string) => void>;
const receipt = (message: string, error = "InvalidCredentials") => ({
  status: "error" as const, message, details: { error },
});
assert.equal(expoCredentialDiagnostic(receipt("APNs key rejected")).credentialProvider, "APNs");
assert.equal(expoCredentialDiagnostic(receipt("FCM credentials missing")).credentialProvider, "FCM");
assert.equal(expoCredentialDiagnostic(receipt("", "MismatchSenderId")).credentialProvider, "FCM");
const unknown = expoCredentialDiagnostic(receipt("Credentials rejected"));
assert.equal(unknown.credentialProvider, "unknown");
assert.match(unknown.hint!, /iOS.*APNs.*Android.*FCM/);
assert.deepEqual(expoCredentialDiagnostic(receipt("", "DeviceNotRegistered")), {});

const token = "ExponentPushToken[isolated-test-only]";
assert.equal(pushTokenRef(token).length, 16);
assert.equal(pushTokenRef(token), pushTokenRef(token));
logExpoReceipt(logger, "send-1", "receipt-1", token, { status: "ok" }, 1);
assert.match(logs[0].message, /device display is not confirmed/);
assert.ok(!JSON.stringify(logs).includes(token));

const calls: { url: string; ids: string[] }[] = [];
const waits: number[] = [];
const pending = new Map([["a", token], ["b", token]]);
await retryPendingExpoReceipts(pending, "send-2", logger, {
  wait: async (ms) => { waits.push(ms); },
  fetch: (async (url, init) => {
    calls.push({ url: String(url), ids: JSON.parse(String(init?.body)).ids });
    return new Response(JSON.stringify({
      data: calls.length === 1
        ? { a: { status: "ok" } }
        : { b: receipt("Device no longer registered", "DeviceNotRegistered") },
    }));
  }) as typeof fetch,
});
assert.deepEqual(calls.map((call) => call.ids), [["a", "b"], ["b"]]);
assert.ok(calls.every((call) => call.url.endsWith("/push/getReceipts")));
assert.equal(pending.size, 2, "Original token/ticket map must remain untouched");
assert.equal(waits.length, 2);
assert.ok(logs.some((log) => log.fields.errorCode === "DeviceNotRegistered"));

let retries = 0;
await retryPendingExpoReceipts(new Map([["pending", token]]), "send-3", logger, {
  wait: async () => {},
  fetch: (async () => {
    retries++;
    if (retries === 1) return new Response("", { status: 503 });
    if (retries === 2) throw new Error("Simulated network error");
    return new Response(JSON.stringify({ data: {} }));
  }) as typeof fetch,
});
assert.equal(retries, 4, "Receipt reads must have bounded retries");
assert.ok(logs.some((log) => log.level === "warn" && log.fields.sendId === "send-3"));
assert.ok(!JSON.stringify(logs).includes(token));
console.log("PASS: APNs/FCM diagnostics, safe correlation, read-only bounded receipt retries");

// Run the actual mobile registration code with device/network/storage doubles.
// This never loads Expo native modules or contacts a real backend.
const mocks: Record<string, string> = {
  react: `export const useState = v => [v, v => __mock.states.push(v)];
    export const useEffect = fn => __mock.effects.push(fn);`,
  "expo-notifications": `export const getPermissionsAsync = async () => ({status: "granted"});
    export const requestPermissionsAsync = getPermissionsAsync;
    export const setNotificationHandler = () => {};
    export const AndroidImportance = {HIGH: 4};
    export const setNotificationChannelAsync = async () => {};
    export const getDevicePushTokenAsync = async () => ({data: "native-fcm"});
    export const getExpoPushTokenAsync = async options => {
      __mock.projectIds.push(options.projectId); return {data: "fresh-store-token"};
    };`,
  "expo-constants": `export default {expoConfig: {extra: {eas: {projectId: "config-project"}}},
    easConfig: {projectId: "eas-fallback-project"}};`,
  "react-native": `export const Platform = {OS: __mock.os};`,
  "@react-native-async-storage/async-storage": `export default {
    getItem: async key => { __mock.reads.push(key); return "old-expo-go-token"; },
    setItem: async (key, value) => { __mock.writes.push([key, value]); }
  };`,
  "@/constants/api": `export const apiPost = (...args) => __mock.apiPost(...args);`,
};
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../../rawabi-menu/hooks/useCustomerPushToken.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs",
  plugins: [{
    name: "isolated-device-doubles",
    setup(b) {
      b.onResolve({ filter: /^(react|react-native|expo-notifications|expo-constants|@react-native-async-storage\/async-storage|@\/constants\/api)$/ },
        args => ({ path: args.path, namespace: "device-mock" }));
      b.onLoad({ filter: /.*/, namespace: "device-mock" },
        args => ({ contents: mocks[args.path], loader: "js" }));
    },
  }],
});
function loadClient(os: string, apiPost: (...args: any[]) => Promise<unknown>) {
  const state = {
    os, apiPost, states: [] as unknown[], effects: [] as (() => void)[],
    projectIds: [] as string[], reads: [] as string[], writes: [] as string[][],
  };
  const module = { exports: {} as any };
  runInNewContext(bundled.outputFiles[0].text, {
    module, exports: module.exports, __mock: state,
    process: { env: { EXPO_PUBLIC_EAS_PROJECT_ID: "env-project" } },
    console: { info() {}, warn() {}, error() {} },
    setTimeout: (fn: () => void) => { fn(); return 0; },
  });
  return { state, client: module.exports };
}
let confirm!: (result: unknown) => void;
let registrations = 0;
const ios = loadClient("ios", async (path) => {
  if (path !== "/push-tokens") return { ok: true };
  registrations++;
  if (registrations === 1) return new Promise(resolve => { confirm = resolve; });
  return { ok: true, persisted: true };
});
const registration = ios.client.registerCustomerNotifications();
await new Promise(resolve => setImmediate(resolve));
assert.equal(ios.state.writes.length, 0, "iOS must await confirmed backend persistence");
confirm({ ok: true, persisted: true });
assert.equal(await registration, "fresh-store-token");
assert.equal(ios.state.projectIds[0], "config-project");
assert.equal(ios.state.writes[0][1], "fresh-store-token");
await ios.client.registerCustomerNotifications();
assert.equal(registrations, 2, "Every launch must register the current token again");

let failures = 0;
const failedIos = loadClient("ios", async (path) => {
  if (path === "/push-tokens") { failures++; return { ok: true, persisted: false }; }
  return { ok: true };
});
assert.equal(await failedIos.client.registerCustomerNotifications(), null);
assert.equal(failures, 3);
assert.equal(failedIos.state.writes.length, 0);
failedIos.client.useCustomerPushToken();
failedIos.state.effects.forEach(effect => effect());
await new Promise(resolve => setImmediate(resolve));
assert.equal(failedIos.state.reads.length, 0, "iOS must not hydrate an old Expo Go token");
assert.equal(failedIos.state.states.length, 0, "An unconfirmed token must not become active");

const android = loadClient("android", async () => ({ ok: true, persisted: true }));
assert.equal(await android.client.registerCustomerNotifications(), "fresh-store-token");
assert.equal(android.state.projectIds[0], "env-project", "Android project selection must remain unchanged");
assert.equal(android.state.writes[0][1], "fresh-store-token");
console.log("PASS: iOS explicit config projectId, confirmed fresh-token persistence, launch refresh, bounded failures, no cached token; Android path unchanged");
