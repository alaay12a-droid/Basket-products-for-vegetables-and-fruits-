import { useState, useCallback, useEffect, useMemo } from "react";
import { Copy, Check, RefreshCw, LogIn, Wifi, WifiOff, ShieldCheck, ShieldOff, Database, AlertCircle, CheckCircle2, Clock, Send, Eye, EyeOff, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────
const LOCAL_API  = `${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""}/api`;
const RENDER_API = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type Status = "idle" | "loading" | "ok" | "error";

interface ConnCheck {
  label: string;
  status: Status;
  code?: number;
  detail?: string;
}

interface LoginLogEntry {
  ts: string;
  endpoint: string;
  username: string;
  status: number | null;
  ok: boolean;
  body: string;
  durationMs: number;
}

interface AccountInfo {
  username: string;
  role: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function StatusDot({ status }: { status: Status }) {
  const cls =
    status === "ok"      ? "bg-emerald-500" :
    status === "error"   ? "bg-red-500" :
    status === "loading" ? "bg-amber-400 animate-pulse" :
    "bg-zinc-300";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls} shrink-0`} />;
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-muted/50 border-b">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AuthDiagnostics() {
  const { toast } = useToast();

  // Account info
  const [account, setAccount]   = useState<AccountInfo | null>(null);
  const [acctLoad, setAcctLoad] = useState(true);
  const [copied, setCopied]     = useState(false);

  // Reset password
  const [resetStep, setResetStep]       = useState<"idle" | "otp-sent" | "done">("idle");
  const [resetOtp, setResetOtp]         = useState("");
  const [resetNew, setResetNew]         = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError]     = useState("");
  const [showResetPw, setShowResetPw]   = useState(false);

  // Test login
  const [testUser, setTestUser]         = useState("");
  const [testPass, setTestPass]         = useState("");
  const [testEndpoint, setTestEndpoint] = useState<"local" | "render">("render");
  const [testRunning, setTestRunning]   = useState(false);
  const [testResult, setTestResult]     = useState<LoginLogEntry | null>(null);
  const [showTestPw, setShowTestPw]     = useState(false);

  // Connection checks
  const [checks, setChecks] = useState<ConnCheck[]>([
    { label: "الخادم المحلي (Preview)", status: "idle" },
    { label: "خادم المشروع", status: "idle" },
    { label: "خدمة المصادقة (محلي)", status: "idle" },
  ]);
  const [checksRunning, setChecksRunning] = useState(false);

  // Session log
  const [log, setLog] = useState<LoginLogEntry[]>([]);

  // ── Load account info ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${LOCAL_API}/dashboard/auth/admin-info`, { credentials: "include" });
        if (r.ok) {
          const d = await r.json() as AccountInfo;
          setAccount(d);
          setTestUser(d.username);
        }
      } catch {
        // ignore
      } finally {
        setAcctLoad(false);
      }
    })();
  }, []);

  // ── Copy username ──────────────────────────────────────────────────────────
  const copyUsername = useCallback(() => {
    if (!account) return;
    navigator.clipboard.writeText(account.username).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [account]);

  // ── Reset password — step 1: send OTP ─────────────────────────────────────
  const sendOtp = useCallback(async () => {
    setResetLoading(true);
    setResetError("");
    try {
      const r = await fetch(`${LOCAL_API}/dashboard/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { setResetError(d.error ?? `خطأ ${r.status}`); return; }
      setResetStep("otp-sent");
      toast({ title: "تم إرسال رمز OTP", description: "تحقق من بريدك الإلكتروني" });
    } catch (e) {
      setResetError("تعذّر الاتصال بالخادم");
    } finally {
      setResetLoading(false);
    }
  }, [toast]);

  // ── Reset password — step 2: submit OTP + new password ────────────────────
  const submitReset = useCallback(async () => {
    if (resetNew !== resetConfirm) { setResetError("كلمتا المرور غير متطابقتين"); return; }
    if (resetNew.length < 6) { setResetError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setResetLoading(true);
    setResetError("");
    try {
      const r = await fetch(`${LOCAL_API}/dashboard/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: resetOtp, newPassword: resetNew }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { setResetError(d.error ?? `خطأ ${r.status}`); return; }
      setResetStep("done");
      toast({ title: "تم تغيير كلمة المرور بنجاح ✓" });
    } catch {
      setResetError("تعذّر الاتصال بالخادم");
    } finally {
      setResetLoading(false);
    }
  }, [resetOtp, resetNew, resetConfirm, toast]);

  // ── Test login ─────────────────────────────────────────────────────────────
  const runTestLogin = useCallback(async () => {
    if (!testUser || !testPass) { toast({ title: "أدخل اسم المستخدم وكلمة المرور", variant: "destructive" }); return; }
    setTestRunning(true);
    setTestResult(null);

    const endpoint = testEndpoint === "render"
      ? `${RENDER_API}/dashboard/auth/login`
      : `${LOCAL_API}/dashboard/auth/login`;

    const start = Date.now();
    let status: number | null = null;
    let bodyText = "";
    let ok = false;

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: testUser, password: testPass }),
      });
      status = r.status;
      ok = r.ok;
      try { bodyText = JSON.stringify(await r.json(), null, 2); } catch { bodyText = await r.text(); }
    } catch (e) {
      bodyText = `خطأ في الاتصال: ${e instanceof Error ? e.message : String(e)}`;
    }

    const entry: LoginLogEntry = {
      ts: now(),
      endpoint,
      username: testUser,
      status,
      ok,
      body: bodyText,
      durationMs: Date.now() - start,
    };
    setTestResult(entry);
    setLog(prev => [entry, ...prev]);
    setTestRunning(false);
  }, [testUser, testPass, testEndpoint, toast]);

  // ── Connection checks ──────────────────────────────────────────────────────
  const runChecks = useCallback(async () => {
    setChecksRunning(true);
    setChecks([
      { label: "الخادم المحلي (Preview)", status: "loading" },
      { label: "خادم المشروع", status: "loading" },
      { label: "خدمة المصادقة (محلي)", status: "loading" },
    ]);

    const check = async (url: string, withCreds = false): Promise<{ status: Status; code?: number; detail?: string }> => {
      try {
        const r = await fetch(url, { credentials: withCreds ? "include" : "omit" });
        return { status: r.ok ? "ok" : "error", code: r.status, detail: r.ok ? "متصل" : `HTTP ${r.status}` };
      } catch (e) {
        return { status: "error", detail: `لا يمكن الوصول: ${e instanceof Error ? e.message : "خطأ"}` };
      }
    };

    const [local, render, auth] = await Promise.all([
      check(`${LOCAL_API}/healthz`),
      check(`${RENDER_API}/healthz`),
      check(`${LOCAL_API}/dashboard/auth/me`, true),
    ]);

    // auth/me returns 401 if not logged in — that still means the service is reachable
    const authStatus: Status = (auth.code === 200 || auth.code === 401) ? "ok" : "error";
    const authDetail = auth.code === 200 ? "مصادق (جلسة نشطة)" : auth.code === 401 ? "متاحة (غير مصادق)" : auth.detail;

    setChecks([
      { label: "الخادم المحلي (Preview)", ...local },
      { label: "خادم المشروع", ...render },
      { label: "خدمة المصادقة (محلي)", status: authStatus, code: auth.code, detail: authDetail },
    ]);
    setChecksRunning(false);
  }, []);

  // Run checks on mount — delayed to avoid insertBefore DOM race on initial render
  useEffect(() => {
    const t = setTimeout(() => { void runChecks(); }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Diagnostics data (stable, computed once after mount) ───────────────────
  const diag = useMemo(() => [
    { label: "عنوان الواجهة الأمامية",   value: window.location.origin },
    { label: "مسار الصفحة الحالي",        value: window.location.pathname },
    { label: "VITE_API_BASE_URL",          value: (import.meta.env.VITE_API_BASE_URL as string | undefined) || "(فارغ — مسارات نسبية)" },
    { label: "نقطة API المحلية",          value: LOCAL_API },
    { label: "نقطة API لخادم المشروع",    value: RENDER_API },
    { label: "بيئة التشغيل (MODE)",        value: import.meta.env.MODE },
    { label: "Cookies مفعّلة",            value: navigator.cookieEnabled ? "نعم ✓" : "لا ✗" },
    { label: "المتصفح",                   value: navigator.userAgent.slice(0, 80) },
  ], []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          تشخيص المصادقة
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          صفحة تشخيصية معزولة — لا تؤثر على أي وظيفة موجودة
        </p>
      </div>

      {/* ── 1. Account Info ───────────────────────────────────────────────── */}
      <SectionCard title="معلومات الحساب" icon={ShieldCheck}>
        {acctLoad ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
          </div>
        ) : account ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">اسم المستخدم الحالي</p>
                <div className="flex items-center gap-2">
                  <code className="rounded-lg bg-muted px-3 py-2 text-sm font-mono font-semibold select-all">
                    {account.username}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyUsername} className="gap-1.5 text-xs shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "تم النسخ" : "نسخ"}
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">الصلاحية</p>
                <Badge variant="secondary" className="text-xs capitalize">{account.role}</Badge>
              </div>
            </div>

            {/* Reset password */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">إعادة تعيين كلمة المرور</p>

              {resetStep === "idle" && (
                <div className="space-y-2">
                  {resetError && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {resetError}
                    </p>
                  )}
                  <Button size="sm" variant="outline" onClick={sendOtp} disabled={resetLoading} className="gap-2 text-xs">
                    {resetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    إرسال رمز OTP للبريد الإلكتروني
                  </Button>
                </div>
              )}

              {resetStep === "otp-sent" && (
                <div className="space-y-3 max-w-sm">
                  {resetError && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {resetError}
                    </p>
                  )}
                  <Input
                    placeholder="رمز OTP المُرسَل للبريد"
                    value={resetOtp}
                    onChange={e => setResetOtp(e.target.value)}
                    className="text-sm h-9"
                    dir="ltr"
                  />
                  <div className="relative">
                    <Input
                      type={showResetPw ? "text" : "password"}
                      placeholder="كلمة المرور الجديدة"
                      value={resetNew}
                      onChange={e => setResetNew(e.target.value)}
                      className="text-sm h-9 pl-9"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPw(v => !v)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showResetPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input
                    type="password"
                    placeholder="تأكيد كلمة المرور"
                    value={resetConfirm}
                    onChange={e => setResetConfirm(e.target.value)}
                    className="text-sm h-9"
                    dir="ltr"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submitReset} disabled={resetLoading} className="text-xs gap-2">
                      {resetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      تأكيد التغيير
                    </Button>
                    <Button size="sm" variant="ghost" onClick={sendOtp} disabled={resetLoading} className="text-xs">
                      إعادة إرسال OTP
                    </Button>
                  </div>
                </div>
              )}

              {resetStep === "done" && (
                <p className="text-sm text-emerald-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> تم تغيير كلمة المرور بنجاح
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-destructive flex items-center gap-2">
            <ShieldOff className="h-4 w-4" /> تعذّر تحميل معلومات الحساب (هل أنت مسجّل الدخول؟)
          </p>
        )}
      </SectionCard>

      {/* ── 2. Test Login ─────────────────────────────────────────────────── */}
      <SectionCard title="اختبار تسجيل الدخول" icon={LogIn}>
        <div className="space-y-4">
          {/* Endpoint picker */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTestEndpoint("render")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${testEndpoint === "render" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
            >
              خادم المشروع
            </button>
            <button
              onClick={() => setTestEndpoint("local")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${testEndpoint === "local" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
            >
              Preview (محلي)
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground font-mono break-all bg-muted rounded px-2 py-1">
            {testEndpoint === "render" ? `${RENDER_API}/dashboard/auth/login` : `${LOCAL_API}/dashboard/auth/login`}
          </p>

          {/* Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <div>
              <p className="text-xs text-muted-foreground mb-1">اسم المستخدم</p>
              <Input
                value={testUser}
                onChange={e => setTestUser(e.target.value)}
                placeholder="username"
                className="text-sm h-9"
                dir="ltr"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">كلمة المرور</p>
              <div className="relative">
                <Input
                  type={showTestPw ? "text" : "password"}
                  value={testPass}
                  onChange={e => setTestPass(e.target.value)}
                  placeholder="password"
                  className="text-sm h-9 pl-9"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowTestPw(v => !v)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showTestPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <Button onClick={runTestLogin} disabled={testRunning} className="gap-2 text-sm">
            {testRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {testRunning ? "جاري الاختبار…" : "تشغيل الاختبار"}
          </Button>

          {/* Live result */}
          {testResult && (
            <div className={`rounded-xl border p-4 space-y-3 ${testResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center gap-2">
                {testResult.ok
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  : <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />}
                <span className={`font-bold text-sm ${testResult.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {testResult.ok ? "تسجيل الدخول نجح ✓" : "فشل تسجيل الدخول"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 inline ml-1" />
                  {testResult.durationMs}ms
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">رمز HTTP</p>
                  <code className={`font-bold text-sm ${testResult.ok ? "text-emerald-700" : "text-red-600"}`}>
                    {testResult.status ?? "لا يوجد (فشل الاتصال)"}
                  </code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">الوقت</p>
                  <code className="font-mono">{testResult.ts}</code>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">النقطة المستخدمة</p>
                <code className="text-[11px] font-mono break-all bg-white/70 rounded px-2 py-1 block">
                  {testResult.endpoint}
                </code>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">استجابة الخادم</p>
                <pre className="text-[11px] font-mono bg-white/70 rounded px-3 py-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                  {testResult.body}
                </pre>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 3. Connection Status ──────────────────────────────────────────── */}
      <SectionCard title="حالة الاتصال" icon={Wifi}>
        <div className="space-y-3">
          {checks.map(c => (
            <div key={c.label} className="flex items-center gap-3">
              <StatusDot status={c.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                {c.detail && (
                  <p className="text-xs text-muted-foreground">{c.detail}{c.code ? ` (HTTP ${c.code})` : ""}</p>
                )}
              </div>
              <div className="shrink-0">
                {c.status === "ok"
                  ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />متصل</span>
                  : c.status === "error"
                    ? <span className="text-xs text-red-500 font-medium flex items-center gap-1"><WifiOff className="h-3.5 w-3.5" />غير متصل</span>
                    : c.status === "loading"
                      ? <span className="text-xs text-amber-500 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />فحص…</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={runChecks}
            disabled={checksRunning}
            className="mt-2 gap-2 text-xs"
          >
            {checksRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            إعادة الفحص
          </Button>
        </div>
      </SectionCard>

      {/* ── 4. Diagnostics ────────────────────────────────────────────────── */}
      <SectionCard title="معلومات التشخيص" icon={Database}>
        <div className="divide-y">
          {diag.map(d => (
            <div key={d.label} className="flex items-start gap-4 py-2.5 first:pt-0 last:pb-0">
              <p className="text-xs text-muted-foreground w-44 shrink-0 pt-0.5">{d.label}</p>
              <code className="text-xs font-mono break-all flex-1">{d.value}</code>
            </div>
          ))}
        </div>

        {/* CORS / Cookie note */}
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            معلومات اختبار خادم المشروع
          </p>
          <ul className="text-xs text-amber-700 space-y-1.5 list-disc list-inside">
            <li><strong>هذا الخادم تابع للمشروع الحالي</strong> ولا يستخدم عنوان خادم خارجي ثابت.</li>
            <li>طلبات لوحة التحكم تستخدم المسار النسبي نفسه في المعاينة والنشر.</li>
            <li>إذا فشل بـ 401 → بيانات الدخول خاطئة. إذا فشل بـ 502 → راجع حالة خادم المشروع.</li>
          </ul>
          <a
            href="/dashboard/auth-diagnostics"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 mt-1"
          >
            افتح صفحة التشخيص
          </a>
        </div>

        {/* Quick render test box */}
        <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-blue-800">بيانات الدخول على خادم المشروع</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-blue-600 mb-0.5">اسم المستخدم</p>
              <code className="bg-white rounded px-2 py-1 block font-mono font-bold">rawabi-almandi</code>
            </div>
            <div>
              <p className="text-blue-600 mb-0.5">كلمة المرور</p>
              <code className="bg-white rounded px-2 py-1 block font-mono font-bold">Aa@123456</code>
            </div>
          </div>
          <p className="text-[11px] text-blue-600">تُستخدم بيانات الدخول المضبوطة لهذا المشروع فقط.</p>
        </div>
      </SectionCard>

      {/* ── 5. Session login log ──────────────────────────────────────────── */}
      <SectionCard title="سجل محاولات الدخول (هذه الجلسة)" icon={Terminal}>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد محاولات بعد — شغّل اختبار الدخول أعلاه.</p>
        ) : (
          <div className="space-y-2">
            {log.map((entry, i) => (
              <div
                key={i}
                className={`rounded-lg border text-xs font-mono p-3 space-y-1 ${entry.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">{entry.ts}</span>
                  <span className={`font-bold ${entry.ok ? "text-emerald-700" : "text-red-600"}`}>
                    HTTP {entry.status ?? "ERR"}
                  </span>
                  <span>{entry.ok ? "✓ نجح" : "✗ فشل"}</span>
                  <span className="text-muted-foreground">{entry.durationMs}ms</span>
                </div>
                <div className="text-muted-foreground break-all">POST {entry.endpoint}</div>
                <div>المستخدم: <span className="text-foreground">{entry.username}</span></div>
                <div className="break-all text-muted-foreground">
                  الاستجابة: {entry.body.slice(0, 200)}{entry.body.length > 200 ? "…" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

    </div>
  );
}
