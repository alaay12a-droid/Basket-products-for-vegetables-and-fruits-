import { tr } from '@/lib/i18n';
import { Check, X, ChevronLeft, Truck, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MerchantOrder } from '@workspace/api-client-react';
import { STATUS_LABEL, STATUS_TONE, money, timeOnly, dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function OrderCard({
  order,
  onOpen,
  onAccept,
  onCancel,
  actionsDisabled,
  refundPending,
  unread,
  showDate,
  index = 0,
}: {
  order: MerchantOrder;
  onOpen: () => void;
  onAccept?: () => void;
  onCancel?: () => void;
  actionsDisabled?: boolean;
  refundPending?: boolean;
  unread?: number;
  showDate?: boolean;
  index?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={cn(
        'animate-rise group relative w-full min-w-0 max-w-full rounded-2xl border bg-card p-4 text-start shadow-xs transition active:scale-[0.99] hover:shadow-md',
        order.status === 'pending' && 'border-citrus/50 bg-gradient-to-l from-citrus-soft/50 to-card',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full min-w-0 text-start" data-testid={`card-order-${order.id}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground num">{order.dailyNumber}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{order.customerName}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground num">
            <Clock3 className="size-3.5" /> {showDate ? dateTime(order.createdAt) : timeOnly(order.createdAt)} · {order.orderType === 'delivery' ? tr('توصيل') : tr('استلام')}
          </p>
        </div>
        <ChevronLeft className="size-5 text-muted-foreground transition rtl:group-hover:-translate-x-1 ltr:-scale-x-100 ltr:group-hover:translate-x-1" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', STATUS_TONE[order.status])}>{STATUS_LABEL[order.status]}</span>
        {refundPending && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-destructive">{tr('طلب استرداد')}</span>}
        {!!unread && <span className="rounded-full bg-citrus px-2.5 py-0.5 text-xs font-bold text-white num">{unread} {tr('رسالة')}</span>}
        {order.driverName && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Truck className="size-3.5" />{order.driverName}</span>
        )}
        <span className="ms-auto text-base font-bold text-primary num">{money(order.totalPrice)}</span>
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">
        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(tr('، '))}
      </p>
      </button>
      {['pending', 'preparing', 'ready'].includes(order.status) && onCancel && (
        <div className={cn('mt-4 grid gap-2 border-t pt-3', order.status === 'pending' && onAccept ? 'grid-cols-2' : 'grid-cols-1')}>
          {order.status === 'pending' && onAccept && <Button type="button" className="h-14 min-w-0 rounded-xl text-base font-bold" disabled={actionsDisabled} onClick={onAccept} data-testid={`button-accept-order-${order.id}`}>
            <Check /> {tr('قبول')}
          </Button>}
          <Button type="button" variant="outline" className="h-14 min-w-0 rounded-xl border-destructive/40 text-base font-bold text-destructive" disabled={actionsDisabled} onClick={onCancel} data-testid={`button-cancel-order-${order.id}`}>
            <X /> {tr('إلغاء')}
          </Button>
        </div>
      )}
    </div>
  );
}
