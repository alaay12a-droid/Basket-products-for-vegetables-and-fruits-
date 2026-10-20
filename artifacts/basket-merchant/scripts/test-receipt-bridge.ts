import assert from "node:assert/strict";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { MerchantOrder, MerchantSettings } from "@workspace/api-client-react";
import { receiptRows, type ReceiptRow } from "../src/lib/receipt";

// Execute the real JS invoice path against an in-memory bridge. No device,
// backend, customer order, payment or physical printer is contacted.
const preferences = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => preferences.get(key) ?? null,
  setItem: (key: string, value: string) => preferences.set(key, value),
} });
globalThis.fetch = async () => { throw new Error("Network access is forbidden in the receipt test."); };
Capacitor.isNativePlatform = () => true;
interface Command { lines: string[]; qr: string; width: number; copies: number; transport: string; address: string; rows?: ReceiptRow[] }
const commands: Command[] = [];
let printerError = false;
registerPlugin("MerchantDevice", { web: () => ({
  detectPrinter: async () => ({
    supported: true, transport: "sunmi", manufacturer: "SUNMI", model: "V3H",
    paperWidth: 58, state: 1, message: "جاهزة",
  }),
  printReceipt: async (command: Command) => {
    if (printerError) throw new Error("نفد الورق");
    commands.push(command);
  },
}) });
const { printOrder, printTestReceipt, saveDevicePrinterPreferences } = await import("../src/lib/device");
const settings = {
  storeName: "السلة للخضار والفواكه", storeAddress: "عنوان المتجر", taxNumber: "TEST",
  printerTransport: "vendor", printerAddress: "", paperWidth: 80, copies: 2,
} as MerchantSettings;
const order = {
  id: 900001, dailyNumber: 999, createdAt: "2026-10-20T10:00:00Z",
  items: [{ id: 1, name: "طماطم طازجة", quantity: 2, price: 10 }],
  totalPrice: 25, deliveryFee: 5, taxAmount: 3.26, paymentMethod: "cash",
  customerName: "عميل اختبار", customerPhone: "TEST", customerAddress: "عنوان الاختبار",
  driverName: "مندوب اختبار", orderType: "delivery", status: "pending",
  notes: "اختبار ترتيب الفاتورة",
} as MerchantOrder;

await printOrder(order, settings);
const invoice = commands[0];
assert.equal(invoice.transport, "sunmi", "Automatic vendor selection must reach the official SUNMI bridge.");
assert.equal(invoice.width, 58, "V3H invoices must use 58mm.");
assert.equal(invoice.copies, 2);
assert.equal(invoice.qr, "BASKET|900001|999|25.00");
for (const value of ["فاتورة طلب", "طلب رقم #999", "طماطم طازجة", "2 × 10.00 ر.س   =   20.00 ر.س",
  "رسوم التوصيل: 5.00 ر.س", "ضريبة 15% مشمولة: 3.26 ر.س", "الإجمالي: 25.00 ر.س",
  "الدفع: نقدًا", "الاسم: عميل اختبار", "المندوب: مندوب اختبار"]) assert.ok(invoice.lines.includes(value), value);
assert.deepEqual(invoice.rows, receiptRows(order, settings));
const labels = invoice.rows!.flatMap(row => row.kind === "text" ? [row.text] : []);
const ordered = ["السلة للخضار والفواكه", "فاتورة طلب", "طلب رقم #999", "بيانات الزبون",
  "الاسم: عميل اختبار", "تفاصيل الطلب", "طماطم طازجة", "رسوم التوصيل: 5.00 ر.س",
  "ملاحظات: اختبار ترتيب الفاتورة", "الإجمالي: 25.00 ر.س", "شكرًا لاختياركم السلة للخضار والفواكه"];
for (let i = 1; i < ordered.length; i++) assert.ok(labels.indexOf(ordered[i]) > labels.indexOf(ordered[i - 1]), ordered[i]);
assert.ok(invoice.rows!.some(row => row.kind === "text" && row.style === "total" && row.text === "الإجمالي: 25.00 ر.س"));
assert.deepEqual(invoice.rows!.find(row => row.kind === "columns"), { kind: "columns", right: "2 × 10.00 ر.س", left: "20.00 ر.س" });
assert.equal(invoice.rows!.at(-2)!.kind, "qr", "QR stays above the final thank-you line.");
assert.equal(invoice.rows!.filter(row => row.kind === "divider").length, 4);
await printOrder(order, settings, true);
assert.ok(commands[1].lines.includes("نسخة المطبخ"));
assert.ok(!commands[1].lines.some(line => line.startsWith("الإجمالي:")));
assert.ok(commands[1].lines.includes("2 × طماطم طازجة"), "Kitchen retains quantities without exposing prices.");
assert.ok(!commands[1].rows!.some(row => row.kind === "columns"));
await printOrder(order, { ...settings, printerTransport: "none" });
assert.equal(commands[2].transport, "sunmi", "An unconfigured device must auto-detect its integrated printer.");
await printTestReceipt(settings);
assert.equal(commands[3].copies, 1);
assert.equal(commands[3].width, 58);
assert.ok(commands[3].lines.includes("رقم الاختبار: 1234567890"));
assert.equal(commands[3].qr, "");
assert.equal(commands[3].rows, undefined, "The working test-print path keeps its plain-text fallback.");
saveDevicePrinterPreferences({ ...settings, printerTransport: "bluetooth", printerAddress: "AA:BB:CC:DD:EE:FF", paperWidth: 58 });
await printOrder(order, settings);
assert.equal(commands[4].transport, "bluetooth");
assert.equal(commands[4].address, "AA:BB:CC:DD:EE:FF");
saveDevicePrinterPreferences({ ...settings, printerTransport: "none" });
await assert.rejects(printOrder(order, settings), /الطباعة متوقفة/);
assert.equal(commands.length, 5, "Disabled printing must not send a bridge command.");
saveDevicePrinterPreferences({ ...settings, printerTransport: "sunmi", paperWidth: 58 });
printerError = true;
await assert.rejects(printOrder(order, settings), /نفد الورق/);
assert.equal(commands.length, 5, "Printer errors must not be reported as successful prints.");
const customized = receiptRows({
  ...order, notes: "", driverName: "", customerAddress: "", discountAmount: 2, totalPrice: 23,
  items: [{ ...order.items[0], customization: {
    size: "كبير", selectedOptions: [{ groupName: "التجهيز", choice: "مقطع" }], addon: "إضافة تجريبية",
  } }],
}, settings);
const customizationText = customized.flatMap(row => row.kind === "text" ? [row.text] : []);
for (const value of ["الحجم: كبير", "التجهيز: مقطع", "إضافة تجريبية", "الخصم: 2.00 ر.س", "الإجمالي: 23.00 ر.س"])
  assert.ok(customizationText.includes(value), value);
assert.ok(!customizationText.some(value => /^(العنوان|المندوب|ملاحظات):/.test(value)), "Absent optional fields stay hidden.");
console.log("Receipt bridge checks passed: full Arabic invoice, kitchen copy, automatic SUNMI/58mm, QR, test receipt, Bluetooth preference, opt-out and error propagation. No real printing or API calls.");
