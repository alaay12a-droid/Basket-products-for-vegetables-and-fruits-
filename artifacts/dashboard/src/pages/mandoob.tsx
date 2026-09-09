import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { getOrderPriceFactor } from "@/lib/format";

// ── API helpers ───────────────────────────────────────────────────────────────
const BASE = "/api";
async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}
const dGet  = <T,>(p: string)             => req<T>(p);
const dPost = <T,>(p: string, b: unknown) => req<T>(p, { method: "POST",  body: JSON.stringify(b) });
const dPut  = <T,>(p: string, b: unknown) => req<T>(p, { method: "PUT",   body: JSON.stringify(b) });

// ── Types ─────────────────────────────────────────────────────────────────────
interface Driver     { id: number; name: string; phone: string; photoUrl: string | null; active: boolean; }
interface OrderItem  { id: string; name: string; price: number; quantity: number; }
interface Order      { id: number; dailyNumber: number; customerName: string; customerPhone: string; customerAddress: string | null; items: OrderItem[]; totalPrice: number; status: string; notes: string | null; createdAt: string; }
interface Assignment { orderId: number; driverId: number; status: string; assignedAt: string; pickedUpAt: string | null; deliveredAt: string | null; }
interface Row        { assignment: Assignment; order: Order | null; }
interface DriverMsg  { id: number; orderId: number; text: string; fromCashier: boolean; driverId: number | null; createdAt: string; readAt: string | null; }
interface Convo      { orderId: number; lastText: string; fromDriver: boolean; lastAt: string; unread: number; order: { id: number; dailyNumber: number; customerName: string; customerPhone: string } | null; }
interface StmtPeriod { ordersCount: number; totalCollected: number; cashCollected: number; electronicCollected: number; cancelledCount: number; }
interface StmtOrder  { orderId: number; dailyNumber: number | null; customerName: string; totalPrice: number; paymentMethod: string; deliveredAt: string | null; cancelled: boolean; }
interface StmtDay    { date: string; ordersCount: number; totalCollected: number; orders: StmtOrder[]; }
interface Statement  { today: StmtPeriod; thisMonth: StmtPeriod; thisYear: StmtPeriod; allTime: StmtPeriod; daily: StmtDay[]; }

// ── Sound ─────────────────────────────────────────────────────────────────────
const BASE_URL = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

function playSound(src: string) {
  try {
    const a = new Audio(src);
    a.volume = 1;
    a.play().catch(() => {
      const AC = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        const s = ctx.currentTime + i * 0.2;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.35, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
        osc.start(s); osc.stop(s + 0.35);
      });
    });
  } catch {}
}

const SND_ORDER = `${BASE_URL}/sounds/notification_loop.wav`;
const SND_MSG   = `${BASE_URL}/sounds/notification.wav`;

