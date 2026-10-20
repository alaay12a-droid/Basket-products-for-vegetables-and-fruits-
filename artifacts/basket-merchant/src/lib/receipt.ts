import type { MerchantOrder, MerchantSettings } from "@workspace/api-client-react";

export type ReceiptRow =
  | { kind: "text"; text: string; style?: "store" | "banner" | "order" | "date" | "heading" | "body" | "total" | "footer" }
  | { kind: "columns"; right: string; left: string }
  | { kind: "divider" | "qr" };

const money = (value: number) => `${Number(value).toFixed(2)} ر.س`;

/** Structured presentation only: prices and totals remain the stored order values. */
export function receiptRows(order: MerchantOrder, settings: MerchantSettings, kitchen = false): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const text = (value: string, style: Extract<ReceiptRow, { kind: "text" }>["style"] = "body") =>
    rows.push({ kind: "text", text: value, style });
  const divider = () => rows.push({ kind: "divider" });

  text(settings.storeName, "store");
  text(kitchen ? "نسخة المطبخ" : "فاتورة طلب", "banner");
  text(`طلب رقم #${order.dailyNumber || order.id}`, "order");
  text(new Date(order.createdAt).toLocaleString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh" }), "date");
  if (order.branchName) text(order.branchName, "date");
  if (settings.storeAddress) text(settings.storeAddress, "date");
  divider();

  text("بيانات الزبون", "heading");
  text(`الاسم: ${order.customerName}`);
  text(`الجوال: ${order.customerPhone}`);
  if (order.customerAddress) text(`العنوان: ${order.customerAddress}`);
  if (order.driverName) text(`المندوب: ${order.driverName}`);
  divider();

  text("تفاصيل الطلب", "heading");
  for (const item of order.items) {
    text(kitchen ? `${item.quantity} × ${item.name}` : item.name);
    if (!kitchen) rows.push({
      kind: "columns",
      right: `${item.quantity} × ${money(item.price)}`,
      left: money(item.price * item.quantity),
    });
    if (item.customization?.size) text(`الحجم: ${item.customization.size}`);
    for (const option of item.customization?.selectedOptions ?? []) text(`${option.groupName}: ${option.choice}`);
    if (item.customization?.addon) text(item.customization.addon);
  }
  if (!kitchen) {
    if (order.discountAmount) text(`الخصم: ${money(order.discountAmount)}`);
    text(`رسوم التوصيل: ${money(order.deliveryFee)}`);
    text(`ضريبة 15% مشمولة: ${money(order.taxAmount ?? order.totalPrice * 15 / 115)}`);
    text(`الدفع: ${order.paymentMethod === "cash" ? "نقدًا" : order.paymentMethod}`);
    if (settings.taxNumber) text(`الرقم الضريبي: ${settings.taxNumber}`);
  }
  if (order.notes) text(`ملاحظات: ${order.notes}`, "heading");
  divider();
  if (!kitchen) {
    text(`الإجمالي: ${money(order.totalPrice)}`, "total");
    divider();
  }
  rows.push({ kind: "qr" });
  text(`شكرًا لاختياركم ${settings.storeName}`, "footer");
  return rows;
}

/** Plain-text fallback for older bridges and simple printer diagnostics. */
export function receiptLines(order: MerchantOrder, settings: MerchantSettings, kitchen = false): string[] {
  return receiptRows(order, settings, kitchen).flatMap(row => {
    if (row.kind === "text") return [row.text];
    if (row.kind === "columns") return [`${row.right}   =   ${row.left}`];
    if (row.kind === "divider") return ["--------------------------------"];
    return [];
  });
}
