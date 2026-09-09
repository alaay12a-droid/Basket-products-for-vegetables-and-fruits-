import { useState, useEffect, useCallback } from "react";
import ZoneMapPicker, { type LatLng } from "@/components/zone-map-picker";
import { apiGet, apiPost, apiPut, apiDel, apiPatch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Pencil, X, ChevronDown, ChevronUp, Package, Image as ImageIcon, Settings, MapPin, Gift, BarChart2, UtensilsCrossed, RefreshCw, Calendar, DollarSign, ShieldCheck, Volume2, Palette, Bell, Upload, Link } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AdminTab = "menu" | "occasions" | "stock" | "banners" | "revenue" | "combos" | "zones" | "referrals" | "settings";
type SettingsSection = "hours" | "payment" | "security" | "appearance" | "menuTemplate" | "sounds" | "discounts" | "notifications";
type MenuTemplate = "classic" | "modern";

interface ApiMenuItem { id: string; name: string; nameEn?: string; category: string; price: number; isAvailable: boolean; stock: number | null; imageUrl?: string; description?: string; }
interface ApiOccasion { id: string; name: string; description?: string; imageUrl?: string; isActive: boolean; }
interface ApiBanner { bannerId: string; imageUrl: string; title?: string | null; active: boolean; createdAt: string; }
interface ApiCombo { id: string; name: string; price: number; description?: string; imageUrl?: string; isAvailable: boolean; components: { name: string; quantity: number }[]; }
interface ApiZone { id: number; name: string; deliveryFee: number; minOrder: number; enabled: boolean; polygon?: LatLng[]; sortOrder?: number; branchId?: number | null; }
interface ApiBranch { id: number; name: string; active: boolean; deliveryEnabled: boolean; pickupEnabled: boolean; }
interface ReferralSettings { enabled: boolean; ratePerReferral: number; }
interface ReferralRow { id: number; referrerName: string; referrerPhone: string; referredPhone: string; rewardAmount: number; createdAt: string; }
interface BranchHours { dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string; }
interface DiscountCode { id: number; code: string; discountType: "percentage" | "fixed"; value: number; minOrder: number | null; description?: string; expiresAt?: string; maxUsages?: number; currentUsages: number; isActive: boolean; }
interface RevenuePeriod { totalRevenue: number; deliveryRevenue: number; itemsRevenue: number; orderCount: number; taxAmount: number; netRevenue: number; cancelledCount: number; cancelledValue: number; pendingCount: number; cashCount: number; onlineCount: number; cashRevenue: number; onlineRevenue: number; }
interface RevenueDayRow { date: string; total: number; delivery: number; items: number; orders: number; tax: number; net: number; cancelledCount: number; cancelledValue: number; cashCount: number; onlineCount: number; }
interface RevenueMonthRow { month: string; total: number; delivery: number; items: number; orders: number; tax: number; net: number; cancelledCount: number; cancelledValue: number; cashCount: number; onlineCount: number; }
interface RevenueTopItem { id: string; name: string; qty: number; revenue: number; }
interface RevenueData { today: RevenuePeriod; week: RevenuePeriod; month: RevenuePeriod; year: RevenuePeriod; dailyBreakdown: RevenueDayRow[]; monthlyBreakdown: RevenueMonthRow[]; topItems: RevenueTopItem[]; }

const CATEGORIES = ["الدجاج", "اللحوم", "المشويات", "المقبلات", "السلطات", "المشروبات", "العصائر", "المناسبات"];

