import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { MerchantSettings } from "@workspace/api-client-react";
import { parsePrinterPreferences, resolvePrinterSettings, type IntegratedPrinter, type PrinterPreferences } from "../src/lib/printer-config";

const settings = {
  printerTransport: "none", printerAddress: "", paperWidth: 80, copies: 2,
  storeName: "السلة", autoPrint: true,
} as MerchantSettings;
const sunmi: IntegratedPrinter = {
  supported: true, transport: "sunmi", manufacturer: "SUNMI", model: "V3H",
  paperWidth: 58, state: 1, message: "جاهزة",
};
const manual = (transport: PrinterPreferences["printerTransport"]): PrinterPreferences => ({
  printerTransport: transport, printerAddress: "192.168.1.50:9100", paperWidth: 80, copies: 3,
});
assert.equal(resolvePrinterSettings(settings, null, sunmi).printerTransport, "sunmi");
assert.equal(resolvePrinterSettings(settings, null, sunmi).paperWidth, 58);
assert.equal(resolvePrinterSettings({ ...settings, printerTransport: "vendor" }, null, sunmi).printerTransport, "sunmi");
assert.equal(resolvePrinterSettings(settings, manual("none"), sunmi).printerTransport, "none");
for (const transport of ["tcp", "bluetooth"] as const) {
  const selected = resolvePrinterSettings(settings, manual(transport), sunmi);
  assert.equal(selected.printerTransport, transport);
  assert.equal(selected.printerAddress, "192.168.1.50:9100");
  assert.equal(selected.paperWidth, 80);
  assert.equal(selected.copies, 3);
}
assert.equal(resolvePrinterSettings(settings, manual("vendor"), sunmi).printerTransport, "sunmi");
assert.equal(resolvePrinterSettings(settings, manual("sunmi"), sunmi).paperWidth, 58);
assert.equal(resolvePrinterSettings(settings, null, { ...sunmi, supported: false, manufacturer: "unknown", model: "other" }).printerTransport, "none");
assert.equal(resolvePrinterSettings({ ...settings, printerTransport: "vendor" }, null, null).printerTransport, "vendor");
assert.equal(settings.paperWidth, 80, "Do not mutate shared settings.");
assert.equal(parsePrinterPreferences("{invalid"), null);
assert.equal(parsePrinterPreferences('{"printerTransport":"mystery"}'), null);
assert.equal(parsePrinterPreferences(JSON.stringify({ ...manual("tcp"), copies: 0 })), null);
assert.equal(parsePrinterPreferences(JSON.stringify({ ...manual("tcp"), paperWidth: 60 })), null);
assert.deepEqual(parsePrinterPreferences(JSON.stringify(manual("tcp"))), manual("tcp"));

const device = readFileSync(new URL("../src/lib/device.ts", import.meta.url), "utf8");
assert.ok(device.includes("رقم الاختبار: 1234567890"), "Test receipt includes Arabic and a number.");
assert.ok(device.includes("copies: 1"), "Test receipt prints a single copy.");
const java = readFileSync(new URL("../android/app/src/main/java/com/basket/merchant/MerchantDevicePlugin.java", import.meta.url), "utf8");
assert.ok(java.includes("try (SunmiConnection connection = connectSunmi())"), "Probe actual SDK service.");
assert.ok(java.includes("connection.close(); throw error;"), "Release service binding after a failed probe.");
assert.ok(java.includes('"vendor".equals(transport)'), "Native device printer uses official SUNMI binding.");
console.log("Printer configuration checks passed: auto SUNMI, 58mm, manual opt-out, TCP/Bluetooth preservation, validation, test receipt, service lifecycle.");
