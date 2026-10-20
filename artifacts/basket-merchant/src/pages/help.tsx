import { tr } from '@/lib/i18n';
import { MessageCircle, Phone } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Panel, PageTitle } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { digits } from '@/lib/format';
import { cn } from '@/lib/utils';

const FAQ = [
  ['لا يصلني تنبيه عند وصول طلب جديد', 'تأكد من تفعيل الصوت في الإعدادات ومن اتصال الجهاز بالإنترنت (تظهر حالة الاتصال أعلى الشاشة). يتكرر التنبيه ما دام هناك طلب جديد لم يُقبل.'],
  ['الطابعة لا تطبع', 'راجع نوع الاتصال والعنوان في الإعدادات. الطباعة تعمل من تطبيق الأندرويد فقط ولا تعمل من المتصفح. فشل الطباعة لا يلغي الطلب، ويمكنك إعادة الطباعة من تفاصيل الطلب.'],
  ['كيف أوقف منتجًا مؤقتًا؟', 'من إدارة الأصناف اضغط زر التوفر على المنتج واختر الإيقاف حتى نهاية اليوم أو لمدة محددة.'],
  ['ماذا تعني الموافقة على الاسترداد؟', 'الموافقة تسجل قرارك في النظام فقط ولا ترسل أي مبلغ للعميل. يتم الاسترداد المالي خارج هذا التطبيق.'],
  ['لماذا ظهرت لي رسالة عدم الصلاحية عند تعديل منتج؟', 'تعديل المنتجات والأقسام العامة متاح لحساب المدير فقط.'],
  ['كيف أغير المندوب بعد التعيين؟', 'افتح تفاصيل الطلب، اختر مندوبًا آخر واضغط تغيير. لا يمكن اختيار إلا مندوب نشط ومتصل. يُحفظ كل تعيين في سجل الطلب.'],
];

export default function Help() {
  const { settings, snap } = useMerchant();
  const wa = digits(settings.supportWhatsapp);
  const ph = settings.supportPhone.trim();
  const loaded = !!snap;
  const cta = 'flex h-16 items-center justify-center gap-3 rounded-2xl text-base font-bold transition active:scale-[0.98]';
  const missing = !wa && !ph ? tr('رقم واتساب ولا رقم هاتف') : !wa ? tr('رقم واتساب') : tr('رقم هاتف');
  return (
    <>
      <PageTitle title={tr('مركز المساعدة')} />
      <Panel className="mb-4">
        <p className="mb-3 font-bold">{tr('تواصل مع الدعم')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {wa ? (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={cn(cta, 'bg-primary text-primary-foreground')} data-testid="link-whatsapp"><MessageCircle className="size-6" /> {tr('واتساب')}</a>
          ) : (
            <div className={cn(cta, 'cursor-not-allowed bg-muted text-muted-foreground')} aria-disabled data-testid="button-whatsapp-disabled"><MessageCircle className="size-6" /> {tr('واتساب')}</div>
          )}
          {ph ? (
            <a href={`tel:${ph}`} className={cn(cta, 'border-2 border-primary text-primary')} data-testid="link-call"><Phone className="size-6" /> {tr('اتصال')}</a>
          ) : (
            <div className={cn(cta, 'cursor-not-allowed border bg-muted text-muted-foreground')} aria-disabled data-testid="button-call-disabled"><Phone className="size-6" /> {tr('اتصال')}</div>
          )}
        </div>
        {(!wa || !ph) && (
          <p className="mt-3 rounded-xl bg-citrus-soft px-3 py-2 text-sm" data-testid="text-support-missing">
            {!loaded ? tr('بيانات الدعم غير متاحة في وضع المعاينة.') : `${tr('لم يتم ضبط')} ${missing} ${tr('للدعم. يمكن إضافته من الإعدادات.')}`}
          </p>
        )}
      </Panel>
      <Accordion type="single" collapsible className="space-y-2">
        {FAQ.map(([q, a], i) => (
          <AccordionItem key={i} value={`q${i}`} className="rounded-2xl border bg-card px-4 data-[state=open]:border-primary/40">
            <AccordionTrigger className="min-h-14 text-start text-[15px] font-semibold hover:no-underline">{tr(q)}</AccordionTrigger>
            <AccordionContent className="text-sm leading-7 text-muted-foreground">{tr(a)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
