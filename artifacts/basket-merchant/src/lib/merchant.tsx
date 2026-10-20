import { tr } from '@/lib/i18n';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  getMerchantStateQueryKey,
  useMerchantAction,
  type MerchantCommandKind,
  type MerchantSettings,
  type MerchantSnapshot,
  type MerchantOrder,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { errMsg, errStatus } from '@/lib/format';
import {
  connectMerchantEvents,
  printOrder,
  startOrderAlerts,
  stopOrderAlerts,
  configureDevice,
  acknowledgeAcceptedOrder,
} from '@/lib/device';

export type Conn = 'connected' | 'reconnecting' | 'offline';

export const PREVIEW_SETTINGS: MerchantSettings = {
  storeName: '',
  supportPhone: '',
  supportWhatsapp: '',
  paperWidth: 80,
  copies: 1,
  kitchenCopy: false,
  autoPrint: false,
  soundEnabled: true,
  keepAwake: true,
  language: 'ar',
  printerTransport: 'none',
  printerAddress: '',
};

interface Ctx {
  snap: MerchantSnapshot | undefined;
  preview: boolean;
  ro: boolean;
  conn: Conn;
  busy: boolean;
  settings: MerchantSettings;
  refetch: () => Promise<unknown>;
  exitPreview: () => void;
  /** Runs a command. Resolves true on success; errors are surfaced via toast. */
  run: (kind: MerchantCommandKind, id?: string | number, data?: Record<string, unknown>, okMsg?: string) => Promise<boolean>;
  print: (orderId: number, kitchen?: boolean) => Promise<string | null>;
  printingIds: number[];
  printErrors: Record<number, string>;
}

const MerchantCtx = createContext<Ctx | null>(null);

export function useMerchant() {
  const c = useContext(MerchantCtx);
  if (!c) throw new Error('MerchantProvider missing');
  return c;
}

