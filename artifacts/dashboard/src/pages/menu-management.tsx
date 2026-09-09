import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPost, apiPut, apiDel } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, Pencil, Trash2, Search, Loader2, PackageX, Package, ImagePlus, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileToCompressedDataUrl } from "@/lib/imageUpload";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
void API_BASE;

interface SizeOption {
  name: string;
  price: string;
  enabled: boolean;
}

interface OptionChoice {
  name: string;
  extraPrice: string;
  available: boolean;
}

interface OptionGroup {
  groupName: string;
  required: boolean;
  choices: OptionChoice[];
  collapsed?: boolean;
}

interface SimpleChoice {
  name: string;
  extraPrice: string;
  available: boolean;
}

interface MenuItem {
  itemId: string;
  name: string;
  nameAr?: string;
  description?: string;
  price: number;
  category: string;
  imageUrl?: string | null;
  available: boolean;
  stock?: number | null;
  sizes: { name: string; price: number; enabled: boolean }[];
  options: { groupName: string; required: boolean; choices: { name: string; extraPrice: number; available: boolean }[] }[];
  riceTypes?: { name: string; extraPrice: number; available: boolean }[];
  additions?: { name: string; extraPrice: number; available: boolean }[];
  calories?: number | null;
  walkingMinutes?: number | null;
  sortOrder: number;
}

interface MenuCategory {
  id: string;
  name: string;
  nameEn?: string;
  icon: string;
  isCustom?: boolean;
}

const DEFAULT_CATEGORIES: MenuCategory[] = [
  { id: "chicken",  name: "الدجاج",           icon: "🍗" },
  { id: "meat",     name: "اللحوم",           icon: "🥩" },
  { id: "mains",    name: "الأطباق الرئيسية", icon: "🍽️" },
  { id: "sides",    name: "الإيدامات",        icon: "🥘" },
  { id: "salads",   name: "السلطات",          icon: "🥗" },
  { id: "desserts", name: "الحلويات",         icon: "🍮" },
  { id: "drinks",   name: "المشروبات",        icon: "🥤" },
  { id: "extras",   name: "إضافات",           icon: "✨" },
];

const getCatMeta = (id: string, categories: MenuCategory[]) =>
  categories.find(c => c.id === id) ?? { id, name: id, icon: "🍽️" };

function defaultSizesForCategory(category: string): SizeOption[] {
  if (category === "drinks") {
    return [
      { name: "صغير", price: "", enabled: false },
      { name: "وسط",  price: "", enabled: false },
      { name: "كبير", price: "", enabled: false },
    ];
  }
  return [
    { name: "صغير", price: "", enabled: false },
    { name: "كبير", price: "", enabled: false },
  ];
}

interface ItemForm {
  itemId?: string;
  name: string;
  nameAr: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
  available: boolean;
  stock: string;
  sizes: SizeOption[];
  options: OptionGroup[];
  riceTypes: SimpleChoice[];
  additions: SimpleChoice[];
  calories: string;
  walkingMinutes: string;
}

const emptyForm = (): ItemForm => ({
  name: "", nameAr: "", description: "", price: "", category: "chicken",
  imageUrl: "", available: true, stock: "",
  sizes: defaultSizesForCategory("chicken"),
  options: [],
  riceTypes: [],
  additions: [],
  calories: "",
  walkingMinutes: "",
});

