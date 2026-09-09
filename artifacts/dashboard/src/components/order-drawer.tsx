import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListOrdersQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatEasternNumber, formatDateTime, getOrderPriceFactor } from "@/lib/format";
import { apiGet, apiPost, apiPatch, apiDel } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Phone, MapPin, CreditCard, ShoppingBag, ReceiptText, Truck, MessageCircle, Printer, Send, UserCheck, UserX } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "done" | "cancelled";
interface OrderItem { id: string; name: string; price: number; quantity: number; }
interface Order {
  id: number; dailyNumber: number | null; customerName: string; customerPhone: string;
  customerAddress: string | null; items: OrderItem[]; totalPrice: number; deliveryFee: number;
  discountCode: string | null; discountAmount: number | null; status: OrderStatus;
  paymentMethod: string; notes: string | null; createdAt: string;
}
interface Driver { id: number; name: string; phone: string; photoUrl: string | null; active: boolean; }
interface Assignment { driverId: number; driverName: string; status: string; }
interface ChatMsg { id: number; orderId: number; text: string; fromCashier: boolean; createdAt: string; readAt: string | null; }

const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: "جديد",    color: "text-red-600",    bg: "bg-red-500/10 border-red-500/20" },
  preparing: { label: "يُحضَّر", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
  ready:     { label: "جاهز",   color: "text-green-600",  bg: "bg-green-500/10 border-green-500/20" },
  out_for_delivery: { label: "قيد التوصيل", color: "text-blue-600", bg: "bg-blue-500/10 border-blue-500/20" },
  done:      { label: "مكتمل",  color: "text-gray-500",   bg: "bg-gray-500/10 border-gray-500/20" },
  cancelled: { label: "ملغي",   color: "text-zinc-400",   bg: "bg-zinc-500/10 border-zinc-500/20" },
};

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated?: (order: Order) => void;
}

