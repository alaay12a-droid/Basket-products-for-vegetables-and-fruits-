import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { setBaseUrl, setAuthTokenGetter, type MerchantOrder, type MerchantSettings } from "@workspace/api-client-react";
import { parsePrinterPreferences, resolvePrinterSettings, type IntegratedPrinter } from "./printer-config";
import { receiptLines, receiptRows, type ReceiptRow } from "./receipt";
export type { IntegratedPrinter } from "./printer-config";
export { receiptLines } from "./receipt";

interface NativeDevice {
  getOrderAlertVolume(): Promise<{ percent: number }>;
  setOrderAlertVolume(options: { percent: number }): Promise<void>;
  updatePendingOrders(options: { ids?: number[]; acceptedId?: number }): Promise<void>;
  saveSession(options: { token: string }): Promise<void>;
  getSession(): Promise<{ token: string | null }>;
  clearSession(): Promise<void>;
  configure(options: { keepAwake: boolean }): Promise<void>;
  detectPrinter(): Promise<IntegratedPrinter>;
  printReceipt(options: {
    lines: string[]; qr: string; width: number; copies: number;
    transport: string; address: string; rows?: ReceiptRow[];
  }): Promise<void>;
  startMonitoring(options: { url: string; sound: boolean }): Promise<void>;
  stopMonitoring(): Promise<void>;
  getMonitoringStatus(): Promise<{ connected: boolean }>;
}
const Device = registerPlugin<NativeDevice>("MerchantDevice");
const native = Capacitor.isNativePlatform();
export async function getOrderAlertVolume(): Promise<number> {
  if (!native) return 100;
  const result = await Device.getOrderAlertVolume();
  if (!Number.isInteger(result.percent) || result.percent < 10 || result.percent > 100) throw new Error('تعذّر قراءة مستوى صوت الطلبات');
  return result.percent;
}
export async function setOrderAlertVolume(percent: number): Promise<void> {
  if (!native) throw new Error('التحكم بصوت الجهاز متاح في تطبيق أندرويد فقط');
  if (!Number.isInteger(percent) || percent < 10 || percent > 100) throw new Error('اختر مستوى صوت بين 10 و100');
  await Device.setOrderAlertVolume({ percent });
}
const printerPreferencesKey = "basket.merchant.printer-preferences.v1";
let integratedPrinter: IntegratedPrinter | null = null;
let printerDetection: Promise<IntegratedPrinter> | null = null;

export async function detectIntegratedPrinter(): Promise<IntegratedPrinter> {
  if (integratedPrinter?.supported) return integratedPrinter;
  if (printerDetection) return printerDetection;
  printerDetection = (async () => {
    const unavailable: IntegratedPrinter = {
      supported: false, transport: "none", manufacturer: "", model: "", paperWidth: 58,
      message: "كشف الطابعة المدمجة متاح في تطبيق أندرويد فقط",
    };
    if (!native) return unavailable;
    try {
      integratedPrinter = await Device.detectPrinter();
      return integratedPrinter;
    } catch {
      return { ...unavailable, message: "تعذّر فحص طابعة الجهاز؛ تأكد من تثبيت APK المحدّث وتشغيل خدمة الطباعة" };
    }
  })().finally(() => { printerDetection = null; });
  return printerDetection;
}

function printerPreferences() {
  if (!native) return null;
  try { return parsePrinterPreferences(localStorage.getItem(printerPreferencesKey)); }
  catch { return null; }
}

export function saveDevicePrinterPreferences(settings: MerchantSettings) {
  if (!native) return;
  // Printer choices are local to this cashier, not another cashier's hardware.
  localStorage.setItem(printerPreferencesKey, JSON.stringify({
    printerTransport: settings.printerTransport, printerAddress: settings.printerAddress,
    paperWidth: settings.paperWidth, copies: settings.copies,
  }));
}

export async function getDevicePrinterSettings(settings: MerchantSettings, useSavedPreferences = true) {
  const preferences = useSavedPreferences ? printerPreferences() : null;
  const selected = { ...settings, ...preferences };
  if (!native || ["tcp", "bluetooth"].includes(selected.printerTransport)
    || (selected.printerTransport === "none" && preferences?.printerTransport === "none")) return selected;
  return resolvePrinterSettings(settings, preferences, await detectIntegratedPrinter());
}
let nativeToken: string | null = null;
let serviceStarted = false;
let monitorSound: boolean | undefined;
let audio: AudioContext | null = null;
let alertTimer: ReturnType<typeof setInterval> | undefined;
let currentIds = "";
const base = () => native
  ? String(import.meta.env.VITE_MERCHANT_SERVER_URL ?? "").replace(/\/$/, "")
  : import.meta.env.BASE_URL.replace(/\/$/, "");