export default function MenuManagement() {
  const { toast } = useToast();
  const [items, setItems]         = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [form, setForm]                 = useState<ItemForm>(emptyForm());
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState("");

  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [stockEditId, setStockEditId]   = useState<string | null>(null);
  const [stockVal, setStockVal]         = useState("");
  const [stockSaving, setStockSaving]   = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderingCategoryId, setReorderingCategoryId] = useState<string | null>(null);
  const imgFileRef                      = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setForm(f => ({ ...f, imageUrl: dataUrl }));
    } catch (err) {
      toast({ title: "تعذّر رفع الصورة", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      if (imgFileRef.current) imgFileRef.current.value = "";
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [data, categoryData] = await Promise.all([
        apiGet<MenuItem[]>("/menu"),
        apiGet<MenuCategory[]>("/menu-categories"),
      ]);
      setItems(data);
      setCategories(categoryData);
    } catch {
      toast({ title: "تعذّر تحميل القائمة", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = items
    .filter(item => {
      const matchCat = catFilter === "all" || item.category === catFilter;
      const q = search.trim().toLowerCase();
      const matchSearch = !q || item.name.toLowerCase().includes(q) || (item.nameAr ?? "").includes(q);
      return matchCat && matchSearch;
    })
    .sort((a, b) => {
      const categoryOrder = categories.findIndex(category => category.id === a.category) -
        categories.findIndex(category => category.id === b.category);
      return categoryOrder || a.sortOrder - b.sortOrder;
    });

  const categoryItems = (categoryId: string) =>
    items
      .filter(item => item.category === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const canReorderItems = catFilter !== "all" && search.trim() === "";

  const openCategoryDialog = () => {
    setCategoryName("");
    setCategoryError("");
    setCategoryDialogOpen(true);
  };

  const handleCategorySave = async () => {
    const name = categoryName.trim();
    if (!name) {
      setCategoryError("اسم القسم مطلوب");
      return;
    }

    setCategorySaving(true);
    setCategoryError("");
    try {
      const created = await apiPost<MenuCategory>("/menu-categories", { name });
      setCategories(prev => [...prev, created]);
      setCategoryDialogOpen(false);
      toast({ title: "تم إضافة القسم ✓" });
    } catch (e: unknown) {
      setCategoryError((e as { message?: string })?.message ?? "تعذّر إضافة القسم");
    } finally {
      setCategorySaving(false);
    }
  };

  const moveCategory = async (categoryId: string, direction: -1 | 1) => {
    const currentIndex = categories.findIndex(category => category.id === categoryId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= categories.length) return;

    const nextCategories = [...categories];
    [nextCategories[currentIndex], nextCategories[nextIndex]] = [nextCategories[nextIndex], nextCategories[currentIndex]];
    setReorderingCategoryId(categoryId);
    try {
      const saved = await apiPut<MenuCategory[]>("/menu-categories/reorder", {
        ids: nextCategories.map(category => category.id),
      });
      setCategories(saved);
    } catch {
      toast({ title: "تعذّر حفظ ترتيب الأقسام", variant: "destructive" });
    } finally {
      setReorderingCategoryId(null);
    }
  };

  const moveItem = async (item: MenuItem, direction: -1 | 1) => {
    if (!canReorderItems) return;
    const currentItems = categoryItems(item.category);
    const currentIndex = currentItems.findIndex(current => current.itemId === item.itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentItems.length) return;

    const nextItems = [...currentItems];
    [nextItems[currentIndex], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[currentIndex]];
    setReorderingId(item.itemId);
    try {
      await apiPut("/menu/reorder", { itemIds: nextItems.map(current => current.itemId) });
      const orderById = new Map(nextItems.map((current, index) => [current.itemId, index + 1]));
      setItems(prev => prev.map(current => {
        const sortOrder = orderById.get(current.itemId);
        return sortOrder === undefined ? current : { ...current, sortOrder };
      }));
    } catch {
      toast({ title: "تعذّر حفظ ترتيب الأصناف", variant: "destructive" });
    } finally {
      setReorderingId(null);
    }
  };

  const openAdd = () => {
    setForm(emptyForm());
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    const existingSizes = item.sizes ?? [];
    let sizes: SizeOption[];
    if (existingSizes.length > 0) {
      sizes = existingSizes.map(s => ({
        name: s.name,
        price: s.price > 0 ? String(s.price / 100) : "",
        enabled: s.enabled,
      }));
    } else {
      sizes = defaultSizesForCategory(item.category);
    }

    const existingOptions = item.options ?? [];
    const options: OptionGroup[] = existingOptions.map(g => ({
      groupName: g.groupName,
      required: g.required,
      collapsed: false,
      choices: g.choices.map(c => ({
        name: c.name,
        extraPrice: c.extraPrice > 0 ? String(c.extraPrice / 100) : "0",
        available: c.available,
      })),
    }));

    const riceTypes: SimpleChoice[] = (item.riceTypes ?? []).map(r => ({
      name: r.name,
      extraPrice: r.extraPrice > 0 ? String(r.extraPrice / 100) : "0",
      available: r.available,
    }));
    const additions: SimpleChoice[] = (item.additions ?? []).map(a => ({
      name: a.name,
      extraPrice: a.extraPrice > 0 ? String(a.extraPrice / 100) : "0",
      available: a.available,
    }));

    setForm({
      itemId: item.itemId,
      name: item.name,
      nameAr: item.nameAr ?? "",
      description: item.description ?? "",
      price: String(item.price / 100),
      category: item.category,
      imageUrl: item.imageUrl ?? "",
      available: item.available,
      stock: item.stock === null || item.stock === undefined ? "" : String(item.stock),
      sizes,
      options,
      riceTypes,
      additions,
      calories: item.calories != null ? String(item.calories) : "",
      walkingMinutes: item.walkingMinutes != null ? String(item.walkingMinutes) : "",
    });
    setFormError("");
    setDialogOpen(true);
  };

  const handleCategoryChange = (newCat: string) => {
    setForm(f => {
      const wasdrinks = f.category === "drinks";
      const isdrinks = newCat === "drinks";
      let sizes = f.sizes;
      if (wasdrinks !== isdrinks && sizes.length === 0) {
        sizes = defaultSizesForCategory(newCat);
      }
      return { ...f, category: newCat, sizes };
    });
  };

  // ── Size helpers ──
  const updateSize = (idx: number, field: keyof SizeOption, value: string | boolean) => {
    setForm(f => ({
      ...f,
      sizes: f.sizes.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };
  const addSize = () => {
    setForm(f => ({ ...f, sizes: [...f.sizes, { name: "", price: "", enabled: true }] }));
  };
  const removeSize = (idx: number) => {
    setForm(f => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }));
  };

  // ── Rice type helpers ──
  const addRiceType = () => setForm(f => ({ ...f, riceTypes: [...f.riceTypes, { name: "", extraPrice: "0", available: true }] }));
  const removeRiceType = (idx: number) => setForm(f => ({ ...f, riceTypes: f.riceTypes.filter((_, i) => i !== idx) }));
  const updateRiceType = (idx: number, field: keyof SimpleChoice, value: string | boolean) =>
    setForm(f => ({ ...f, riceTypes: f.riceTypes.map((r, i) => i === idx ? { ...r, [field]: value } : r) }));

  // ── Addition helpers ──
  const addAddition = () => setForm(f => ({ ...f, additions: [...f.additions, { name: "", extraPrice: "0", available: true }] }));
  const removeAddition = (idx: number) => setForm(f => ({ ...f, additions: f.additions.filter((_, i) => i !== idx) }));
  const updateAddition = (idx: number, field: keyof SimpleChoice, value: string | boolean) =>
    setForm(f => ({ ...f, additions: f.additions.map((a, i) => i === idx ? { ...a, [field]: value } : a) }));

  // ── Option group helpers ──
  const addOptionGroup = () => {
    setForm(f => ({
      ...f,
      options: [...f.options, { groupName: "", required: false, collapsed: false, choices: [{ name: "", extraPrice: "0", available: true }] }],
    }));
  };
  const removeOptionGroup = (gIdx: number) => {
    setForm(f => ({ ...f, options: f.options.filter((_, i) => i !== gIdx) }));
  };
  const updateOptionGroup = (gIdx: number, field: keyof Omit<OptionGroup, "choices">, value: string | boolean) => {
    setForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === gIdx ? { ...g, [field]: value } : g),
    }));
  };
  const toggleGroupCollapsed = (gIdx: number) => {
    setForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === gIdx ? { ...g, collapsed: !g.collapsed } : g),
    }));
  };

  // ── Choice helpers ──
  const addChoice = (gIdx: number) => {
    setForm(f => ({
      ...f,
      options: f.options.map((g, i) =>
        i === gIdx
          ? { ...g, choices: [...g.choices, { name: "", extraPrice: "0", available: true }] }
          : g
      ),
    }));
  };
  const removeChoice = (gIdx: number, cIdx: number) => {
    setForm(f => ({
      ...f,
      options: f.options.map((g, i) =>
        i === gIdx ? { ...g, choices: g.choices.filter((_, ci) => ci !== cIdx) } : g
      ),
    }));
  };
  const updateChoice = (gIdx: number, cIdx: number, field: keyof OptionChoice, value: string | boolean) => {
    setForm(f => ({
      ...f,
      options: f.options.map((g, i) =>
        i === gIdx
          ? { ...g, choices: g.choices.map((c, ci) => ci === cIdx ? { ...c, [field]: value } : c) }
          : g
      ),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("اسم الصنف مطلوب"); return; }
    if (!form.price.trim() || isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) {
      setFormError("أدخل سعراً صحيحاً"); return;
    }
    for (const s of form.sizes) {
      if (!s.name.trim()) { setFormError("أدخل اسم الحجم"); return; }
      if (s.enabled && (s.price.trim() === "" || isNaN(parseFloat(s.price)) || parseFloat(s.price) < 0)) {
        setFormError(`أدخل سعراً صحيحاً للحجم: ${s.name}`); return;
      }
    }
    for (const g of form.options) {
      if (!g.groupName.trim()) { setFormError("أدخل اسم مجموعة الخيارات"); return; }
      for (const c of g.choices) {
        if (!c.name.trim()) { setFormError(`أدخل اسم الخيار في: ${g.groupName}`); return; }
        if (isNaN(parseFloat(c.extraPrice)) || parseFloat(c.extraPrice) < 0) {
          setFormError(`سعر إضافي غير صحيح في: ${g.groupName}`); return;
        }
      }
    }
    for (const r of form.riceTypes) {
      if (!r.name.trim()) { setFormError("أدخل اسم نوع الأرز"); return; }
      if (isNaN(parseFloat(r.extraPrice)) || parseFloat(r.extraPrice) < 0) {
        setFormError("سعر إضافي غير صحيح في أنواع الأرز"); return;
      }
    }
    for (const a of form.additions) {
      if (!a.name.trim()) { setFormError("أدخل اسم الإضافة"); return; }
      if (isNaN(parseFloat(a.extraPrice)) || parseFloat(a.extraPrice) < 0) {
        setFormError("سعر إضافي غير صحيح في الإضافات"); return;
      }
    }
    setSaving(true);
    setFormError("");
    try {
      const sizes = form.sizes.map(s => ({
        name: s.name,
        price: s.enabled ? parseFloat(s.price) : 0,
        enabled: s.enabled,
      }));
      const options = form.options.map(g => ({
        groupName: g.groupName,
        required: g.required,
        choices: g.choices.map(c => ({
          name: c.name,
          extraPrice: parseFloat(c.extraPrice) || 0,
          available: c.available,
        })),
      }));
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || undefined,
        description: form.description.trim() || undefined,
        price: parseFloat(form.price),
        category: form.category,
        imageUrl: form.imageUrl.trim() || undefined,
        available: form.available,
        stock: form.stock.trim() === "" ? null : parseInt(form.stock),
        sizes,
        options,
        riceTypes: form.riceTypes.map(r => ({
          name: r.name,
          extraPrice: parseFloat(r.extraPrice) || 0,
          available: r.available,
        })),
        additions: form.additions.map(a => ({
          name: a.name,
          extraPrice: parseFloat(a.extraPrice) || 0,
          available: a.available,
        })),
        calories: form.calories.trim() === "" ? null : parseInt(form.calories),
        walkingMinutes: form.walkingMinutes.trim() === "" ? null : parseInt(form.walkingMinutes),
      };

      if (form.itemId) {
        const updated = await apiPut<MenuItem>(`/menu/${form.itemId}`, body);
        setItems(prev => prev.map(i => i.itemId === form.itemId ? updated : i));
        toast({ title: "تم تحديث الصنف ✓" });
      } else {
        const created = await apiPost<MenuItem>("/menu", body);
        setItems(prev => [...prev, created]);
        toast({ title: "تم إضافة الصنف ✓" });
      }
      setDialogOpen(false);
    } catch (e: unknown) {
      setFormError((e as { message?: string })?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiDel(`/menu/${deleteId}`);
      setItems(prev => prev.filter(i => i.itemId !== deleteId));
      toast({ title: "تم حذف الصنف" });
    } catch {
      toast({ title: "تعذّر حذف الصنف", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    setTogglingId(item.itemId);
    try {
      const updated = await apiPut<MenuItem>(`/menu/${item.itemId}`, { available: !item.available });
      setItems(prev => prev.map(i => i.itemId === item.itemId ? updated : i));
    } catch {
      toast({ title: "تعذّر تحديث الحالة", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const saveStock = async (itemId: string) => {
    const raw = stockVal.trim();
    const stock = raw === "" ? null : parseInt(raw);
    if (raw !== "" && (isNaN(stock!) || stock! < 0)) return;
    setStockSaving(true);
    try {
      const updated = await apiPut<MenuItem>(`/menu/${itemId}`, { stock });
      setItems(prev => prev.map(i => i.itemId === itemId ? updated : i));
      toast({ title: "تم تحديث المخزون ✓" });
    } catch {
      toast({ title: "تعذّر تحديث المخزون", variant: "destructive" });
    } finally {
      setStockSaving(false);
      setStockEditId(null);
    }
  };

  const availableCount   = items.filter(i => i.available).length;
  const unavailableCount = items.filter(i => !i.available).length;
  const outOfStockCount  = items.filter(i => i.stock !== null && i.stock !== undefined && i.stock <= 0).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">إدارة القائمة</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إضافة وتعديل الأصناف، الأحجام، الخيارات، والمخزون</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={openCategoryDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            إضافة قسم
          </Button>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            إضافة صنف
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <Package className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">متاح</p>
              <p className="text-2xl font-bold">{availableCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-500/10">
              <PackageX className="h-5 w-5 text-zinc-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">نافد / غير متاح</p>
              <p className="text-2xl font-bold">{unavailableCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <PackageX className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">مخزون صفر</p>
              <p className="text-2xl font-bold">{outOfStockCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="بحث..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={catFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setCatFilter("all")}
          >
            الكل ({items.length})
          </Button>
          {categories.map((cat, categoryIndex) => {
            const count = items.filter(i => i.category === cat.id).length;
            return (
              <div key={cat.id} className="flex items-center gap-0.5">
                <Button
                  variant={catFilter === cat.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCatFilter(cat.id)}
                  className="gap-1"
                >
                  {cat.icon} {cat.name} ({count})
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-7"
                  onClick={() => moveCategory(cat.id, -1)}
                  disabled={categoryIndex === 0 || reorderingCategoryId !== null}
                  aria-label={`تحريك قسم ${cat.name} للأعلى`}
                  title="تحريك القسم للأعلى"
                >
                  {reorderingCategoryId === cat.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-7"
                  onClick={() => moveCategory(cat.id, 1)}
                  disabled={categoryIndex === categories.length - 1 || reorderingCategoryId !== null}
                  aria-label={`تحريك قسم ${cat.name} للأسفل`}
                  title="تحريك القسم للأسفل"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="text-muted-foreground">لا توجد أصناف مطابقة</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الصنف</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">التصنيف</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">السعر</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الأحجام / الخيارات</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">المخزون</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">التوفّر</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const cat = getCatMeta(item.category, categories);
                  const enabledSizes = (item.sizes ?? []).filter(s => s.enabled);
                  const optionGroups = item.options ?? [];
                  const orderedCategoryItems = canReorderItems ? categoryItems(item.category) : [];
                  const orderIndex = orderedCategoryItems.findIndex(current => current.itemId === item.itemId);
                  return (
                    <tr
                      key={item.itemId}
                      className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", idx % 2 === 0 ? "" : "bg-muted/5")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-9 w-9 rounded-lg object-cover shrink-0 border"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-base shrink-0">
                              {cat.icon}
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{item.nameAr || item.name}</p>
                            {item.nameAr && item.name !== item.nameAr && (
                              <p className="text-xs text-muted-foreground" dir="ltr">{item.name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-base">{cat.icon}</span>{" "}
                        <span className="text-muted-foreground">{cat.name}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {(item.price / 100).toFixed(2)} ر.س
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {enabledSizes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {enabledSizes.map(s => (
                                <span key={s.name} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                                  {s.name} · {(s.price / 100).toFixed(2)}
                                </span>
                              ))}
                            </div>
                          )}
                          {optionGroups.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {optionGroups.map(g => (
                                <span key={g.groupName} className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 text-xs font-medium">
                                  {g.groupName} ({g.choices.length})
                                </span>
                              ))}
                            </div>
                          )}
                          {enabledSizes.length === 0 && optionGroups.length === 0 && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {stockEditId === item.itemId ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 w-20 text-center"
                              value={stockVal}
                              onChange={e => setStockVal(e.target.value.replace(/\D/g, ""))}
                              placeholder="∞"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === "Enter") saveStock(item.itemId);
                                if (e.key === "Escape") setStockEditId(null);
                              }}
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveStock(item.itemId)} disabled={stockSaving}>
                              {stockSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "✓"}
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                            onClick={() => {
                              setStockEditId(item.itemId);
                              setStockVal(item.stock === null || item.stock === undefined ? "" : String(item.stock));
                            }}
                          >
                            {item.stock === null || item.stock === undefined
                              ? <span className="text-green-600">∞</span>
                              : item.stock <= 0
                                ? <span className="text-red-500">نفد ({item.stock})</span>
                                : item.stock}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {togglingId === item.itemId ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Switch
                              checked={item.available}
                              onCheckedChange={() => toggleAvailable(item)}
                              className="scale-90"
                            />
                          )}
                          <Badge
                            variant={item.available ? "default" : "outline"}
                            className={cn(
                              "text-xs",
                              item.available
                                ? "bg-green-500/15 text-green-700 border-green-500/30"
                                : "text-zinc-400"
                            )}
                          >
                            {item.available ? "متاح" : "نافد"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canReorderItems && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => moveItem(item, -1)}
                                disabled={orderIndex <= 0 || reorderingId !== null}
                                aria-label={`تحريك ${item.name} للأعلى`}
                                title="تحريك الصنف للأعلى"
                              >
                                {reorderingId === item.itemId
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <ChevronUp className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => moveItem(item, 1)}
                                disabled={orderIndex < 0 || orderIndex === orderedCategoryItems.length - 1 || reorderingId !== null}
                                aria-label={`تحريك ${item.name} للأسفل`}
                                title="تحريك الصنف للأسفل"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(item.itemId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add category dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة قسم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="category-name">اسم القسم</Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={event => setCategoryName(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !categorySaving) handleCategorySave();
              }}
              placeholder="مثال: المقبلات"
              autoFocus
            />
            {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)} disabled={categorySaving}>
              إلغاء
            </Button>
            <Button onClick={handleCategorySave} disabled={categorySaving}>
              {categorySaving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ القسم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.itemId ? "تعديل الصنف" : "إضافة صنف جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الاسم (عربي)</Label>
                <Input
                  value={form.nameAr}
                  onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                  placeholder="مثال: مندي دجاج"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>الاسم (إنجليزي / ID) *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="chicken_mandi"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Price + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>السعر الأساسي (ريال) *</Label>
                <Input
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  dir="ltr"
                  type="number"
                  min="0"
                  step="any"
                />
              </div>
              <div className="space-y-1.5">
                <Label>التصنيف *</Label>
                <Select value={form.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>الوصف (اختياري)</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="وصف مختصر للصنف"
              />
            </div>

            {/* ── Calorie Info (optional) ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-end">
                <Label className="text-sm font-semibold">معلومات غذائية (اختياري)</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">🔥 السعرات الحرارية (كيلوكالوري)</Label>
                  <Input
                    value={form.calories}
                    onChange={e => setForm(f => ({ ...f, calories: e.target.value.replace(/\D/g, "") }))}
                    placeholder="مثال: 450"
                    dir="ltr"
                    type="number"
                    min="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">🚶 وقت المشي (دقائق)</Label>
                  <Input
                    value={form.walkingMinutes}
                    onChange={e => setForm(f => ({ ...f, walkingMinutes: e.target.value.replace(/\D/g, "") }))}
                    placeholder="مثال: 30"
                    dir="ltr"
                    type="number"
                    min="0"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                إذا تُركت فارغة لن تظهر في التطبيق. تظهر فقط عند فتح تفاصيل الصنف.
              </p>
            </div>

            {/* ── Sizes Section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addSize}>
                    <Plus className="h-3 w-3" />
                    إضافة حجم
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    title="إضافة حجمَي كبير وصغير جاهزَين"
                    onClick={() => setForm(f => ({
                      ...f,
                      sizes: [
                        ...f.sizes,
                        { name: "كبير", price: "", enabled: true },
                        { name: "صغير", price: "", enabled: true },
                      ],
                    }))}
                  >
                    كبير / صغير ⚡
                  </Button>
                </div>
                <Label className="text-sm font-semibold">خيارات الحجم</Label>
              </div>
              {form.sizes.length > 0 ? (
                <div className="rounded-lg border divide-y">
                  {form.sizes.map((size, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeSize(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <Switch
                        checked={size.enabled}
                        onCheckedChange={v => updateSize(idx, "enabled", v)}
                        className="scale-75 shrink-0"
                      />
                      <Input
                        value={size.name}
                        onChange={e => updateSize(idx, "name", e.target.value)}
                        placeholder="مثال: صغير"
                        className="h-8 text-sm flex-1 min-w-[70px]"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          value={size.price}
                          onChange={e => updateSize(idx, "price", e.target.value)}
                          placeholder="السعر"
                          dir="ltr"
                          type="number"
                          min="0"
                          step="any"
                          className="h-8 text-sm w-24"
                          disabled={!size.enabled}
                        />
                        <span className="text-xs text-muted-foreground">ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2 border rounded-lg border-dashed">
                  لا توجد أحجام — الصنف بسعر ثابت واحد
                </p>
              )}
              {form.sizes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  فعّل الأحجام التي تريد إظهارها للعميل. الأحجام المعطّلة لن تظهر.
                </p>
              )}
            </div>

            {/* ── Rice Types Section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addRiceType}>
                  <Plus className="h-3 w-3" />
                  إضافة نوع أرز
                </Button>
                <Label className="text-sm font-semibold">أنواع الأرز</Label>
              </div>
              {form.riceTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2 border rounded-lg border-dashed">
                  لا توجد أنواع — مثال: أرز بشاور أبيض، أرز مندي
                </p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {form.riceTypes.map((rt, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                      <button type="button" onClick={() => removeRiceType(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <Switch checked={rt.available} onCheckedChange={v => updateRiceType(idx, "available", v)} className="scale-75 shrink-0" />
                      <Input value={rt.name} onChange={e => updateRiceType(idx, "name", e.target.value)}
                        placeholder="مثال: أرز بشاور أبيض" className="h-8 text-sm flex-1 min-w-[80px]" />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">+</span>
                        <Input value={rt.extraPrice} onChange={e => updateRiceType(idx, "extraPrice", e.target.value)}
                          placeholder="0" dir="ltr" type="number" min="0" step="any" className="h-8 text-sm w-20" />
                        <span className="text-xs text-muted-foreground">ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Additions Section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addAddition}>
                  <Plus className="h-3 w-3" />
                  إضافة خيار
                </Button>
                <Label className="text-sm font-semibold">الإضافات</Label>
              </div>
              {form.additions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2 border rounded-lg border-dashed">
                  لا توجد إضافات — مثال: بدون كشنة، زيادة كشنة
                </p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {form.additions.map((add, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                      <button type="button" onClick={() => removeAddition(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <Switch checked={add.available} onCheckedChange={v => updateAddition(idx, "available", v)} className="scale-75 shrink-0" />
                      <Input value={add.name} onChange={e => updateAddition(idx, "name", e.target.value)}
                        placeholder="مثال: بدون كشنة" className="h-8 text-sm flex-1 min-w-[80px]" />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">+</span>
                        <Input value={add.extraPrice} onChange={e => updateAddition(idx, "extraPrice", e.target.value)}
                          placeholder="0" dir="ltr" type="number" min="0" step="any" className="h-8 text-sm w-20" />
                        <span className="text-xs text-muted-foreground">ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Options / Sub-Options Section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addOptionGroup}>
                  <Plus className="h-3 w-3" />
                  إضافة مجموعة خيارات
                </Button>
                <Label className="text-sm font-semibold">الخيارات الفرعية</Label>
              </div>
              {form.options.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2 border rounded-lg border-dashed">
                  لا توجد خيارات — مثال: نوع المشروب (بيبسي، 7UP، ...)
                </p>
              )}
              {form.options.map((group, gIdx) => (
                <div key={gIdx} className="rounded-lg border overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => removeOptionGroup(gIdx)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <Input
                      value={group.groupName}
                      onChange={e => updateOptionGroup(gIdx, "groupName", e.target.value)}
                      placeholder="اسم المجموعة (مثال: نوع المشروب)"
                      className="h-8 text-sm flex-1"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Switch
                        checked={group.required}
                        onCheckedChange={v => updateOptionGroup(gIdx, "required", v)}
                        className="scale-75"
                      />
                      <span className="text-xs text-muted-foreground">مطلوب</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(gIdx)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {group.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Choices */}
                  {!group.collapsed && (
                    <div className="divide-y">
                      {group.choices.map((choice, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-2 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeChoice(gIdx, cIdx)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <Switch
                            checked={choice.available}
                            onCheckedChange={v => updateChoice(gIdx, cIdx, "available", v)}
                            className="scale-75 shrink-0"
                          />
                          <Input
                            value={choice.name}
                            onChange={e => updateChoice(gIdx, cIdx, "name", e.target.value)}
                            placeholder="مثال: بيبسي"
                            className="h-7 text-sm flex-1 min-w-[80px]"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">+</span>
                            <Input
                              value={choice.extraPrice}
                              onChange={e => updateChoice(gIdx, cIdx, "extraPrice", e.target.value)}
                              placeholder="0"
                              dir="ltr"
                              type="number"
                              min="0"
                              step="any"
                              className="h-7 text-sm w-20"
                            />
                            <span className="text-xs text-muted-foreground">ر.س</span>
                          </div>
                        </div>
                      ))}
                      <div className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 h-7 text-xs w-full"
                          onClick={() => addChoice(gIdx)}
                        >
                          <Plus className="h-3 w-3" />
                          إضافة خيار
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {form.options.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  الخيارات المفعّلة تظهر للعميل. السعر الإضافي يُجمع فوق سعر الحجم.
                </p>
              )}
            </div>

            {/* Image upload */}
            <div className="space-y-1.5">
              <Label>صورة الصنف (اختياري)</Label>
              <input ref={imgFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              <div className="flex gap-3 items-start">
                <div className="relative shrink-0 h-24 w-24 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : form.imageUrl ? (
                    <img src={form.imageUrl} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full"
                    disabled={uploading}
                    onClick={() => imgFileRef.current?.click()}
                  >
                    {uploading
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الرفع...</>
                      : <><ImagePlus className="h-4 w-4" /> {form.imageUrl ? "تغيير الصورة" : "رفع صورة"}</>
                    }
                  </Button>
                  <Input
                    value={form.imageUrl}
                    onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="أو الصق رابط صورة..."
                    dir="ltr"
                    className="text-xs h-8"
                  />
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                      className="text-xs text-destructive hover:underline text-right"
                    >
                      ✕ حذف الصورة
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Stock + Available */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>المخزون (اتركه فارغاً = غير محدود)</Label>
                <Input
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value.replace(/\D/g, "") }))}
                  placeholder="غير محدود"
                  dir="ltr"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <div className="flex items-center justify-between rounded-lg border p-3 w-full">
                  <Label className="cursor-pointer">متاح</Label>
                  <Switch
                    checked={form.available}
                    onCheckedChange={v => setForm(f => ({ ...f, available: v }))}
                  />
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              {form.itemId ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الصنف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد؟ سيتم حذف هذا الصنف نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
