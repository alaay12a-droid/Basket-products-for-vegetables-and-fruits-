import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { getMerchantHistoryQueryKey, useMerchantHistory } from '@workspace/api-client-react';
import { Search, History as HistoryIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { OrderCard } from '@/components/order-card';
import { OrderDetail } from '@/components/order-detail';
import { Empty, ErrorBox, PageTitle, inputCls } from '@/components/kit';
import { MerchantProvider, useMerchant } from '@/lib/merchant';
import { STATUS_LABEL, errMsg } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUSES = ['all', 'pending', 'preparing', 'ready', 'done', 'cancelled'] as const;

export default function History() {
  const { preview, exitPreview } = useMerchant();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [date, setDate] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(q.trim()); setCursors([undefined]); }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const params = {
    search: search || undefined, date: date || undefined,
    status: status === 'all' ? undefined : status,
    before: cursors.at(-1),
  };
  const archive = useMerchantHistory(params, {
    query: { queryKey: getMerchantHistoryQueryKey(params), enabled: !preview, retry: false },
  });
  const list = archive.data?.orders ?? [];

  const filtered = q || status !== 'all' || date;

  return (
    <>
      <PageTitle title={tr("الطلبات السابقة")} hint={`${list.length} ${tr('طلب')}`} />
      <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="text-history-limit">
        {tr('البحث والفلاتر تشمل كامل الأرشيف؛ 250 طلبًا في الصفحة.')}
      </p>
      <div className="mb-4 space-y-2.5 rounded-2xl border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("بحث بالاسم أو الجوال أو رقم الطلب أو المنتج")} className={inputCls + ' ps-11'} data-testid="input-search" />
        </div>
        <div className="flex gap-2">
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setCursors([undefined]); }} className={inputCls + ' flex-1'} aria-label={tr("التاريخ")} data-testid="input-date" />
          {filtered && (
            <button onClick={() => { setQ(''); setStatus('all'); setDate(''); setCursors([undefined]); }} className="flex h-12 items-center gap-1.5 rounded-xl border px-4 text-sm font-medium" data-testid="button-clear-filters">
              <X className="size-4" /> {tr('مسح')}
            </button>
          )}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setCursors([undefined]); }} className={cn('h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition active:scale-95', status === s ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')} data-testid={`filter-${s}`}>
              {s === 'all' ? tr('الكل') : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {archive.error && !preview ? <ErrorBox title={tr('تعذر الاتصال بالخادم')} message={errMsg(archive.error)} onRetry={() => void archive.refetch()} /> : archive.isLoading ? (
        <p className="p-8 text-center text-muted-foreground">{tr('جارٍ التحميل…')}</p>
      ) : list.length === 0 ? (
        <Empty icon={<HistoryIcon className="size-9" strokeWidth={1.5} />} title={filtered ? tr('لا توجد نتائج مطابقة') : tr('لا توجد طلبات سابقة')} hint={filtered ? tr('جرّب تغيير البحث أو الفلاتر.') : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((o, i) => (
            <OrderCard key={o.id} order={o} index={i} showDate onOpen={() => setOpenId(o.id)} />
          ))}
        </div>
      )}
      {!preview && <div className="mt-4 flex gap-3">
        <button className="h-12 flex-1 rounded-xl border disabled:opacity-40" disabled={cursors.length < 2 || archive.isFetching} onClick={() => setCursors(values => values.slice(0, -1))}>{tr('الصفحة السابقة')}</button>
        <button className="h-12 flex-1 rounded-xl border disabled:opacity-40" disabled={list.length < 250 || archive.isFetching} onClick={() => setCursors(values => [...values, Math.min(...list.map(order => order.id))])}>{tr('طلبات أقدم')}</button>
      </div>}
      {openId != null && archive.data && (
        <MerchantProvider snap={archive.data} preview={preview} refetch={() => archive.refetch()} exitPreview={exitPreview}>
          <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />
        </MerchantProvider>
      )}
    </>
  );
}
