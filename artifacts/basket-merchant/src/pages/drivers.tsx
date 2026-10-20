import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { Pencil, Phone, Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Confirm, Dot, Empty, FieldRow, PageTitle, inputCls } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import type { MerchantDriver as Driver } from '@/lib/format';

export default function Drivers() {
  const { snap, ro } = useMerchant();
  const [form, setForm] = useState<{ open: boolean; driver: Driver | null }>({ open: false, driver: null });
  const drivers = (snap?.drivers ?? []) as Driver[];
  const busyCount = (id: number) => (snap?.orders ?? []).filter((o) => o.driverId === id && (o.status === 'preparing' || o.status === 'ready')).length;

  return (
    <>
      <PageTitle title={tr("المندوبون")} hint={`${drivers.filter((d) => d.active).length} ${tr('نشط')} ${tr('من أصل')} ${drivers.length} · ${drivers.filter((d) => d.active && d.isOnline).length} ${tr('متصل الآن')}`} actions={<Button className="h-12 text-base" disabled={ro} onClick={() => setForm({ open: true, driver: null })} data-testid="button-add-driver"><Plus className="size-4" /> {tr('مندوب')}</Button>} />
      {drivers.length === 0 ? (
        <Empty icon={<Truck className="size-9" strokeWidth={1.5} />} title={tr("لا يوجد مندوبون")} hint={tr("أضف مندوبًا بالاسم ورقم الجوال ورمز الدخول.")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {drivers.map((d, i) => {
            const n = busyCount(d.id);
            return (
              <li key={d.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-rise flex items-center gap-3 rounded-2xl border bg-card p-3.5" data-testid={`row-driver-${d.id}`}>
                <div className="grid size-12 place-items-center rounded-full bg-leaf-soft text-lg font-bold text-primary">{d.name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{d.name}</p>
                  <a href={`tel:${d.phone}`} dir="ltr" className="flex items-center justify-end gap-1.5 text-sm text-muted-foreground num"><Phone className="size-3.5" />{d.phone}</a>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><Dot tone={d.active ? 'green' : 'gray'} />{d.active ? tr('حساب نشط') : tr('موقوف')}</span>
                    <span className="flex items-center gap-1.5" data-testid={`status-online-${d.id}`}><Dot tone={d.isOnline === undefined ? 'gray' : d.isOnline ? 'green' : 'red'} />{d.isOnline === undefined ? tr('حالة الاتصال غير معروفة') : d.isOnline ? tr('متصل') : tr('غير متصل الآن')}</span>
                    {n > 0 && <span className="flex items-center gap-1.5 text-[hsl(26,85%,32%)]"><Dot tone="amber" />{tr('لديه')} {n} {tr('طلب حالي')}</span>}
                  </div>
                </div>
                <Button variant="outline" className="size-12" disabled={ro} onClick={() => setForm({ open: true, driver: d })} aria-label={tr("تعديل")} data-testid={`button-edit-driver-${d.id}`}><Pencil className="size-4" /></Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{tr('لا يوجد حذف نهائي للمندوب؛ أوقف الحساب لمنع تعيينه على الطلبات.')}</p>
      <DriverForm open={form.open} driver={form.driver} onClose={() => setForm({ open: false, driver: null })} />
    </>
  );
}

function DriverForm({ open, driver, onClose }: { open: boolean; driver: Driver | null; onClose: () => void }) {
  const { run, busy, ro } = useMerchant();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [pin, setPin] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const k = open ? String(driver?.id ?? 'new') : null;
  if (k !== key) {
    setKey(k);
    if (k) { setName(driver?.name ?? ''); setPhone(driver?.phone ?? ''); setActive(driver?.active ?? true); setPin(''); }
  }
  const pinOk = driver ? pin === '' || pin.length >= 4 : pin.length >= 4;
  const save = async () => {
    const data: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), active };
    if (pin) data.pin = pin;
    const ok = await run('driver-save', driver?.id, data, tr('تم حفظ المندوب'));
    if (ok) onClose();
    return ok;
  };
  const deactivating = !!driver && driver.active && !active;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-[94vw] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>{driver ? tr('تعديل مندوب') : tr('مندوب جديد')}</DialogTitle>
          <DialogDescription>{tr('رمز الدخول يستخدمه المندوب في تطبيقه.')}</DialogDescription>
        </DialogHeader>
        <FieldRow label={tr("الاسم")}><Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} data-testid="input-driver-name" /></FieldRow>
        <FieldRow label={tr("رقم الجوال")}><Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls + ' rtl:text-right num'} data-testid="input-driver-phone" /></FieldRow>
        <FieldRow label={driver ? tr('رمز دخول جديد (اتركه فارغًا دون تغيير)') : tr('رمز الدخول (4 أرقام على الأقل)')}>
          <Input dir="ltr" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="off" className={inputCls + ' rtl:text-right num'} data-testid="input-driver-pin" />
        </FieldRow>
        <label className="flex min-h-12 items-center justify-between rounded-xl border px-4"><span className="font-medium">{tr('الحساب نشط')}</span><Switch checked={active} onCheckedChange={setActive} data-testid="switch-driver-active" /></label>
        <Button className="h-12 text-base" disabled={ro || busy || !name.trim() || !phone.trim() || !pinOk} onClick={() => (deactivating ? setConfirm(true) : void save())} data-testid="button-save-driver">{tr('حفظ')}</Button>
        <Confirm open={confirm} onOpenChange={setConfirm} title={tr("إيقاف المندوب")} destructive confirmLabel={tr("إيقاف")} description={tr("لن يتمكن المندوب من استلام طلبات جديدة.")} onConfirm={save} />
      </DialogContent>
    </Dialog>
  );
}