function fmtPrice(riyals: number) { return `${(riyals).toFixed(2)} ر.س`; }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Admin() {
  const { toast } = useToast();

  // Auth
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [adminPin, setAdminPin] = useState("1234");
  const [pinsLoaded, setPinsLoaded] = useState(false);

  // Navigation
  const [activeTab, setActiveTab] = useState<AdminTab>("menu");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("hours");

  // ── Menu ──
  const [menuItems, setMenuItems] = useState<ApiMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuFilter, setMenuFilter] = useState("الكل");
  const [menuSearch, setMenuSearch] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ApiMenuItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", nameEn: "", category: CATEGORIES[0], price: "", stock: "", description: "", imageUrl: "", isAvailable: true });
  const [itemFormSaving, setItemFormSaving] = useState(false);

  // ── Stock ──
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [stockSaving, setStockSaving] = useState<string | null>(null);

  // ── Occasions ──
  const [occasions, setOccasions] = useState<ApiOccasion[]>([]);
  const [occasionsLoading, setOccasionsLoading] = useState(false);
  const [showOccasionForm, setShowOccasionForm] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState<ApiOccasion | null>(null);
  const [occasionForm, setOccasionForm] = useState({ name: "", description: "", imageUrl: "" });
  const [occasionSaving, setOccasionSaving] = useState(false);

  // ── Banners ──
  const [banners, setBanners] = useState<ApiBanner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerUploadMode, setBannerUploadMode] = useState<"url" | "file">("file");
  const [bannerUploading, setBannerUploading] = useState(false);

  // ── Revenue ──
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // ── Combos ──
  const [combos, setCombos] = useState<ApiCombo[]>([]);
  const [combosLoading, setCombosLoading] = useState(false);
  const [showComboForm, setShowComboForm] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ApiCombo | null>(null);
  const [comboForm, setComboForm] = useState({ name: "", price: "", description: "", imageUrl: "" });
  const [comboComponents, setComboComponents] = useState<{ name: string; quantity: string }[]>([{ name: "", quantity: "1" }]);
  const [comboSaving, setComboSaving] = useState(false);

  // ── Zones ──
  const [zones, setZones] = useState<ApiZone[]>([]);
  const [zoneBranches, setZoneBranches] = useState<ApiBranch[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<ApiZone | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: "", fee: "", minOrder: "", branchId: "unassigned" });
  const [zonePolygon, setZonePolygon] = useState<LatLng[]>([]);
  const [zoneSaving, setZoneSaving] = useState(false);
  // ── Free delivery threshold ──
  const [freeDeliveryEnabled, setFreeDeliveryEnabled]       = useState(false);
  const [freeDeliveryThresholdInput, setFreeDeliveryThresholdInput] = useState("100");
  const [freeDeliverySaving, setFreeDeliverySaving]         = useState(false);
  // ── Drivers enabled ──
  const [driversEnabled, setDriversEnabled]   = useState(false);
  const [driversSaving, setDriversSaving]     = useState(false);

  // ── Referrals ──
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(null);
  const [referralRows, setReferralRows] = useState<ReferralRow[]>([]);
  const [referralRateInput, setReferralRateInput] = useState("");
  const [referralSaving, setReferralSaving] = useState(false);

  // ── Settings: Hours ──
  const [branchHours, setBranchHours] = useState<BranchHours[]>([]);
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);

  // ── Settings: Payment ──
  const [paymentCash, setPaymentCash] = useState(true);
  const [paymentElectronic, setPaymentElectronic] = useState(false);
  const [paymentWallet, setPaymentWallet] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);

  // ── Settings: Security ──
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinTarget, setPinTarget] = useState<"cashier" | "admin">("cashier");
  const [otpStep, setOtpStep] = useState<"idle" | "sent" | "verified">("idle");
  const [otpSaving, setOtpSaving] = useState(false);

  // ── Settings: Appearance ──
  const [logoBg, setLogoBg] = useState("#C8171A");
  const [logoBgSaving, setLogoBgSaving] = useState(false);
  const [menuTemplate, setMenuTemplate] = useState<MenuTemplate>("classic");
  const [menuTemplateSaving, setMenuTemplateSaving] = useState(false);

  // ── Settings: Discounts ──
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [showDcForm, setShowDcForm] = useState(false);
  const [dcForm, setDcForm] = useState({ code: "", discountType: "percentage" as "percentage" | "fixed", value: "", minOrder: "", description: "", expiresAt: "", maxUsages: "" });
  const [dcSaving, setDcSaving] = useState(false);

  // ── Settings: Notifications (Re-engagement) ──
  const [reengagementDays, setReengagementDays] = useState(30);
  const [reengagementDaysInput, setReengagementDaysInput] = useState("30");
  const [reengagementSaving, setReengagementSaving] = useState(false);

  // ── Load PINs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    apiGet<{ cashier?: string; admin?: string }>("/settings/pins")
      .then(data => { if (data.admin) setAdminPin(data.admin); setPinsLoaded(true); })
      .catch(() => setPinsLoaded(true));
  }, []);

  // ── Load on tab change ────────────────────────────────────────────────────
  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const data = await apiGet<ApiMenuItem[]>("/menu");
      setMenuItems(data);
      const edits: Record<string, string> = {};
      data.forEach(i => { edits[i.id] = i.stock != null ? String(i.stock) : ""; });
      setStockEdits(edits);
    } catch { toast({ title: "خطأ في تحميل القائمة", variant: "destructive" }); }
    finally { setMenuLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (!authenticated) return;
    if (activeTab === "menu" || activeTab === "stock") loadMenu();
    if (activeTab === "occasions") loadOccasions();
    if (activeTab === "banners") loadBanners();
    if (activeTab === "revenue") loadRevenue();
    if (activeTab === "combos") loadCombos();
    if (activeTab === "zones") loadZones();
    if (activeTab === "referrals") loadReferrals();
    if (activeTab === "settings") loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authenticated]);

  const loadOccasions = async () => {
    setOccasionsLoading(true);
    try { const d = await apiGet<ApiOccasion[]>("/occasions"); setOccasions(d); }
    catch {} finally { setOccasionsLoading(false); }
  };
  const loadBanners = async () => {
    setBannersLoading(true);
    try { const d = await apiGet<ApiBanner[]>("/banners"); setBanners(d); }
    catch {} finally { setBannersLoading(false); }
  };
  const loadRevenue = async () => {
    setRevenueLoading(true);
    try { const d = await apiGet<RevenueData>("/revenue"); setRevenueData(d); }
    catch {} finally { setRevenueLoading(false); }
  };
  const loadCombos = async () => {
    setCombosLoading(true);
    try { const d = await apiGet<ApiCombo[]>("/combos"); setCombos(d); }
    catch {} finally { setCombosLoading(false); }
  };
  const loadZones = async () => {
    setZonesLoading(true);
    try {
      const [d, app, drvEnabled, branches] = await Promise.all([
        apiGet<ApiZone[]>("/delivery-zones"),
        apiGet<{ freeDeliveryThreshold: number }>("/settings/appearance"),
        apiGet<{ enabled: boolean }>("/settings/drivers-enabled").catch(() => ({ enabled: false })),
        apiGet<ApiBranch[]>("/branches"),
      ]);
      setZones(d);
      setZoneBranches(branches);
      const thr = app.freeDeliveryThreshold ?? 0;
      setFreeDeliveryEnabled(thr > 0);
      setFreeDeliveryThresholdInput(thr > 0 ? String(thr) : "100");
      setDriversEnabled(drvEnabled.enabled);
    } catch {} finally { setZonesLoading(false); }
  };
  const handleSaveDriversEnabled = async (val: boolean) => {
    setDriversEnabled(val);
    setDriversSaving(true);
    try {
      await apiPut("/settings/drivers-enabled", { enabled: val });
      toast({ title: val ? "✅ تم تفعيل خدمة المناديب" : "❌ تم إيقاف خدمة المناديب" });
    } catch { toast({ title: "خطأ في الحفظ", variant: "destructive" }); }
    finally { setDriversSaving(false); }
  };
  const handleSaveFreeDelivery = async () => {
    setFreeDeliverySaving(true);
    try {
      const threshold = freeDeliveryEnabled ? (parseFloat(freeDeliveryThresholdInput) || 0) : 0;
      await apiPut("/settings/appearance", { freeDeliveryThreshold: threshold });
      toast({ title: "تم الحفظ" });
    } catch { toast({ title: "خطأ في الحفظ", variant: "destructive" }); }
    finally { setFreeDeliverySaving(false); }
  };
  const loadReferrals = async () => {
    try {
      const [settings, rows] = await Promise.all([
        apiGet<ReferralSettings>("/referrals/settings"),
        apiGet<ReferralRow[]>("/referrals/all"),
      ]);
      setReferralSettings(settings);
      setReferralRateInput(String(settings.ratePerReferral ?? 0));
      setReferralRows(rows);
    } catch {}
  };
  const loadSettings = async () => {
    try {
      const [hours, payment, dc, reengagement, template] = await Promise.all([
        apiGet<{ enabled: boolean; hours: BranchHours[] }>("/branch-hours").catch(() => null),
        apiGet<{ cash: boolean; electronic: boolean; wallet: boolean }>("/settings/payment").catch(() => null),
        apiGet<DiscountCode[]>("/discount-codes").catch(() => []),
        apiGet<{ days: number }>("/settings/reengagement").catch(() => null),
        apiGet<{ menuTemplate: MenuTemplate }>("/settings/menu-template").catch(() => null),
      ]);
      if (hours) { setHoursEnabled(hours.enabled); setBranchHours(hours.hours ?? []); }
      if (payment) { setPaymentCash(payment.cash); setPaymentElectronic(payment.electronic); setPaymentWallet(payment.wallet); }
      setDiscountCodes(dc as DiscountCode[]);
      if (reengagement) { setReengagementDays(reengagement.days); setReengagementDaysInput(String(reengagement.days)); }
      if (template) setMenuTemplate(template.menuTemplate === "modern" ? "modern" : "classic");
    } catch {}
  };
  const handleSaveReengagement = async () => {
    const days = Math.max(1, Math.min(365, parseInt(reengagementDaysInput, 10) || 30));
    setReengagementSaving(true);
    try {
      await apiPut("/settings/reengagement", { days });
      setReengagementDays(days);
      setReengagementDaysInput(String(days));
      toast({ title: "✅ تم حفظ إعداد الإشعارات" });
    } catch { toast({ title: "خطأ في الحفظ", variant: "destructive" }); }
    finally { setReengagementSaving(false); }
  };
  const loadDiscounts = async () => {
    setDiscountsLoading(true);
    try { const d = await apiGet<DiscountCode[]>("/discount-codes"); setDiscountCodes(d); }
    catch {} finally { setDiscountsLoading(false); }
  };

  // ── PIN ───────────────────────────────────────────────────────────────────
  const handlePinSubmit = () => {
    if (!pinsLoaded) return;
    if (pinInput === adminPin) { setAuthenticated(true); setPinInput(""); }
    else { toast({ title: "رمز خاطئ", variant: "destructive" }); setPinInput(""); }
  };

  // ── Menu CRUD ─────────────────────────────────────────────────────────────
  const openAddItem = () => {
    setEditingItem(null);
    setItemForm({ name: "", nameEn: "", category: CATEGORIES[0], price: "", stock: "", description: "", imageUrl: "", isAvailable: true });
    setShowItemForm(true);
  };
  const openEditItem = (item: ApiMenuItem) => {
    setEditingItem(item);
    setItemForm({ name: item.name, nameEn: item.nameEn ?? "", category: item.category, price: String(item.price / 100), stock: item.stock != null ? String(item.stock) : "", description: item.description ?? "", imageUrl: item.imageUrl ?? "", isAvailable: item.isAvailable });
    setShowItemForm(true);
  };
  const handleSaveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) return;
    setItemFormSaving(true);
    const payload = {
      name: itemForm.name.trim(),
      nameEn: itemForm.nameEn.trim() || undefined,
      category: itemForm.category,
      price: Math.round(parseFloat(itemForm.price) * 100),
      stock: itemForm.stock !== "" ? parseInt(itemForm.stock) : null,
      description: itemForm.description.trim() || undefined,
      imageUrl: itemForm.imageUrl.trim() || undefined,
      isAvailable: itemForm.isAvailable,
    };
    try {
      if (editingItem) { await apiPut(`/menu/${editingItem.id}`, payload); }
      else { await apiPost("/menu", payload); }
      await loadMenu();
      setShowItemForm(false);
      toast({ title: editingItem ? "تم التعديل" : "تمت الإضافة" });
    } catch { toast({ title: "خطأ في الحفظ", variant: "destructive" }); }
    finally { setItemFormSaving(false); }
  };
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("حذف هذا الصنف نهائياً؟")) return;
    try { await apiDel(`/menu/${id}`); setMenuItems(prev => prev.filter(i => i.id !== id)); toast({ title: "تم الحذف" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };
  const handleToggleAvail = async (item: ApiMenuItem) => {
    try {
      await apiPut(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i));
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Stock ─────────────────────────────────────────────────────────────────
  const handleSaveStock = async (itemId: string) => {
    setStockSaving(itemId);
    const val = stockEdits[itemId];
    const stock = val === "" ? null : parseInt(val);
    try {
      await apiPut(`/menu/${itemId}`, { stock });
      setMenuItems(prev => prev.map(i => i.id === itemId ? { ...i, stock } : i));
      toast({ title: "تم حفظ المخزون" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setStockSaving(null); }
  };

  // ── Occasions ─────────────────────────────────────────────────────────────
  const openAddOccasion = () => { setEditingOccasion(null); setOccasionForm({ name: "", description: "", imageUrl: "" }); setShowOccasionForm(true); };
  const openEditOccasion = (o: ApiOccasion) => { setEditingOccasion(o); setOccasionForm({ name: o.name, description: o.description ?? "", imageUrl: o.imageUrl ?? "" }); setShowOccasionForm(true); };
  const handleSaveOccasion = async () => {
    if (!occasionForm.name.trim()) return;
    setOccasionSaving(true);
    try {
      if (editingOccasion) { await apiPut(`/occasions/${editingOccasion.id}`, occasionForm); }
      else { await apiPost("/occasions", occasionForm); }
      await loadOccasions(); setShowOccasionForm(false);
      toast({ title: editingOccasion ? "تم التعديل" : "تمت الإضافة" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setOccasionSaving(false); }
  };
  const handleToggleOccasion = async (o: ApiOccasion) => {
    try { await apiPut(`/occasions/${o.id}`, { isActive: !o.isActive }); setOccasions(prev => prev.map(x => x.id === o.id ? { ...x, isActive: !x.isActive } : x)); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };
  const handleDeleteOccasion = async (id: string) => {
    if (!window.confirm("حذف هذه المناسبة؟")) return;
    try { await apiDel(`/occasions/${id}`); setOccasions(prev => prev.filter(o => o.id !== id)); toast({ title: "تم الحذف" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Banners ───────────────────────────────────────────────────────────────
  const handleBannerFileUpload = async (file: File) => {
    setBannerUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace("jpeg", "jpg");
      const contentType = file.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
      const urlRes = await fetch(`${apiBase}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `banner-${Date.now()}.${ext}`, size: file.size, contentType }),
      });
      if (!urlRes.ok) throw new Error("فشل طلب رابط الرفع");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      setBannerImageUrl(`${apiBase}/api/storage${objectPath}`);
    } catch {
      toast({ title: "خطأ في رفع الصورة، حاول مرة أخرى", variant: "destructive" });
    } finally {
      setBannerUploading(false);
    }
  };
  const handleAddBanner = async () => {
    if (!bannerImageUrl.trim()) return;
    setBannerSaving(true);
    try {
      await apiPost("/banners", { imageUrl: bannerImageUrl, title: bannerTitle || null });
      await loadBanners();
      setBannerImageUrl("");
      setBannerTitle("");
      toast({ title: "تمت الإضافة" });
    }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setBannerSaving(false); }
  };
  const handleToggleBanner = async (b: ApiBanner) => {
    try {
      await apiPut(`/banners/${b.bannerId}`, { active: !b.active });
      setBanners(prev => prev.map(x => x.bannerId === b.bannerId ? { ...x, active: !x.active } : x));
    }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };
  const handleDeleteBanner = async (bannerId: string) => {
    if (!window.confirm("حذف البانر؟")) return;
    try {
      await apiDel(`/banners/${bannerId}`);
      setBanners(prev => prev.filter(b => b.bannerId !== bannerId));
      toast({ title: "تم الحذف" });
    }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Combos ────────────────────────────────────────────────────────────────
  const openAddCombo = () => { setEditingCombo(null); setComboForm({ name: "", price: "", description: "", imageUrl: "" }); setComboComponents([{ name: "", quantity: "1" }]); setShowComboForm(true); };
  const openEditCombo = (c: ApiCombo) => { setEditingCombo(c); setComboForm({ name: c.name, price: String(c.price / 100), description: c.description ?? "", imageUrl: c.imageUrl ?? "" }); setComboComponents(c.components.map(x => ({ name: x.name, quantity: String(x.quantity) }))); setShowComboForm(true); };
  const handleSaveCombo = async () => {
    if (!comboForm.name.trim() || !comboForm.price) return;
    setComboSaving(true);
    const payload = { name: comboForm.name, price: Math.round(parseFloat(comboForm.price) * 100), description: comboForm.description || undefined, imageUrl: comboForm.imageUrl || undefined, components: comboComponents.filter(c => c.name.trim()).map(c => ({ name: c.name, quantity: parseInt(c.quantity) || 1 })) };
    try {
      if (editingCombo) { await apiPut(`/combos/${editingCombo.id}`, payload); }
      else { await apiPost("/combos", payload); }
      await loadCombos(); setShowComboForm(false); toast({ title: editingCombo ? "تم التعديل" : "تمت الإضافة" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setComboSaving(false); }
  };
  const handleDeleteCombo = async (id: string) => {
    if (!window.confirm("حذف هذه الوجبة؟")) return;
    try { await apiDel(`/combos/${id}`); setCombos(prev => prev.filter(c => c.id !== id)); toast({ title: "تم الحذف" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Zones ─────────────────────────────────────────────────────────────────
  const openAddZone = () => { setEditingZone(null); setZoneForm({ name: "", fee: "", minOrder: "", branchId: "unassigned" }); setZonePolygon([]); setShowZoneForm(true); };
  const openEditZone = (z: ApiZone) => { setEditingZone(z); setZoneForm({ name: z.name, fee: String(z.deliveryFee / 100), minOrder: String(z.minOrder / 100), branchId: z.branchId != null ? String(z.branchId) : "unassigned" }); setZonePolygon(z.polygon ?? []); setShowZoneForm(true); };
  const handleSaveZone = async () => {
    if (!zoneForm.name.trim()) return;
    if (!editingZone && zonePolygon.length < 3) { toast({ title: "ارسم حدود المنطقة على الخريطة (3 نقاط على الأقل)", variant: "destructive" }); return; }
    setZoneSaving(true);
    const payload: Record<string, unknown> = {
      name: zoneForm.name,
      deliveryFee: Math.round(parseFloat(zoneForm.fee || "0") * 100),
      minOrder: Math.round(parseFloat(zoneForm.minOrder || "0") * 100),
      branchId: zoneForm.branchId === "unassigned" ? null : parseInt(zoneForm.branchId, 10),
    };
    if (zonePolygon.length >= 3) payload.polygon = zonePolygon;
    try {
      if (editingZone) { await apiPut(`/delivery-zones/${editingZone.id}`, payload); }
      else { await apiPost("/delivery-zones", payload); }
      await loadZones(); setShowZoneForm(false); toast({ title: editingZone ? "تم التعديل" : "تمت الإضافة" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setZoneSaving(false); }
  };
  const handleToggleZone = async (z: ApiZone) => {
    try { await apiPut(`/delivery-zones/${z.id}`, { enabled: !z.enabled }); setZones(prev => prev.map(x => x.id === z.id ? { ...x, enabled: !x.enabled } : x)); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };
  const handleDeleteZone = async (id: number) => {
    if (!window.confirm("حذف هذه المنطقة؟")) return;
    try { await apiDel(`/delivery-zones/${id}`); setZones(prev => prev.filter(z => z.id !== id)); toast({ title: "تم الحذف" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Referrals ─────────────────────────────────────────────────────────────
  const handleSaveReferrals = async () => {
    if (!referralSettings) return;
    setReferralSaving(true);
    try {
      await apiPut("/referrals/settings", { enabled: referralSettings.enabled, ratePerReferral: parseFloat(referralRateInput) || 0 });
      toast({ title: "تم الحفظ" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setReferralSaving(false); }
  };

  // ── Settings: Hours ───────────────────────────────────────────────────────
  const handleSaveHours = async () => {
    setHoursSaving(true);
    try { await apiPut("/branch-hours", { enabled: hoursEnabled, hours: branchHours }); toast({ title: "تم حفظ أوقات العمل" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setHoursSaving(false); }
  };

  // ── Settings: Payment ─────────────────────────────────────────────────────
  const handleSavePayment = async () => {
    setPaymentSaving(true);
    try { await apiPut("/settings/payment", { cash: paymentCash, electronic: paymentElectronic, wallet: paymentWallet }); toast({ title: "تم حفظ طرق الدفع" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setPaymentSaving(false); }
  };

  // ── Settings: Security (OTP PIN change) ───────────────────────────────────
  const handleSendOtp = async () => {
    setOtpSaving(true);
    try { await apiPost("/auth/pin-otp/send", { phone: otpPhone, target: pinTarget }); setOtpStep("sent"); toast({ title: "تم إرسال OTP" }); }
    catch { toast({ title: "خطأ في إرسال OTP", variant: "destructive" }); }
    finally { setOtpSaving(false); }
  };
  const handleVerifyOtp = async () => {
    setOtpSaving(true);
    try { await apiPost("/auth/pin-otp/verify", { phone: otpPhone, code: otpCode, newPin, target: pinTarget }); setOtpStep("verified"); toast({ title: "تم تغيير الرمز السري بنجاح" }); }
    catch { toast({ title: "رمز OTP خاطئ أو منتهي", variant: "destructive" }); }
    finally { setOtpSaving(false); }
  };

  // ── Settings: Appearance ──────────────────────────────────────────────────
  const handleSaveLogoBg = async () => {
    setLogoBgSaving(true);
    try { await apiPut("/settings/appearance", { logoBg }); toast({ title: "تم الحفظ" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setLogoBgSaving(false); }
  };
  const handleSaveMenuTemplate = async () => {
    setMenuTemplateSaving(true);
    try {
      const saved = await apiPut<{ menuTemplate: MenuTemplate }>("/settings/menu-template", { menuTemplate });
      setMenuTemplate(saved.menuTemplate);
      toast({ title: "تم حفظ قالب المنيو" });
    } catch {
      toast({ title: "خطأ في حفظ قالب المنيو", variant: "destructive" });
    } finally {
      setMenuTemplateSaving(false);
    }
  };

  // ── Discounts ─────────────────────────────────────────────────────────────
  const handleSaveDc = async () => {
    if (!dcForm.code.trim() || !dcForm.value) return;
    setDcSaving(true);
    const payload = {
      code: dcForm.code.trim().toUpperCase(),
      discountType: dcForm.discountType,
      value: parseFloat(dcForm.value),
      minOrder: dcForm.minOrder ? Math.round(parseFloat(dcForm.minOrder) * 100) : null,
      description: dcForm.description || undefined,
      expiresAt: dcForm.expiresAt || undefined,
      maxUsages: dcForm.maxUsages ? parseInt(dcForm.maxUsages) : undefined,
    };
    try { await apiPost("/discount-codes", payload); await loadDiscounts(); setShowDcForm(false); toast({ title: "تمت الإضافة" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setDcSaving(false); }
  };
  const handleDeleteDc = async (id: number) => {
    if (!window.confirm("حذف كود الخصم؟")) return;
    try { await apiDel(`/discount-codes/${id}`); setDiscountCodes(prev => prev.filter(d => d.id !== id)); toast({ title: "تم الحذف" }); }
    catch { toast({ title: "خطأ", variant: "destructive" }); }
  };

  // ── Filtered menu ─────────────────────────────────────────────────────────
  const filteredMenu = menuItems.filter(i => {
    const catMatch = menuFilter === "الكل" || i.category === menuFilter;
    const searchMatch = !menuSearch || i.name.includes(menuSearch);
    return catMatch && searchMatch;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PIN Screen
  // ──────────────────────────────────────────────────────────────────────────
  if (!pinsLoaded || !authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <div className="text-5xl mb-3">⚙️</div>
          <h2 className="text-2xl font-black text-foreground">لوحة الإدارة</h2>
          <p className="text-muted-foreground text-sm mt-1">أدخل رمز الدخول</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <Input type="password" placeholder="••••••" value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
            className="text-center text-xl tracking-widest h-14 rounded-2xl border-2 text-right" dir="ltr" />
          <Button onClick={handlePinSubmit} disabled={!pinsLoaded}
            className="w-full h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-base">
            {!pinsLoaded ? <Loader2 className="h-5 w-5 animate-spin" /> : "دخول"}
          </Button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TABS
  // ──────────────────────────────────────────────────────────────────────────
  const TABS: { key: AdminTab; icon: React.ElementType; label: string }[] = [
    { key: "menu", icon: UtensilsCrossed, label: "الأصناف" },
    { key: "occasions", icon: Calendar, label: "المناسبات" },
    { key: "stock", icon: Package, label: "المخزون" },
    { key: "banners", icon: ImageIcon, label: "البانر" },
    { key: "revenue", icon: BarChart2, label: "الإيرادات" },
    { key: "combos", icon: Gift, label: "الوجبات" },
    { key: "zones", icon: MapPin, label: "المناطق" },
    { key: "referrals", icon: Gift, label: "الإحالات" },
    { key: "settings", icon: Settings, label: "الإعدادات" },
  ];

  return (
    <div className="space-y-4 -mt-2">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border pb-0 min-w-max">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors",
                activeTab === t.key ? "border-amber-500 text-amber-500" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MENU TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "menu" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">الأصناف ({menuItems.length})</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => loadMenu()} variant="outline" disabled={menuLoading}>
                <RefreshCw className={cn("h-4 w-4", menuLoading && "animate-spin")} />
              </Button>
              <Button size="sm" onClick={openAddItem} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
                <Plus className="h-4 w-4 ml-1" /> إضافة
              </Button>
            </div>
          </div>
          {/* Search */}
          <Input placeholder="بحث باسم الصنف..." value={menuSearch} onChange={e => setMenuSearch(e.target.value)} />
          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["الكل", ...CATEGORIES].map(cat => (
              <button key={cat} onClick={() => setMenuFilter(cat)}
                className={cn(
                  "whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                  menuFilter === cat ? "bg-amber-500 text-white border-amber-500" : "bg-card text-muted-foreground border-border hover:border-amber-500/50"
                )}>
                {cat}
                {cat !== "الكل" && <span className="mr-1">({menuItems.filter(i => i.category === cat).length})</span>}
                {cat === "الكل" && <span className="mr-1">({menuItems.length})</span>}
              </button>
            ))}
          </div>
          {/* Items list */}
          {menuLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>
          ) : (
            <div className="space-y-2">
              {filteredMenu.map(item => (
                <div key={item.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{item.name}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{item.category}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-black text-amber-500 text-sm">{formatCurrency(item.price)}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                          item.stock === null ? "bg-blue-100 text-blue-600" :
                          item.stock === 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                        )}>
                          {item.stock === null ? "∞ غير محدود" : item.stock === 0 ? "نافد" : `${item.stock} متبقي`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch checked={item.isAvailable} onCheckedChange={() => handleToggleAvail(item)} />
                      <button onClick={() => openEditItem(item)} className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDeleteItem(item.id)} className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredMenu.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <UtensilsCrossed className="h-10 w-10 opacity-20" />
                  <span className="text-sm">لا توجد أصناف</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STOCK TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "stock" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">إدارة المخزون</h2>
            <Button size="sm" onClick={() => loadMenu()} variant="outline" disabled={menuLoading}>
              <RefreshCw className={cn("h-4 w-4", menuLoading && "animate-spin")} />
            </Button>
          </div>
          {menuLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
            <div className="space-y-2">
              {menuItems.map(item => (
                <div key={item.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.category}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={item.isAvailable} onCheckedChange={() => handleToggleAvail(item)} />
                    <span className="text-xs text-muted-foreground">{item.isAvailable ? "متاح" : "نافد"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setStockEdits(e => ({ ...e, [item.id]: String(Math.max(0, (parseInt(e[item.id]) || 0) - 1)) }))}
                      className="h-7 w-7 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center font-bold hover:bg-red-200 transition-colors">−</button>
                    <input type="number" value={stockEdits[item.id] ?? ""} placeholder="∞"
                      onChange={e => setStockEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-14 text-center text-sm border border-border rounded-lg h-7 bg-background text-foreground" />
                    <button onClick={() => setStockEdits(e => ({ ...e, [item.id]: String((parseInt(e[item.id]) || 0) + 1) }))}
                      className="h-7 w-7 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-600 flex items-center justify-center font-bold hover:bg-green-200 transition-colors">+</button>
                    <button onClick={() => handleSaveStock(item.id)} disabled={stockSaving === item.id}
                      className="h-7 px-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">
                      {stockSaving === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          OCCASIONS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "occasions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">المناسبات</h2>
            <Button size="sm" onClick={openAddOccasion} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
              <Plus className="h-4 w-4 ml-1" /> إضافة
            </Button>
          </div>
          {occasionsLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
            <div className="space-y-2">
              {occasions.map(occ => (
                <div key={occ.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                  {occ.imageUrl && <img src={occ.imageUrl} alt={occ.name} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="font-bold text-sm text-foreground">{occ.name}</div>
                    {occ.description && <div className="text-xs text-muted-foreground mt-0.5">{occ.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={occ.isActive} onCheckedChange={() => handleToggleOccasion(occ)} />
                    <button onClick={() => openEditOccasion(occ)} className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteOccasion(occ.id)} className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {occasions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Calendar className="h-10 w-10 opacity-20" />
                  <span className="text-sm">لا توجد مناسبات</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BANNERS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "banners" && (
        <div className="space-y-4">
          <h2 className="font-bold text-base text-foreground">البانرات</h2>
          {/* Add banner */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-sm text-foreground">إضافة بانر جديد</h3>
            {/* Mode toggle */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => { setBannerUploadMode("file"); setBannerImageUrl(""); }}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors",
                  bannerUploadMode === "file" ? "bg-amber-500 text-white" : "bg-background text-muted-foreground hover:bg-muted")}
              >
                <Upload className="h-3.5 w-3.5" /> رفع من الجهاز
              </button>
              <button
                onClick={() => { setBannerUploadMode("url"); setBannerImageUrl(""); }}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors",
                  bannerUploadMode === "url" ? "bg-amber-500 text-white" : "bg-background text-muted-foreground hover:bg-muted")}
              >
                <Link className="h-3.5 w-3.5" /> رابط URL
              </button>
            </div>
            {/* File upload */}
            {bannerUploadMode === "file" && (
              <label className={cn(
                "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors",
                bannerUploading ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/10"
              )}>
                <input type="file" accept="image/*" className="hidden" disabled={bannerUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleBannerFileUpload(f); e.target.value = ""; }} />
                {bannerUploading ? (
                  <><Loader2 className="h-6 w-6 animate-spin text-amber-500" /><span className="text-xs text-amber-600 font-medium">جاري الرفع…</span></>
                ) : bannerImageUrl ? (
                  <><img src={bannerImageUrl} alt="preview" className="w-full h-32 object-cover rounded-lg" /><span className="text-xs text-green-600 font-medium">✅ تم رفع الصورة — اضغط للتغيير</span></>
                ) : (
                  <><Upload className="h-8 w-8 text-muted-foreground/40" /><span className="text-sm font-medium text-muted-foreground">اضغط لاختيار صورة</span><span className="text-xs text-muted-foreground/60">JPG, PNG, WebP</span></>
                )}
              </label>
            )}
            {/* URL input */}
            {bannerUploadMode === "url" && (
              <>
                <Input placeholder="https://..." value={bannerImageUrl} onChange={e => setBannerImageUrl(e.target.value)} dir="ltr" />
                {bannerImageUrl && <img src={bannerImageUrl} alt="preview" className="w-full h-32 object-cover rounded-xl" onError={e => (e.currentTarget.style.display = "none")} />}
              </>
            )}
            <Input placeholder="العنوان (اختياري)" value={bannerTitle} onChange={e => setBannerTitle(e.target.value)} />
            <Button onClick={handleAddBanner} disabled={bannerSaving || bannerUploading || !bannerImageUrl.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {bannerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة البانر"}
            </Button>
          </div>
          {/* Banner list */}
          {bannersLoading ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
            <div className="space-y-2">
              {banners.map(b => (
                <div key={b.bannerId} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <img src={b.imageUrl} alt={b.title ?? ""} className="w-full h-32 object-cover" />
                  <div className="flex items-center justify-between p-3">
                    <div>
                      {b.title && <div className="font-medium text-sm text-foreground">{b.title}</div>}
                      <div className={cn("text-xs font-medium", b.active ? "text-green-600" : "text-zinc-400")}>
                        {b.active ? "✅ ظاهر" : "🚫 مخفي"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={b.active} onCheckedChange={() => handleToggleBanner(b)} />
                      <button onClick={() => handleDeleteBanner(b.bannerId)} className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {banners.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <ImageIcon className="h-10 w-10 opacity-20" />
                  <span className="text-sm">لا توجد بانرات</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          REVENUE TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "revenue" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">الإيرادات</h2>
            <Button size="sm" onClick={loadRevenue} variant="outline" disabled={revenueLoading}>
              <RefreshCw className={cn("h-4 w-4", revenueLoading && "animate-spin")} />
            </Button>
          </div>
          {revenueLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>
          ) : revenueData ? (
            <div className="space-y-4">
              {/* Today */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <h3 className="font-bold text-sm text-amber-500">اليوم</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-amber-500/10 rounded-xl p-3 text-center">
                    <div className="font-black text-amber-500 text-xl">{fmtPrice(revenueData.today.totalRevenue)}</div>
                    <div className="text-[11px] text-muted-foreground">الإجمالي</div>
                  </div>
                  <div className="bg-zinc-500/10 rounded-xl p-3 text-center">
                    <div className="font-black text-foreground text-xl">{revenueData.today.orderCount}</div>
                    <div className="text-[11px] text-muted-foreground">طلب</div>
                  </div>
                  <div className="bg-green-500/10 rounded-xl p-3 text-center">
                    <div className="font-black text-green-600 text-lg">{fmtPrice(revenueData.today.cashRevenue)}</div>
                    <div className="text-[11px] text-muted-foreground">نقدي</div>
                  </div>
                  <div className="bg-blue-500/10 rounded-xl p-3 text-center">
                    <div className="font-black text-blue-600 text-lg">{fmtPrice(revenueData.today.onlineRevenue)}</div>
                    <div className="text-[11px] text-muted-foreground">إلكتروني</div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-2">
                  <span>صافي (بعد الضريبة): <span className="text-foreground font-bold">{fmtPrice(revenueData.today.netRevenue)}</span></span>
                  <span>ضريبة: <span className="text-foreground font-bold">{fmtPrice(revenueData.today.taxAmount)}</span></span>
                </div>
              </div>
              {/* Week / Month / Year */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-card border border-border rounded-2xl p-3 text-center space-y-1">
                  <div className="text-[11px] text-muted-foreground">الأسبوع</div>
                  <div className="font-black text-amber-500 text-sm">{fmtPrice(revenueData.week.totalRevenue)}</div>
                  <div className="text-[11px] text-muted-foreground">{revenueData.week.orderCount} طلب</div>
                </div>
                <div className="bg-card border border-border rounded-2xl p-3 text-center space-y-1">
                  <div className="text-[11px] text-muted-foreground">الشهر</div>
                  <div className="font-black text-amber-500 text-sm">{fmtPrice(revenueData.month.totalRevenue)}</div>
                  <div className="text-[11px] text-muted-foreground">{revenueData.month.orderCount} طلب</div>
                </div>
                <div className="bg-card border border-border rounded-2xl p-3 text-center space-y-1">
                  <div className="text-[11px] text-muted-foreground">السنة</div>
                  <div className="font-black text-amber-500 text-sm">{fmtPrice(revenueData.year.totalRevenue)}</div>
                  <div className="text-[11px] text-muted-foreground">{revenueData.year.orderCount} طلب</div>
                </div>
              </div>
              {/* Top Items */}
              {revenueData.topItems.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
                  <h3 className="font-bold text-sm text-amber-500">أعلى الأصناف مبيعاً</h3>
                  {revenueData.topItems.slice(0, 5).map((item, i) => (
                    <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                        <span className="text-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{item.qty} وحدة</span>
                        <span className="font-bold text-amber-500">{fmtPrice(item.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Daily Breakdown (last 7 days with data) */}
              {revenueData.dailyBreakdown.filter(d => d.orders > 0).length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
                  <h3 className="font-bold text-sm text-amber-500">آخر الأيام النشطة</h3>
                  {revenueData.dailyBreakdown.filter(d => d.orders > 0).slice(-7).reverse().map(day => (
                    <div key={day.date} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                      <span className="text-muted-foreground text-xs">{day.date}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{day.orders} طلب</span>
                        <span className="font-bold text-foreground">{fmtPrice(day.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <BarChart2 className="h-10 w-10 opacity-20" />
              <span className="text-sm">لا توجد بيانات</span>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          COMBOS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "combos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">الوجبات المجمّعة</h2>
            <Button size="sm" onClick={openAddCombo} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
              <Plus className="h-4 w-4 ml-1" /> إضافة
            </Button>
          </div>
          {combosLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
            <div className="space-y-2">
              {combos.map(c => (
                <div key={c.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                  {c.imageUrl && <img src={c.imageUrl} alt={c.name} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="font-bold text-sm text-foreground">{c.name}</div>
                    <div className="font-black text-amber-500 text-sm">{formatCurrency(c.price)}</div>
                    <div className="text-xs text-muted-foreground">{c.components.map(x => `${x.name} ×${x.quantity}`).join(" + ")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditCombo(c)} className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteCombo(c.id)} className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {combos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Gift className="h-10 w-10 opacity-20" />
                  <span className="text-sm">لا توجد وجبات مجمّعة</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ZONES TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "zones" && (
        <div className="space-y-4">
          {/* ── Drivers enabled card ── */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛵</span>
                <div>
                  <div className="font-bold text-sm text-foreground">خدمة التوصيل بالمناديب</div>
                  <div className={`text-xs mt-0.5 ${driversEnabled ? "text-green-600" : "text-red-500"}`}>
                    {driversEnabled ? "✅ مفعّلة — يمكن تعيين مناديب للطلبات" : "❌ موقوفة — يظهر «التوصيل غير مفعّل» في الطلبات"}
                  </div>
                </div>
              </div>
              <Switch checked={driversEnabled} disabled={driversSaving} onCheckedChange={handleSaveDriversEnabled} />
            </div>
          </div>

          {/* ── Free delivery threshold card ── */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚗</span>
                <div>
                  <div className="font-bold text-sm text-foreground">توصيل مجاني عند حد معين</div>
                  <div className="text-xs text-muted-foreground">إذا تجاوز الطلب المبلغ المحدد يصبح التوصيل مجانياً</div>
                </div>
              </div>
              <Switch checked={freeDeliveryEnabled} onCheckedChange={setFreeDeliveryEnabled} />
            </div>
            {freeDeliveryEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">عند تجاوز</span>
                <Input
                  type="number"
                  value={freeDeliveryThresholdInput}
                  onChange={e => setFreeDeliveryThresholdInput(e.target.value)}
                  placeholder="100"
                  dir="ltr"
                  className="w-32"
                  min="1"
                />
                <span className="text-sm text-muted-foreground shrink-0">ريال</span>
              </div>
            )}
            <Button
              size="sm"
              onClick={handleSaveFreeDelivery}
              disabled={freeDeliverySaving}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
            >
              {freeDeliverySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">مناطق التوصيل</h2>
            <Button size="sm" onClick={openAddZone} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
              <Plus className="h-4 w-4 ml-1" /> إضافة
            </Button>
          </div>
          {zonesLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
            <div className="space-y-2">
              {zones.map(z => {
                const branch = zoneBranches.find(b => b.id === z.branchId);
                return (
                <div key={z.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-foreground">{z.name}</div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>رسوم: {fmtPrice(z.deliveryFee / 100)}</span>
                      <span>الحد الأدنى: {fmtPrice(z.minOrder / 100)}</span>
                      {z.polygon && z.polygon.length > 0 && <span className="text-green-600">✓ {z.polygon.length} نقطة</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                      <Badge variant="outline" className="text-[11px]">
                        الفرع: {branch ? branch.name : "غير معيّنة"}
                      </Badge>
                      {branch && !branch.active && <span className="text-amber-600">⚠ الفرع موقوف</span>}
                      {branch && !branch.deliveryEnabled && <span className="text-amber-600">⚠ التوصيل غير مفعّل للفرع</span>}
                      {z.branchId != null && !branch && <span className="text-destructive">⚠ الفرع غير موجود</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={z.enabled} onCheckedChange={() => handleToggleZone(z)} />
                    <button onClick={() => openEditZone(z)} className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteZone(z.id)} className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                );
              })}
              {zones.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <MapPin className="h-10 w-10 opacity-20" />
                  <span className="text-sm">لا توجد مناطق توصيل</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          REFERRALS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "referrals" && (
        <div className="space-y-4">
          <h2 className="font-bold text-base text-foreground">برنامج الإحالات</h2>
          {referralSettings && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-foreground">تفعيل البرنامج</span>
                <Switch checked={referralSettings.enabled}
                  onCheckedChange={v => setReferralSettings(s => s ? { ...s, enabled: v } : s)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">قيمة الإحالة (ريال)</label>
                <Input type="number" value={referralRateInput} onChange={e => setReferralRateInput(e.target.value)} placeholder="0" dir="ltr" />
              </div>
              <Button onClick={handleSaveReferrals} disabled={referralSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                {referralSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الإعدادات"}
              </Button>
            </div>
          )}
          {/* Referral rows */}
          {referralRows.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-3 border-b border-border font-semibold text-sm text-foreground">سجل الإحالات ({referralRows.length})</div>
              <div className="divide-y divide-border">
                {referralRows.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-foreground">{r.referrerName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{r.referredPhone}</div>
                    </div>
                    <span className="font-black text-amber-500">{fmtPrice(r.rewardAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SETTINGS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          {/* Settings sub-nav */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              { key: "hours", icon: Calendar, label: "أوقات العمل" },
              { key: "payment", icon: DollarSign, label: "طرق الدفع" },
              { key: "discounts", icon: Gift, label: "الخصومات" },
              { key: "security", icon: ShieldCheck, label: "الأمان" },
              { key: "appearance", icon: Palette, label: "المظهر" },
              { key: "menuTemplate", icon: UtensilsCrossed, label: "قالب المنيو" },
              { key: "notifications", icon: Bell, label: "الإشعارات" },
            ] as const).map(s => (
              <button key={s.key} onClick={() => setSettingsSection(s.key)}
                className={cn(
                  "whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors",
                  settingsSection === s.key ? "bg-amber-500 text-white border-amber-500" : "bg-card text-muted-foreground border-border hover:border-amber-500/50"
                )}>
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            ))}
          </div>

          {/* ── Hours ── */}
          {settingsSection === "hours" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" /> أوقات عمل الفرع
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-foreground">تفعيل قيود أوقات العمل</div>
                  <div className={cn("text-xs mt-0.5", hoursEnabled ? "text-green-600" : "text-red-500")}>
                    {hoursEnabled ? "✅ مفعّل — الطلبات تُقبل في الأوقات المحددة فقط" : "❌ موقوف — الطلبات مقبولة في أي وقت"}
                  </div>
                </div>
                <Switch checked={hoursEnabled} onCheckedChange={setHoursEnabled} />
              </div>
              {hoursEnabled && branchHours.length > 0 && (
                <div className="space-y-2">
                  {["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day, idx) => {
                    const h = branchHours[idx] ?? { dayOfWeek: idx, isOpen: false, openTime: "09:00", closeTime: "23:00" };
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-16">{day}</span>
                        <Switch checked={h.isOpen} onCheckedChange={v => setBranchHours(prev => prev.map((x, i) => i === idx ? { ...x, isOpen: v } : x))} />
                        {h.isOpen && (
                          <>
                            <input type="time" value={h.openTime} onChange={e => setBranchHours(prev => prev.map((x, i) => i === idx ? { ...x, openTime: e.target.value } : x))}
                              className="border border-border rounded-lg h-8 px-2 text-sm bg-background text-foreground" />
                            <span className="text-xs text-muted-foreground">—</span>
                            <input type="time" value={h.closeTime} onChange={e => setBranchHours(prev => prev.map((x, i) => i === idx ? { ...x, closeTime: e.target.value } : x))}
                              className="border border-border rounded-lg h-8 px-2 text-sm bg-background text-foreground" />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <Button onClick={handleSaveHours} disabled={hoursSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                {hoursSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "💾 حفظ أوقات العمل"}
              </Button>
            </div>
          )}

          {/* ── Payment ── */}
          {settingsSection === "payment" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-500" /> طرق الدفع
              </h3>
              {[
                { key: "cash" as const, label: "نقدي", icon: "💵", state: paymentCash, set: setPaymentCash },
                { key: "electronic" as const, label: "إلكتروني (Moyasar)", icon: "💳", state: paymentElectronic, set: setPaymentElectronic },
                { key: "wallet" as const, label: "المحفظة الداخلية", icon: "👛", state: paymentWallet, set: setPaymentWallet },
              ].map(p => (
                <div key={p.key} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.icon}</span>
                    <span className="font-medium text-sm text-foreground">{p.label}</span>
                  </div>
                  <Switch checked={p.state} onCheckedChange={p.set} />
                </div>
              ))}
              <Button onClick={handleSavePayment} disabled={paymentSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                {paymentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
            </div>
          )}

          {/* ── Discounts ── */}
          {settingsSection === "discounts" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-foreground">كودات الخصم</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={loadDiscounts} disabled={discountsLoading}>
                    <RefreshCw className={cn("h-4 w-4", discountsLoading && "animate-spin")} />
                  </Button>
                  <Button size="sm" onClick={() => setShowDcForm(true)} className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
                    <Plus className="h-4 w-4 ml-1" /> إضافة
                  </Button>
                </div>
              </div>
              {discountsLoading ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
                <div className="space-y-2">
                  {discountCodes.map(dc => (
                    <div key={dc.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-amber-500 font-mono">{dc.code}</span>
                          <Badge variant="outline" className={cn("text-xs", dc.isActive ? "text-green-600" : "text-zinc-400")}>
                            {dc.isActive ? "نشط" : "منتهي"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {dc.discountType === "percentage" ? `${dc.value}%` : `${dc.value} ر.س`}
                          {dc.minOrder && ` | حد أدنى: ${fmtPrice(dc.minOrder / 100)}`}
                          {` | الاستخدامات: ${dc.currentUsages}${dc.maxUsages ? `/${dc.maxUsages}` : ""}`}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteDc(dc.id)} className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {discountCodes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <Gift className="h-10 w-10 opacity-20" />
                      <span className="text-sm">لا توجد كودات خصم</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Security ── */}
          {settingsSection === "security" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-500" /> تغيير الرمز السري
              </h3>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">الرمز المراد تغييره</label>
                <div className="flex gap-2">
                  {(["cashier", "admin"] as const).map(t => (
                    <button key={t} onClick={() => setPinTarget(t)}
                      className={cn("flex-1 py-2 rounded-xl text-sm font-bold border transition-colors",
                        pinTarget === t ? "bg-amber-500 text-white border-amber-500" : "bg-card text-muted-foreground border-border"
                      )}>
                      {t === "cashier" ? "رمز الكاشير" : "رمز الإدارة"}
                    </button>
                  ))}
                </div>
              </div>
              {otpStep === "idle" && (
                <div className="space-y-3">
                  <Input placeholder="رقم الجوال للتحقق" value={otpPhone} onChange={e => setOtpPhone(e.target.value)} dir="ltr" />
                  <Button onClick={handleSendOtp} disabled={otpSaving || !otpPhone.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                    {otpSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال OTP"}
                  </Button>
                </div>
              )}
              {otpStep === "sent" && (
                <div className="space-y-3">
                  <Input placeholder="رمز OTP المُرسَل" value={otpCode} onChange={e => setOtpCode(e.target.value)} dir="ltr" />
                  <Input placeholder="الرمز السري الجديد" type="password" value={newPin} onChange={e => setNewPin(e.target.value)} />
                  <Button onClick={handleVerifyOtp} disabled={otpSaving || !otpCode.trim() || !newPin.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                    {otpSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد وتغيير الرمز"}
                  </Button>
                </div>
              )}
              {otpStep === "verified" && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                  <div className="text-green-600 font-bold">✅ تم تغيير الرمز السري بنجاح</div>
                  <button onClick={() => { setOtpStep("idle"); setOtpPhone(""); setOtpCode(""); setNewPin(""); }}
                    className="text-sm text-muted-foreground mt-2 hover:text-foreground underline">تغيير مرة أخرى</button>
                </div>
              )}
            </div>
          )}

          {/* ── Appearance ── */}
          {settingsSection === "appearance" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Palette className="h-4 w-4 text-amber-500" /> المظهر
              </h3>
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">لون خلفية الشعار</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={logoBg} onChange={e => setLogoBg(e.target.value)}
                    className="h-10 w-20 rounded-lg border border-border cursor-pointer" />
                  <div className="h-10 w-10 rounded-full border-2 border-border" style={{ backgroundColor: logoBg }} />
                  <span className="text-sm text-muted-foreground font-mono">{logoBg}</span>
                </div>
                <Button onClick={handleSaveLogoBg} disabled={logoBgSaving}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                  {logoBgSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
                </Button>
              </div>
            </div>
          )}

          {settingsSection === "menuTemplate" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-amber-500" /> قالب المنيو
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { value: "classic", title: "القالب الحالي", description: "التصميم الحالي كما هو" },
                  { value: "modern", title: "قالب جديد", description: "التصميم الحديث المرفق" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMenuTemplate(option.value)}
                    className={cn(
                      "text-right rounded-xl border-2 p-4 transition-colors",
                      menuTemplate === option.value
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-border bg-background hover:border-amber-500/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "h-4 w-4 rounded-full border-2 flex items-center justify-center",
                        menuTemplate === option.value ? "border-amber-500" : "border-muted-foreground"
                      )}>
                        {menuTemplate === option.value && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                      </span>
                      <span className="font-bold text-foreground">{option.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{option.description}</p>
                  </button>
                ))}
              </div>
              <Button onClick={handleSaveMenuTemplate} disabled={menuTemplateSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                {menuTemplateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ قالب المنيو"}
              </Button>
            </div>
          )}

          {/* ── Notifications ── */}
          {settingsSection === "notifications" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" /> إشعارات إعادة التفاعل
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يُرسل النظام تلقائياً إشعاراً لكل عميل لم يفتح التطبيق منذ فترة معيّنة، مرة واحدة فقط لكل دورة غياب.
                الرسالة: «وحشتنا يا [الاسم] 👋 مرت فترة ما زرتنا فيها، تعال شوف عروضنا الجديدة 🍗»
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-foreground">عدد أيام الغياب قبل الإشعار</label>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      الحالي: <span className="font-bold text-amber-500">{reengagementDays} يوم</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={reengagementDaysInput}
                    onChange={e => setReengagementDaysInput(e.target.value)}
                    className="w-24 border border-border rounded-lg h-9 px-3 text-sm bg-background text-foreground text-center"
                    dir="ltr"
                  />
                  <span className="text-sm text-muted-foreground">يوم</span>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed space-y-1">
                  <div>⏰ يعمل الجدول يومياً في الساعة 2:00 صباحاً (توقيت الرياض)</div>
                  <div>✅ يُعاد ضبط حالة الإشعار تلقائياً عند فتح العميل للتطبيق من جديد</div>
                </div>
                <Button onClick={handleSaveReengagement} disabled={reengagementSaving}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                  {reengagementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "💾 حفظ الإعداد"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════════════ */}

      {/* ── Item Form Modal ───────────────────────────────────────────────── */}
      <Dialog open={showItemForm} onOpenChange={setShowItemForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "تعديل الصنف" : "إضافة صنف جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">الاسم (عربي) *</label>
                <Input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: مندي دجاج" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">الاسم (إنجليزي)</label>
                <Input value={itemForm.nameEn} onChange={e => setItemForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Chicken Mandi" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">التصنيف *</label>
                <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">السعر (ريال) *</label>
                <Input type="number" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">المخزون (فارغ = غير محدود)</label>
                <Input type="number" value={itemForm.stock} onChange={e => setItemForm(f => ({ ...f, stock: e.target.value }))} placeholder="∞" dir="ltr" />
              </div>
              <div className="space-y-1 flex flex-col justify-end">
                <div className="flex items-center gap-2 pb-1">
                  <Switch checked={itemForm.isAvailable} onCheckedChange={v => setItemForm(f => ({ ...f, isAvailable: v }))} />
                  <span className="text-sm text-muted-foreground">{itemForm.isAvailable ? "متاح" : "غير متاح"}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">الوصف</label>
              <Textarea value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="وصف الصنف..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">رابط الصورة</label>
              <Input value={itemForm.imageUrl} onChange={e => setItemForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." dir="ltr" />
              {itemForm.imageUrl && <img src={itemForm.imageUrl} alt="" className="w-full h-28 object-cover rounded-xl mt-2" onError={e => (e.currentTarget.style.display = "none")} />}
            </div>
            <Button onClick={handleSaveItem} disabled={itemFormSaving || !itemForm.name.trim() || !itemForm.price}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {itemFormSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingItem ? "حفظ التعديلات" : "إضافة الصنف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Occasion Form Modal ────────────────────────────────────────────── */}
      <Dialog open={showOccasionForm} onOpenChange={setShowOccasionForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingOccasion ? "تعديل المناسبة" : "إضافة مناسبة"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="اسم المناسبة" value={occasionForm.name} onChange={e => setOccasionForm(f => ({ ...f, name: e.target.value }))} />
            <Textarea placeholder="وصف" value={occasionForm.description} onChange={e => setOccasionForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            <Input placeholder="رابط الصورة" value={occasionForm.imageUrl} onChange={e => setOccasionForm(f => ({ ...f, imageUrl: e.target.value }))} dir="ltr" />
            <Button onClick={handleSaveOccasion} disabled={occasionSaving || !occasionForm.name.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {occasionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Combo Form Modal ───────────────────────────────────────────────── */}
      <Dialog open={showComboForm} onOpenChange={setShowComboForm}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCombo ? "تعديل الوجبة" : "إضافة وجبة مجمّعة"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="اسم الوجبة" value={comboForm.name} onChange={e => setComboForm(f => ({ ...f, name: e.target.value }))} />
            <Input type="number" placeholder="السعر (ريال)" value={comboForm.price} onChange={e => setComboForm(f => ({ ...f, price: e.target.value }))} dir="ltr" />
            <Textarea placeholder="الوصف" value={comboForm.description} onChange={e => setComboForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            <Input placeholder="رابط الصورة" value={comboForm.imageUrl} onChange={e => setComboForm(f => ({ ...f, imageUrl: e.target.value }))} dir="ltr" />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">المكونات</label>
              {comboComponents.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="اسم الصنف" value={c.name} onChange={e => setComboComponents(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1" />
                  <Input type="number" placeholder="كمية" value={c.quantity} onChange={e => setComboComponents(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} className="w-16" dir="ltr" />
                  {comboComponents.length > 1 && (
                    <button onClick={() => setComboComponents(prev => prev.filter((_, j) => j !== i))}
                      className="h-9 w-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setComboComponents(prev => [...prev, { name: "", quantity: "1" }])}
                className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-amber-500/50 hover:text-amber-500 transition-colors">
                + إضافة مكوّن
              </button>
            </div>
            <Button onClick={handleSaveCombo} disabled={comboSaving || !comboForm.name.trim() || !comboForm.price}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {comboSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Zone Form Modal ────────────────────────────────────────────────── */}
      <Dialog open={showZoneForm} onOpenChange={setShowZoneForm}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader><DialogTitle>{editingZone ? "تعديل المنطقة" : "إضافة منطقة توصيل"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="اسم المنطقة" value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))} className="col-span-2" />
              <Input type="number" placeholder="رسوم التوصيل (ريال)" value={zoneForm.fee} onChange={e => setZoneForm(f => ({ ...f, fee: e.target.value }))} dir="ltr" />
              <Input type="number" placeholder="الحد الأدنى للطلب (ريال)" value={zoneForm.minOrder} onChange={e => setZoneForm(f => ({ ...f, minOrder: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">الفرع المسؤول (اختياري)</label>
              <Select value={zoneForm.branchId} onValueChange={branchId => setZoneForm(f => ({ ...f, branchId }))}>
                <SelectTrigger><SelectValue placeholder="اختر فرعاً" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">غير معيّنة لأي فرع</SelectItem>
                  {zoneBranches.map(branch => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name} — {branch.active ? "نشط" : "موقوف"} / توصيل {branch.deliveryEnabled ? "مفعّل" : "موقوف"} / استلام {branch.pickupEnabled ? "مفعّل" : "موقوف"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {zoneForm.branchId !== "unassigned" && (() => {
                const branch = zoneBranches.find(b => b.id === Number(zoneForm.branchId));
                return branch && (!branch.active || !branch.deliveryEnabled) ? (
                  <p className="text-xs text-amber-600">⚠ {branch.active ? "التوصيل غير مفعّل لهذا الفرع" : "هذا الفرع موقوف"}</p>
                ) : null;
              })()}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  حدود المنطقة على الخريطة
                  {zonePolygon.length > 0 && (
                    <span className="mr-2 text-green-600">{zonePolygon.length} نقطة{zonePolygon.length < 3 ? ` (${3 - zonePolygon.length} متبقية)` : " ✓"}</span>
                  )}
                </span>
                <div className="flex gap-1.5">
                  {zonePolygon.length > 0 && (
                    <button onClick={() => setZonePolygon(p => p.slice(0, -1))}
                      className="text-xs px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-muted-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                      ↩ تراجع
                    </button>
                  )}
                  {zonePolygon.length > 0 && (
                    <button onClick={() => setZonePolygon([])}
                      className="text-xs px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                      مسح الكل
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">انقر على الخريطة لإضافة نقاط المضلع (3 نقاط على الأقل)</p>
              <ZoneMapPicker points={zonePolygon} onChange={setZonePolygon} />
            </div>
            <Button onClick={handleSaveZone} disabled={zoneSaving || !zoneForm.name.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {zoneSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Discount Code Form Modal ────────────────────────────────────────── */}
      <Dialog open={showDcForm} onOpenChange={setShowDcForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة كود خصم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="الكود (مثل: RAMADAN50)" value={dcForm.code} onChange={e => setDcForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} dir="ltr" className="font-mono" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={dcForm.discountType} onValueChange={v => setDcForm(f => ({ ...f, discountType: v as "percentage" | "fixed" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">نسبة مئوية %</SelectItem>
                  <SelectItem value="fixed">مبلغ ثابت ريال</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder={dcForm.discountType === "percentage" ? "%" : "ريال"} value={dcForm.value} onChange={e => setDcForm(f => ({ ...f, value: e.target.value }))} dir="ltr" />
            </div>
            <Input type="number" placeholder="الحد الأدنى للطلب (ريال)" value={dcForm.minOrder} onChange={e => setDcForm(f => ({ ...f, minOrder: e.target.value }))} dir="ltr" />
            <Input type="number" placeholder="الحد الأقصى للاستخدام (فارغ = غير محدود)" value={dcForm.maxUsages} onChange={e => setDcForm(f => ({ ...f, maxUsages: e.target.value }))} dir="ltr" />
            <Input type="date" placeholder="تاريخ الانتهاء" value={dcForm.expiresAt} onChange={e => setDcForm(f => ({ ...f, expiresAt: e.target.value }))} dir="ltr" />
            <Textarea placeholder="وصف الكود (اختياري)" value={dcForm.description} onChange={e => setDcForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            <Button onClick={handleSaveDc} disabled={dcSaving || !dcForm.code.trim() || !dcForm.value}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
              {dcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة الكود"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
