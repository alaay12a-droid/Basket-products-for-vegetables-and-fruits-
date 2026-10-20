import { tr } from '@/lib/i18n';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, LogIn, ShieldAlert, Eye as EyeIcon } from 'lucide-react';
import { useMerchantLogin, type MerchantReadiness } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BasketMark, FieldRow, inputCls } from '@/components/kit';
import { errMsg, errStatus } from '@/lib/format';
import { saveNativeSession } from '@/lib/device';

export default function Login({
  readiness,
  stateError,
  onPreview,
  onDone,
}: {
  readiness?: MerchantReadiness;
  stateError?: unknown;
  onPreview: () => void;
  onDone: () => Promise<unknown>;
}) {
  const login = useMerchantLogin();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unavailable = readiness ? !readiness.enabled : errStatus(stateError) === 503;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await login.mutateAsync({ data: { username: username.trim(), password } });
      if (r.token) await saveNativeSession(r.token);
      await onDone();
    } catch (ex) {
      const s = errStatus(ex);
      setErr(
        s === 503
          ? tr('الخدمة تحتاج إلى تفعيل من الإدارة قبل تسجيل الدخول.')
          : s === 401
            ? tr('اسم المستخدم أو كلمة المرور غير صحيحة.')
            : errMsg(ex),
      );
    }
  };

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 -end-32 size-[28rem] rounded-full bg-leaf-soft" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -start-24 size-[26rem] rounded-full bg-citrus-soft" />
      <div className="animate-rise relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <BasketMark className="size-20 drop-shadow-sm" />
          <h1 className="mt-4 text-3xl font-bold text-primary">{tr('السلة')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr('شاشة التاجر والكاشير')}</p>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-lg sm:p-7">
          {unavailable && (
            <div role="alert" className="mb-4 flex gap-3 rounded-2xl border border-citrus/30 bg-citrus-soft p-3.5 text-sm" data-testid="notice-unavailable">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-citrus" />
              <div>
                <p className="font-semibold">{tr('الخدمة غير مفعلة بعد')}</p>
                <p className="mt-0.5 text-muted-foreground">{readiness?.message || tr('تحتاج خدمة التاجر إلى تفعيل من الإدارة. لا يمكن تسجيل الدخول حاليًا.')}</p>
              </div>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <FieldRow label={tr("اسم المستخدم")}>
              <Input value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="none" required className={inputCls} data-testid="input-username" />
            </FieldRow>
            <FieldRow label={tr("كلمة المرور")}>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required className={inputCls + ' pe-12'} data-testid="input-password" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tr('إخفاء') : tr('إظهار')} className="absolute inset-y-0 end-0 grid w-12 place-items-center text-muted-foreground">
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </FieldRow>
            {err && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-destructive" data-testid="text-login-error">
                {err}
              </p>
            )}
            <Button type="submit" disabled={unavailable || login.isPending || !username || !password} className="h-14 w-full rounded-xl text-base font-bold" data-testid="button-login">
              {login.isPending ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
              {tr('تسجيل الدخول')}
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {tr('أو')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" onClick={onPreview} className="h-12 w-full rounded-xl text-base" data-testid="button-preview">
            <EyeIcon className="size-5" />
            {tr('معاينة الواجهة بدون اتصال')}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">{tr('المعاينة للقراءة فقط ولا تعرض طلبات حقيقية.')}</p>
        </div>
      </div>
    </div>
  );
}
