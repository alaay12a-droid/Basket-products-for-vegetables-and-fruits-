import { tr } from '@/lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getMerchantStateQueryKey,
  getMerchantStatusQueryKey,
  setBaseUrl,
  useMerchantState,
  useMerchantStatus,
} from '@workspace/api-client-react';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BasketMark, ErrorBox } from '@/components/kit';
import { Shell } from '@/components/shell';
import { MerchantProvider } from '@/lib/merchant';
import { initializeMerchantClient } from '@/lib/device';
import { Capacitor } from '@capacitor/core';
import { errMsg, errStatus } from '@/lib/format';
import { setLang, type Lang } from '@/lib/i18n';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import Today from '@/pages/today';
import History from '@/pages/history';
import Catalog from '@/pages/catalog';
import Drivers from '@/pages/drivers';
import Hours from '@/pages/hours';
import Notifications from '@/pages/notifications';
import Help from '@/pages/help';
import Tutorials from '@/pages/tutorials';
import Settings from '@/pages/settings';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } });

function Splash() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <div className="animate-pulse"><BasketMark className="size-16" /></div>
    </div>
  );
}

function Routes() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Today} />
        <Route path="/history" component={History} />
        <Route path="/catalog" component={Catalog} />
        <Route path="/drivers" component={Drivers} />
        <Route path="/hours" component={Hours} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/help" component={Help} />
        <Route path="/tutorials" component={Tutorials} />
        <Route path="/settings" component={Settings} />
        <Route path="/login">
          <Redirect to="/" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function Gate() {
  const [ready, setReady] = useState(false);
  const [initErr, setInitErr] = useState<string | null>(null);
  const [preview, setPreview] = useState(() => new URLSearchParams(window.location.search).get('preview') === '1');

  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    setBaseUrl(base || null);
    initializeMerchantClient()
      .catch((e) => setInitErr(errMsg(e)))
      .finally(() => setReady(true));
  }, []);

  const state = useMerchantState({
    query: { queryKey: getMerchantStateQueryKey(), enabled: ready && !preview, retry: false, refetchInterval: 45000 },
  });
  const status = useMerchantStatus({
    query: { queryKey: getMerchantStatusQueryKey(), enabled: ready && !preview && !state.data, retry: false },
  });

  const lang: Lang = !preview && state.data?.settings.language === 'en' ? 'en' : 'ar';
  setLang(lang);
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);
  const expired = state.isError && errStatus(state.error) === 401;

  const exitPreview = () => {
    setPreview(false);
    window.history.replaceState(null, '', import.meta.env.BASE_URL);
  };

  let body: ReactNode;
  if (!ready) body = <Splash />;
  else if (initErr)
    body = (
      <div className="grid min-h-[100dvh] place-items-center p-4">
        <ErrorBox title={tr("تعذر تهيئة التطبيق")} message={initErr} onRetry={() => window.location.reload()} />
      </div>
    );
  else if (preview)
    body = (
      <MerchantProvider snap={undefined} preview refetch={async () => undefined} exitPreview={exitPreview}>
        <Shell><Routes /></Shell>
      </MerchantProvider>
    );
  else if (state.isLoading) body = <Splash />;
  else if (state.data && !expired)
    body = (
      <MerchantProvider snap={state.data} preview={false} refetch={() => state.refetch()} exitPreview={exitPreview}>
        <Shell><Routes /></Shell>
      </MerchantProvider>
    );
  else {
    const s = errStatus(state.error);
    if (s === 401 || s === 403 || s === 503 || status.data)
      body = <Login readiness={status.data} stateError={state.error} onPreview={() => setPreview(true)} onDone={() => state.refetch()} />;
    else
      body = (
        <div className="grid min-h-[100dvh] place-items-center p-4">
          <div className="w-full max-w-md">
            <ErrorBox title={tr("تعذر الاتصال بالخادم")} message={errMsg(state.error)} onRetry={() => void state.refetch()} />
            <button className="mt-3 h-12 w-full rounded-xl border bg-card font-semibold" onClick={() => setPreview(true)} data-testid="button-preview-error">{tr('معاينة الواجهة بدون اتصال')}</button>
          </div>
        </div>
      );
  }
  return <div key={lang}>{body}</div>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={Capacitor.isNativePlatform() ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Gate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
