import { tr, isRtl } from '@/lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  ClipboardList,
  Clock,
  GraduationCap,
  History,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  Settings,
  Truck,
  WifiOff,
  X,
} from 'lucide-react';
import { useMerchantLogout, getMerchantStateQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { BasketMark, Confirm, Dot } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { clearNativeSession, stopOrderAlerts } from '@/lib/device';
import { errMsg } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'طلبات اليوم', icon: ClipboardList },
  { href: '/history', label: 'الطلبات السابقة', icon: History },
  { href: '/catalog', label: 'إدارة الأصناف', icon: Package },
  { href: '/drivers', label: 'المندوبون', icon: Truck },
  { href: '/hours', label: 'ساعات العمل', icon: Clock },
  { href: '/help', label: 'مركز المساعدة', icon: LifeBuoy },
  { href: '/notifications', label: 'مركز الإشعارات', icon: Bell },
  { href: '/tutorials', label: 'البرامج التعليمية', icon: GraduationCap },
  { href: '/settings', label: 'الإعدادات', icon: Settings },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.href, n.label]));

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [loc] = useLocation();
  const { snap, preview, conn, exitPreview } = useMerchant();
  const qc = useQueryClient();
  const logout = useMerchantLogout();

  useEffect(() => setOpen(false), [loc]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const unread = (snap?.notifications ?? []).filter((n) => !n.readAt).length;
  const pending = (snap?.orders ?? []).filter((o) => o.status === 'pending').length;

  const doLogout = async () => {
    if (preview) {
      exitPreview();
      return true;
    }
    try {
      await logout.mutateAsync();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('تعذر تسجيل الخروج'), description: errMsg(e) });
      return false;
    }
    try {
      await clearNativeSession();
      await stopOrderAlerts();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('تعذر مسح جلسة الجهاز'), description: errMsg(e) });
    }
    qc.removeQueries({ queryKey: getMerchantStateQueryKey() });
    window.location.reload();
    return true;
  };

  const off = isRtl() ? '100%' : '-100%';
  const title = tr(TITLES[loc] ?? 'السلة');

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {preview && (
        <div className="pt-safe sticky top-0 z-40 bg-citrus text-white" data-testid="banner-preview">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold">
            <span>{tr('معاينة فقط — غير متصل بالطلبات')}</span>
            <button className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold active:bg-white/30" onClick={exitPreview} data-testid="button-exit-preview">
              {tr('خروج من المعاينة')}
            </button>
          </div>
        </div>
      )}
      <header className={cn('sticky z-30 border-b bg-card/90 backdrop-blur', preview ? 'top-[44px]' : 'top-0 pt-safe')}>
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-3 sm:px-5">
          <button
            onClick={() => setOpen(true)}
            aria-label={tr("فتح القائمة")}
            className="relative grid size-12 place-items-center rounded-xl border bg-card text-primary transition active:scale-95"
            data-testid="button-menu"
          >
            <Menu className="size-6" />
            {(unread > 0) && <span className="absolute -top-1 -end-1 size-3 rounded-full bg-citrus ring-2 ring-card" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold leading-tight">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{snap?.settings.storeName || tr('السلة')}</p>
          </div>
          {conn !== 'connected' && !preview && (
            <span className="flex items-center gap-1.5 rounded-full bg-citrus-soft px-3 py-1.5 text-xs font-semibold text-[hsl(26,85%,32%)]" data-testid="status-connection">
              <WifiOff className="size-3.5" />
              {conn === 'offline' ? tr('غير متصل') : tr('إعادة اتصال…')}
            </span>
          )}
          {snap && !preview && (
            <Link href="/hours" className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-semibold" data-testid="status-store">
              <Dot tone={snap.storeOpen ? 'green' : 'red'} />
              {snap.storeOpen ? tr('المتجر مفتوح') : tr('المتجر مغلق')}
            </Link>
          )}
          {pending > 0 && (
            <Link href="/" className="grid h-9 min-w-9 place-items-center rounded-full bg-citrus px-2 text-sm font-bold text-white num" data-testid="badge-pending">
              {pending}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-24 pt-4 sm:px-5 sm:pt-6">
        <motion.div key={loc} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
          {children}
        </motion.div>
      </main>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-50 bg-[hsl(150,30%,8%)]/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-label={tr("القائمة")}
              className="pt-safe pb-safe fixed inset-y-0 start-0 z-50 flex w-[86vw] max-w-[22rem] flex-col bg-card shadow-2xl"
              initial={{ x: off }}
              animate={{ x: 0 }}
              exit={{ x: off }}
              transition={{ type: 'tween', duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="flex items-center gap-3 border-b bg-leaf-soft px-4 py-4">
                <BasketMark className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold leading-tight text-primary">{tr('السلة')}</p>
                  <p className="truncate text-xs text-muted-foreground">{snap?.user.username ?? tr('وضع المعاينة')}</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label={tr("إغلاق القائمة")} className="grid size-12 place-items-center rounded-xl bg-card text-foreground active:scale-95" data-testid="button-close-drawer">
                  <X className="size-6" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">
                {NAV.map((n, i) => {
                  const active = loc === n.href;
                  return (
                    <motion.div key={n.href} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i + 0.08 }}>
                      <Link
                        href={n.href}
                        className={cn(
                          'mb-1 flex min-h-14 items-center gap-3 rounded-xl px-3 text-[16px] font-medium transition-colors',
                          active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted active:bg-muted',
                        )}
                        data-testid={`link-nav-${n.href === '/' ? 'today' : n.href.slice(1)}`}
                      >
                        <n.icon className="size-5" strokeWidth={1.8} />
                        <span className="flex-1">{tr(n.label)}</span>
                        {n.href === '/notifications' && unread > 0 && (
                          <span className="rounded-full bg-citrus px-2 py-0.5 text-xs font-bold text-white num">{unread}</span>
                        )}
                        {n.href === '/' && pending > 0 && (
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold num', active ? 'bg-white/25' : 'bg-citrus text-white')}>{pending}</span>
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>
              <div className="border-t p-3">
                <button
                  onClick={() => setConfirmOut(true)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-[16px] font-semibold text-destructive transition-colors hover:bg-red-50 active:bg-red-50"
                  data-testid="button-logout"
                >
                  <LogOut className="size-5" strokeWidth={1.8} />
                  {tr('تسجيل الخروج')}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Confirm
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={preview ? tr('الخروج من المعاينة') : tr('تسجيل الخروج')}
        description={preview ? tr('سيتم الرجوع إلى شاشة الدخول.') : tr('لن تصلك تنبيهات الطلبات الجديدة على هذا الجهاز بعد تسجيل الخروج.')}
        confirmLabel={preview ? tr('خروج') : tr('تسجيل الخروج')}
        destructive
        onConfirm={doLogout}
      />
    </div>
  );
}

