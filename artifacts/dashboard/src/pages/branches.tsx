import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPut, apiDel } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, RefreshCw, Pencil, Trash2, MapPin, Phone, GitBranch, Package } from "lucide-react";

interface Branch {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  active: boolean;
  lat: number | null;
  lng: number | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  createdAt: string;
  weeklyOperatingHours: Record<string, null | "closed" | { open: string; close: string }> | null;
  deliveryCapacity: number | null;
}

interface ProductAvailability {
  itemId: string;
  name: string;
  globalAvailable: boolean;
  override: boolean | null;
  effective: boolean;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_NAMES: Record<string, string> = { sun: "الأحد", mon: "الإثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة", sat: "السبت" };

const parseHours = (hoursMap: Record<string, null | "closed" | { open: string; close: string }> | null) => {
  const result: Record<string, { isOpen: boolean; open: string; close: string }> = {};
  for (const day of DAYS) {
    if (hoursMap && hoursMap[day]) {
      const val = hoursMap[day];
      if (val === "closed") {
        result[day] = { isOpen: false, open: "08:00", close: "23:59" };
      } else if (typeof val === "object" && val !== null) {
        result[day] = { isOpen: true, open: val.open || "08:00", close: val.close || "23:59" };
      }
    } else {
      result[day] = { isOpen: true, open: "08:00", close: "23:59" };
    }
  }
  return result;
};

const formatHours = (hours: Record<string, { isOpen: boolean; open: string; close: string }>, enabled: boolean) => {
  if (!enabled) return null;
  const result: Record<string, null | "closed" | { open: string; close: string }> = {};
  for (const day of DAYS) {
    if (!hours[day].isOpen) {
      result[day] = "closed";
    } else {
      result[day] = { open: hours[day].open, close: hours[day].close };
    }
  }
  return result;
};

interface BranchForm {
  id?: number;
  name: string;
  address: string;
  phone: string;
  mapsUrl: string;
  active: boolean;
  lat: string;
  lng: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  hoursEnabled: boolean;
  hours: Record<string, { isOpen: boolean; open: string; close: string }>;
  deliveryCapacity: string;
}

const emptyForm = (): BranchForm => ({
  name: "", address: "", phone: "", mapsUrl: "", active: false, lat: "", lng: "",
  deliveryEnabled: false, pickupEnabled: false,
  hoursEnabled: false,
  hours: parseHours(null),
  deliveryCapacity: "",
});

export default function Branches() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading]   = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm]             = useState<BranchForm>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState("");

  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const [productsOpen, setProductsOpen] = useState(false);
  const [productsBranch, setProductsBranch] = useState<Branch | null>(null);
  const [products, setProducts] = useState<ProductAvailability[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productUpdating, setProductUpdating] = useState<string | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await apiGet<Branch[]>("/branches");
      setBranches(data);
    } catch {
      toast({ title: "خطأ", description: "تعذّر تحميل الفروع", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open dialog ────────────────────────────────────────────────────────────
  const openAdd  = () => { setForm(emptyForm()); setFormError(""); setDialogOpen(true); };
  const openEdit = (b: Branch) => {
    setForm({
      id: b.id,
      name: b.name,
      address: b.address ?? "",
      phone: b.phone ?? "",
      mapsUrl: b.mapsUrl ?? "",
      active: b.active,
      lat: b.lat != null ? String(b.lat) : "",
      lng: b.lng != null ? String(b.lng) : "",
      deliveryEnabled: b.deliveryEnabled,
      pickupEnabled: b.pickupEnabled,
      hoursEnabled: b.weeklyOperatingHours != null,
      hours: parseHours(b.weeklyOperatingHours),
      deliveryCapacity: b.deliveryCapacity != null ? String(b.deliveryCapacity) : "",
    });
    setFormError("");
    setDialogOpen(true);
  };

  const loadProducts = async (branchId: number) => {
    setProductsLoading(true);
    try {
      const data = await apiGet<ProductAvailability[]>(`/branches/${branchId}/product-availability`);
      setProducts(data);
    } catch {
      toast({ title: "خطأ", description: "تعذّر تحميل المنتجات", variant: "destructive" });
    }
    setProductsLoading(false);
  };

  const handleOpenProducts = (b: Branch) => {
    setProductsBranch(b);
    setProducts([]);
    setProductsOpen(true);
    loadProducts(b.id);
  };

  const updateProduct = async (itemId: string, availableStr: string) => {
    if (!productsBranch) return;
    const val = availableStr === "inherit" ? null : availableStr === "enabled";
    setProductUpdating(itemId);
    try {
      await apiPut(`/branches/${productsBranch.id}/product-availability`, { itemId, available: val });
      setProducts(prev => prev.map(p => {
         if (p.itemId === itemId) {
           const effective = p.globalAvailable && val !== false;
           return { ...p, override: val, effective };
         }
         return p;
      }));
      toast({ title: "تم التحديث" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر تحديث حالة المنتج", variant: "destructive" });
    }
    setProductUpdating(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("اسم الفرع مطلوب"); return; }
    const hasLat = form.lat.trim() !== "";
    const hasLng = form.lng.trim() !== "";
    if (hasLat !== hasLng) {
      setFormError("أدخل خط العرض وخط الطول معًا، أو اترك الحقلين فارغين");
      return;
    }
    const latVal = hasLat ? Number(form.lat) : null;
    const lngVal = hasLng ? Number(form.lng) : null;
    if (
      (latVal !== null && (!Number.isFinite(latVal) || latVal < -90 || latVal > 90))
      || (lngVal !== null && (!Number.isFinite(lngVal) || lngVal < -180 || lngVal > 180))
    ) {
      setFormError("تحقق من الإحداثيات: Latitude بين -90 و90 وLongitude بين -180 و180");
      return;
    }

    const deliveryCapVal = form.deliveryCapacity.trim() ? parseInt(form.deliveryCapacity, 10) : null;
    if (deliveryCapVal !== null && (isNaN(deliveryCapVal) || deliveryCapVal < 1)) {
       setFormError("الطاقة الاستيعابية يجب أن تكون رقماً صحيحاً أكبر من صفر");
       return;
    }

    setSaving(true);
    try {
      const payload = {
        name:    form.name.trim(),
        address: form.address.trim() || null,
        phone:   form.phone.trim()   || null,
        mapsUrl: form.mapsUrl.trim() || null,
        active:  form.active,
        lat: latVal,
        lng: lngVal,
        deliveryEnabled: form.deliveryEnabled,
        pickupEnabled: form.pickupEnabled,
        weeklyOperatingHours: formatHours(form.hours, form.hoursEnabled),
        deliveryCapacity: deliveryCapVal,
      };
      if (form.id) {
        await apiPut(`/branches/${form.id}`, payload);
        toast({ title: "تم التعديل" });
      } else {
        await apiPost("/branches", payload);
        toast({ title: "تمت الإضافة" });
      }
      setDialogOpen(false);
      load(true);
    } catch {
      setFormError("حدث خطأ، حاول مرة أخرى");
    }
    setSaving(false);
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggle = async (b: Branch) => {
    try {
      await apiPut(`/branches/${b.id}`, { active: !b.active });
      setBranches(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x));
    } catch {
      toast({ title: "خطأ", description: "تعذّر تحديث الحالة", variant: "destructive" });
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiDel(`/branches/${deleteId}`);
      toast({ title: "تم الحذف" });
      setDeleteId(null);
      load(true);
    } catch {
      toast({ title: "خطأ", description: "تعذّر حذف الفرع", variant: "destructive" });
    }
    setDeleting(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-teal-600" />
            إدارة الفروع
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            أضف فروع المطعم — سيرى العميل قائمة الفروع عند الاستلام
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)}>
            <RefreshCw className="w-4 h-4 ml-1" />
            تحديث
          </Button>
          <Button size="sm" onClick={openAdd} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 ml-1" />
            إضافة فرع
          </Button>
        </div>
      </div>

      {/* Info banner when only 1 branch */}
      {!loading && branches.length <= 1 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          💡 عندما يكون هناك فرعان أو أكثر، سيظهر للعميل خيار اختيار الفرع عند الضغط على
          <strong> "استلام"</strong> في صفحة الدفع.
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : branches.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">لا توجد فروع مضافة</p>
          <p className="text-sm mt-1">اضغط «إضافة فرع» لإضافة أول فرع</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {branches.map(b => (
            <div
              key={b.id}
              className={`rounded-xl border p-4 space-y-3 transition-opacity ${b.active ? "bg-white border-border" : "bg-muted/40 border-border opacity-60"}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base truncate">{b.name}</span>
                    <Badge variant={b.active ? "default" : "secondary"} className="text-xs shrink-0">
                      {b.active ? "نشط" : "موقوف"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant={b.deliveryEnabled ? "outline" : "secondary"} className="text-[11px]">
                      التوصيل: {b.deliveryEnabled ? "مفعّل" : "موقوف"}
                    </Badge>
                    <Badge variant={b.pickupEnabled ? "outline" : "secondary"} className="text-[11px]">
                      الاستلام: {b.pickupEnabled ? "مفعّل" : "موقوف"}
                    </Badge>
                  </div>
                  {b.address && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {b.address}
                    </p>
                  )}
                  {b.phone && (
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 dir-ltr" dir="ltr">
                      <Phone className="w-3 h-3 shrink-0" />
                      {b.phone}
                    </p>
                  )}
                  {b.mapsUrl && (
                    <a
                      href={b.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-0.5 block truncate"
                    >
                      🗺️ رابط الخريطة
                    </a>
                  )}
                </div>
              </div>

              {/* Bottom row */}
              <div className="flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`active-${b.id}`}
                    checked={b.active}
                    onCheckedChange={() => handleToggle(b)}
                  />
                  <Label htmlFor={`active-${b.id}`} className="text-sm cursor-pointer">
                    {b.active ? "نشط" : "موقوف"}
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenProducts(b)}>
                    <Package className="w-3.5 h-3.5 ml-1" />
                    المنتجات
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(b.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل الفرع" : "إضافة فرع جديد"}</DialogTitle>
            <DialogDescription>
              حدّث بيانات الفرع وخيارات الاستلام والتوصيل وساعات التشغيل.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto px-1">
            <div className="space-y-1">
              <Label>اسم الفرع <span className="text-destructive">*</span></Label>
              <Input
                placeholder="مثال: الفرع الرئيسي — الروضة"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input
                placeholder="مثال: تبوك — حي الروضة، شارع الملك سلمان"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>رقم الهاتف</Label>
              <Input
                placeholder="مثال: 0501234567"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>رابط الخريطة (Google Maps)</Label>
              <Input
                placeholder="https://maps.app.goo.gl/..."
                value={form.mapsUrl}
                onChange={e => setForm(f => ({ ...f, mapsUrl: e.target.value }))}
                dir="ltr"
              />
            </div>
            {/* Coordinates */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                إحداثيات الموقع
                <span className="text-muted-foreground text-xs font-normal mr-1">(اختياري)</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                افتح الموقع على Google Maps ← اضغط على النقطة ← انسخ الإحداثيات
              </p>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">خط العرض (Latitude)</Label>
                  <Input
                    placeholder="مثال: 28.3835"
                    value={form.lat}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    dir="ltr"
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">خط الطول (Longitude)</Label>
                  <Input
                    placeholder="مثال: 36.5662"
                    value={form.lng}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                    dir="ltr"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Capacity */}
            <div className="space-y-1">
              <Label>الطاقة الاستيعابية للتوصيل <span className="text-muted-foreground font-normal">(اختياري)</span></Label>
              <Input
                placeholder="مثال: 5 (طلبات في نفس الوقت)"
                value={form.deliveryCapacity}
                onChange={e => setForm(f => ({ ...f, deliveryCapacity: e.target.value }))}
                type="number"
                min="1"
                dir="ltr"
                className="text-right"
              />
            </div>

            {/* Hours */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="form-hours-enabled"
                  checked={form.hoursEnabled}
                  onCheckedChange={v => setForm(f => ({ ...f, hoursEnabled: v }))}
                />
                <Label htmlFor="form-hours-enabled" className="cursor-pointer">تخصيص أوقات العمل</Label>
              </div>
              {form.hoursEnabled && (
                <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                  {DAYS.map(day => {
                     const h = form.hours[day];
                     const isOvernight = h.isOpen && h.close < h.open;
                     return (
                       <div key={day} className="flex items-center gap-2 text-sm">
                         <span className="w-16 font-medium shrink-0">{DAY_NAMES[day]}</span>
                         <Select
                           value={h.isOpen ? "open" : "closed"}
                           onValueChange={v => setForm(f => ({ ...f, hours: { ...f.hours, [day]: { ...h, isOpen: v === "open" } } }))}
                         >
                           <SelectTrigger className="w-24 h-8 shrink-0"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="open">مفتوح</SelectItem>
                             <SelectItem value="closed">مغلق</SelectItem>
                           </SelectContent>
                         </Select>
                         {h.isOpen && (
                           <div className="flex items-center gap-2 flex-1 min-w-0">
                             <Input
                               type="time"
                               value={h.open}
                               onChange={e => setForm(f => ({ ...f, hours: { ...f.hours, [day]: { ...h, open: e.target.value } } }))}
                               className="h-8 w-24 dir-ltr shrink-0"
                             />
                             <span className="text-muted-foreground">-</span>
                             <Input
                               type="time"
                               value={h.close}
                               onChange={e => setForm(f => ({ ...f, hours: { ...f.hours, [day]: { ...h, close: e.target.value } } }))}
                               className="h-8 w-24 dir-ltr shrink-0"
                             />
                             {isOvernight && <Badge variant="outline" className="text-[10px] whitespace-nowrap">لليوم التالي</Badge>}
                           </div>
                         )}
                       </div>
                     );
                  })}
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Switch
                id="form-active"
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
              <Label htmlFor="form-active">نشط (مرئي للعملاء)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="form-delivery-enabled"
                checked={form.deliveryEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, deliveryEnabled: v }))}
              />
              <Label htmlFor="form-delivery-enabled">التوصيل مفعّل</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="form-pickup-enabled"
                checked={form.pickupEnabled}
                onCheckedChange={v => setForm(f => ({ ...f, pickupEnabled: v }))}
              />
              <Label htmlFor="form-pickup-enabled">الاستلام من الفرع مفعّل</Label>
            </div>
            {formError && <p className="text-destructive text-sm">{formError}</p>}
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
              {saving ? "جارٍ الحفظ…" : form.id ? "حفظ التعديلات" : "إضافة الفرع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDesc>
              سيتم حذف الفرع نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "جارٍ الحذف…" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Products availability dialog */}
      <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>توفر المنتجات: {productsBranch?.name}</DialogTitle>
            <DialogDescription>
              تخصيص توفر المنتجات في هذا الفرع. إذا كان المنتج موقوفاً عاماً، فلن تتمكن من تفعيله هنا.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 mt-2">
            {productsLoading ? (
               <div className="space-y-3">
                 {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
               </div>
            ) : products.length === 0 ? (
               <div className="text-center py-12 text-muted-foreground">لا توجد منتجات</div>
            ) : (
               <div className="space-y-2">
                 {products.map(p => {
                   const val = p.override === null ? "inherit" : p.override ? "enabled" : "disabled";
                   const isDisabledGlobally = !p.globalAvailable;
                   return (
                     <div key={p.itemId} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                       <div>
                         <div className="font-medium text-sm">{p.name}</div>
                         <div className="text-xs mt-1 flex gap-1.5 items-center">
                           <Badge variant={p.globalAvailable ? "outline" : "secondary"} className="text-[10px] py-0 h-5">
                             العام: {p.globalAvailable ? "متاح" : "غير متاح"}
                           </Badge>
                           <Badge variant={p.effective ? "default" : "secondary"} className={`text-[10px] py-0 h-5 ${p.effective ? "bg-green-600 hover:bg-green-600 border-green-600" : ""}`}>
                             الفعلي: {p.effective ? "متاح" : "غير متاح"}
                           </Badge>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {productUpdating === p.itemId && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
                         <Select
                           value={val}
                           onValueChange={(v) => updateProduct(p.itemId, v)}
                           disabled={productUpdating === p.itemId}
                         >
                           <SelectTrigger className="w-32 h-8 text-xs">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="inherit" className="text-xs">وراثة العام</SelectItem>
                             {(!isDisabledGlobally || val === "enabled") && (
                               <SelectItem value="enabled" disabled={isDisabledGlobally} className="text-xs">متاح للفرع</SelectItem>
                             )}
                             <SelectItem value="disabled" className="text-xs">إيقاف للفرع</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                     </div>
                   )
                 })}
               </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
