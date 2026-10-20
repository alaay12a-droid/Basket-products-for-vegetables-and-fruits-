import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMerchant } from '@/lib/merchant';
import { cn } from '@/lib/utils';

export interface AvailTarget {
  kind: 'item' | 'category';
  id: string;
  name: string;
}

type Opt = 'on' | 'manual' | 'today' | 'minutes';

export function AvailabilityDialog({ target, onClose }: { target: AvailTarget | null; onClose: () => void }) {
  const { run, busy, ro } = useMerchant();
  const [opt, setOpt] = useState<Opt>('manual');
  const [minutes, setMinutes] = useState(60);
  const opts: { id: Opt; label: string; hint: string }[] = [
    { id: 'on', label: tr('إتاحة الآن'), hint: tr('يظهر للعملاء ويمكن طلبه') },
    { id: 'manual', label: tr('إيقاف حتى إشعار آخر'), hint: tr('يبقى موقوفًا حتى تعيد إتاحته يدويًا') },
    { id: 'today', label: tr('إيقاف حتى نهاية اليوم'), hint: tr('يعود تلقائيًا غدًا') },
    { id: 'minutes', label: tr('إيقاف لمدة محددة'), hint: tr('يعود تلقائيًا بعد المدة') },
  ];
  const submit = async () => {
    if (!target) return;
    const data: Record<string, unknown> =
      opt === 'on' ? { available: true, mode: 'manual' } : opt === 'minutes' ? { available: false, mode: 'minutes', minutes } : { available: false, mode: opt };
    const ok = await run(target.kind === 'item' ? 'item-availability' : 'category-availability', target.id, data, tr('تم تحديث التوفر'));
    if (ok) onClose();
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-[94vw] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>{tr('توفر')} {target?.kind === 'category' ? tr('القسم') : tr('المنتج')}: {target?.name}</DialogTitle>
          <DialogDescription>{target?.kind === 'category' ? tr('سيطبق على كل منتجات القسم.') : tr('اختر كيف يتغير توفر المنتج.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {opts.map((o) => (
            <button key={o.id} onClick={() => setOpt(o.id)} className={cn('flex min-h-14 w-full flex-col items-start rounded-xl border px-4 py-2 text-start transition', opt === o.id ? 'border-primary bg-leaf-soft' : 'bg-card')} data-testid={`avail-${o.id}`}>
              <span className="font-semibold">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </button>
          ))}
          {opt === 'minutes' && (
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-12 w-28 rounded-xl text-center text-base" data-testid="input-avail-minutes" />
              <span className="text-sm text-muted-foreground">{tr('دقيقة')}</span>
              {[30, 60, 120].map((m) => (
                <button key={m} onClick={() => setMinutes(m)} className="h-10 rounded-full border px-3 text-sm num">{m}</button>
              ))}
            </div>
          )}
        </div>
        <Button className="h-12 w-full text-base" disabled={ro || busy || (opt === 'minutes' && minutes < 1)} onClick={submit} data-testid="button-avail-save">
          {tr('حفظ')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
