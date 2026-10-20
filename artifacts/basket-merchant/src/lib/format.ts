import type { Driver, MerchantOrder } from '@workspace/api-client-react';
import { locale, tr } from '@/lib/i18n';

const TZ = 'Asia/Riyadh';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: 'SAR' }).format(Number(n ?? 0));
export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const timeOnly = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
/** YYYY-MM-DD in Asia/Riyadh */
export const dayKey = (iso: string | Date) => dayFmt.format(typeof iso === 'string' ? new Date(iso) : iso);

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { data?: unknown; message?: string; status?: number };
    if (o.status === 401) return tr('انتهت الجلسة. سجّل الدخول مجددًا.');
    if (o.status === 403) return tr('ليس لديك صلاحية لتنفيذ هذا الإجراء (قد يتطلب حساب مدير).');
    if (o.data && typeof o.data === 'object') {
      const d = o.data as { error?: string; message?: string };
      if (d.error) return d.error;
      if (d.message) return d.message;
    }
    if (o.message) return o.message;
  }
  return tr('حدث خطأ غير متوقع');
}

export const errStatus = (e: unknown): number | undefined =>
  e && typeof e === 'object' ? (e as { status?: number }).status : undefined;

export const STATUS_LABEL: Record<MerchantOrder['status'], string> = {
  get pending() { return tr('جديد'); },
  get preparing() { return tr('قيد التحضير'); },
  get ready() { return tr('جاهز'); },
  get done() { return tr('تم التسليم'); },
  get cancelled() { return tr('ملغي'); },
};

export const STATUS_TONE: Record<MerchantOrder['status'], string> = {
  pending: 'bg-citrus-soft text-[hsl(26,85%,32%)] border-citrus/30',
  preparing: 'bg-sky-50 text-sky-800 border-sky-200',
  ready: 'bg-leaf-soft text-primary border-primary/20',
  done: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-red-50 text-destructive border-red-200',
};

export const PAYMENT_LABEL = (m: string) =>
  ({ cash: tr('نقدًا'), card: tr('بطاقة'), online: tr('دفع إلكتروني'), mada: tr('مدى'), apple_pay: 'Apple Pay' } as Record<string, string>)[m] ?? m;

const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const dayName = (i: number) => tr(DAY_AR[i] ?? '');

export const digits = (s: string) => s.replace(/[^\d]/g, '');

/** Driver snapshot refinement: server exposes isOnline, generated type lacks it. */
export type MerchantDriver = Driver & { isOnline?: boolean };
/** Only active drivers that are positively online can be assigned. */
export const assignable = (d: MerchantDriver) => d.active && d.isOnline === true;