export function MerchantProvider({
  snap,
  preview,
  refetch,
  exitPreview,
  children,
}: {
  snap: MerchantSnapshot | undefined;
  preview: boolean;
  refetch: () => Promise<unknown>;
  exitPreview: () => void;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const action = useMerchantAction();
  const [conn, setConn] = useState<Conn>('connected');
  const accepting = useRef(new Set<number>());
  const printing = useRef(new Set<number>());
  const [printingIds, setPrintingIds] = useState<number[]>([]);
  const [printErrors, setPrintErrors] = useState<Record<number, string>>({});
  const settings = snap?.settings ?? PREVIEW_SETTINGS;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (preview) return;
    return connectMerchantEvents(
      () => {
        void qc.invalidateQueries({ queryKey: getMerchantStateQueryKey() });
      },
      (s) => setConn(s),
    );
  }, [preview, qc]);

  const pendingKey = (snap?.orders ?? [])
    .filter((o) => o.status === 'pending')
    .map((o) => o.id)
    .sort((a, b) => a - b)
    .join(',');
  const soundOn = settings.soundEnabled;
  useEffect(() => {
    if (preview) return;
    configureDevice(settings).catch(e =>
      toast({ variant: 'destructive', title: tr('إعداد الجهاز يحتاج مراجعة'), description: errMsg(e) }),
    );
  }, [preview, settings.keepAwake, settings.soundEnabled]);
  useEffect(() => {
    if (preview) return;
    const ids = pendingKey ? pendingKey.split(',').map(Number) : [];
    const task = startOrderAlerts(ids, settingsRef.current);
    task.catch((e) =>
      toast({ variant: 'destructive', title: tr('تعذر تشغيل تنبيه الطلبات'), description: errMsg(e) }),
    );
  }, [pendingKey, soundOn, preview]);
  useEffect(
    () => () => {
      stopOrderAlerts().catch(() => undefined);
    },
    [],
  );

  const printReceipt = async (order: MerchantOrder, kitchen = false, includeKitchen = false): Promise<string | null> => {
    if (printing.current.has(order.id)) return tr('طباعة هذا الطلب جارية بالفعل');
    printing.current.add(order.id);
    setPrintingIds([...printing.current]);
    setPrintErrors(previous => { const next = { ...previous }; delete next[order.id]; return next; });
    let kitchenStage = kitchen;
    try {
      await printOrder(order, settingsRef.current, kitchen);
      if (includeKitchen && settingsRef.current.kitchenCopy) {
        kitchenStage = true;
        await printOrder(order, settingsRef.current, true);
      }
      return null;
    } catch (e) {
      const m = kitchenStage ? `${tr('نسخة المطبخ:')} ${errMsg(e)}` : errMsg(e);
      setPrintErrors(previous => ({ ...previous, [order.id]: m }));
      toast({ variant: 'destructive', title: tr('فشلت الطباعة'), description: m });
      return m;
    } finally {
      printing.current.delete(order.id);
      setPrintingIds([...printing.current]);
    }
  };
  const print = async (orderId: number, kitchen = false): Promise<string | null> => {
    const order = snapRef.current?.orders.find((o) => o.id === orderId);
    return order ? printReceipt(order, kitchen) : tr('الطلب غير موجود');
  };

  const run: Ctx['run'] = async (kind, id, data = {}, okMsg) => {
    if (preview) {
      toast({ variant: 'destructive', title: tr('معاينة فقط'), description: tr('الإجراءات معطلة في وضع المعاينة.') });
      return false;
    }
    const acceptedOrder = kind === 'accept' ? snapRef.current?.orders.find(o => o.id === Number(id)) : undefined;
    if (kind === 'accept') {
      if (!acceptedOrder || acceptedOrder.status !== 'pending' || accepting.current.has(acceptedOrder.id)) return false;
      accepting.current.add(acceptedOrder.id);
    }
    try {
      await action.mutateAsync({
        data: { kind, id: id === undefined ? undefined : String(id), requestId: crypto.randomUUID(), data },
      });
    } catch (e) {
      if (acceptedOrder) accepting.current.delete(acceptedOrder.id);
      toast({ variant: 'destructive', title: tr('لم يتم تنفيذ الإجراء'), description: errMsg(e) });
      if (errStatus(e) === 401) void refetchRef.current();
      return false;
    }
    if (acceptedOrder) {
      // This transition is applied only AFTER the server confirms acceptance.
      // Do not wait for the printer or a slow refetch before offering driver selection.
      try {
        await qc.cancelQueries({ queryKey: getMerchantStateQueryKey() });
        qc.setQueryData<MerchantSnapshot>(getMerchantStateQueryKey(), previous => previous && ({
          ...previous,
          orders: previous.orders.map(order => order.id === acceptedOrder.id
            ? { ...order, status: 'preparing', preparationMinutes: Number(data.minutes) } : order),
        }));
      } catch (e) {
        toast({ variant: 'destructive', title: tr('تم قبول الطلب لكن تعذر تحديث العرض'), description: errMsg(e) });
      }
      void acknowledgeAcceptedOrder(acceptedOrder.id).catch(e =>
        toast({ variant: 'destructive', title: tr('تم القبول لكن تعذر تحديث التنبيه'), description: errMsg(e) }),
      );
      void printReceipt({ ...acceptedOrder, status: 'preparing' }, false, true);
      accepting.current.delete(acceptedOrder.id);
      if (okMsg) toast({ title: okMsg });
      void refetchRef.current().catch(e =>
        toast({ variant: 'destructive', title: tr('تم الإجراء لكن تعذر تحديث البيانات'), description: errMsg(e) }),
      );
      return true;
    }
    if (kind === 'reject') {
      // Reflect a confirmed cancellation even if the subsequent refresh fails.
      try {
        await qc.cancelQueries({ queryKey: getMerchantStateQueryKey() });
        qc.setQueryData<MerchantSnapshot>(getMerchantStateQueryKey(), previous => previous && ({
          ...previous,
          orders: previous.orders.map(order => order.id === Number(id)
            ? { ...order, status: 'cancelled', rejectionReason: String(data.reason ?? '').trim() } : order),
        }));
      } catch (e) {
        toast({ variant: 'destructive', title: tr('تم الإلغاء لكن تعذر تحديث العرض'), description: errMsg(e) });
      }
      // The same native acknowledgement removes this order from the pending alarm.
      void acknowledgeAcceptedOrder(Number(id)).catch(e =>
        toast({ variant: 'destructive', title: tr('تم الإلغاء لكن تعذر تحديث التنبيه'), description: errMsg(e) }),
      );
    }
    try {
      await refetchRef.current();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('تم الإجراء لكن تعذر تحديث البيانات'), description: errMsg(e) });
    }
    if (okMsg) toast({ title: okMsg });
    return true;
  };

  const value = useMemo<Ctx>(
    () => ({
      snap,
      preview,
      ro: preview,
      conn,
      busy: action.isPending,
      settings,
      refetch,
      exitPreview,
      run,
      print,
      printingIds,
      printErrors,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, preview, conn, action.isPending, settings, printingIds, printErrors],
  );
  return <MerchantCtx.Provider value={value}>{children}</MerchantCtx.Provider>;
}
