import { tr } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { OrderCard } from '@/components/order-card';
import { OrderDetail } from '@/components/order-detail';
import { Empty, PageTitle } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { dayKey } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'pending' | 'preparing' | 'ready' | 'refund';
type Fulfillment = 'all' | 'delivery' | 'pickup';
const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'جديدة' },
  { id: 'preparing', label: 'قيد التحضير' },
  { id: 'ready', label: 'جاهزة' },
  { id: 'refund', label: 'الاسترداد' },
];

export default function Today() {
  const { snap, ro, busy } = useMerchant();
  const [tab, setTab] = useState<Tab>('pending');
  const [fulfillment, setFulfillment] = useState<Fulfillment>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [entryAction, setEntryAction] = useState<'accept' | 'cancel'>();
  const openOrder = (id: number, action?: 'accept' | 'cancel') => {
    setEntryAction(action);
    setOpenId(id);
  };

  const { lists, refundIds } = useMemo(() => {
    const orders = snap?.orders ?? [];
    const today = dayKey(snap?.serverTime ?? new Date());
    const rIds = new Set((snap?.refunds ?? []).filter((r) => r.status === 'pending').map((r) => r.orderId));
    const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const isCurrent = (o: (typeof orders)[number]) => dayKey(o.createdAt) === today || ['pending', 'preparing', 'ready'].includes(o.status);
    return {
      refundIds: rIds,
      lists: {
        pending: sorted.filter((o) => o.status === 'pending'),
        preparing: sorted.filter((o) => o.status === 'preparing'),
        ready: sorted.filter((o) => o.status === 'ready'),
        refund: sorted.filter((o) => rIds.has(o.id) && isCurrent(o)),
      } as Record<Tab, typeof orders>,
    };
  }, [snap?.orders, snap?.refunds, snap?.serverTime]);

  const unreadFor = (id: number) => (snap?.messages ?? []).filter((m) => m.orderId === id && !m.fromCashier && !m.readAt).length;
  const counts = {
    all: lists[tab].length,
    delivery: lists[tab].filter((order) => order.orderType === 'delivery').length,
    pickup: lists[tab].filter((order) => order.orderType === 'pickup').length,
  };
  const list = lists[tab].filter((order) => fulfillment === 'all' || order.orderType === fulfillment);

  return (
    <>
      <PageTitle title={tr("طلبات اليوم")} hint={tr("يتحدث تلقائيًا عند وصول طلب جديد")} />
      <div className="no-scrollbar sticky top-[72px] z-20 -mx-3 mb-4 flex gap-2 overflow-x-auto bg-background/95 px-3 py-2 backdrop-blur sm:mx-0 sm:px-0" role="tablist">
        {TABS.map((t) => {
          const n = lists[t.id].length;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={cn('flex h-12 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 text-[15px] font-semibold transition active:scale-95', on ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card text-foreground')}
              data-testid={`tab-${t.id}`}
            >
              {tr(t.label)}
              <span className={cn('grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold num', on ? 'bg-white/25' : n > 0 && t.id === 'pending' ? 'bg-citrus text-white' : 'bg-muted text-muted-foreground')} data-testid={`count-${t.id}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="group" aria-label={tr('نوع الطلب')}>
        {([
          ['all', 'الكل'],
          ['delivery', 'توصيل'],
          ['pickup', 'استلام شخصي'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={fulfillment === value}
            data-testid={`fulfillment-${value}`}
            onClick={() => setFulfillment(value)}
            className={cn('min-h-12 rounded-lg px-1 text-sm font-semibold transition', fulfillment === value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground')}
          >
            {tr(label)} <span className="num">({counts[value]})</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty
          icon={<FileText className="size-10" strokeWidth={1.4} />}
          title={tr("لا توجد طلبات حتى الآن")}
          hint={tab === 'refund' ? tr('لا توجد طلبات إلغاء أو استرداد بانتظار قرارك.') : tr('ستظهر الطلبات هنا فور وصولها.')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((o, i) => (
            <OrderCard
              key={o.id} order={o} index={i}
              refundPending={refundIds.has(o.id)} unread={unreadFor(o.id)}
              onOpen={() => openOrder(o.id)}
              onAccept={() => openOrder(o.id, 'accept')}
              onCancel={() => openOrder(o.id, 'cancel')}
              actionsDisabled={ro || busy}
            />
          ))}
        </div>
      )}
      <OrderDetail orderId={openId} initialAction={entryAction} onClose={() => setOpenId(null)} />
    </>
  );
}