export async function initializeMerchantClient() {
  if (native) {
    // Binding is asynchronous; discovery must never delay sign-in or orders.
    void detectIntegratedPrinter();
    const value = base();
    if (!/^https:\/\/[^/]+\/basket-merchant$/.test(value)) {
      throw new Error("يلزم إعداد رابط خدمة التاجر HTTPS قبل بناء تطبيق أندرويد");
    }
    nativeToken = (await Device.getSession()).token;
    setAuthTokenGetter(() => nativeToken);
    await LocalNotifications.createChannel({ id: "merchant-orders", name: "طلبات السلة", importance: 5, visibility: 1, vibration: true });
  }
  setBaseUrl(base());
}
export async function saveNativeSession(token: string) {
  if (!native) return;
  await Device.saveSession({ token });
  nativeToken = token;
}
export async function clearNativeSession() {
  await stopOrderAlerts();
  if (native) {
    await Device.stopMonitoring();
    await Device.clearSession();
    nativeToken = null;
    serviceStarted = false;
  }
}
export async function configureDevice(settings: MerchantSettings) {
  if (native) {
    await Device.configure({ keepAwake: settings.keepAwake });
    if (nativeToken && (!serviceStarted || monitorSound !== settings.soundEnabled)) {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") {
        const result = await LocalNotifications.requestPermissions();
        if (result.display !== "granted") throw new Error("الإشعارات غير مسموحة؛ فعّلها من إعدادات أندرويد لاستقبال تنبيه الطلبات");
      }
      await Device.startMonitoring({ url: base(), sound: settings.soundEnabled });
      serviceStarted = true;
      monitorSound = settings.soundEnabled;
    }
  }
}
export async function printOrder(order: MerchantOrder, settings: MerchantSettings, kitchen = false) {
  if (!native) throw new Error("الطباعة الحرارية تتطلب تطبيق أندرويد؛ لا نستخدم طباعة المتصفح");
  settings = await getDevicePrinterSettings(settings);
  await printLines(receiptLines(order, settings, kitchen), `BASKET|${order.id}|${order.dailyNumber}|${order.totalPrice.toFixed(2)}`, settings, receiptRows(order, settings, kitchen));
}

async function printLines(lines: string[], qr: string, settings: MerchantSettings, rows?: ReceiptRow[]) {
  if (settings.printerTransport === "none") throw new Error("الطباعة متوقفة؛ اختر الطابعة المدمجة أو اتصال بلوتوث أو شبكة");
  if (settings.printerTransport === "vendor")
    throw new Error(integratedPrinter?.message || "لم يتم العثور على طابعة مدمجة مدعومة؛ اختر بلوتوث أو شبكة، أو تحقق من خدمة SUNMI");
  await Device.printReceipt({
    lines, qr,
    width: settings.paperWidth, copies: settings.copies,
    transport: settings.printerTransport, address: settings.printerAddress, rows,
  });
}

export async function printTestReceipt(settings: MerchantSettings) {
  if (!native) throw new Error("الطباعة التجريبية تتطلب تطبيق أندرويد");
  // Test the visible choice, including unsaved edits, without creating an order.
  const selected = settings.printerTransport === "none"
    ? settings : await getDevicePrinterSettings(settings, false);
  await printLines(["السلة — اختبار الطباعة", "هذا سطر عربي للتأكد من وضوح الحروف", "رقم الاختبار: 1234567890", "ليست فاتورة طلب"], "", { ...selected, copies: 1 });
}
function beep() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + 0.5);
  } catch { /* Audio unlock requires a user gesture in browsers; native monitoring owns production alerts. */ }
}
export async function startOrderAlerts(ids: number[], settings: MerchantSettings) {
  if (native) { await configureDevice(settings); await Device.updatePendingOrders({ ids }); return; }
  const key = [...ids].sort((a, b) => a - b).join(",");
  if (currentIds === key && alertTimer) return;
  await stopOrderAlerts();
  currentIds = key;
  if (ids.length && settings.soundEnabled) { beep(); alertTimer = setInterval(beep, 6000); }
}
export async function stopOrderAlerts() {
  if (alertTimer) clearInterval(alertTimer);
  alertTimer = undefined;
  currentIds = "";
  // Do not stop native monitoring on screen navigation or when no pending order exists.
}
export async function acknowledgeAcceptedOrder(orderId: number) {
  if (native) await Device.updatePendingOrders({ acceptedId: orderId });
}
export function connectMerchantEvents(onUpdate: () => void, onConnection: (status: "connected" | "reconnecting" | "offline") => void) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  function connect() {
    if (stopped) return;
    if (!navigator.onLine) { onConnection("offline"); return; }
    const url = new URL(`${base()}/events`, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    // Native background service authenticates its socket with a header.
    // The browser socket uses the independent HttpOnly session cookie.
    if (native) {
      void Device.getMonitoringStatus().then(result => onConnection(result.connected ? "connected" : "reconnecting")).catch(() => onConnection("offline"));
      return;
    }
    onConnection("reconnecting");
    socket = new WebSocket(url);
    socket.onopen = () => { attempts = 0; onConnection("connected"); onUpdate(); };
    socket.onmessage = () => onUpdate();
    socket.onerror = () => onConnection("reconnecting");
    socket.onclose = () => {
      if (stopped) return;
      onConnection(navigator.onLine ? "reconnecting" : "offline");
      retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
    };
  }
  const resume = () => { socket?.close(); if (retry) clearTimeout(retry); connect(); onUpdate(); };
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  const poll = setInterval(() => {
    if (navigator.onLine) onUpdate();
    if (native) connect();
  }, native ? 3000 : 15000);
  const listener = native ? App.addListener("appStateChange", state => { if (state.isActive) resume(); }) : null;
  connect();
  return () => {
    stopped = true; socket?.close(); if (retry) clearTimeout(retry); clearInterval(poll);
    window.removeEventListener("online", resume); window.removeEventListener("offline", resume);
    if (listener) void listener.then(value => value.remove());
  };
}
