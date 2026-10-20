import type { MerchantSettings } from "@workspace/api-client-react";

export interface IntegratedPrinter {
  supported: boolean;
  transport: "sunmi" | "none";
  manufacturer: string;
  model: string;
  paperWidth: 58;
  state?: number;
  message: string;
}

export type PrinterPreferences = Pick<MerchantSettings, "printerTransport" | "printerAddress" | "paperWidth" | "copies">;
const transports = new Set(["none", "vendor", "sunmi", "tcp", "bluetooth"]);

export function parsePrinterPreferences(raw: string | null): PrinterPreferences | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !transports.has(value.printerTransport) || typeof value.printerAddress !== "string"
      || ![58, 80].includes(value.paperWidth) || !Number.isInteger(value.copies) || value.copies < 1 || value.copies > 5) return null;
    return { printerTransport: value.printerTransport, printerAddress: value.printerAddress, paperWidth: value.paperWidth, copies: value.copies };
  } catch { return null; }
}

export function resolvePrinterSettings(
  settings: MerchantSettings,
  preferences: PrinterPreferences | null,
  printer: IntegratedPrinter | null,
): MerchantSettings {
  const selected = { ...settings, ...preferences };
  // A deliberate "none" selection on this device remains an opt-out.
  const auto = selected.printerTransport === "vendor"
    || (selected.printerTransport === "none" && preferences === null);
  if (auto && printer?.supported) return { ...selected, printerTransport: "sunmi", printerAddress: "", paperWidth: 58 };
  if (selected.printerTransport === "sunmi" && printer?.supported && /^V3H$/i.test(printer.model.trim())) {
    return { ...selected, paperWidth: 58 };
  }
  return selected;
}