export function OrderDrawer({ order, open, onOpenChange, onOrderUpdated }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating]         = useState(false);
  const [drivers, setDrivers]               = useState<Driver[]>([]);
  const [driversEnabled, setDriversEnabled] = useState(false);
  const [assignment, setAssignment]         = useState<Assignment | null>(null);
  const [assigning, setAssigning]           = useState(false);
  const [messages, setMessages]             = useState<ChatMsg[]>([]);
  const [msgInput, setMsgInput]             = useState("");
  const [sending, setSending]               = useState(false);
  const [unreadCount, setUnreadCount]       = useState(0);
  const chatEndRef                          = useRef<HTMLDivElement>(null);
  const pollRef                             = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDriversData = useCallback(async () => {
    try {
      const [drvList, drvEnabled] = await Promise.all([
        apiGet<Driver[]>("/drivers"),
        apiGet<{ enabled: boolean }>("/settings/drivers-enabled"),
      ]);
      setDrivers(drvList.filter(d => d.active));
      setDriversEnabled(drvEnabled.enabled);
    } catch {}
  }, []);

  const loadAssignment = useCallback(async (orderId: number) => {
    try {
      const row = await apiGet<{ assignment: { driverId: number; status: string }; driver: { name: string } } | null>(
        `/orders/${orderId}/assignment`
      );
      if (row) setAssignment({ driverId: row.assignment.driverId, driverName: row.driver?.name ?? "مندوب", status: row.assignment.status });
      else setAssignment(null);
    } catch { setAssignment(null); }
  }, []);

  const loadMessages = useCallback(async (orderId: number, markRead = true) => {
    try {
      const msgs = await apiGet<ChatMsg[]>(`/messages/order/${orderId}`);
      setMessages(msgs);
      if (markRead) {
        await apiPatch(`/messages/order/${orderId}/read`, { fromCashier: true });
        setUnreadCount(0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!open || !order) { setMessages([]); setAssignment(null); setDrivers([]); return; }
    loadDriversData();
    loadAssignment(order.id);
    loadMessages(order.id);
  }, [open, order?.id]);

  useEffect(() => {
    if (!open || !order) { if (pollRef.current) clearInterval(pollRef.current); return; }
    pollRef.current = setInterval(() => loadMessages(order.id, true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, order?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!order) return;
    setIsUpdating(true);
    try {
      const updated = await apiPatch<Order>(`/orders/${order.id}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      onOrderUpdated?.(updated);
      toast({ title: "تم التحديث", description: `الحالة: ${STATUS_META[newStatus].label}` });
    } catch {
      toast({ title: "خطأ", description: "تعذّر تحديث الحالة", variant: "destructive" });
    }
    setIsUpdating(false);
  };

  const handleAssignDriver = async (driverId: number) => {
    if (!order) return;
    setAssigning(true);
    try {
      await apiPost(`/orders/${order.id}/assign-driver`, { driverId });
      await loadAssignment(order.id);
      // Assigning a driver auto-transitions the order to "قيد التوصيل" server-side; refresh to reflect it.
      try {
        const updated = await apiGet<Order>(`/orders/${order.id}`);
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        onOrderUpdated?.(updated);
      } catch {}
      toast({ title: "تم التعيين", description: `تم تعيين السائق ونقل الطلب إلى "قيد التوصيل"` });
    } catch {
      toast({ title: "خطأ", description: "تعذّر تعيين السائق", variant: "destructive" });
    }
    setAssigning(false);
  };

  const handleUnassignDriver = async () => {
    if (!order) return;
    setAssigning(true);
    try {
      await apiDel(`/orders/${order.id}/assign-driver`);
      setAssignment(null);
      try {
        const updated = await apiGet<Order>(`/orders/${order.id}`);
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        onOrderUpdated?.(updated);
      } catch {}
      toast({ title: "تم الإلغاء", description: "تم إلغاء تعيين السائق" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر إلغاء التعيين", variant: "destructive" });
    }
    setAssigning(false);
  };

  const handleSendMessage = async () => {
    if (!order || !msgInput.trim()) return;
    const text = msgInput.trim();
    setMsgInput("");
    setSending(true);
    try {
      const msg = await apiPost<ChatMsg>(`/messages/order/${order.id}`, { text, fromCashier: true });
      setMessages(prev => [...prev, msg]);
    } catch {
      toast({ title: "خطأ", description: "تعذّر الإرسال", variant: "destructive" });
      setMsgInput(text);
    }
    setSending(false);
  };

  const handlePrint = () => {
    if (!order) return;
    const date = new Date(order.createdAt);
    const dateStr = date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
    const timeStr = date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    const pf = getOrderPriceFactor(order);
    const itemsRows = order.items.map(item => {
      const lineTotal = item.price * item.quantity * pf;
      return `<tr><td style="padding:5px 8px;text-align:left;">${lineTotal % 1 === 0 ? lineTotal : lineTotal.toFixed(2)} ر.س</td><td style="padding:5px 8px;text-align:right;">${item.name}</td><td style="padding:5px 8px;text-align:center;">${item.quantity}</td></tr>`;
    }).join("");
    const deliveryFee = (order.deliveryFee ?? 0) / 100;
    const totalPaid = order.totalPrice / 100;
    const discount = order.discountAmount ? order.discountAmount / 100 : 0;
    const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>إيصال #${order.dailyNumber ?? order.id}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;background:#fff;color:#111;direction:rtl;padding:10mm;}
h1{text-align:center;font-size:18px;font-weight:800;color:#8B4513;margin-bottom:4px}.sub{text-align:center;font-size:11px;color:#888;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13px}thead th{background:#8B4513;color:#fff;padding:7px 8px;text-align:center}
tbody tr:nth-child(even){background:#fafafa}.summary{border-top:2px solid #aaa;padding-top:8px;margin-top:8px}
@media print{body{padding:5mm}}</style></head><body>
<h1>سلة الخضار</h1>
<div class="sub">الرقم الضريبي: 302282730200003 | العنوان: تبوك، الروضة، 47711</div>
<div class="sub">إيصال طلب #${formatEasternNumber(order.dailyNumber ?? order.id)} — ${dateStr} ${timeStr}</div>
<p style="font-size:13px;margin-bottom:4px;"><strong>العميل:</strong> ${order.customerName || "عميل"}</p>
${order.customerPhone ? `<p style="font-size:13px;margin-bottom:4px;" dir="ltr"><strong>الجوال:</strong> ${order.customerPhone}</p>` : ""}
${order.customerAddress ? `<p style="font-size:13px;margin-bottom:12px;"><strong>العنوان:</strong> ${order.customerAddress}</p>` : "<br/>"}
<table><thead><tr><th>المبلغ</th><th>الصنف</th><th>الكمية</th></tr></thead><tbody>${itemsRows}</tbody></table>
<div class="summary">
${deliveryFee > 0 ? `<p style="font-size:12px;color:#555;text-align:left;">${fmt(deliveryFee)} ر.س رسوم التوصيل</p>` : ""}
${discount > 0 ? `<p style="font-size:12px;color:#C8171A;text-align:left;">- ${fmt(discount)} ر.س خصم</p>` : ""}
<p style="font-size:16px;font-weight:800;text-align:left;">${fmt(totalPaid)} ر.س — الإجمالي</p>
<p style="font-size:13px;color:#555;">الدفع: ${order.paymentMethod === "cash" ? "نقدي" : "إلكتروني"}</p>
</div>
${order.notes ? `<p style="margin-top:8px;font-size:12px;color:#555;"><strong>ملاحظات:</strong> ${order.notes}</p>` : ""}
<div style="text-align:center;margin-top:16px;">
<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`سلة الخضار - طلب رقم ${order.dailyNumber ?? order.id} - ${fmt(totalPaid)} ر.س`)}" width="100" height="100" alt="QR"/>
<p style="font-size:10px;color:#aaa;margin-top:4px;">طلب #${order.dailyNumber ?? order.id}</p>
</div>
<script>window.onload=function(){window.print();}</script></body></html>`;
    const win = window.open("", "_blank", "width=500,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const ASSIGN_STATUS: Record<string, string> = {
    assigned: "معيّن", picked_up: "استلم الطلب", delivered: "سلّم الطلب"
  };

  if (!order) return null;
  const meta = STATUS_META[order.status];
  const isDelivery = !!(order.customerAddress || order.notes?.includes("توصيل"));
  const pf = getOrderPriceFactor(order);
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0) * pf;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 border-l gap-0" dir="rtl">
        {/* Header */}
        <SheetHeader className="p-5 border-b bg-card shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl flex items-center gap-2.5">
              <span>طلب #{formatEasternNumber(order.dailyNumber ?? order.id)}</span>
              <Badge variant="outline" className={cn("text-xs font-bold", meta.bg, meta.color)}>
                {meta.label}
              </Badge>
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={handlePrint} title="طباعة الإيصال">
              <Printer className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="shrink-0 w-full rounded-none border-b bg-card h-11 gap-0 p-0">
            <TabsTrigger value="details" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none h-full">
              <ShoppingBag className="w-4 h-4 ml-1.5" />
              الطلب
            </TabsTrigger>
            <TabsTrigger value="delivery" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none h-full">
              <Truck className="w-4 h-4 ml-1.5" />
              التوصيل
              {assignment && <span className="mr-1.5 inline-flex w-2 h-2 rounded-full bg-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none h-full">
              <MessageCircle className="w-4 h-4 ml-1.5" />
              الدردشة
              {unreadCount > 0 && (
                <span className="mr-1.5 inline-flex items-center justify-center bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Details ── */}
          <TabsContent value="details" className="flex-1 flex flex-col overflow-hidden m-0">
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-6">
                {/* Customer */}
                <section>
                  <h3 className="font-semibold flex items-center gap-2 pb-2 border-b mb-3">
                    <ReceiptText className="w-4 h-4 text-primary" />بيانات العميل
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="font-semibold text-base">{order.customerName || "عميل"}</div>
                    {order.customerPhone && (
                      <div className="flex items-center gap-2 text-muted-foreground" dir="ltr">
                        <Phone className="w-4 h-4" />{order.customerPhone}
                      </div>
                    )}
                    {order.customerAddress && (
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0" />{order.customerAddress}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="w-4 h-4" />
                      {order.paymentMethod === "cash" ? "💵 نقدي" : "💳 إلكتروني"}
                    </div>
                  </div>
                </section>

                {/* Items */}
                <section>
                  <h3 className="font-semibold flex items-center gap-2 pb-2 border-b mb-3">
                    <ShoppingBag className="w-4 h-4 text-primary" />الأصناف
                  </h3>
                  <div className="space-y-2.5">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {formatEasternNumber(item.quantity)}
                          </span>
                          <span className="font-medium text-sm">{item.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">
                          {formatCurrency(Math.round(item.price * item.quantity * pf * 100))}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>قيمة الطلب</span>
                      <span>{formatCurrency(Math.round(subtotal * 100))}</span>
                    </div>
                    {(order.deliveryFee ?? 0) > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>رسوم التوصيل</span>
                        <span>{formatCurrency(order.deliveryFee)}</span>
                      </div>
                    )}
                    {order.discountAmount && order.discountAmount > 0 ? (
                      <div className="flex justify-between text-green-600">
                        <span>خصم {order.discountCode ? `(${order.discountCode})` : ""}</span>
                        <span dir="ltr">-{formatCurrency(order.discountAmount)}</span>
                      </div>
                    ) : null}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center font-bold text-base">
                      <span>الإجمالي</span>
                      <span className="text-primary">{formatCurrency(order.totalPrice)}</span>
                    </div>
                  </div>
                </section>

                {order.notes && (
                  <section className="p-3 bg-yellow-50/60 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg text-sm">
                    <div className="font-semibold text-yellow-800 dark:text-yellow-400 mb-1">ملاحظات</div>
                    <p className="text-yellow-900/80 dark:text-yellow-300/80">{order.notes}</p>
                  </section>
                )}
              </div>
            </ScrollArea>

            {/* Status Actions */}
            <div className="p-4 border-t bg-card shrink-0 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">تحديث الحالة</p>
              <div className="grid grid-cols-2 gap-2">
                {order.status === "pending" && (
                  <Button className="col-span-2" disabled={isUpdating} onClick={() => handleStatusChange("preparing")}>
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                    قبول الطلب والبدء بالتحضير
                  </Button>
                )}
                {(order.status === "pending" || order.status === "preparing") && (
                  <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={isUpdating} onClick={() => handleStatusChange("ready")}>
                    الطلب جاهز ✓
                  </Button>
                )}
                {order.status === "ready" && (
                  <Button className="bg-gray-700 hover:bg-gray-800 text-white col-span-2" disabled={isUpdating} onClick={() => handleStatusChange("done")}>
                    تأكيد التسليم — مكتمل ✓
                  </Button>
                )}
                {order.status === "out_for_delivery" && (
                  <Button className="bg-gray-700 hover:bg-gray-800 text-white col-span-2" disabled={isUpdating} onClick={() => handleStatusChange("done")}>
                    تأكيد التسليم — مكتمل ✓
                  </Button>
                )}
                {order.status !== "cancelled" && order.status !== "done" && (
                  <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200" disabled={isUpdating} onClick={() => handleStatusChange("cancelled")}>
                    إلغاء الطلب
                  </Button>
                )}
                {(order.status === "done" || order.status === "cancelled") && (
                  <div className={cn("col-span-2 text-center text-sm font-medium py-2 rounded-lg",
                    order.status === "done" ? "bg-gray-100 dark:bg-gray-800 text-gray-500" : "bg-red-50 dark:bg-red-900/20 text-red-500"
                  )}>
                    {order.status === "done" ? "✓ الطلب مكتمل" : "✗ تم إلغاء الطلب"}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Delivery / Driver ── */}
          <TabsContent value="delivery" className="flex-1 overflow-auto m-0 p-5">
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold flex items-center gap-2 pb-2 border-b mb-3">
                  <Truck className="w-4 h-4 text-primary" />التوصيل والمندوب
                </h3>
                {!driversEnabled && (
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground text-center">
                    التوصيل غير مفعّل حالياً
                  </div>
                )}
                {driversEnabled && !isDelivery && (
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground text-center">
                    هذا الطلب للاستلام من الفرع
                  </div>
                )}
              </div>

              {driversEnabled && (
                <>
                  {/* Current assignment */}
                  {assignment && (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-5 h-5 text-green-600" />
                          <div>
                            <div className="font-semibold text-sm">{assignment.driverName}</div>
                            <div className="text-xs text-muted-foreground">{ASSIGN_STATUS[assignment.status] ?? assignment.status}</div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          disabled={assigning}
                          onClick={handleUnassignDriver}
                        >
                          <UserX className="w-4 h-4 ml-1" />
                          إلغاء التعيين
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Available drivers */}
                  {!assignment && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">اختر مندوباً:</p>
                      {drivers.length === 0 ? (
                        <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground text-center">
                          لا يوجد مناديب نشطون
                        </div>
                      ) : (
                        drivers.map(driver => (
                          <button
                            key={driver.id}
                            disabled={assigning}
                            onClick={() => handleAssignDriver(driver.id)}
                            className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-right"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                {driver.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-sm">{driver.name}</div>
                                <div className="text-xs text-muted-foreground" dir="ltr">{driver.phone}</div>
                              </div>
                            </div>
                            {assigning ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                              <span className="text-xs text-primary font-medium">تعيين</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Tab: Chat ── */}
          <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0">
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  لا توجد رسائل بعد
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn("flex", msg.fromCashier ? "justify-start" : "justify-end")}
                    >
                      <div className={cn(
                        "max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm",
                        msg.fromCashier
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-card border border-border rounded-tl-sm"
                      )}>
                        <p>{msg.text}</p>
                        <p className={cn(
                          "text-[10px] mt-1 opacity-70",
                          msg.fromCashier ? "text-left" : "text-right"
                        )}>
                          {new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ScrollArea>
            <div className="p-3 border-t bg-card shrink-0">
              <div className="flex gap-2">
                <Textarea
                  className="flex-1 min-h-[42px] max-h-[100px] resize-none text-sm"
                  placeholder="اكتب رسالة..."
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                  }}
                  rows={1}
                />
                <Button
                  size="icon"
                  className="shrink-0 h-[42px] w-[42px]"
                  disabled={sending || !msgInput.trim()}
                  onClick={handleSendMessage}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
