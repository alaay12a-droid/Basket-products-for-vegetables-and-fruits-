import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { Plus, Store, Trash2 } from 'lucide-react';
import type { MerchantDayHours } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Confirm, Dot, Panel, PageTitle } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { dayName, dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const blank = (): MerchantDayHours[] => Array.from({ length: 7 }, (_, day) => ({ day, periods: [] }));

export default function Hours() {
  const { snap, run, busy, ro } = useMerchant();
  const [hours, setHours] = useState<MerchantDayHours[]>(blank());
  const [dirty, setDirty] = useState(false);
  const [closeMin, setCloseMin] = useState(60);
  const [confirmClose, setConfirmClose] = useState(false);
  const serverKey = JSON.stringify(snap?.hours ?? []);

  useEffect(() => {
    if (dirty) return;
    const base = blank();
    for (const h of snap?.hours ?? []) base[h.day] = { day: h.day, periods: h.periods.map((p) => ({ ...p })) };
    setHours(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, dirty]);

  const edit = (day: number, fn: (p: MerchantDayHours['periods']) => MerchantDayHours['periods']) => {
    setDirty(true);
    setHours((h) => h.map((x) => (x.day === day ? { ...x, periods: fn(x.periods) } : x)));
  };
  const invalid = hours.some((h) => h.periods.some((p) => !p.open || !p.close || p.open === p.close));

  return (
    <>
      <PageTitle title={tr("ساعات العمل")} />
      <Panel className="mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('grid size-12 place-items-center rounded-xl', snap?.storeOpen ? 'bg-leaf-soft text-primary' : 'bg-red-50 text-destructive')}><Store className="size-6" /></div>
          <div className="flex-1">
            <p className="flex items-center gap-2 font-bold"><Dot tone={snap?.storeOpen ? 'green' : 'red'} />{snap ? (snap.storeOpen ? tr('المتجر مفتوح') : tr('المتجر مغلق')) : tr('الحالة غير معروفة')}</p>
            {snap?.closedUntil && <p className="text-xs text-muted-foreground">{tr('إغلاق مؤقت حتى')} {dateTime(snap.closedUntil)}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[30, 60, 120].map((m) => (
            <button key={m} onClick={() => setCloseMin(m)} className={cn('h-11 rounded-xl border px-4 text-sm font-semibold num', closeMin === m ? 'border-primary bg-leaf-soft text-primary' : 'bg-card')}>{m} {tr('د')}</button>
          ))}
          <Input type="number" min={1} value={closeMin} onChange={(e) => setCloseMin(Number(e.target.value))} className="h-11 w-24 rounded-xl text-center num" aria-label={tr("دقائق الإغلاق")} data-testid="input-close-minutes" />
          <Button variant="outline" className="h-11 border-destructive/40 text-destructive" disabled={ro || busy || closeMin < 1} onClick={() => setConfirmClose(true)} data-testid="button-close-store">{tr('إغلاق مؤقت')}</Button>
          <Button className="h-11" disabled={ro || busy || !!snap?.storeOpen} onClick={() => run('store-toggle', undefined, { open: true }, tr('تم فتح المتجر'))} data-testid="button-open-store">{tr('فتح المتجر الآن')}</Button>
        </div>
      </Panel>

      <div className="space-y-2.5">
        {hours.map((h) => (
          <Panel key={h.day} className="animate-rise p-3">
            <div className="flex items-center justify-between">
              <b>{dayName(h.day)}</b>
              <button disabled={ro} onClick={() => edit(h.day, (p) => [...p, { open: '09:00', close: '22:00' }])} className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-primary disabled:opacity-50" data-testid={`button-add-period-${h.day}`}><Plus className="size-4" /> {tr('فترة')}</button>
            </div>
            {h.periods.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{tr('مغلق طوال اليوم')}</p> : h.periods.map((p, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <Input type="time" value={p.open} onChange={(e) => edit(h.day, (a) => a.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} className="h-12 flex-1 rounded-xl text-base" dir="ltr" aria-label={tr("من")} data-testid={`input-open-${h.day}-${i}`} />
                <span className="text-muted-foreground">{tr('إلى')}</span>
                <Input type="time" value={p.close} onChange={(e) => edit(h.day, (a) => a.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} className="h-12 flex-1 rounded-xl text-base" dir="ltr" aria-label={tr("إلى")} data-testid={`input-close-${h.day}-${i}`} />
                <button disabled={ro} onClick={() => edit(h.day, (a) => a.filter((_, j) => j !== i))} aria-label={tr("حذف الفترة")} className="grid size-10 place-items-center text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </Panel>
        ))}
      </div>
      <div className="pb-safe sticky bottom-3 mt-4">
        <Button className="h-14 w-full text-base font-bold shadow-lg" disabled={ro || busy || !dirty || invalid} onClick={async () => { if (await run('hours-save', undefined, { hours }, tr('تم حفظ ساعات العمل'))) setDirty(false); }} data-testid="button-save-hours">
          {dirty ? tr('حفظ ساعات العمل') : tr('لا توجد تغييرات')}
        </Button>
      </div>
      <Confirm open={confirmClose} onOpenChange={setConfirmClose} title={tr("إغلاق المتجر مؤقتًا")} destructive confirmLabel={tr("إغلاق")} description={`لن يستقبل المتجر طلبات جديدة لمدة ${closeMin} دقيقة.`} onConfirm={() => run('store-toggle', undefined, { open: false, minutes: closeMin }, tr('تم إغلاق المتجر مؤقتًا'))} />
    </>
  );
}
