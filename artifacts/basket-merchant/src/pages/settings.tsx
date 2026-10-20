import { tr } from '@/lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import type { MerchantSettings } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FieldRow, Panel, PageTitle, SectionLabel, inputCls } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { configureDevice, detectIntegratedPrinter, getDevicePrinterSettings, getOrderAlertVolume, setOrderAlertVolume, printTestReceipt, saveDevicePrinterPreferences, type IntegratedPrinter } from '@/lib/device';
import { errMsg } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const TRANSPORTS: [MerchantSettings['printerTransport'], string][] = [
  ['none', 'بدون طابعة'],
  ['tcp', 'شبكة (TCP)'],
  ['bluetooth', 'بلوتوث'],
  ['sunmi', 'Sunmi المدمجة'],
  ['vendor', 'تلقائي — طابعة الجهاز'],
];

const isNative = () => {
  const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!c?.isNativePlatform?.();
};

export default function Settings() {
  const { settings, snap, run, busy, ro } = useMerchant();
  const [f, setF] = useState<MerchantSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [printer, setPrinter] = useState<IntegratedPrinter | null>(null);
  const [printerChoiceTouched, setPrinterChoiceTouched] = useState(false);
  const [orderVolume, setOrderVolume] = useState(100);
  const [savedVolume, setSavedVolume] = useState(100);
  const [volumeReady, setVolumeReady] = useState(false);
  const [volumeSaving, setVolumeSaving] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const key = JSON.stringify(settings);
  useEffect(() => {
    let active = true;
    if (!dirty) {
      setF(settings);
      void getDevicePrinterSettings(settings).then((selected) => { if (active) setF(selected); });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dirty]);
  const set = <K extends keyof MerchantSettings>(k: K, v: MerchantSettings[K]) => {
    setDirty(true);
    if (['printerTransport', 'printerAddress', 'paperWidth', 'copies'].includes(k)) setPrinterChoiceTouched(true);
    setF((s) => ({
      ...s, [k]: v,
      ...(k === 'printerTransport' && (v === 'sunmi' || v === 'vendor') && printer?.supported && /^V3H$/i.test(printer.model.trim()) ? { paperWidth: 58 as const } : {}),
    }));
  };
  const native = isNative();
  useEffect(() => {
    let active = true;
    if (native) void getOrderAlertVolume().then(percent => {
      if (active) { setOrderVolume(percent); setSavedVolume(percent); setVolumeReady(true); }
    }).catch(error => { if (active) setVolumeError(errMsg(error)); });
    return () => { active = false; };
  }, [native]);
  const saveVolume = async () => {
    setVolumeSaving(true);
    setVolumeError(null);
    try {
      await setOrderAlertVolume(orderVolume);
      setSavedVolume(orderVolume);
      toast({ title: tr('تم حفظ مستوى صوت الطلبات على هذا الجهاز') });
    } catch (error) { setVolumeError(errMsg(error)); }
    finally { setVolumeSaving(false); }
  };
  const sunmi58 = printer?.supported && /^V3H$/i.test(printer.model.trim()) && ['sunmi', 'vendor'].includes(f.printerTransport);
  useEffect(() => {
    if (!native) return;
    let active = true;
    void detectIntegratedPrinter().then((info) => { if (active) setPrinter(info); });
    return () => { active = false; };
  }, [native]);

  const save = async () => {
    if (!(await run('settings-save', undefined, { ...f }, tr('تم حفظ الإعدادات')))) return;
    setDirty(false);
    try {
      if (printerChoiceTouched || f.printerTransport !== 'none') saveDevicePrinterPreferences(f);
      setPrinterChoiceTouched(false);
      await configureDevice(f);
    } catch (e) { toast({ variant: 'destructive', title: tr('حُفظت الإعدادات لكن تعذر ضبط الجهاز'), description: errMsg(e) }); }
  };

  const test = async () => {
    setTesting(true);
    setTestErr(null);
    try { await printTestReceipt(f); toast({ title: tr('أُرسلت ورقة الاختبار إلى الطابعة') }); } catch (e) { setTestErr(errMsg(e)); }
    setTesting(false);
  };

  const Toggle = ({ k, label, hint }: { k: 'kitchenCopy' | 'autoPrint' | 'soundEnabled' | 'keepAwake'; label: string; hint?: string }) => (
    <label className="flex min-h-14 items-center justify-between gap-3 border-b py-2 last:border-0">
      <span><span className="block font-medium">{label}</span>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</span>
      <Switch checked={f[k]} onCheckedChange={(v) => set(k, v)} disabled={ro} data-testid={`switch-${k}`} />
    </label>
  );
  const Seg = ({ children }: { children: ReactNode }) => <div className="flex gap-2">{children}</div>;

  return (
    <>
      <PageTitle title={tr("الإعدادات")} />
      <div className="space-y-3 pb-24">
        <Panel>
          <SectionLabel>{tr('المتجر والدعم')}</SectionLabel>
          <div className="space-y-3">
            <FieldRow label={tr("اسم المتجر")}><Input value={f.storeName} onChange={(e) => set('storeName', e.target.value)} disabled={ro} className={inputCls} data-testid="input-store-name" /></FieldRow>
            <FieldRow label={tr("العنوان")}><Input value={f.storeAddress ?? ''} onChange={(e) => set('storeAddress', e.target.value)} disabled={ro} className={inputCls} /></FieldRow>
            <FieldRow label={tr("الرقم الضريبي")}><Input dir="ltr" value={f.taxNumber ?? ''} onChange={(e) => set('taxNumber', e.target.value)} disabled={ro} className={inputCls + ' rtl:text-right num'} /></FieldRow>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label={tr("هاتف الدعم")}><Input dir="ltr" inputMode="tel" value={f.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} disabled={ro} className={inputCls + ' rtl:text-right num'} data-testid="input-support-phone" /></FieldRow>
              <FieldRow label={tr("واتساب الدعم")} hint={tr("بصيغة دولية، مثال 9665XXXXXXXX")}><Input dir="ltr" inputMode="tel" value={f.supportWhatsapp} onChange={(e) => set('supportWhatsapp', e.target.value)} disabled={ro} className={inputCls + ' rtl:text-right num'} data-testid="input-support-whatsapp" /></FieldRow>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionLabel>{tr('الطابعة')}</SectionLabel>
          {native && (
            <div className="mb-3 rounded-xl border bg-muted/30 p-3 text-sm" role="status" data-testid="integrated-printer-status">
              <p className="font-semibold">{printer ? printer.message : tr('جارٍ اكتشاف الطابعة المدمجة…')}</p>
              {printer?.supported && <p className="mt-1 text-muted-foreground" dir="auto">SUNMI · {printer.model} · 58 {tr('مم')} — {tr('يتم اختيارها تلقائيًا ما لم تحدد اتصالًا آخر أو توقف الطباعة')}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{tr('خيارات الطابعة المحفوظة تخص هذا الجهاز؛ يبقى البلوتوث والشبكة متاحين.')}</p>
            </div>
          )}
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
            {TRANSPORTS.map(([id, l]) => (
              <button key={id} disabled={ro} onClick={() => set('printerTransport', id)} className={cn('h-12 shrink-0 rounded-xl border px-4 text-sm font-semibold transition active:scale-95', f.printerTransport === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')} data-testid={`transport-${id}`}>{tr(l)}</button>
            ))}
          </div>
          {(f.printerTransport === 'tcp' || f.printerTransport === 'bluetooth') && (
            <FieldRow label={f.printerTransport === 'tcp' ? tr('عنوان الطابعة (IP:المنفذ)') : tr('عنوان البلوتوث (MAC)')}><Input dir="ltr" value={f.printerAddress} onChange={(e) => set('printerAddress', e.target.value)} disabled={ro} placeholder={f.printerTransport === 'tcp' ? '192.168.1.50:9100' : 'AA:BB:CC:DD:EE:FF'} className={inputCls + ' rtl:text-right'} data-testid="input-printer-address" /></FieldRow>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><span className="mb-1.5 block text-sm font-medium">{tr('عرض الورق')}</span>
              <Seg>{([58, 80] as const).map((w) => <button key={w} disabled={ro || (sunmi58 && w === 80)} onClick={() => set('paperWidth', w)} className={cn('h-12 flex-1 rounded-xl border font-semibold num disabled:opacity-50', f.paperWidth === w ? 'border-primary bg-leaf-soft text-primary' : 'bg-card')} data-testid={`paper-${w}`}>{w} {tr('مم')}</button>)}</Seg></div>
            <div><span className="mb-1.5 block text-sm font-medium">{tr('عدد النسخ')}</span>
              <Seg>{[1, 2, 3, 4, 5].map((n) => <button key={n} disabled={ro} onClick={() => set('copies', n)} className={cn('h-12 flex-1 rounded-xl border font-semibold num', f.copies === n ? 'border-primary bg-leaf-soft text-primary' : 'bg-card')} data-testid={`copies-${n}`}>{n}</button>)}</Seg></div>
          </div>
          <div className="mt-3">
            <Toggle k="kitchenCopy" label={tr("نسخة المطبخ")} hint={tr("طباعة نسخة إضافية للمطبخ")} />
            <p className="rounded-xl bg-leaf-soft px-3 py-2.5 text-sm text-primary">{tr('تُطبع فاتورة العميل تلقائيًا بعد قبول الطلب. تعذّر الطباعة لا يلغي قبول الطلب.')}</p>
          </div>
          <Button variant="outline" className="mt-3 h-12 w-full text-base" disabled={ro || !native || testing || f.printerTransport === 'none'} onClick={test} data-testid="button-test-printer"><Printer className="size-4" /> {testing ? tr('جارٍ الإرسال…') : tr('طباعة تجريبية')}</Button>
          {!native && <p className="mt-2 rounded-xl bg-citrus-soft px-3 py-2 text-sm" data-testid="text-test-unsupported">{tr('اختبار الطابعة غير مدعوم في المتصفح؛ يعمل من تطبيق الأندرويد فقط عبر الطباعة الأصلية.')}</p>}
          {native && f.printerTransport === 'none' && <p className="mt-2 text-sm text-muted-foreground">{tr('اختر نوع اتصال للطابعة أولًا.')}</p>}
          {testErr && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-destructive" data-testid="text-test-error">{tr('فشل الاختبار:')} {testErr}</p>}
          {dirty && native && <p className="mt-2 text-xs text-muted-foreground">{tr('الاختبار يستخدم القيم الحالية في النموذج.')}</p>}
        </Panel>

        <Panel>
          <SectionLabel>{tr('الجهاز')}</SectionLabel>
          <Toggle k="soundEnabled" label={tr("صوت تنبيه الطلبات")} />
          <div className="space-y-2 border-b py-3">
            <label htmlFor="order-alert-volume" className="flex items-center justify-between gap-3 font-medium">
              {tr('مستوى صوت الطلبات')} <span className="num" data-testid="text-order-volume">{orderVolume}%</span>
            </label>
            <input id="order-alert-volume" type="range" min={10} max={100} step={10} dir="ltr"
              value={orderVolume} onChange={event => setOrderVolume(Number(event.target.value))}
              disabled={ro || !native || !volumeReady || volumeSaving}
              className="h-12 w-full accent-primary" data-testid="input-order-volume" />
            <p className="text-xs text-muted-foreground">{tr('يُرفع صوت التنبيهات مؤقتًا عند وجود طلب جديد، ويعود بعد قبول أو إلغاء آخر طلب. يُحترم الصامت وعدم الإزعاج.')}</p>
            <p className="text-xs text-muted-foreground">{tr('هذا الإعداد خاص بهذا الجهاز، وقد يرفع صوت تنبيهات التطبيقات الأخرى مؤقتًا.')}</p>
            {!native && <p className="text-xs text-muted-foreground">{tr('التحكم بصوت الجهاز متاح في تطبيق أندرويد فقط')}</p>}
            {volumeError && <p role="alert" className="text-sm text-destructive">{volumeError}</p>}
            <Button type="button" variant="outline" className="h-12 w-full" onClick={saveVolume}
              disabled={ro || !native || !volumeReady || volumeSaving || orderVolume === savedVolume}
              data-testid="button-save-order-volume">
              {volumeSaving ? tr('جارٍ الحفظ…') : tr('حفظ مستوى الصوت')}
            </Button>
          </div>
          <Toggle k="keepAwake" label={tr("إبقاء الشاشة مضاءة")} />
          <div className="mt-3"><span className="mb-1.5 block text-sm font-medium">{tr('اللغة')}</span>
            <Seg>{([['ar', 'العربية'], ['en', 'English']] as const).map(([id, l]) => <button key={id} disabled={ro} onClick={() => set('language', id)} className={cn('h-12 flex-1 rounded-xl border font-semibold', f.language === id ? 'border-primary bg-leaf-soft text-primary' : 'bg-card')} data-testid={`lang-${id}`}>{l}</button>)}</Seg>
          </div>
        </Panel>
        {snap && <p className="text-center text-xs text-muted-foreground">{tr('المستخدم:')} {snap.user.username} · {snap.user.role === 'admin' ? tr('مدير') : tr('موظف')}</p>}
      </div>
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-5xl">
          <Button className="h-14 w-full text-base font-bold" disabled={ro || busy || !dirty || !f.storeName.trim()} onClick={save} data-testid="button-save-settings">{dirty ? tr('حفظ الإعدادات') : tr('لا توجد تغييرات')}</Button>
        </div>
      </div>
    </>
  );
}
