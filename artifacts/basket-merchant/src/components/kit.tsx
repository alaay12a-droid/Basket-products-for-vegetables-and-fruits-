import { tr } from '@/lib/i18n';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, FileText, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export function BasketMark({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="hsl(148 55% 24%)" />
      <path d="M24 12c4 0 7 2.4 7.6 6-4.2.3-7.4-1.6-7.6-6z" fill="hsl(84 55% 62%)" />
      <path d="M12 21h24l-2.6 14.2a3 3 0 0 1-3 2.4H17.6a3 3 0 0 1-3-2.4L12 21z" fill="#fff" />
      <path d="M18.5 21l4-7M29.5 21l-4-7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19 26v6M24 26v6M29 26v6" stroke="hsl(148 55% 24%)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PageTitle({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="animate-rise flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <div className="mb-4 grid size-20 place-items-center rounded-full bg-leaf-soft text-primary">
        {icon ?? <FileText className="size-9" strokeWidth={1.5} />}
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ title = tr('تعذر تحميل البيانات'), message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="animate-rise flex flex-col items-center rounded-2xl border border-red-200 bg-red-50/60 px-6 py-12 text-center">
      <div className="mb-3 grid size-16 place-items-center rounded-full bg-red-100 text-destructive">
        <AlertTriangle className="size-8" strokeWidth={1.6} />
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} className="mt-5 h-12 px-6 text-base" data-testid="button-retry">
          <RotateCw className="size-4" /> {tr('إعادة المحاولة')}
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-2xl border bg-card p-4 shadow-xs', className)}>{children}</section>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground">{children}</h3>;
}

export function FieldRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<boolean | void> | boolean | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent dir="rtl" className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <AlertDialogHeader className="text-start sm:text-right">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant={destructive ? 'destructive' : 'default'}
            className="h-12 flex-1 text-base sm:flex-none sm:px-8"
            disabled={busy}
            data-testid="button-confirm"
            onClick={async () => {
              setBusy(true);
              try {
                const r = await onConfirm();
                if (r !== false) onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? tr('جارٍ التنفيذ…') : confirmLabel}
          </Button>
          <Button variant="outline" className="h-12 flex-1 text-base sm:flex-none sm:px-8" disabled={busy} onClick={() => onOpenChange(false)} data-testid="button-cancel">
            {tr('تراجع')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Dot({ tone }: { tone: 'green' | 'amber' | 'red' | 'gray' }) {
  const c = { green: 'bg-emerald-600 text-emerald-600', amber: 'bg-citrus text-citrus', red: 'bg-destructive text-destructive', gray: 'bg-muted-foreground/50 text-muted-foreground' }[tone];
  return <span className={cn('relative inline-block size-2.5 rounded-full', c, tone === 'green' && 'pulse-dot')} />;
}

export const inputCls = 'h-12 rounded-xl bg-card text-base';
