export const defaultSettings = {
  storeName: "منتجات السلة للخضار والفواكه",
  storeAddress: "",
  taxNumber: "",
  supportPhone: "",
  supportWhatsapp: "",
  paperWidth: 58,
  copies: 1,
  kitchenCopy: true,
  autoPrint: false,
  soundEnabled: true,
  keepAwake: true,
  language: "ar",
  printerTransport: "none",
  printerAddress: "",
};
export const defaultHours = Array.from({ length: 7 }, (_, day) => ({ day, periods: [] as { open: string; close: string }[] }));
export function isOpenAt(hours: typeof defaultHours, closedUntil: string | null, manuallyClosed: boolean, date = new Date(), manuallyOpen = false) {
  if (closedUntil && Date.parse(closedUntil) > date.getTime()) return false;
  if (manuallyClosed && !closedUntil) return false;
  // An unset schedule is not a fabricated closed schedule.
  if (manuallyOpen) return true;
  if (!hours.some(day => day.periods.length)) return false;
  const saudi = new Date(date.getTime() + 3 * 3600000);
  const minute = saudi.getUTCHours() * 60 + saudi.getUTCMinutes();
  const day = saudi.getUTCDay();
  const mins = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return hours.some(entry => entry.periods.some(period => {
    const open = mins(period.open), close = mins(period.close);
    return open < close
      ? entry.day === day && minute >= open && minute < close
      : (entry.day === day && minute >= open) || ((entry.day + 1) % 7 === day && minute < close);
  }));
}
