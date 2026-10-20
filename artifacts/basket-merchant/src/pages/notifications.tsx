import { tr } from '@/lib/i18n';
import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrderDetail } from '@/components/order-detail';
import { Empty, PageTitle } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Notifications() {
  const { snap, run, busy, ro } = useMerchant();
  const [openId, setOpenId] = useState<number | null>(null);
  const list = [...(snap?.notifications ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <PageTitle title={tr("مركز الإشعارات")} hint={unread ? `${unread} غير مقروء` : tr('كل الإشعارات مقروءة')} actions={unread > 0 ? <Button variant="outline" className="h-12" disabled={ro || busy} onClick={() => run('notification-read', 'all', {}, tr('تم تعليم الكل كمقروء'))} data-testid="button-read-all"><CheckCheck className="size-4" /> {tr('قراءة الكل')}</Button> : undefined} />
      {list.length === 0 ? (
        <Empty icon={<Bell className="size-9" strokeWidth={1.5} />} title={tr("لا توجد إشعارات")} hint={tr("ستظهر هنا تنبيهات الطلبات والرسائل.")} />
      ) : (
        <ul className="space-y-2.5">
          {list.map((n, i) => (
            <li key={n.id} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} className={cn('animate-rise rounded-2xl border p-3.5', n.readAt ? 'bg-card' : 'border-primary/30 bg-leaf-soft')} data-testid={`row-notification-${n.id}`}>
              <div className="flex items-start gap-3">
                <span className={cn('mt-2 size-2.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-citrus')} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground num">{dateTime(n.createdAt)}</p>
                  <div className="mt-2 flex gap-2">
                    {n.orderId != null && snap?.orders.some((o) => o.id === n.orderId) && <Button size="sm" variant="outline" className="h-10 bg-card" onClick={() => setOpenId(n.orderId ?? null)}>{tr('فتح الطلب')}</Button>}
                    {!n.readAt && <Button size="sm" variant="ghost" className="h-10" disabled={ro || busy} onClick={() => run('notification-read', n.id, {})} data-testid={`button-read-${n.id}`}>{tr('تعليم كمقروء')}</Button>}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
