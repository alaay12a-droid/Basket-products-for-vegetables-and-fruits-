import { tr } from '@/lib/i18n';
import { PageTitle } from '@/components/kit';

const STEPS = [
  { t: 'استقبال طلب جديد', s: ['افتح طلبات اليوم وتبويب جديدة.', 'افتح الطلب، اختر وقت التحضير ثم اضغط قبول.', 'للرفض اكتب السبب ليصل للعميل.'] },
  { t: 'تحضير الطلب وتسليمه', s: ['بعد القبول ينتقل الطلب إلى قيد التحضير.', 'اضغط الطلب جاهز عند الانتهاء.', 'ثم اضغط تم التسليم عند خروجه.'] },
  { t: 'تعيين مندوب', s: ['في تفاصيل الطلب اختر مندوبًا نشطًا واضغط تعيين.', 'يمكن تغييره لاحقًا ويبقى السجل ظاهرًا.'] },
  { t: 'إيقاف منتج أو قسم', s: ['من إدارة الأصناف اضغط زر التوفر على المنتج.', 'لإيقاف قسم كامل اختر القسم ثم إيقاف القسم.'] },
  { t: 'إعداد الطابعة', s: ['من الإعدادات اختر نوع الاتصال وأدخل العنوان.', 'اختر عرض الورق وعدد النسخ.', 'استخدم اختبار الطابعة من تطبيق الأندرويد.'] },
  { t: 'الإغلاق المؤقت', s: ['من ساعات العمل اختر المدة واضغط إغلاق مؤقت.', 'يمكن فتح المتجر مبكرًا بالضغط على فتح المتجر الآن.'] },
];

export default function Tutorials() {
  return (
    <>
      <PageTitle title={tr("البرامج التعليمية")} hint={tr("خطوات مختصرة للمهام اليومية")} />
      <div className="grid gap-3 md:grid-cols-2">
        {STEPS.map((x, i) => (
          <section key={x.t} style={{ animationDelay: `${i * 50}ms` }} className="animate-rise rounded-2xl border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-3 font-bold"><span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground num">{i + 1}</span>{tr(x.t)}</h2>
            <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-6 text-muted-foreground marker:text-primary">
              {x.s.map((s) => <li key={s}>{tr(s)}</li>)}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
