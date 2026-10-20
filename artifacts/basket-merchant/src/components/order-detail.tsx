import { tr } from '@/lib/i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, MapPin, MessageSquare, Phone, Printer, Send, Truck, X } from 'lucide-react';
import type { MerchantOrder } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Confirm, Panel, SectionLabel, inputCls } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { assignable, type MerchantDriver, PAYMENT_LABEL, STATUS_LABEL, STATUS_TONE, dateTime, money, timeOnly } from '@/lib/format';
import { cn } from '@/lib/utils';

const MINUTES = [10, 15, 20, 30, 45, 60];
const QUICK = ['طلبك قيد التحضير', 'طلبك جاهز', 'المندوب في الطريق'];

export function OrderDetail({ orderId, onClose, initialAction }: { orderId: number | null; onClose: () => void; initialAction?: 'accept' | 'cancel' }) {
  const { snap } = useMerchant();
  const order = snap?.orders.find((o) => o.id === orderId);
  return (
    <Dialog open={orderId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        hideClose
        className="merchant-order-panel flex w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-3xl"
        data-testid="order-detail-dialog"
      >
        <DialogTitle className="sr-only">{tr('تفاصيل الطلب')}</DialogTitle>
        <DialogDescription className="sr-only">{tr('تفاصيل الطلب وإجراءاته')}</DialogDescription>
        {order ? <Body key={`${order.id}:${initialAction ?? 'details'}`} order={order} onClose={onClose} initialAction={initialAction} /> : <p className="p-8 text-center text-muted-foreground">{tr('الطلب غير موجود في البيانات الحالية.')}</p>}
      </DialogContent>
    </Dialog>
  );
}

function Body({ order, onClose, initialAction }: { order: MerchantOrder; onClose: () => void; initialAction?: 'accept' | 'cancel' }) {
  const { snap, ro, run, busy, print, settings, printingIds, printErrors } = useMerchant();
  const [minutes, setMinutes] = useState(20);
  const [rejectOpen, setRejectOpen] = useState(initialAction === 'cancel' && ['pending', 'preparing', 'ready'].includes(order.status));
  const [reason, setReason] = useState('');
  const [manualPrintErr, setPrintErr] = useState<string | null>(null);
  const [manualPrinting, setPrinting] = useState(false);
  const printing = manualPrinting || printingIds.includes(order.id);
  const printErr = printing ? null : (printErrors[order.id] ?? manualPrintErr);
  const [msg, setMsg] = useState('');
  const [driverId, setDriverId] = useState<string>('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [refundType, setRefundType] = useState<'cancel' | 'refund'>('cancel');
  const [refundReason, setRefundReason] = useState('');
  const [decision, setDecision] = useState<null | 'accepted' | 'rejected'>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const detailScroll = useRef<HTMLDivElement>(null);
  const chatList = useRef<HTMLDivElement>(null);
  const markedRef = useRef<string>('');

  const messages = useMemo(() => (snap?.messages ?? []).filter((m) => m.orderId === order.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [snap?.messages, order.id]);
  const unread = messages.filter((m) => !m.fromCashier && !m.readAt).length;
  const refunds = (snap?.refunds ?? []).filter((r) => r.orderId === order.id);
  const pendingRefund = refunds.find((r) => r.status === 'pending');
  const history = (snap?.assignmentHistory ?? []).filter((a) => a.orderId === order.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const allDrivers = (snap?.drivers ?? []) as MerchantDriver[];
  const drivers = allDrivers.filter(assignable);

  useLayoutEffect(() => {
    if (detailScroll.current) detailScroll.current.scrollTop = 0;
  }, [order.id]);

  useEffect(() => {
    // Scroll only the message list, never its parent order-details viewport.
    if (chatList.current) chatList.current.scrollTop = chatList.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (ro || unread === 0) return;
    const key = `${order.id}:${unread}`;
    if (markedRef.current === key) return;
    markedRef.current = key;
    void run('message-read', order.id, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, order.id, ro]);

  const doPrint = async (kitchen: boolean) => {
    setPrinting(true);
    setPrintErr(await print(order.id, kitchen));
    setPrinting(false);
  };
  const assignDriver = async () => {
    if (!driverId) return;
    if (await run('assign-driver', order.id, { driverId: Number(driverId) }, order.driverId ? tr('تم تغيير المندوب') : tr('تم تعيين المندوب'))) {
      setDriverId('');
      setAssignOpen(false);
    }
  };

  const active = order.status === 'pending' || order.status === 'preparing' || order.status === 'ready';
  const subtotal = order.items.reduce((s, i) => s + (i.customization?.unitPrice ?? i.price) * i.quantity, 0);

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b bg-leaf-soft px-4 py-3.5">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground num">#{order.dailyNumber}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', STATUS_TONE[order.status])}>{STATUS_LABEL[order.status]}</span>
            <span className="text-xs text-muted-foreground">{order.orderType === 'delivery' ? tr('توصيل') : tr('استلام من المتجر')}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{dateTime(order.createdAt)}</p>
        </div>
        <button onClick={onClose} aria-label={tr("إغلاق")} className="grid size-12 shrink-0 place-items-center rounded-xl bg-card active:scale-95" data-testid="button-close-order">
          <X className="size-6" />
        </button>
      </div>

      <div ref={detailScroll} className="merchant-modal-scroll min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto bg-background p-3 sm:p-4" data-testid="order-detail-scroll">
        {order.status === 'pending' && (
          <Panel className="border-citrus/40">
            <SectionLabel>{tr('قبول الطلب — وقت التحضير')}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {MINUTES.map((m) => (
                <button key={m} onClick={() => setMinutes(m)} className={cn('h-12 min-w-16 rounded-xl border px-3 text-base font-semibold transition active:scale-95 num', minutes === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')} data-testid={`chip-minutes-${m}`}>
                  {m} {tr('د')}
                </button>
              ))}
              <Input type="number" inputMode="numeric" min={5} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-12 w-24 rounded-xl text-center text-base num" aria-label={tr("دقائق مخصصة")} data-testid="input-minutes" />
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              <Button
                className="col-span-3 h-14 text-base font-bold"
                disabled={ro || busy || minutes < 5 || minutes > 180}
                onClick={async () => {
                  if (await run('accept', order.id, { minutes }, tr('تم قبول الطلب'))) {
                    setPrintErr(null);
                    if (order.orderType === 'delivery') {
                      setDriverId(order.driverId ? String(order.driverId) : '');
                      setAssignOpen(true);
                    }
                  }
                }}
                data-testid="button-accept"
              >
                <Check className="size-5" /> {tr('قبول')}
              </Button>
              <Button variant="outline" className="col-span-2 h-14 border-destructive/40 text-base font-bold text-destructive" disabled={ro || busy} onClick={() => setRejectOpen(true)} data-testid="button-reject">
                {tr('إلغاء')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{tr('ستتم الطباعة تلقائيًا بعد القبول، ثم تختار مندوبًا لطلب التوصيل.')}</p>
          </Panel>
        )}
        <Panel>
          <SectionLabel>{tr('العميل')}</SectionLabel>
          <p className="text-lg font-bold" data-testid="text-customer-name">{order.customerName}</p>
          <a href={`tel:${order.customerPhone}`} className="mt-1 inline-flex min-h-10 items-center gap-2 text-primary num" dir="ltr" data-testid="link-customer-phone">
            <Phone className="size-4" /> {order.customerPhone}
          </a>
          {order.orderType === 'delivery' && (
            <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" />{order.customerAddress || tr('بدون عنوان')}</p>
          )}
          {order.notes && <p className="mt-2 rounded-xl bg-citrus-soft px-3 py-2 text-sm">{tr('ملاحظة:')} {order.notes}</p>}
          {order.branchName && <p className="mt-2 text-xs text-muted-foreground">{tr('الفرع:')} {order.branchName}</p>}
        </Panel>

        <Panel>
          <SectionLabel>{tr('المنتجات')}</SectionLabel>
          <ul className="divide-y">
            {order.items.map((it, idx) => {
              const c = it.customization;
              const unit = c?.unitPrice ?? it.price;
              const extras = [c?.size, c?.variantName, c?.riceType, c?.addon, ...(c?.selectedOptions ?? []).map((o) => `${o.groupName}: ${o.choice}`)].filter(Boolean);
              return (
                <li key={`${it.id}-${idx}`} className="flex items-start gap-3 py-2.5" data-testid={`row-item-${idx}`}>
                  <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-leaf-soft px-1 text-sm font-bold text-primary num">{it.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{it.name}</p>
                    {extras.length > 0 && <p className="text-xs text-muted-foreground">{extras.join(' · ')}</p>}
                    <p className="text-xs text-muted-foreground num">{money(unit)} {tr('للوحدة')}</p>
                  </div>
                  <span className="font-semibold num">{money(unit * it.quantity)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="mt-2 space-y-1 border-t pt-3 text-sm num">
            <Row k={tr("مجموع المنتجات")} v={money(subtotal)} />
            {order.deliveryFee > 0 && <Row k={tr("رسوم التوصيل")} v={money(order.deliveryFee)} />}
            {!!order.discountAmount && <Row k={`${tr('خصم')} ${order.discountCode ?? ''}`} v={`− ${money(order.discountAmount)}`} />}
            {!!order.taxAmount && <Row k={tr("الضريبة (مشمولة)")} v={money(order.taxAmount)} />}
            <div className="flex items-center justify-between pt-1 text-lg font-bold">
              <dt>{tr('الإجمالي')}</dt>
              <dd data-testid="text-order-total">{money(order.totalPrice)}</dd>
            </div>
            <Row k={tr("طريقة الدفع")} v={PAYMENT_LABEL(order.paymentMethod)} />
          </dl>
        </Panel>

        {order.status === 'preparing' && (
          <Button className="h-14 w-full text-base font-bold" disabled={ro || busy} onClick={() => run('ready', order.id, {}, tr('الطلب جاهز'))} data-testid="button-ready">
            <Check className="size-5" /> {tr('الطلب جاهز')}
          </Button>
        )}
        {(order.status === 'preparing' || order.status === 'ready') && (
          <Button variant="outline" className="h-14 w-full border-destructive/40 text-base font-bold text-destructive" disabled={ro || busy} onClick={() => { setReason(''); setRejectOpen(true); }} data-testid="button-cancel-active-order">
            <X className="size-5" /> {tr('إلغاء الطلب')}
          </Button>
        )}
        {order.status === 'ready' && (
          <Button className="h-14 w-full text-base font-bold" disabled={ro || busy} onClick={() => run('deliver', order.id, {}, tr('تم تسليم الطلب'))} data-testid="button-deliver">
            <Check className="size-5" /> {order.orderType === 'delivery' ? tr('تم التسليم للمندوب / العميل') : tr('تم تسليم الطلب للعميل')}
          </Button>
        )}
        {order.status === 'cancelled' && order.rejectionReason && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-destructive">{tr('سبب الإلغاء:')} {order.rejectionReason}</p>
        )}
        {order.preparationMinutes ? <p className="text-center text-xs text-muted-foreground num">{tr('وقت التحضير المحدد:')} {order.preparationMinutes} {tr('دقيقة')}</p> : null}

        <Panel>
          <SectionLabel>{tr('الطباعة')}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12 text-base" disabled={ro || printing} onClick={() => doPrint(false)} data-testid="button-print">
              <Printer className="size-4" /> {printing ? tr('جارٍ الطباعة…') : tr('طباعة الفاتورة')}
            </Button>
            <Button variant="outline" className="h-12 text-base" disabled={ro || printing} onClick={() => doPrint(true)} data-testid="button-print-kitchen">
              <Printer className="size-4" /> {tr('نسخة المطبخ')}
            </Button>
          </div>
          {printErr && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-destructive" data-testid="text-print-error">{tr('فشلت الطباعة:')} {printErr}{tr('. الطلب لم يتأثر.')}</p>}
        </Panel>

        <Panel>
          <SectionLabel>{tr('المندوب')}</SectionLabel>
          <p className="flex items-center gap-2 font-semibold" data-testid="text-driver">
            <Truck className="size-4 text-primary" /> {order.driverName ?? tr('لم يُعيَّن مندوب')}
          </p>
          {order.orderType === 'delivery' && order.status !== 'cancelled' && order.status !== 'done' && (
            <div className="mt-3 flex gap-2">
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border bg-card px-3 text-base" aria-label={tr("اختيار المندوب")} data-testid="select-driver">
                <option value="">{tr('اختر مندوبًا')}</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.id === order.driverId ? tr(' (الحالي)') : ''}</option>
                ))}
              </select>
              <Button className="h-12 px-5 text-base" disabled={ro || busy || !driverId || Number(driverId) === order.driverId} onClick={assignDriver} data-testid="button-assign-driver">
                {order.driverId ? tr('تغيير') : tr('تعيين')}
              </Button>
            </div>
          )}
          {drivers.length === 0 && order.orderType === 'delivery' && <p className="mt-2 text-xs text-muted-foreground">{tr('لا يوجد مندوبون نشطون ومتصلون الآن. المندوب غير المتصل لا يمكن تعيينه.')}</p>}
          {history.length > 0 && (
            <ol className="mt-3 space-y-1.5 border-t pt-3 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2" data-testid={`row-assignment-${h.id}`}>
                  <span>{h.driverName}{h.previousDriverId ? tr(' (بدل مندوب سابق)') : ''}</span>
                  <span className="text-muted-foreground num">{dateTime(h.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel>
          <SectionLabel>{tr('الإلغاء والاسترداد')}</SectionLabel>
          {refunds.map((r) => (
            <div key={r.id} className="mb-2 rounded-xl border bg-muted/50 p-3 text-sm" data-testid={`row-refund-${r.id}`}>
              <div className="flex items-center justify-between">
                <b>{r.type === 'cancel' ? tr('طلب إلغاء') : tr('طلب استرداد')}</b>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', r.status === 'pending' ? 'bg-citrus-soft text-[hsl(26,85%,32%)]' : r.status === 'accepted' ? 'bg-leaf-soft text-primary' : 'bg-red-50 text-destructive')}>
                  {r.status === 'pending' ? tr('بانتظار القرار') : r.status === 'accepted' ? tr('تمت الموافقة') : tr('مرفوض')}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{r.reason}</p>
              {r.decisionReason && <p className="mt-1">{tr('القرار:')} {r.decisionReason}</p>}
              {r.status === 'accepted' && <p className="mt-1 text-xs text-muted-foreground">{tr('الموافقة تسجَّل في النظام فقط، ولا يعني ذلك أنه تم إرسال أي مبلغ مالي للعميل.')}</p>}
            </div>
          ))}
          {pendingRefund ? (
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-12 text-base" disabled={ro || busy} onClick={() => { setDecisionReason(''); setDecision('accepted'); }} data-testid="button-refund-accept">{tr('موافقة')}</Button>
              <Button variant="outline" className="h-12 border-destructive/40 text-base text-destructive" disabled={ro || busy} onClick={() => { setDecisionReason(''); setDecision('rejected'); }} data-testid="button-refund-reject">{tr('رفض الطلب')}</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {(['cancel', 'refund'] as const).map((t) => (
                  <button key={t} onClick={() => setRefundType(t)} className={cn('h-11 rounded-xl border text-sm font-semibold', refundType === t ? 'border-primary bg-leaf-soft text-primary' : 'bg-card')} data-testid={`chip-refund-${t}`}>
                    {t === 'cancel' ? tr('إلغاء الطلب') : tr('استرداد')}
                  </button>
                ))}
              </div>
              <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={tr("السبب (مطلوب)")} className="min-h-20 rounded-xl text-base" data-testid="input-refund-reason" />
              <Button variant="outline" className="h-12 w-full text-base" disabled={ro || busy || !refundReason.trim()} onClick={async () => { if (await run('refund-create', undefined, { orderId: order.id, type: refundType, reason: refundReason.trim() }, tr('تم تسجيل الطلب'))) setRefundReason(''); }} data-testid="button-refund-create">
                {tr('تسجيل طلب')} {refundType === 'cancel' ? tr('إلغاء') : tr('استرداد')}
              </Button>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionLabel>
            <span className="inline-flex items-center gap-2"><MessageSquare className="size-4" /> {tr('المحادثة مع العميل')} {unread > 0 && <b className="rounded-full bg-citrus px-2 text-white num">{unread} {tr('جديد')}</b>}</span>
          </SectionLabel>
          <div ref={chatList} className="max-h-60 space-y-2 overflow-y-auto rounded-xl bg-muted/50 p-2.5" data-testid="chat-list">
            {messages.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{tr('لا توجد رسائل لهذا الطلب.')}</p>}
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.fromCashier ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-[82%] rounded-2xl px-3 py-2 text-sm', m.fromCashier ? 'bg-primary text-primary-foreground' : 'border bg-card')}>
                  <p>{m.text}</p>
                  <p className={cn('mt-0.5 text-[10px] num', m.fromCashier ? 'text-white/70' : 'text-muted-foreground')}>{timeOnly(m.createdAt)}{!m.fromCashier && !m.readAt ? tr(' · غير مقروءة') : ''}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK.map((q) => (
              <button key={q} disabled={ro || busy} onClick={() => run('message-send', order.id, { text: q })} className="h-10 shrink-0 rounded-full border bg-leaf-soft px-3.5 text-sm font-medium text-primary disabled:opacity-50 active:scale-95" data-testid={`button-quick-${q}`}>
                {tr(q)}
              </button>
            ))}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const t = msg.trim(); if (t && (await run('message-send', order.id, { text: t }))) setMsg(''); }}>
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={tr("اكتب رسالة…")} className={inputCls + ' flex-1'} data-testid="input-message" />
            <Button type="submit" className="h-12 w-14" disabled={ro || busy || !msg.trim()} aria-label={tr("إرسال")} data-testid="button-send-message"><Send className="size-5 rtl:-scale-x-100" /></Button>
          </form>
        </Panel>
        {!active && <div className="h-2" />}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent dir="rtl" className="max-w-md" data-testid="assign-driver-dialog">
          <DialogTitle className="pe-7 text-xl font-bold">{tr('تعيين مندوب للطلب')} #{order.dailyNumber}</DialogTitle>
          <DialogDescription>{tr('تم قبول الطلب. اختر المندوب لإرسال الطلب إليه.')}</DialogDescription>
          {printing && <p role="status" className="rounded-xl bg-leaf-soft p-3 text-sm text-primary">{tr('جارٍ طباعة الفاتورة تلقائيًا… يمكنك تعيين المندوب الآن.')}</p>}
          {printErr && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-destructive">{tr('تم قبول الطلب، لكن تعذرت الطباعة:')} {printErr}</p>}
          {drivers.length ? (
            <select value={driverId} onChange={e => setDriverId(e.target.value)} className="h-14 w-full min-w-0 rounded-xl border bg-card px-3 text-base" aria-label={tr('اختيار مندوب بعد القبول')} data-testid="select-accepted-driver">
              <option value="">{tr('اختر مندوبًا')}</option>
              {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}{driver.id === order.driverId ? tr(' (الحالي)') : ''}</option>)}
            </select>
          ) : <p className="rounded-xl bg-muted p-3 text-sm">{tr('لا يوجد مندوب متاح حاليًا. يمكنك إضافة المندوبين أو تفعيلهم من قسم المندوبين، وتعيينهم لاحقًا من تفاصيل الطلب.')}</p>}
          <Button className="h-14 text-base" disabled={ro || busy || !driverId || Number(driverId) === order.driverId} onClick={assignDriver} data-testid="button-confirm-accepted-driver">
            <Truck className="size-5" /> {tr('تعيين المندوب')}
          </Button>
          <Button variant="outline" className="h-12 text-base" onClick={() => setAssignOpen(false)} data-testid="button-assign-later">{tr('تعيين لاحقًا')}</Button>
        </DialogContent>
      </Dialog>
      <Confirm
        open={rejectOpen && active}
        onOpenChange={setRejectOpen}
        title={tr("إلغاء الطلب")}
        destructive
        confirmLabel={tr("تأكيد الإلغاء")}
        description={
          <div className="space-y-2">
            <p>{tr('سيتم إلغاء الطلب وإبلاغ العميل. اكتب السبب:')}</p>
            <p className="text-sm">{tr('إلغاء الطلب لا ينفذ استردادًا ماليًا تلقائيًا.')}</p>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="min-h-24 rounded-xl text-base" placeholder={tr("سبب الإلغاء (مطلوب)")} data-testid="input-reject-reason" />
          </div>
        }
        onConfirm={async () => {
          if (ro || busy || !active || !reason.trim()) return false;
          const ok = await run('reject', order.id, { reason: reason.trim() }, tr('تم إلغاء الطلب'));
          if (ok) setReason('');
          return ok;
        }}
      />
      <Confirm
        open={decision !== null}
        onOpenChange={(o) => !o && setDecision(null)}
        title={decision === 'accepted' ? tr('الموافقة على الطلب') : tr('رفض الطلب')}
        destructive={decision === 'rejected'}
        confirmLabel={decision === 'accepted' ? tr('تأكيد الموافقة') : tr('تأكيد الرفض')}
        description={
          <div className="space-y-2">
            {decision === 'accepted' && <p className="rounded-xl bg-citrus-soft p-2.5 text-sm">{tr('الموافقة تسجل القرار فقط ولا ترسل أي مبلغ مالي للعميل. يجب إتمام أي استرداد خارج هذا التطبيق.')}</p>}
            <Textarea value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} className="min-h-20 rounded-xl text-base" placeholder={tr("سبب القرار")} data-testid="input-decision-reason" />
          </div>
        }
        onConfirm={async () => {
          if (!pendingRefund || !decision || !decisionReason.trim()) return false;
          return run('refund-decide', pendingRefund.id, { decision, reason: decisionReason.trim() }, decision === 'accepted' ? tr('تم تسجيل الموافقة (لم يُرسل أي مبلغ)') : tr('تم رفض الطلب'));
        }}
      />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}