// ── Status label ──────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  assigned:  "بانتظار الاستلام من المطعم",
  picked_up: "🚗 في الطريق",
  delivered: "تم التسليم ✅",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Login Screen
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }: { onLogin: (d: Driver) => void }) {
  const [phone,   setPhone]   = useState("");
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!phone.trim() || !pin.trim()) { setError("أدخل رقم الجوال والرقم السري"); return; }
    setLoading(true); setError("");
    try {
      const driver = await dPost<Driver>("/drivers/login", { phone: phone.trim(), pin: pin.trim() });
      onLogin(driver);
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "تعذر تسجيل الدخول");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F0A05] p-6 gap-6" dir="rtl">
      <img src={`${BASE_URL}/logo.png`} alt="سلة الخضار" className="h-20 w-auto object-contain" />
      <div className="w-full max-w-sm bg-[#1A1208] rounded-2xl border border-[#E8920C33] p-6 space-y-4 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="text-4xl">🛵</div>
          <h1 className="text-xl font-bold text-[#E8920C]">بوابة المناديب</h1>
          <p className="text-xs text-[#666]">سلة الخضار</p>
        </div>
        <input
          value={phone} onChange={e => { setPhone(e.target.value); setError(""); }}
          placeholder="رقم الجوال" type="tel"
          className="w-full bg-[#0F0A05] border border-[#E8920C44] rounded-xl px-4 py-3 text-white text-center placeholder-[#555] focus:outline-none focus:border-[#E8920C] text-base"
        />
        <input
          value={pin} onChange={e => { setPin(e.target.value); setError(""); }}
          placeholder="الرقم السري" type="password"
          className="w-full bg-[#0F0A05] border border-[#E8920C44] rounded-xl px-4 py-3 text-white text-center placeholder-[#555] focus:outline-none focus:border-[#E8920C] text-2xl tracking-widest"
          onKeyDown={e => e.key === "Enter" && submit()}
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={submit} disabled={loading}
          className="w-full bg-[#E8920C] hover:bg-[#d4820b] disabled:opacity-60 rounded-xl py-3 font-bold text-[#1A0A00] text-base transition-colors">
          {loading ? "جاري الدخول..." : "دخول 🚗"}
        </button>
      </div>
      <Link href="/" className="text-xs text-[#444] hover:text-[#666] transition-colors">
        ← العودة للداشبورد
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Driver Home
// ═══════════════════════════════════════════════════════════════════════════════
function DriverHome({ driver, onLogout }: { driver: Driver; onLogout: () => void }) {
  type View = "waiting" | "delivered" | "messages" | "statement";
  const [rows,       setRows]       = useState<Row[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating,   setUpdating]   = useState<number | null>(null);
  const [activeView, setActiveView] = useState<View>("waiting");

  // GPS
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError,   setLocationError]   = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [driverCoords,    setDriverCoords]    = useState<{ lat: number; lng: number } | null>(null);
  const gpsIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackedOrderRef   = useRef<number | null>(null);
  const locationEnabledRef = useRef(true);

  // Polling / sound
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundEnabled = useRef(false);
  const knownIds     = useRef(new Set<number>());

  // Chat
  const [convos,       setConvos]       = useState<Convo[]>([]);
  const [chatOrderId,  setChatOrderId]  = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<DriverMsg[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatSending,  setChatSending]  = useState(false);
  const msgSoundEnabled = useRef(false);
  const knownUnreads    = useRef(new Map<number, number>());
  const msgsPollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatScrollRef   = useRef<HTMLDivElement>(null);

  // Statement
  const [statement,    setStatement]    = useState<Statement | null>(null);
  const [stmtLoading,  setStmtLoading]  = useState(false);
  type Period = "today" | "month" | "year" | "history";
  const [stmtPeriod,   setStmtPeriod]   = useState<Period>("today");
  const [expandedDay,  setExpandedDay]  = useState<string | null>(null);

  // Confirm modal
  const [pendingDelivery, setPendingDelivery] = useState<{ orderId: number; total: number; name: string } | null>(null);
  const [cashConfirmed,   setCashConfirmed]   = useState(false);

  // ── GPS ──────────────────────────────────────────────────────────────────────
  const sendLocation = useCallback(async (orderId: number, lat: number, lng: number) => {
    setDriverCoords({ lat, lng });
    try { await dPut(`/orders/${orderId}/driver-location`, { lat, lng }); } catch {}
  }, []);

  const stopGPS = useCallback(() => {
    setSharingLocation(false); setLocationError(false);
    trackedOrderRef.current = null;
    if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
  }, []);

  const startGPS = useCallback((orderId: number) => {
    if (trackedOrderRef.current === orderId) return;
    stopGPS();
    trackedOrderRef.current = orderId;
    if (!navigator.geolocation) { setLocationError(true); return; }
    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 };
    const ok  = (p: GeolocationPosition) => { setSharingLocation(true); setLocationError(false); sendLocation(orderId, p.coords.latitude, p.coords.longitude); };
    const err = () => { setSharingLocation(false); setLocationError(true); };
    navigator.geolocation.getCurrentPosition(ok, err, opts);
    gpsIntervalRef.current = setInterval(() => navigator.geolocation.getCurrentPosition(ok, err, opts), 8000);
  }, [stopGPS, sendLocation]);

  const toggleLocation = useCallback((orderId: number) => {
    const next = !locationEnabledRef.current;
    locationEnabledRef.current = next;
    setLocationEnabled(next);
    if (next) startGPS(orderId); else stopGPS();
  }, [startGPS, stopGPS]);

  useEffect(() => {
    const pickedUp = rows.find(r => r.assignment.status === "picked_up");
    if (pickedUp && locationEnabledRef.current) startGPS(pickedUp.assignment.orderId);
    else if (!pickedUp) { stopGPS(); locationEnabledRef.current = true; setLocationEnabled(true); }
  }, [rows, startGPS, stopGPS]);

  useEffect(() => () => { stopGPS(); }, [stopGPS]);

  // ── Orders ───────────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const data = await dGet<Row[]>(`/drivers/${driver.id}/orders`);
      if (silent && soundEnabled.current) {
        const newOnes = data.filter(r => !knownIds.current.has(r.assignment.orderId));
        if (newOnes.length > 0) {
          playSound(SND_ORDER);
          const prev = document.title;
          document.title = `🔔 طلب جديد!`;
          setTimeout(() => { document.title = prev; }, 5000);
        }
      }
      data.forEach(r => knownIds.current.add(r.assignment.orderId));
      setRows(data);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [driver.id]);

  useEffect(() => {
    loadOrders();
    const t = setTimeout(() => { soundEnabled.current = true; }, 2000);
    pollRef.current = setInterval(() => loadOrders(true), 15000);
    return () => { clearInterval(pollRef.current!); clearTimeout(t); };
  }, [loadOrders]);

  // ── Status update ────────────────────────────────────────────────────────────
  const updateStatus = async (orderId: number, status: "picked_up" | "delivered") => {
    setUpdating(orderId);
    try { await dPut(`/orders/${orderId}/driver-status`, { status }); await loadOrders(true); }
    catch { alert("تعذّر تحديث الحالة"); }
    setUpdating(null);
  };

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const loadConvos = useCallback(async (silent = false) => {
    try {
      const data = await dGet<Convo[]>(`/messages/driver/${driver.id}/conversations`);
      if (silent && msgSoundEnabled.current) {
        for (const c of data) {
          const prev = knownUnreads.current.get(c.orderId) ?? 0;
          if (c.unread > prev) { playSound(SND_MSG); break; }
        }
      }
      data.forEach(c => knownUnreads.current.set(c.orderId, c.unread));
      setConvos(data);
    } catch {}
  }, [driver.id]);

  useEffect(() => {
    loadConvos();
    const t = setTimeout(() => { msgSoundEnabled.current = true; }, 2000);
    msgsPollRef.current = setInterval(() => loadConvos(true), 15000);
    return () => { clearInterval(msgsPollRef.current!); clearTimeout(t); };
  }, [loadConvos]);

  useEffect(() => {
    if (!chatOrderId) return;
    const poll = setInterval(async () => {
      try {
        const msgs = await dGet<DriverMsg[]>(`/messages/driver/${driver.id}/order/${chatOrderId}`);
        setChatMessages(msgs);
        setConvos(prev => prev.map(c => c.orderId === chatOrderId ? { ...c, unread: 0 } : c));
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [chatOrderId, driver.id]);

  const openChat = async (orderId: number) => {
    setChatOrderId(orderId); setChatMessages([]);
    try {
      const msgs = await dGet<DriverMsg[]>(`/messages/driver/${driver.id}/order/${orderId}`);
      setChatMessages(msgs);
      setConvos(prev => prev.map(c => c.orderId === orderId ? { ...c, unread: 0 } : c));
    } catch {}
    setTimeout(() => chatScrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 100);
  };

  const sendMsg = async () => {
    if (!chatOrderId || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput(""); setChatSending(true);
    try {
      const msg = await dPost<DriverMsg>(`/messages/driver/${driver.id}/order/${chatOrderId}`, { text });
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatScrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 100);
    } catch {} finally { setChatSending(false); }
  };

  // ── Statement ────────────────────────────────────────────────────────────────
  const loadStatement = useCallback(async () => {
    setStmtLoading(true);
    try { setStatement(await dGet<Statement>(`/drivers/${driver.id}/statement`)); }
    catch {} finally { setStmtLoading(false); }
  }, [driver.id]);

  useEffect(() => { if (activeView === "statement") loadStatement(); }, [activeView, loadStatement]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const waitingRows   = rows.filter(r => r.assignment.status === "assigned" || r.assignment.status === "picked_up");
  const deliveredRows = rows.filter(r => r.assignment.status === "delivered");
  const totalUnread   = convos.reduce((s, c) => s + c.unread, 0);

  // ── Chat modal ───────────────────────────────────────────────────────────────
  if (chatOrderId !== null) {
    const chatRow = convos.find(c => c.orderId === chatOrderId);
    return (
      <div className="min-h-screen flex flex-col bg-[#0F0A05]" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8920C33] bg-[#1A1208]">
          <span className="font-bold text-white text-sm">
            محادثة — طلب #{chatRow?.order?.dailyNumber ?? chatOrderId}
          </span>
          <button onClick={() => setChatOrderId(null)} className="text-[#999] hover:text-white text-2xl leading-none">×</button>
        </div>
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: "calc(100vh - 120px)" }}>
          {chatMessages.length === 0 && (
            <p className="text-center text-[#555] text-sm pt-8">لا توجد رسائل بعد</p>
          )}
          {chatMessages.map(m => (
            <div key={m.id} className={`flex ${m.fromCashier ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                m.fromCashier
                  ? "bg-[#1A1208] text-white rounded-tr-none border border-[#E8920C33]"
                  : "bg-[#29B6F6] text-[#0A1F2A] rounded-tl-none"
              }`}>
                <p>{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.fromCashier ? "text-[#666]" : "text-[#0A1F2A99]"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-3 border-t border-[#E8920C33] bg-[#1A1208]">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMsg()}
            placeholder="اكتب رسالة..." autoFocus
            className="flex-1 bg-[#0F0A05] border border-[#29B6F655] rounded-xl px-3 py-2 text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#29B6F6]"
          />
          <button onClick={sendMsg} disabled={chatSending || !chatInput.trim()}
            className="bg-[#29B6F6] disabled:opacity-50 rounded-xl px-4 py-2 text-[#0A1F2A] font-bold text-sm">
            إرسال
          </button>
        </div>
      </div>
    );
  }

  // ── Confirm modal ─────────────────────────────────────────────────────────────
  if (pendingDelivery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/80 p-4" dir="rtl">
        <div className="bg-[#1A1208] border border-[#4CAF5055] rounded-2xl p-6 w-full max-w-sm space-y-4">
          <div className="text-center space-y-1">
            <div className="text-4xl">💵</div>
            <h3 className="text-lg font-bold text-white">تأكيد استلام المبلغ</h3>
            <p className="text-[#4CAF50] font-bold text-2xl">{pendingDelivery.total.toFixed(2)} ريال</p>
            <p className="text-[#999] text-sm">من: {pendingDelivery.name}</p>
          </div>
          <label className="flex items-center gap-3 bg-[#0F0A05] rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={cashConfirmed} onChange={e => setCashConfirmed(e.target.checked)} className="w-5 h-5 accent-[#4CAF50]" />
            <span className="text-white text-sm">نعم، استلمت المبلغ من العميل</span>
          </label>
          <div className="flex gap-3">
            <button onClick={() => setPendingDelivery(null)}
              className="flex-1 bg-[#2A2A2A] rounded-xl py-3 text-[#999] font-bold">إلغاء</button>
            <button
              disabled={!cashConfirmed || updating === pendingDelivery.orderId}
              onClick={() => { updateStatus(pendingDelivery.orderId, "delivered"); setPendingDelivery(null); }}
              className="flex-1 bg-[#4CAF50] disabled:opacity-50 rounded-xl py-3 text-white font-bold">
              تأكيد ✅
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[#0F0A05]" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#1A1208] border-b border-[#E8920C33]">
        <div className="flex items-center gap-3">
          <img src={`${BASE_URL}/logo.png`} alt="سلة الخضار" className="h-8 w-auto object-contain" />
          <div>
            <p className="text-white font-bold text-sm leading-tight">{driver.name}</p>
            <p className="text-[#E8920C] text-[11px]">{driver.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {driverCoords && (
            <span className="text-[10px] text-[#4CAF50] bg-[#4CAF5011] border border-[#4CAF5033] rounded-full px-2 py-0.5">📡 GPS</span>
          )}
          {(sharingLocation || locationError) && !driverCoords && (
            <span className="text-[10px] text-[#FB8C00] bg-[#FB8C0011] border border-[#FB8C0033] rounded-full px-2 py-0.5">
              {locationError ? "⚠️ GPS" : "📡..."}
            </span>
          )}
          <button onClick={() => { stopGPS(); onLogout(); }}
            className="text-[#666] hover:text-[#E8920C] text-xs border border-[#333] rounded-lg px-3 py-1.5 transition-colors">
            خروج
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex border-b border-[#E8920C22] bg-[#1A1208] sticky top-[57px] z-10">
        {([
          { key: "waiting"  as View, label: "الانتظار",   badge: waitingRows.length,   red: false },
          { key: "delivered"as View, label: "المسلّمة",    badge: deliveredRows.length,  red: false },
          { key: "messages" as View, label: "الرسائل",     badge: totalUnread,           red: true  },
          { key: "statement"as View, label: "كشف الحساب",  badge: 0,                     red: false },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveView(tab.key)}
            className={`flex-1 py-3 text-xs font-bold relative transition-colors ${
              activeView === tab.key ? "text-[#E8920C] border-b-2 border-[#E8920C]" : "text-[#666] hover:text-[#999]"
            }`}>
            {tab.label}
            {tab.badge > 0 && (
              <span className={`absolute top-1.5 right-1 min-w-[16px] h-4 text-[9px] font-bold rounded-full flex items-center justify-center px-1 ${
                tab.red ? "bg-red-500 text-white" : "bg-[#E8920C22] text-[#E8920C]"
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Waiting ──────────────────────────────────────────────────────────── */}
      {activeView === "waiting" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-10">
          {loading && (
            <div className="flex justify-center pt-16">
              <div className="w-8 h-8 border-2 border-[#E8920C] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && waitingRows.length === 0 && (
            <div className="flex flex-col items-center pt-20 gap-4 text-center">
              <span className="text-6xl">🛵</span>
              <p className="text-[#666] font-semibold">لا يوجد طلبات في الانتظار</p>
              <button onClick={() => loadOrders(true)} disabled={refreshing}
                className="text-xs text-[#E8920C] border border-[#E8920C33] rounded-lg px-4 py-2 hover:bg-[#E8920C11] transition-colors">
                {refreshing ? "جاري التحديث..." : "🔄 تحديث"}
              </button>
            </div>
          )}
          {waitingRows.map(({ assignment, order }) => order && (
            <div key={assignment.orderId}
              className={`rounded-2xl border overflow-hidden ${
                assignment.status === "picked_up"
                  ? "border-[#29B6F644] bg-[#0D2030]"
                  : "border-[#FB8C0044] bg-[#1A1208]"
              }`}>
              {/* Status bar */}
              <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
                assignment.status === "picked_up"
                  ? "bg-[#29B6F611] border-[#29B6F622]"
                  : "bg-[#FB8C0011] border-[#FB8C0022]"
              }`}>
                <span className={`text-xs font-bold ${assignment.status === "picked_up" ? "text-[#29B6F6]" : "text-[#FB8C00]"}`}>
                  {STATUS_LABEL[assignment.status]}
                </span>
                <span className="text-[#E8920C] font-bold text-sm">طلب #{order.dailyNumber}</span>
              </div>

              <div className="p-4 space-y-3">
                {/* Customer info */}
                <div className="space-y-2">
                  <p className="text-white font-bold text-base">{order.customerName}</p>
                  <a href={`tel:${order.customerPhone}`}
                    className="text-[#29B6F6] text-sm flex items-center gap-1.5">
                    📞 {order.customerPhone}
                  </a>
                  {order.customerAddress && (
                    <a
                      href={order.customerAddress.startsWith("http")
                        ? order.customerAddress
                        : `https://maps.google.com/?q=${encodeURIComponent(order.customerAddress)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-[#0A2A0A] rounded-xl p-2.5 text-[#4CAF50] text-sm hover:bg-[#0A3A0A] transition-colors">
                      📍 {order.customerAddress.startsWith("http") ? "افتح الموقع على الخريطة" : order.customerAddress}
                    </a>
                  )}
                </div>

                {/* Map iframe — only when picked_up */}
                {assignment.status === "picked_up" && (
                  <div className="rounded-xl overflow-hidden border border-[#29B6F633]" style={{ height: 180 }}>
                    <iframe src={`/api/map/${assignment.orderId}`}
                      className="w-full h-full border-0" title="خريطة التتبع" />
                  </div>
                )}

                {/* Items */}
                <div className="bg-[#0F0A05] rounded-xl p-3 space-y-1.5">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-white">×{item.quantity} {item.name}</span>
                      <span className="text-[#999]">{(item.price * item.quantity * getOrderPriceFactor(order)).toFixed(2)} ر.س</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1.5 border-t border-[#333] text-[#E8920C] font-bold">
                    <span>الإجمالي</span>
                    <span>{(order.totalPrice / 100).toFixed(2)} ر.س</span>
                  </div>
                </div>

                {order.notes && (
                  <div className="bg-[#2A1508] rounded-xl p-3 text-[#E8920C] text-sm">
                    📝 {order.notes}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  {assignment.status === "assigned" && (
                    <div className="bg-[#1A1208] rounded-xl p-3 text-center border border-[#FB8C0033]">
                      <p className="text-[#FB8C00] text-sm font-bold">🏠 بانتظار الاستلام من المطعم</p>
                      <p className="text-[#FB8C0066] text-[11px] mt-1">سيتم إشعارك عند جاهزية التسليم</p>
                    </div>
                  )}

                  {assignment.status === "picked_up" && (
                    <>
                      {/* GPS toggle */}
                      <button onClick={() => toggleLocation(assignment.orderId)}
                        className={`w-full rounded-xl p-3 border flex items-center justify-between transition-colors ${
                          locationEnabled && !locationError
                            ? "bg-[#0A1F2A] border-[#29B6F655]"
                            : locationError
                            ? "bg-[#2A1A1A] border-[#E5737355]"
                            : "bg-[#1A1A1A] border-[#33333355]"
                        }`}>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${
                            locationEnabled
                              ? locationError ? "text-[#E57373]" : "text-[#29B6F6]"
                              : "text-[#666]"
                          }`}>
                            {locationEnabled
                              ? locationError ? "تعذّر الوصول للموقع" : "📡 مشاركة موقعك مفعّلة"
                              : "مشاركة الموقع مُعطَّلة"}
                          </p>
                          <p className={`text-[11px] ${
                            locationEnabled
                              ? locationError ? "text-[#E5737366]" : "text-[#29B6F666]"
                              : "text-[#444]"
                          }`}>
                            {locationEnabled && !locationError
                              ? "يُرسَل للعميل تلقائياً كل 8 ثوانٍ"
                              : locationError
                              ? "تحقق من صلاحية الموقع في المتصفح"
                              : "اضغط لتفعيل"}
                          </p>
                        </div>
                        <div className={`w-12 h-6 rounded-full flex items-center px-0.5 transition-colors ${
                          locationEnabled && !locationError ? "bg-[#29B6F6] justify-end" : "bg-[#333] justify-start"
                        }`}>
                          <div className="w-5 h-5 bg-white rounded-full shadow" />
                        </div>
                      </button>

                      {/* Deliver button */}
                      <button
                        onClick={() => { setCashConfirmed(false); setPendingDelivery({ orderId: assignment.orderId, total: order.totalPrice / 100, name: order.customerName }); }}
                        disabled={updating === assignment.orderId}
                        className="w-full bg-[#1A3A1A] hover:bg-[#1F4A1F] disabled:opacity-60 border border-[#43A047] rounded-xl py-3 text-[#4CAF50] font-bold transition-colors">
                        {updating === assignment.orderId ? "جاري التحديث..." : "✅ تم التسليم للعميل"}
                      </button>
                    </>
                  )}

                  {/* Chat + call */}
                  <div className="flex gap-2">
                    <button onClick={() => openChat(assignment.orderId)}
                      className="flex-1 bg-[#0A1F2A] border border-[#29B6F655] rounded-xl py-2.5 text-[#29B6F6] font-bold text-sm flex items-center justify-center gap-2 relative">
                      💬 محادثة
                      {(() => {
                        const n = convos.find(c => c.orderId === assignment.orderId)?.unread ?? 0;
                        return n > 0 ? (
                          <span className="absolute top-1 left-2 bg-red-500 text-white text-[9px] rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-1">{n}</span>
                        ) : null;
                      })()}
                    </button>
                    <a href={`tel:${order.customerPhone}`}
                      className="flex-1 bg-[#0A2A0A] border border-[#4CAF5033] rounded-xl py-2.5 text-[#4CAF50] font-bold text-sm flex items-center justify-center gap-2">
                      📞 اتصال
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delivered ────────────────────────────────────────────────────────── */}
      {activeView === "delivered" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-10">
          {deliveredRows.length === 0 && (
            <div className="flex flex-col items-center pt-20 gap-4 text-center">
              <span className="text-6xl">📦</span>
              <p className="text-[#666] font-semibold">لا يوجد طلبات مسلّمة بعد</p>
            </div>
          )}
          {deliveredRows.length > 0 && (
            <div className="bg-[#0A2A0A] border border-[#4CAF5033] rounded-xl p-4 flex justify-around items-center">
              <div className="text-center">
                <p className="text-[#4CAF50] font-bold text-3xl">{deliveredRows.length}</p>
                <p className="text-[#4CAF5066] text-xs">طلب مسلّم</p>
              </div>
              <div className="w-px h-10 bg-[#4CAF5033]" />
              <div className="text-center">
                <p className="text-[#4CAF50] font-bold text-2xl">
                  {deliveredRows.reduce((s, r) => s + (r.order?.totalPrice ?? 0) / 100, 0).toFixed(2)}
                </p>
                <p className="text-[#4CAF5066] text-xs">ريال محصّل</p>
              </div>
            </div>
          )}
          {deliveredRows.map(({ assignment, order }) => order && (
            <div key={assignment.orderId} className="bg-[#1A1208] border border-[#4CAF5022] rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[#4CAF50] font-bold text-sm">{order.customerName}</p>
                <p className="text-[#666] text-xs">
                  {assignment.deliveredAt
                    ? new Date(assignment.deliveredAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
              <div className="text-left">
                <p className="text-[#E8920C] font-bold">{(order.totalPrice / 100).toFixed(2)} ر.س</p>
                <p className="text-[#666] text-[11px]">طلب #{order.dailyNumber}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────────────── */}
      {activeView === "messages" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-10">
          {convos.length === 0 && (
            <div className="flex flex-col items-center pt-20 gap-4 text-center">
              <span className="text-6xl">💬</span>
              <p className="text-[#666] font-semibold">لا توجد محادثات بعد</p>
            </div>
          )}
          {convos.map(c => (
            <button key={c.orderId} onClick={() => openChat(c.orderId)}
              className="w-full bg-[#1A1208] border border-[#E8920C22] rounded-xl p-3 flex items-center justify-between hover:border-[#E8920C55] transition-colors text-right">
              <div className="flex-1">
                <p className="text-white font-bold text-sm">طلب #{c.order?.dailyNumber ?? c.orderId}</p>
                <p className="text-[#666] text-xs truncate max-w-[200px]">{c.lastText}</p>
              </div>
              {c.unread > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                  {c.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Statement ────────────────────────────────────────────────────────── */}
      {activeView === "statement" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-10">
          <div className="flex gap-2 flex-wrap">
            {([
              { key: "today"   as Period, label: "اليوم"   },
              { key: "month"   as Period, label: "الشهر"   },
              { key: "year"    as Period, label: "العام"   },
              { key: "history" as Period, label: "السجل"   },
            ]).map(p => (
              <button key={p.key} onClick={() => setStmtPeriod(p.key)}
                className={`rounded-xl px-4 py-1.5 text-xs font-bold border transition-all ${
                  stmtPeriod === p.key
                    ? "bg-[#E8920C] text-[#1A0A00] border-[#E8920C]"
                    : "bg-[#1A1208] text-[#E8920C] border-[#E8920C33] hover:border-[#E8920C66]"
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {stmtLoading ? (
            <div className="flex justify-center pt-8">
              <div className="w-8 h-8 border-2 border-[#E8920C] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !statement ? (
            <button onClick={loadStatement}
              className="w-full bg-[#1A1208] border border-[#E8920C33] rounded-xl py-4 text-[#E8920C] font-bold">
              تحميل كشف الحساب
            </button>
          ) : (
            <>
              {(() => {
                const d = stmtPeriod === "today" ? statement.today
                        : stmtPeriod === "month" ? statement.thisMonth
                        : stmtPeriod === "year"  ? statement.thisYear
                        :                          statement.allTime;
                return (
                  <div className="bg-[#1A1208] border border-[#E8920C33] rounded-2xl p-4 grid grid-cols-2 gap-3">
                    {[
                      { label: "طلبات مكتملة",  value: String(d.ordersCount),              color: "text-[#4CAF50]" },
                      { label: "إجمالي المحصّل", value: `${d.totalCollected.toFixed(2)} ر.س`, color: "text-[#E8920C]" },
                      { label: "نقدي",           value: `${d.cashCollected.toFixed(2)} ر.س`,  color: "text-[#FB8C00]" },
                      { label: "إلكتروني",       value: `${d.electronicCollected.toFixed(2)} ر.س`, color: "text-[#29B6F6]" },
                      { label: "ملغاة",          value: String(d.cancelledCount),            color: "text-[#E57373]" },
                    ].map(item => (
                      <div key={item.label} className="bg-[#0F0A05] rounded-xl p-3">
                        <p className="text-[#666] text-[11px]">{item.label}</p>
                        <p className={`font-bold text-base ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {stmtPeriod === "history" && statement.daily.map(day => (
                <div key={day.date} className="bg-[#1A1208] border border-[#E8920C22] rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                    className="w-full flex items-center justify-between px-4 py-3">
                    <span className="text-[#E8920C] font-bold text-sm">{day.date}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#4CAF50] text-sm">{day.ordersCount} طلب</span>
                      <span className="text-[#E8920C] text-sm">{day.totalCollected.toFixed(2)} ر.س</span>
                      <span className="text-[#666] text-xs">{expandedDay === day.date ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expandedDay === day.date && day.orders.map((o, i) => (
                    <div key={i} className={`flex justify-between px-4 py-2.5 border-t border-[#E8920C11] ${o.cancelled ? "opacity-40" : ""}`}>
                      <div>
                        <span className="text-white text-sm">{o.customerName}</span>
                        {o.dailyNumber != null && <span className="text-[#666] text-xs mr-2">#{o.dailyNumber}</span>}
                        {o.cancelled && <span className="text-red-400 text-[10px] mr-2">ملغي</span>}
                      </div>
                      <span className={`font-bold text-sm ${o.cancelled ? "text-[#666]" : "text-[#4CAF50]"}`}>
                        {o.totalPrice.toFixed(2)} ر.س
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              <button onClick={loadStatement}
                className="w-full text-center text-xs text-[#666] border border-[#333] rounded-xl py-2.5 hover:text-[#999] transition-colors">
                🔄 تحديث الكشف
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Root export
// ═══════════════════════════════════════════════════════════════════════════════
export default function MandoobPortal() {
  const [driver, setDriver] = useState<Driver | null>(null);
  if (!driver) return <LoginScreen onLogin={setDriver} />;
  return <DriverHome driver={driver} onLogout={() => setDriver(null)} />;
}
