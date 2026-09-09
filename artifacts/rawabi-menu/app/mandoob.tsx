import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, StatusBar, Platform, RefreshControl, Image, Alert, Modal, Vibration, KeyboardAvoidingView, Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiPost, apiGet, apiPut, API_BASE } from "@/constants/api";
import { MapWebView } from "@/components/MapWebView";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Audio } from "expo-av";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationDisclosureModal } from "@/components/LocationDisclosureModal";

const LOCATION_DISCLOSURE_KEY = "driver_location_disclosure_accepted_v1";

// ── Background location task ─────────────────────────────────────────────────
// Must be defined at module level (top of file), outside any component.
const BG_LOCATION_TASK = "DRIVER_BG_LOCATION";

// Module-level refs shared with the task callback (survives component re-mounts)
let _bgOrderId: number | null = null;

if (!TaskManager.isTaskDefined(BG_LOCATION_TASK)) {
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error || !data?.locations?.length || _bgOrderId === null) return;
    const { latitude, longitude } = data.locations[0].coords;
    try {
      await fetch(`${API_BASE}/api/orders/${_bgOrderId}/driver-location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: latitude, lng: longitude }),
      });
    } catch {}
  });
}

const ORDER_SOUND   = require("../assets/sounds/notification_loop.wav");
const MESSAGE_SOUND = require("../assets/sounds/notification.wav");

const F = { regular: "Cairo_400Regular", semi: "Cairo_600SemiBold", bold: "Cairo_700Bold", extra: "Cairo_800ExtraBold" };

interface Driver { id: number; name: string; phone: string; photoUrl: string | null; active: boolean; }
interface OrderItem { id: string; name: string; price: number; quantity: number; }
interface Order { id: number; dailyNumber: number; customerName: string; customerPhone: string; customerAddress: string | null; items: OrderItem[]; totalPrice: number; status: string; notes: string | null; createdAt: string; }
interface Assignment { orderId: number; driverId: number; status: string; assignedAt: string; pickedUpAt: string | null; deliveredAt: string | null; }
interface Row { assignment: Assignment; order: Order | null; }

function LoginScreen({ onLogin }: { onLogin: (driver: Driver) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!phone.trim() || !pin.trim()) { setError("أدخل رقم الجوال والرقم السري"); return; }
    setLoading(true);
    setError("");
    try {
      const driver = await apiPost<Driver>("/drivers/login", { phone: phone.trim(), pin: pin.trim() });
      onLogin(driver);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "تعذر تسجيل الدخول");
    }
    setLoading(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 60 : insets.top }}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 16, alignSelf: "flex-end" }}>
        <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 24 }}>
        <Text style={{ fontSize: 56 }}>🛵</Text>
        <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 26, textAlign: "center" }}>
          بوابة المناديب
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center" }}>
          سلة الخضار — دخول المناديب
        </Text>

        <View style={{ width: "100%", gap: 12 }}>
          <TextInput
            value={phone}
            onChangeText={(t) => { setPhone(t); setError(""); }}
            placeholder="رقم الجوال"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, color: colors.foreground, fontFamily: F.bold, fontSize: 16, textAlign: "center", borderWidth: 1, borderColor: colors.border }}
          />
          <TextInput
            value={pin}
            onChangeText={(t) => { setPin(t); setError(""); }}
            placeholder="الرقم السري"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, color: colors.foreground, fontFamily: F.bold, fontSize: 22, textAlign: "center", letterSpacing: 10, borderWidth: 1, borderColor: error ? "#E53935" : colors.border }}
          />
          {error ? <Text style={{ color: "#E53935", fontFamily: F.semi, fontSize: 13, textAlign: "center" }}>{error}</Text> : null}
        </View>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          style={{ backgroundColor: "#E8920C", borderRadius: 16, paddingVertical: 16, width: "100%", alignItems: "center", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <ActivityIndicator color="#1A0A00" /> : <Text style={{ color: "#1A0A00", fontFamily: F.extra, fontSize: 17 }}>دخول 🚗</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DriverHome({ driver, onLogout }: { driver: Driver; onLogout: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [bgPermDenied, setBgPermDenied] = useState(false);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(true);
  const locationSharingEnabledRef = useRef(true);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const locationDisclosureAcceptedRef = useRef(false);
  const pendingDisclosureOrderIdRef = useRef<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LOCATION_DISCLOSURE_KEY).then((v) => {
      locationDisclosureAcceptedRef.current = v === "true";
    }).catch(() => {});
  }, []);

  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingDelivery, setPendingDelivery] = useState<{ orderId: number; total: number; customerName: string } | null>(null);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [activeView, setActiveView] = useState<"waiting" | "delivered" | "statement" | "messages">("waiting");

  // ── Driver chat ────────────────────────────────────────────────────────────
  interface DriverConvo { orderId: number; lastText: string; fromDriver: boolean; lastAt: string; unread: number; order: { id: number; dailyNumber: number; customerName: string; customerPhone: string } | null; }
  interface DriverMsg { id: number; orderId: number; text: string; fromCashier: boolean; driverId: number | null; createdAt: string; readAt: string | null; }
  const [driverConvos, setDriverConvos]   = useState<DriverConvo[]>([]);
  const [chatOrderId, setChatOrderId]     = useState<number | null>(null);
  const [chatMessages, setChatMessages]   = useState<DriverMsg[]>([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatSending, setChatSending]     = useState(false);
  const [chatLoading, setChatLoading]     = useState(false);
  const chatScrollRef                      = useRef<ScrollView>(null);
  const msgsPollRef                        = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownConvoUnreads                  = useRef<Map<number, number>>(new Map());
  const msgSoundEnabled                    = useRef(false);
  const playMessageSoundRef                = useRef<() => void>(() => {});

  const loadDriverConvos = useCallback(async (silent = false) => {
    try {
      const data = await apiGet<DriverConvo[]>(`/messages/driver/${driver.id}/conversations`);
      if (silent && msgSoundEnabled.current) {
        for (const c of data) {
          const prev = knownConvoUnreads.current.get(c.orderId) ?? 0;
          if (c.unread > prev) {
            playMessageSoundRef.current();
            if (Platform.OS === "web" && typeof document !== "undefined") {
              const prevTitle = document.title;
              document.title = `💬 رسالة جديدة! | المندوب`;
              setTimeout(() => { document.title = prevTitle; }, 5000);
            }
            break;
          }
        }
      }
      data.forEach(c => knownConvoUnreads.current.set(c.orderId, c.unread));
      setDriverConvos(data);
    } catch {}
  }, [driver.id]);

  const openDriverChat = useCallback(async (orderId: number) => {
    setChatOrderId(orderId);
    setChatLoading(true);
    setChatMessages([]);
    try {
      const msgs = await apiGet<DriverMsg[]>(`/messages/driver/${driver.id}/order/${orderId}`);
      setChatMessages(msgs);
      setDriverConvos(prev => prev.map(c => c.orderId === orderId ? { ...c, unread: 0 } : c));
    } catch {}
    setChatLoading(false);
  }, [driver.id]);

  const sendDriverMsg = useCallback(async () => {
    if (!chatOrderId || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      const msg = await apiPost<DriverMsg>(`/messages/driver/${driver.id}/order/${chatOrderId}`, { text });
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {} finally { setChatSending(false); }
  }, [chatOrderId, chatInput, driver.id]);

  // Poll conversations every 15s, and active chat every 5s
  useEffect(() => {
    loadDriverConvos(false);
    const initTimer = setTimeout(() => { msgSoundEnabled.current = true; }, 2000);
    msgsPollRef.current = setInterval(() => loadDriverConvos(true), 15000);
    return () => {
      if (msgsPollRef.current) clearInterval(msgsPollRef.current);
      clearTimeout(initTimer);
    };
  }, [loadDriverConvos]);

  useEffect(() => {
    if (!chatOrderId) return;
    const t = setInterval(async () => {
      try {
        const msgs = await apiGet<DriverMsg[]>(`/messages/driver/${driver.id}/order/${chatOrderId}`);
        setChatMessages(msgs);
        setDriverConvos(prev => prev.map(c => c.orderId === chatOrderId ? { ...c, unread: 0 } : c));
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [chatOrderId, driver.id]);

  const totalUnreadMsgs = driverConvos.reduce((s, c) => s + c.unread, 0);

  interface StmtOrder { orderId: number; dailyNumber: number | null; customerName: string; totalPrice: number; deliveredAt: string; }
  interface StmtPeriod { ordersCount: number; totalCollected: number; }
  interface StmtDay { date: string; ordersCount: number; totalCollected: number; orders: StmtOrder[]; }
  interface Statement { today: StmtPeriod; thisMonth: StmtPeriod; thisYear: StmtPeriod; allTime: StmtPeriod; daily: StmtDay[]; }
  const [statement, setStatement] = useState<Statement | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [stmtPeriod, setStmtPeriod] = useState<"today" | "month" | "year" | "history">("today");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await apiGet<Statement>(`/drivers/${driver.id}/statement`);
      setStatement(data);
    } catch {}
    setSummaryLoading(false);
  }, [driver.id]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const trackedOrderRef = useRef<number | null>(null);
  const soundEnabled = useRef(false);
  const knownAssignmentIds = useRef<Set<number>>(new Set());

  const playOrderSound = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        Vibration.vibrate([0, 300, 150, 300]);
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
          const { sound } = await Audio.Sound.createAsync(ORDER_SOUND, { shouldPlay: true, volume: 1.0 });
          sound.setOnPlaybackStatusUpdate((s) => {
            if (s.isLoaded && s.didJustFinish) sound.unloadAsync().catch(() => {});
          });
        } catch { /* silent fallback */ }
        return;
      }
      try {
        const audio = new (window as any).Audio();
        audio.src = "/assets/sounds/notification_loop.wav";
        audio.volume = 1.0;
        await audio.play();
        return;
      } catch {}
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.2;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.start(start); osc.stop(start + 0.35);
      });
    } catch { /* silent */ }
  }, []);

  const playMessageSound = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        Vibration.vibrate([0, 200, 100, 200]);
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
          const { sound } = await Audio.Sound.createAsync(MESSAGE_SOUND, { shouldPlay: true, volume: 1.0 });
          sound.setOnPlaybackStatusUpdate((s) => {
            if (s.isLoaded && s.didJustFinish) sound.unloadAsync().catch(() => {});
          });
        } catch { /* silent fallback */ }
        return;
      }
      try {
        const audio = new (window as any).Audio();
        audio.src = "/assets/sounds/notification.wav";
        audio.volume = 1.0;
        await audio.play();
        return;
      } catch {}
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [880, 1108, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
        osc.start(start); osc.stop(start + 0.3);
      });
    } catch { /* silent */ }
  }, []);

  // Keep ref in sync so loadDriverConvos can call it without circular deps
  useEffect(() => { playMessageSoundRef.current = playMessageSound; }, [playMessageSound]);

  // ── Schedule a system notification (works outside / background) ────────────
  const fireOrderNotification = useCallback(async (orderNum: number, customerName: string) => {
    try {
      // Request permission if needed (no-op if already granted)
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🛵 طلب جديد!",
          body: `طلب #${orderNum}${customerName ? ` — ${customerName}` : ""}`,
          sound: Platform.OS === "android" ? "notification_loop" : "notification_loop.wav",
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 300, 150, 300],
        },
        trigger: null,
      });
    } catch { /* silent */ }
  }, []);

  const sendLocation = useCallback(async (orderId: number, lat: number, lng: number) => {
    setDriverCoords({ lat, lng });
    try { await apiPut(`/orders/${orderId}/driver-location`, { lat, lng }); } catch {}
  }, []);

  const stopGPS = useCallback(async () => {
    setSharingLocation(false);
    setLocationError(false);
    setBgPermDenied(false);
    trackedOrderRef.current = null;
    _bgOrderId = null;
    if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    if (locationSubRef.current) { locationSubRef.current.remove(); locationSubRef.current = null; }
    if (Platform.OS !== "web") {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
        if (running) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
      } catch {}
    }
  }, []);

  const startGPS = useCallback(async (orderId: number) => {
    if (trackedOrderRef.current === orderId) return;

    if (Platform.OS !== "web" && !locationDisclosureAcceptedRef.current) {
      pendingDisclosureOrderIdRef.current = orderId;
      setShowLocationDisclosure(true);
      return;
    }

    await stopGPS();
    trackedOrderRef.current = orderId;
    setLocationError(false);

    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const onSuccess = (p: GeolocationPosition) => {
          setSharingLocation(true);
          setLocationError(false);
          sendLocation(orderId, p.coords.latitude, p.coords.longitude);
        };
        const onError = () => {
          setSharingLocation(false);
          setLocationError(true);
        };
        const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 };
        navigator.geolocation.getCurrentPosition(onSuccess, onError, opts);
        gpsIntervalRef.current = setInterval(
          () => navigator.geolocation.getCurrentPosition(onSuccess, onError, opts),
          8000,
        );
      } else {
        setLocationError(true);
      }
    } else {
      // Request foreground permission first
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== "granted") { setLocationError(true); return; }

      // Request background permission so updates continue when app is minimised
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      setBgPermDenied(bgStatus !== "granted");

      // Set module-level order ID for the background task callback
      _bgOrderId = orderId;

      try {
        await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 8000,
          distanceInterval: 20,
          pausesUpdatesAutomatically: false,
          // Android requires a foreground service notification to keep the
          // task alive when the app is backgrounded.
          foregroundService: {
            notificationTitle: "سلة الخضار",
            notificationBody: "يتم إرسال موقعك للعميل أثناء التوصيل",
            notificationColor: "#E8920C",
          },
          // showsBackgroundLocationIndicator shows the blue bar on iOS
          showsBackgroundLocationIndicator: true,
          // Warn developer if background permission was not granted
          ...(bgStatus !== "granted" && { activityType: Location.ActivityType.AutomotiveNavigation }),
        });
        setSharingLocation(true);
      } catch {
        // Fall back to foreground-only watchPositionAsync if background task fails
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 20 },
          (loc) => {
            setLocationError(false);
            sendLocation(orderId, loc.coords.latitude, loc.coords.longitude);
          },
        );
        locationSubRef.current = sub;
        setSharingLocation(true);
      }
    }
  }, [sendLocation, stopGPS]);

  const toggleLocationSharing = useCallback(async (orderId: number) => {
    const next = !locationSharingEnabledRef.current;
    locationSharingEnabledRef.current = next;
    setLocationSharingEnabled(next);
    if (next) {
      await startGPS(orderId);
    } else {
      await stopGPS();
    }
  }, [startGPS, stopGPS]);

  const handleDisclosureContinue = useCallback(async () => {
    locationDisclosureAcceptedRef.current = true;
    setShowLocationDisclosure(false);
    try { await AsyncStorage.setItem(LOCATION_DISCLOSURE_KEY, "true"); } catch {}
    const orderId = pendingDisclosureOrderIdRef.current;
    pendingDisclosureOrderIdRef.current = null;
    if (orderId !== null) await startGPS(orderId);
  }, [startGPS]);

  const handleDisclosureCancel = useCallback(() => {
    setShowLocationDisclosure(false);
    pendingDisclosureOrderIdRef.current = null;
    locationSharingEnabledRef.current = false;
    setLocationSharingEnabled(false);
  }, []);

  useEffect(() => {
    const pickedUp = rows.find(r => r.assignment.status === "picked_up");
    if (pickedUp) {
      if (locationSharingEnabledRef.current) {
        startGPS(pickedUp.assignment.orderId);
      }
    } else {
      stopGPS();
      locationSharingEnabledRef.current = true;
      setLocationSharingEnabled(true);
    }
  }, [rows, startGPS, stopGPS]);

  useEffect(() => { return () => { stopGPS(); }; }, [stopGPS]);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGet<Row[]>(`/drivers/${driver.id}/orders`);

      if (silent && soundEnabled.current) {
        const newOnes = data.filter((r) => !knownAssignmentIds.current.has(r.assignment.orderId));
        if (newOnes.length > 0) {
          // Play sound in-app
          playOrderSound();
          // Fire system notification (audible even outside the app)
          for (const r of newOnes) {
            const orderNum = r.order?.dailyNumber ?? r.assignment.orderId;
            const customerName = r.order?.customerName ?? "";
            fireOrderNotification(orderNum, customerName);
          }
          // Update browser tab title on web
          if (Platform.OS === "web" && typeof document !== "undefined") {
            const prev = document.title;
            document.title = `🔔 طلب جديد! | المندوب`;
            setTimeout(() => { document.title = prev; }, 5000);
          }
        }
      }

      data.forEach((r) => knownAssignmentIds.current.add(r.assignment.orderId));
      setRows(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [driver.id, playOrderSound, fireOrderNotification]);

  useEffect(() => {
    loadOrders();
    const initTimer = setTimeout(() => { soundEnabled.current = true; }, 2000);
    pollRef.current = setInterval(() => loadOrders(true), 15000);
    return () => {
      clearInterval(pollRef.current!);
      clearTimeout(initTimer);
    };
  }, [loadOrders]);

  const updateStatus = async (orderId: number, status: "picked_up" | "delivered") => {
    setUpdating(orderId);
    try {
      await apiPut(`/orders/${orderId}/driver-status`, { status });
      await loadOrders(true);
    } catch { Alert.alert("خطأ", "تعذّر تحديث الحالة"); }
    setUpdating(null);
  };

  const waitingRows  = rows.filter((r) => r.assignment.status === "assigned" || r.assignment.status === "picked_up");
  const deliveredRows = rows.filter((r) => r.assignment.status === "delivered");

  const statusLabel: Record<string, string> = { assigned: "بانتظار الاستلام من المطعم", picked_up: "🚗 في الطريق — انتظار التسليم", delivered: "تم التسليم ✅" };
  const statusColor: Record<string, string> = { assigned: "#FB8C00", picked_up: "#29B6F6", delivered: "#757575" };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 60 : insets.top }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
            {driver.photoUrl
              ? <Image source={{ uri: driver.photoUrl }} style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: "#E8920C" }} />
              : <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#2A1A08", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#E8920C" }}><Text style={{ fontSize: 20 }}>🛵</Text></View>
            }
            <View>
              <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>{driver.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{driver.phone}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => { Alert.alert("تسجيل الخروج", "هل تريد الخروج؟", [{ text: "إلغاء", style: "cancel" }, { text: "خروج", style: "destructive", onPress: onLogout }]); }}>
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        {sharingLocation && !locationError && (
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1B3A1B", paddingVertical: 6, paddingHorizontal: 14 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4CAF50" }} />
            <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 12 }}>📡 موقعك يُرسل للعميل</Text>
          </View>
        )}
        {locationError && (
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#3A1B1B", paddingVertical: 6, paddingHorizontal: 14 }}>
            <Feather name="alert-circle" size={13} color="#E57373" />
            <Text style={{ color: "#E57373", fontFamily: F.semi, fontSize: 12 }}>تعذّر تحديد موقعك — تحقق من صلاحية الموقع</Text>
          </View>
        )}

        {/* Tab bar */}
        <View style={{ flexDirection: "row-reverse", borderTopWidth: 1, borderTopColor: colors.border }}>
          {([
            { key: "waiting",   label: "انتظار",    icon: "clock",          badge: waitingRows.length,   accent: "#E8920C" },
            { key: "messages",  label: "رسائل",     icon: "message-circle", badge: totalUnreadMsgs,      accent: "#29B6F6" },
            { key: "delivered", label: "تسليم",     icon: "check-circle",   badge: deliveredRows.length, accent: "#4CAF50" },
            { key: "statement", label: "حساب",      icon: "dollar-sign",    badge: 0,                    accent: "#E8920C" },
          ] as const).map(tab => {
            const active = activeView === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => { setActiveView(tab.key); if (tab.key === "statement") loadSummary(); }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: active ? tab.accent : "transparent", gap: 3 }}
              >
                <View style={{ position: "relative" }}>
                  <Feather name={tab.icon} size={18} color={active ? tab.accent : colors.mutedForeground} />
                  {tab.badge > 0 && (
                    <View style={{ position: "absolute", top: -5, right: -8, backgroundColor: active ? tab.accent : "#555", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
                      <Text style={{ color: "#fff", fontSize: 9, fontFamily: F.bold }}>{tab.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: active ? tab.accent : colors.mutedForeground, fontFamily: active ? F.bold : F.regular, fontSize: 10 }}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Cash collection confirmation modal ── */}
      <Modal
        visible={!!pendingDelivery}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingDelivery(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 16, paddingTop: 8 }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 }} />

            {/* Icon */}
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#1A2E1A", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#4CAF5066" }}>
                <Text style={{ fontSize: 40 }}>💵</Text>
              </View>
            </View>

            <Text style={{ color: colors.foreground, fontFamily: F.extra, fontSize: 20, textAlign: "center", marginBottom: 6 }}>
              تأكيد استلام المبلغ
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center", marginBottom: 24, paddingHorizontal: 32 }}>
              قبل تأكيد التسليم، تأكد من استلام المبلغ من العميل
            </Text>

            {/* Amount box */}
            <View style={{ marginHorizontal: 20, backgroundColor: "#0A2A0A", borderRadius: 16, padding: 20, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#4CAF5033", marginBottom: 20 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 13 }}>
                {pendingDelivery?.customerName}
              </Text>
              <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 36 }}>
                {pendingDelivery?.total} ر.س
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>
                المبلغ المطلوب تحصيله
              </Text>
            </View>

            {/* Checkbox confirm */}
            <TouchableOpacity
              onPress={() => setCashConfirmed(v => !v)}
              style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 20, backgroundColor: cashConfirmed ? "#1A2E1A" : colors.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: cashConfirmed ? "#4CAF5066" : colors.border }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: cashConfirmed ? "#4CAF50" : colors.mutedForeground, backgroundColor: cashConfirmed ? "#4CAF50" : "transparent", alignItems: "center", justifyContent: "center" }}>
                {cashConfirmed && <Feather name="check" size={14} color="#fff" />}
              </View>
              <Text style={{ flex: 1, color: cashConfirmed ? "#4CAF50" : colors.foreground, fontFamily: F.semi, fontSize: 14, textAlign: "right" }}>
                نعم، استلمت المبلغ من العميل ✅
              </Text>
            </TouchableOpacity>

            {/* Confirm button */}
            <TouchableOpacity
              disabled={!cashConfirmed || updating === pendingDelivery?.orderId}
              onPress={async () => {
                if (!pendingDelivery) return;
                await updateStatus(pendingDelivery.orderId, "delivered");
                setPendingDelivery(null);
              }}
              style={{ marginHorizontal: 20, borderRadius: 14, paddingVertical: 15, alignItems: "center", backgroundColor: cashConfirmed ? "#43A047" : colors.secondary, marginBottom: 10 }}
            >
              {updating === pendingDelivery?.orderId
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: cashConfirmed ? "#fff" : colors.mutedForeground, fontFamily: F.extra, fontSize: 16 }}>
                    ✅ تأكيد التسليم
                  </Text>
              }
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              onPress={() => setPendingDelivery(null)}
              style={{ alignItems: "center", paddingVertical: 10 }}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════
           تاب: رسائل العملاء
          ══════════════════════════════════════════ */}
      {activeView === "messages" && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 60 }}>
          {driverConvos.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 80, gap: 14 }}>
              <Text style={{ fontSize: 52 }}>💬</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 15, textAlign: "center" }}>
                لا توجد رسائل من العملاء
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>
                ستظهر هنا رسائل العملاء المعيّنين لك
              </Text>
            </View>
          ) : driverConvos.map(convo => {
            const time = new Date(convo.lastAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
            return (
              <TouchableOpacity
                key={convo.orderId}
                onPress={() => openDriverChat(convo.orderId)}
                style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: convo.unread > 0 ? "#29B6F6" : colors.border, gap: 8 }}
              >
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#0A1F2A", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#29B6F6" }}>
                      <Text style={{ fontSize: 18 }}>👤</Text>
                    </View>
                    <View>
                      <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>
                        {convo.order?.customerName ?? "عميل"}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                        طلب #{convo.order?.dailyNumber ?? convo.orderId}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{time}</Text>
                    {convo.unread > 0 && (
                      <View style={{ backgroundColor: "#29B6F6", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                        <Text style={{ color: "#fff", fontFamily: F.bold, fontSize: 11 }}>{convo.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={{ color: convo.unread > 0 ? colors.foreground : colors.mutedForeground, fontFamily: convo.unread > 0 ? F.semi : F.regular, fontSize: 13, textAlign: "right" }} numberOfLines={1}>
                  {convo.fromDriver ? "أنت: " : ""}{convo.lastText}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Chat modal (driver ↔ customer) ── */}
      {chatOrderId !== null && (() => {
        const convo = driverConvos.find(c => c.orderId === chatOrderId);
        return (
          <Modal visible animationType="slide" onRequestClose={() => setChatOrderId(null)}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
              <View style={{ flex: 1, backgroundColor: colors.background }}>
                {/* Header */}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: (Platform.OS === "web" ? 20 : insets.top) + 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#0A1F2A" }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                    <TouchableOpacity onPress={() => { setChatOrderId(null); loadDriverConvos(); }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="arrow-right" size={20} color={colors.foreground} />
                    </TouchableOpacity>
                    <View>
                      <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>
                        {convo?.order?.customerName ?? "عميل"}
                      </Text>
                      <Text style={{ color: "#29B6F6", fontFamily: F.regular, fontSize: 12 }}>
                        طلب #{convo?.order?.dailyNumber ?? chatOrderId}
                      </Text>
                    </View>
                  </View>
                  {convo?.order?.customerPhone ? (
                    <TouchableOpacity
                      onPress={() => { const p = convo.order!.customerPhone; if (Platform.OS === "web") window.open(`tel:${p}`); else import("react-native").then(({ Linking }) => Linking.openURL(`tel:${p}`)); }}
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#1A3A20", borderWidth: 1.5, borderColor: "#4CAF50", alignItems: "center", justifyContent: "center" }}
                    >
                      <Feather name="phone" size={17} color="#4CAF50" />
                    </TouchableOpacity>
                  ) : <View style={{ width: 36 }} />}
                </View>

                {/* Messages */}
                <ScrollView
                  ref={chatScrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 14, gap: 10 }}
                  onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
                >
                  {chatLoading ? (
                    <ActivityIndicator size="large" color="#29B6F6" style={{ margin: 40 }} />
                  ) : chatMessages.length === 0 ? (
                    <View style={{ alignItems: "center", padding: 40, gap: 14 }}>
                      <Text style={{ fontSize: 48 }}>💬</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 14, textAlign: "center" }}>
                        لا توجد رسائل بعد
                      </Text>
                    </View>
                  ) : chatMessages.map(msg => {
                    const isDriver = msg.fromCashier;
                    const time = new Date(msg.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <View key={msg.id} style={{ alignItems: isDriver ? "flex-start" : "flex-end" }}>
                        <View style={{ maxWidth: "80%", backgroundColor: isDriver ? "#0A1F2A" : "#2A1800", borderRadius: 18, borderTopRightRadius: isDriver ? 18 : 4, borderTopLeftRadius: isDriver ? 4 : 18, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: isDriver ? "#29B6F6" + "55" : colors.gold + "55" }}>
                          <Text style={{ color: isDriver ? "#29B6F6" : colors.gold, fontFamily: F.semi, fontSize: 14, textAlign: isDriver ? "left" : "right" }}>{msg.text}</Text>
                          <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 10, marginTop: 4, textAlign: isDriver ? "left" : "right" }}>
                            {time}{isDriver ? " • أنت" : " • العميل"}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Input */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
                  <TouchableOpacity
                    onPress={sendDriverMsg}
                    disabled={chatSending || !chatInput.trim()}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatInput.trim() ? "#29B6F6" : colors.secondary, alignItems: "center", justifyContent: "center" }}
                  >
                    {chatSending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={18} color={chatInput.trim() ? "#fff" : colors.mutedForeground} />}
                  </TouchableOpacity>
                  <TextInput
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="اكتب ردك…"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, backgroundColor: colors.background, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: colors.foreground, fontFamily: F.regular, fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: "right" }}
                    onSubmitEditing={sendDriverMsg}
                    returnKeyType="send"
                    multiline
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      {/* ── كشف الحساب view ── */}
      {activeView === "statement" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {summaryLoading && <ActivityIndicator color="#E8920C" style={{ marginTop: 40 }} />}

          {!summaryLoading && !statement && (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 10 }}>
              <Text style={{ fontSize: 44 }}>📊</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>اسحب للتحميل</Text>
            </View>
          )}

          {!summaryLoading && statement && (<>

            {/* Period tab bar */}
            <View style={{ flexDirection: "row-reverse", backgroundColor: colors.card, borderRadius: 14, padding: 4, gap: 3, borderWidth: 1, borderColor: colors.border }}>
              {([
                { key: "today",   label: "اليوم"  },
                { key: "month",   label: "الشهر"  },
                { key: "year",    label: "السنة"  },
                { key: "history", label: "السجل"  },
              ] as const).map(tab => {
                const active = stmtPeriod === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setStmtPeriod(tab.key)}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: active ? "#E8920C" : "transparent" }}
                  >
                    <Text style={{ color: active ? "#fff" : colors.mutedForeground, fontFamily: active ? F.bold : F.regular, fontSize: 13 }}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Period summary cards ── */}
            {stmtPeriod !== "history" && (() => {
              const p = stmtPeriod === "today" ? statement.today
                      : stmtPeriod === "month" ? statement.thisMonth
                      : statement.thisYear;
              const label = stmtPeriod === "today" ? new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })
                          : stmtPeriod === "month" ? new Date().toLocaleDateString("ar-SA", { month: "long", year: "numeric" })
                          : String(new Date().getFullYear());
              return (
                <>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "center" }}>{label}</Text>

                  {/* Big stats */}
                  <View style={{ flexDirection: "row-reverse", gap: 12 }}>
                    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: "#E8920C44", padding: 18, alignItems: "center", gap: 8 }}>
                      <Feather name="package" size={22} color="#E8920C" />
                      <Text style={{ fontSize: 38, fontFamily: F.extra, color: "#E8920C", lineHeight: 44 }}>{p.ordersCount}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13, textAlign: "center" }}>طلبات سُلِّمت</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: "#4CAF5044", padding: 18, alignItems: "center", gap: 8 }}>
                      <Feather name="dollar-sign" size={22} color="#4CAF50" />
                      <Text style={{ fontSize: 30, fontFamily: F.extra, color: "#4CAF50", lineHeight: 36 }}>{p.totalCollected.toFixed(2)}</Text>
                      <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 11 }}>ريال سعودي</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12, textAlign: "center" }}>إجمالي المحصّل</Text>
                    </View>
                  </View>

                  {/* All-time mini stat */}
                  <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                      <Feather name="award" size={16} color="#E8920C" />
                      <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>إجمالي كل الأوقات</Text>
                    </View>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                      <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 15 }}>{statement.allTime.totalCollected.toFixed(2)}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>ر  ({statement.allTime.ordersCount} طلب)</Text>
                    </View>
                  </View>

                  {/* Today's orders list — only for "today" tab */}
                  {stmtPeriod === "today" && (() => {
                    const todayKey = new Date().toISOString().slice(0, 10);
                    const todayDay = statement.daily.find(d => d.date === todayKey);
                    if (!todayDay || todayDay.orders.length === 0) return (
                      <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                        <Text style={{ fontSize: 36 }}>📭</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>لا يوجد طلبات مسلّمة اليوم بعد</Text>
                      </View>
                    );
                    return (
                      <View style={{ gap: 8 }}>
                        <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14, textAlign: "right" }}>تفاصيل اليوم</Text>
                        {todayDay.orders.map(ord => {
                          const time = new Date(ord.deliveredAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                          return (
                            <View key={ord.orderId} style={{ backgroundColor: colors.card, borderRadius: 13, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                              <View style={{ gap: 3 }}>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                                  <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 }}>
                                    <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 12 }}>#{ord.dailyNumber ?? ord.orderId}</Text>
                                  </View>
                                  <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{ord.customerName}</Text>
                                </View>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                                  <Feather name="clock" size={10} color={colors.mutedForeground} />
                                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{time}</Text>
                                </View>
                              </View>
                              <View style={{ alignItems: "flex-end" }}>
                                <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>{ord.totalPrice.toFixed(2)}</Text>
                                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>ريال</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </>
              );
            })()}

            {/* ── History tab — daily log ── */}
            {stmtPeriod === "history" && (<>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12, textAlign: "center" }}>
                سجل الأيام ({statement.daily.length} يوم)
              </Text>

              {statement.daily.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                  <Text style={{ fontSize: 44 }}>📭</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 14 }}>لا يوجد سجل بعد</Text>
                </View>
              )}

              {statement.daily.map(day => {
                const isExpanded = expandedDay === day.date;
                const dayDate = new Date(day.date + "T12:00:00");
                const dayLabel = dayDate.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <View key={day.date} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: isToday ? "#E8920C55" : colors.border, overflow: "hidden" }}>
                    {/* Day header — tap to expand */}
                    <TouchableOpacity
                      onPress={() => setExpandedDay(isExpanded ? null : day.date)}
                      style={{ flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 10 }}
                    >
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                          {isToday && (
                            <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 10 }}>اليوم</Text>
                            </View>
                          )}
                          <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 13 }}>{dayLabel}</Text>
                        </View>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                            <Feather name="package" size={11} color={colors.mutedForeground} />
                            <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{day.ordersCount} طلب</Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 17 }}>{day.totalCollected.toFixed(2)}</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>ريال</Text>
                      </View>
                      <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>

                    {/* Expanded orders */}
                    {isExpanded && (
                      <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                        {day.orders.map(ord => {
                          const time = new Date(ord.deliveredAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                          return (
                            <View key={ord.orderId} style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + "55" }}>
                              <View style={{ gap: 2 }}>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                                  <View style={{ backgroundColor: "#E8920C22", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                                    <Text style={{ color: "#E8920C", fontFamily: F.extra, fontSize: 11 }}>#{ord.dailyNumber ?? ord.orderId}</Text>
                                  </View>
                                  <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>{ord.customerName}</Text>
                                </View>
                                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                                  <Feather name="clock" size={10} color={colors.mutedForeground} />
                                  <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{time}</Text>
                                </View>
                              </View>
                              <View style={{ alignItems: "flex-end" }}>
                                <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15 }}>{ord.totalPrice.toFixed(2)}</Text>
                                <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 11 }}>ريال</Text>
                              </View>
                            </View>
                          );
                        })}
                        {/* Day total row */}
                        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#4CAF5011" }}>
                          <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 13 }}>إجمالي اليوم</Text>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                            <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>{day.totalCollected.toFixed(2)}</Text>
                            <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 11 }}>ريال</Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </>)}

            {/* Refresh */}
            <TouchableOpacity
              onPress={loadSummary}
              style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: 4 }}
            >
              <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>تحديث الكشف</Text>
            </TouchableOpacity>
          </>)}
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════
           تاب: انتظار التسليم
          ══════════════════════════════════════════ */}
      {activeView === "waiting" && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={colors.gold} />}
          contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 60 }}
        >
          {loading && <ActivityIndicator color="#E8920C" style={{ marginTop: 40 }} />}

          {!loading && waitingRows.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 80, gap: 14 }}>
              <Text style={{ fontSize: 60 }}>🛵</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 15, textAlign: "center" }}>
                لا يوجد طلبات في الانتظار
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>اسحب للتحديث</Text>
            </View>
          )}

          {waitingRows.map(({ assignment, order }) => order && (
            <View key={assignment.orderId} style={{ backgroundColor: colors.card, borderRadius: 18, overflow: "hidden", borderWidth: 1.5, borderColor: statusColor[assignment.status] + "66" }}>

              {/* شريط الحالة */}
              <View style={{ backgroundColor: statusColor[assignment.status] + "22", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: statusColor[assignment.status] + "44" }}>
                <Text style={{ color: statusColor[assignment.status], fontFamily: F.extra, fontSize: 13 }}>{statusLabel[assignment.status]}</Text>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 14 }}>طلب #{order.dailyNumber}</Text>
                  <View style={{ backgroundColor: colors.gold + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: colors.gold, fontFamily: F.bold, fontSize: 11 }}>
                      {new Date(order.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ padding: 16, gap: 12 }}>

                {/* بيانات العميل */}
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <Feather name="user" size={14} color={colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 15 }}>{order.customerName}</Text>
                  </View>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <Feather name="phone" size={14} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 13 }}>{order.customerPhone}</Text>
                  </View>
                  {order.customerAddress && (
                    <TouchableOpacity
                      onPress={() => {
                        const addr = order.customerAddress!;
                        const url = addr.startsWith("https://") || addr.startsWith("http://")
                          ? addr
                          : `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
                        if (Platform.OS === "web") window.open(url);
                        else import("react-native").then(({ Linking }) => Linking.openURL(url));
                      }}
                      style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#0A2A0A", borderRadius: 10, padding: 10 }}
                    >
                      <Feather name="map-pin" size={14} color="#4CAF50" />
                      <Text style={{ color: "#4CAF50", fontFamily: F.semi, fontSize: 13, flex: 1, textAlign: "right" }} numberOfLines={2}>
                        {order.customerAddress.startsWith("https://") || order.customerAddress.startsWith("http://")
                          ? "📍 افتح الموقع على الخريطة"
                          : order.customerAddress}
                      </Text>
                      {(order.customerAddress.startsWith("https://") || order.customerAddress.startsWith("http://")) && (
                        <Feather name="external-link" size={13} color="#4CAF50" />
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* خريطة مصغّرة — تظهر فقط عند الاستلام */}
                {assignment.status === "picked_up" && (() => {
                  const mapUri = Platform.OS === "web"
                    ? `/api/map/${assignment.orderId}`
                    : `${API_BASE}/api/map/${assignment.orderId}`;

                  const openNavigation = () => {
                    const addr = order.customerAddress;
                    let url: string;
                    if (!addr) {
                      url = "https://maps.google.com/";
                    } else if (addr.startsWith("https://") || addr.startsWith("http://")) {
                      url = addr;
                    } else {
                      url = `https://maps.google.com/maps?daddr=${encodeURIComponent(addr)}`;
                    }
                    if (Platform.OS === "web") {
                      window.open(url, "_blank");
                    } else {
                      import("react-native").then(({ Linking }) => Linking.openURL(url));
                    }
                  };

                  return (
                    <View style={{ gap: 6 }}>
                      <View style={{ height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#29B6F633" }}>
                        <MapWebView uri={mapUri} style={{ flex: 1 }} />
                      </View>
                      <TouchableOpacity
                        onPress={openNavigation}
                        activeOpacity={0.8}
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          backgroundColor: "#0A1F2A",
                          borderRadius: 10,
                          paddingVertical: 10,
                          borderWidth: 1,
                          borderColor: "#29B6F633",
                        }}
                      >
                        <Feather name="navigation" size={14} color="#29B6F6" />
                        <Text style={{ color: "#29B6F6", fontFamily: F.semi, fontSize: 13 }}>افتح للتنقل إلى العميل</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}

                {/* المشتريات */}
                <View style={{ backgroundColor: colors.secondary, borderRadius: 10, padding: 10, gap: 4 }}>
                  {order.items.map((item, i) => (
                    <View key={i} style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 13 }}>×{item.quantity} {item.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>{item.price * item.quantity} ر.س</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 14 }}>الإجمالي</Text>
                    <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 14 }}>{(order.totalPrice / 100).toFixed(2)} ر.س</Text>
                  </View>
                </View>

                {order.notes && (
                  <View style={{ flexDirection: "row-reverse", gap: 8, backgroundColor: "#2A1508", borderRadius: 8, padding: 10 }}>
                    <Text style={{ color: "#E8920C", fontFamily: F.regular, fontSize: 12, flex: 1, textAlign: "right" }}>📝 {order.notes}</Text>
                  </View>
                )}

                {/* أزرار الإجراء */}
                <View style={{ gap: 8, marginTop: 4 }}>
                  {/* بانتظار الاستلام من المطعم */}
                  {assignment.status === "assigned" && (
                    <View style={{ backgroundColor: "#1A1208", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FB8C0044", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontSize: 26 }}>🏠</Text>
                      <Text style={{ color: "#FB8C00", fontFamily: F.bold, fontSize: 14 }}>بانتظار استلامه من المطعم</Text>
                      <Text style={{ color: "#FB8C0099", fontFamily: F.regular, fontSize: 11 }}>سيتم إشعارك عند جاهزية التسليم</Text>
                    </View>
                  )}

                  {/* ── مشاركة الموقع — فقط للـ picked_up ── */}
                  {assignment.status === "picked_up" && (
                    <TouchableOpacity
                      onPress={() => toggleLocationSharing(assignment.orderId)}
                      activeOpacity={0.8}
                      style={{
                        borderRadius: 14,
                        overflow: "hidden",
                        borderWidth: 1.5,
                        borderColor: locationSharingEnabled
                          ? (locationError ? "#E5737355" : "#29B6F655")
                          : "#55555555",
                      }}
                    >
                      <View style={{
                        backgroundColor: locationSharingEnabled
                          ? (locationError ? "#3A1B1B" : "#0A1F2A")
                          : "#1A1A1A",
                        paddingHorizontal: 16,
                        paddingVertical: 13,
                        flexDirection: "row-reverse",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}>
                        {/* Right side: icon + label */}
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, flex: 1 }}>
                          <View style={{
                            width: 38, height: 38, borderRadius: 19,
                            backgroundColor: locationSharingEnabled
                              ? (locationError ? "#3A1B1B" : "#0D2A3A")
                              : "#2A2A2A",
                            alignItems: "center", justifyContent: "center",
                            borderWidth: 1.5,
                            borderColor: locationSharingEnabled
                              ? (locationError ? "#E57373" : "#29B6F6")
                              : "#444",
                          }}>
                            <Feather
                              name={locationSharingEnabled && !locationError ? "navigation" : "navigation-2"}
                              size={18}
                              color={locationSharingEnabled
                                ? (locationError ? "#E57373" : "#29B6F6")
                                : "#666"}
                            />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{
                              color: locationSharingEnabled
                                ? (locationError ? "#E57373" : "#29B6F6")
                                : "#888",
                              fontFamily: F.bold, fontSize: 14, textAlign: "right",
                            }}>
                              {locationSharingEnabled
                                ? (locationError ? "تعذّر الوصول للموقع" : "📡 مشاركة موقعك مفعّلة")
                                : "مشاركة الموقع مُعطَّلة"}
                            </Text>
                            <Text style={{
                              color: locationSharingEnabled
                                ? (locationError ? "#E5737399" : "#29B6F699")
                                : "#555",
                              fontFamily: F.regular, fontSize: 11, textAlign: "right",
                            }}>
                              {locationSharingEnabled
                                ? (locationError
                                    ? "تحقق من صلاحية الموقع في الإعدادات"
                                    : "يُرسَل للعميل تلقائياً كل 8 ثوانٍ")
                                : "اضغط لتفعيل الإرسال التلقائي للعميل"}
                            </Text>
                          </View>
                        </View>

                        {/* Toggle switch */}
                        <View style={{
                          width: 50, height: 28, borderRadius: 14,
                          backgroundColor: locationSharingEnabled && !locationError ? "#29B6F6" : "#333",
                          justifyContent: "center",
                          paddingHorizontal: 3,
                        }}>
                          <View style={{
                            width: 22, height: 22, borderRadius: 11,
                            backgroundColor: "#fff",
                            alignSelf: locationSharingEnabled ? "flex-end" : "flex-start",
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.3,
                            shadowRadius: 2,
                            elevation: 2,
                          }} />
                        </View>
                      </View>

                      {/* Live pulse bar — only when actively sharing */}
                      {locationSharingEnabled && !locationError && (
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#29B6F611", paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#29B6F622" }}>
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4CAF50" }} />
                          <Text style={{ color: "#4CAF5099", fontFamily: F.semi, fontSize: 11 }}>
                            مباشر — موقعك مرئي على خريطة العميل الآن
                          </Text>
                        </View>
                      )}

                      {/* Background permission warning */}
                      {locationSharingEnabled && bgPermDenied && (
                        <View style={{ backgroundColor: "#2A1A00", borderTopWidth: 1, borderTopColor: "#E8920C44", paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 }}>
                            <Feather name="alert-triangle" size={14} color="#E8920C" style={{ marginTop: 2 }} />
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 13, textAlign: "right" }}>
                                صلاحية الموقع في الخلفية غير مفعّلة
                              </Text>
                              <Text style={{ color: "#E8920C99", fontFamily: F.regular, fontSize: 11, textAlign: "right", lineHeight: 17 }}>
                                سيتوقف إرسال موقعك للعميل عند تصغير التطبيق. افتح الإعدادات وغيّر صلاحية الموقع إلى "دائمًا".
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => Linking.openSettings()}
                            activeOpacity={0.8}
                            style={{ backgroundColor: "#E8920C22", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#E8920C55" }}
                          >
                            <Text style={{ color: "#E8920C", fontFamily: F.bold, fontSize: 12 }}>⚙️ فتح إعدادات التطبيق</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* زر تسليم للعميل — فقط للـ picked_up */}
                  {assignment.status === "picked_up" && (
                    <TouchableOpacity
                      onPress={() => { setCashConfirmed(false); setPendingDelivery({ orderId: assignment.orderId, total: order.totalPrice / 100, customerName: order.customerName }); }}
                      disabled={updating === assignment.orderId}
                      style={{ backgroundColor: "#1A3A1A", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1.5, borderColor: "#43A047" }}
                    >
                      {updating === assignment.orderId
                        ? <ActivityIndicator color="#4CAF50" />
                        : <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 15 }}>✅ تم التسليم للعميل</Text>}
                    </TouchableOpacity>
                  )}

                  {/* زر الشات + اتصال */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {/* محادثة مع العميل */}
                    <TouchableOpacity
                      onPress={() => openDriverChat(assignment.orderId)}
                      style={{ flex: 1, backgroundColor: "#0A1F2A", borderRadius: 12, paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: "#29B6F6" }}
                    >
                      {(() => {
                        const unread = driverConvos.find(c => c.orderId === assignment.orderId)?.unread ?? 0;
                        return (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={{ position: "relative" }}>
                              <Feather name="message-circle" size={15} color="#29B6F6" />
                              {unread > 0 && (
                                <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: "#E53935", borderRadius: 7, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                                  <Text style={{ color: "#fff", fontSize: 9, fontFamily: F.bold }}>{unread}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ color: "#29B6F6", fontFamily: F.bold, fontSize: 13 }}>محادثة</Text>
                          </View>
                        );
                      })()}
                    </TouchableOpacity>

                    {/* اتصال بالعميل */}
                    <TouchableOpacity
                      onPress={() => { const p = order.customerPhone; if (Platform.OS === "web") window.open(`tel:${p}`); else import("react-native").then(({ Linking }) => Linking.openURL(`tel:${p}`)); }}
                      style={{ flex: 1, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Feather name="phone" size={15} color="#4CAF50" />
                      <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>اتصال</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════
           تاب: تم التسليم
          ══════════════════════════════════════════ */}
      {activeView === "delivered" && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={colors.gold} />}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 60 }}
        >
          {loading && <ActivityIndicator color="#4CAF50" style={{ marginTop: 40 }} />}

          {!loading && deliveredRows.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 80, gap: 14 }}>
              <Text style={{ fontSize: 60 }}>📦</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 15, textAlign: "center" }}>
                لا يوجد طلبات مسلّمة بعد
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 12 }}>ستظهر هنا بعد التسليم</Text>
            </View>
          )}

          {deliveredRows.length > 0 && (
            <View style={{ backgroundColor: "#0A2A0A", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#4CAF5033", flexDirection: "row-reverse", justifyContent: "space-around", alignItems: "center" }}>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 28 }}>{deliveredRows.length}</Text>
                <Text style={{ color: "#4CAF5099", fontFamily: F.semi, fontSize: 12 }}>طلب مسلّم</Text>
              </View>
              <View style={{ width: 1, height: 40, backgroundColor: "#4CAF5033" }} />
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 24 }}>
                  {deliveredRows.reduce((s, r) => s + (r.order ? r.order.totalPrice / 100 : 0), 0).toFixed(2)}
                </Text>
                <Text style={{ color: "#4CAF5099", fontFamily: F.semi, fontSize: 12 }}>ريال محصّل</Text>
              </View>
            </View>
          )}

          {deliveredRows.map(({ assignment, order }) => order && (
            <View key={assignment.orderId} style={{ backgroundColor: colors.card, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#4CAF5033" }}>
              {/* Header */}
              <View style={{ backgroundColor: "#4CAF5011", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#4CAF5022" }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>✅</Text>
                  <Text style={{ color: "#4CAF50", fontFamily: F.bold, fontSize: 13 }}>تم التسليم</Text>
                </View>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.gold, fontFamily: F.extra, fontSize: 14 }}>طلب #{order.dailyNumber}</Text>
                  {assignment.deliveredAt && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>
                      {new Date(assignment.deliveredAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  )}
                </View>
              </View>

              <View style={{ padding: 14, gap: 10 }}>
                {/* بيانات العميل */}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <Feather name="user" size={13} color={colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontFamily: F.bold, fontSize: 14 }}>{order.customerName}</Text>
                  </View>
                  <Text style={{ color: "#4CAF50", fontFamily: F.extra, fontSize: 16 }}>{(order.totalPrice / 100).toFixed(2)} ر.س</Text>
                </View>

                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Feather name="phone" size={13} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: F.semi, fontSize: 12 }}>{order.customerPhone}</Text>
                </View>

                {/* المشتريات (مطوية) */}
                <View style={{ backgroundColor: colors.secondary, borderRadius: 8, padding: 8, gap: 3 }}>
                  {order.items.map((item, i) => (
                    <View key={i} style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.foreground, fontFamily: F.semi, fontSize: 12 }}>×{item.quantity} {item.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: F.regular, fontSize: 11 }}>{item.price * item.quantity} ر.س</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <LocationDisclosureModal
        visible={showLocationDisclosure}
        onContinue={handleDisclosureContinue}
        onCancel={handleDisclosureCancel}
      />
    </View>
  );
}

export default function MandoobScreen() {
  const [driver, setDriver] = useState<Driver | null>(null);
  return driver ? <DriverHome driver={driver} onLogout={() => setDriver(null)} /> : <LoginScreen onLogin={setDriver} />;
}
