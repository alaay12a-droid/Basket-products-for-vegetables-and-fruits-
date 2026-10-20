import { tr } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ImageOff, Package, Pause, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MenuCategory, MerchantProduct } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AvailabilityDialog, type AvailTarget } from '@/components/availability-dialog';
import { ProductForm } from '@/components/product-form';
import { Confirm, Empty, FieldRow, PageTitle, inputCls } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';
import { dateTime, money } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Catalog() {
  const { snap, run, busy, ro } = useMerchant();
  const cats = snap?.categories ?? [];
  const products = snap?.products ?? [];
  const [sel, setSel] = useState<string>('all');
  const [avail, setAvail] = useState<AvailTarget | null>(null);
  const [form, setForm] = useState<{ open: boolean; product: MerchantProduct | null }>({ open: false, product: null });
  const [catForm, setCatForm] = useState<{ open: boolean; cat: MenuCategory | null }>({ open: false, cat: null });
  const [delItem, setDelItem] = useState<MerchantProduct | null>(null);
  const [delCat, setDelCat] = useState<MenuCategory | null>(null);

  const shown = useMemo(
    () => products.filter((p) => sel === 'all' || p.category === sel).sort((a, b) => a.sortOrder - b.sortOrder),
    [products, sel],
  );
  const selCat = cats.find((c) => c.id === sel);

  const moveItem = (idx: number, dir: -1 | 1) => {
    const ids = shown.map((p) => p.itemId);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void run('menu-reorder', undefined, { itemIds: ids });
  };
  const moveCat = (idx: number, dir: -1 | 1) => {
    const ids = cats.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void run('menu-reorder', undefined, { categoryIds: ids });
  };

  return (
    <>
      <PageTitle
        title={tr("إدارة الأصناف")}
        hint={`${products.length} ${tr('منتج')} · ${cats.length} ${tr('قسم')}`}
        actions={
          <>
            <Button variant="outline" className="h-12 text-base" disabled={ro} onClick={() => setCatForm({ open: true, cat: null })} data-testid="button-add-category"><Plus className="size-4" /> {tr('قسم')}</Button>
            <Button className="h-12 text-base" disabled={ro || cats.length === 0} onClick={() => setForm({ open: true, product: null })} data-testid="button-add-product"><Plus className="size-4" /> {tr('منتج')}</Button>
          </>
        }
      />

      <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {[{ id: 'all', name: tr('الكل') }, ...cats].map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className={cn('h-11 shrink-0 rounded-full border px-4 text-[15px] font-semibold transition active:scale-95', sel === c.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')} data-testid={`chip-category-${c.id}`}>
            {c.name}
          </button>
        ))}
      </div>

      {selCat && (
        <div className="animate-rise mb-3 flex flex-wrap items-center gap-2 rounded-2xl border bg-leaf-soft/60 p-3">
          <b className="me-auto">{selCat.name}</b>
          <Button size="sm" variant="outline" className="h-10 bg-card" disabled={ro || busy} onClick={() => moveCat(cats.findIndex((c) => c.id === selCat.id), -1)} aria-label={tr("تقديم القسم")}><ArrowUp className="size-4" /></Button>
          <Button size="sm" variant="outline" className="h-10 bg-card" disabled={ro || busy} onClick={() => moveCat(cats.findIndex((c) => c.id === selCat.id), 1)} aria-label={tr("تأخير القسم")}><ArrowDown className="size-4" /></Button>
          <Button size="sm" variant="outline" className="h-10 bg-card" disabled={ro} onClick={() => setAvail({ kind: 'category', id: selCat.id, name: selCat.name })} data-testid="button-category-availability"><Pause className="size-4" /> {tr('إيقاف القسم')}</Button>
          <Button size="sm" variant="outline" className="h-10 bg-card" disabled={ro} onClick={() => setCatForm({ open: true, cat: selCat })} data-testid="button-edit-category"><Pencil className="size-4" /> {tr('تعديل')}</Button>
          <Button size="sm" variant="outline" className="h-10 border-destructive/40 bg-card text-destructive" disabled={ro} onClick={() => setDelCat(selCat)} data-testid="button-delete-category"><Trash2 className="size-4" /></Button>
        </div>
      )}

      {shown.length === 0 ? (
        <Empty icon={<Package className="size-9" strokeWidth={1.5} />} title={cats.length === 0 ? tr('لا توجد أقسام بعد') : tr('لا توجد منتجات في هذا القسم')} hint={cats.length === 0 ? tr('ابدأ بإضافة قسم ثم أضف منتجاتك.') : undefined} />
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {shown.map((p, idx) => (
            <li key={p.itemId} className="animate-rise rounded-2xl border bg-card p-3" style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }} data-testid={`row-product-${p.itemId}`}>
              <div className="flex gap-3">
                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className="size-16 shrink-0 rounded-xl border object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><ImageOff className="size-6" strokeWidth={1.5} /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-sm font-semibold text-primary num">{money(p.price)}</p>
                  <p className="truncate text-xs text-muted-foreground">{cats.find((c) => c.id === p.category)?.name ?? p.category}{p.sizes.length > 0 && ` · ${p.sizes.length} ${tr('أحجام')}`}{!!p.options?.length && ` · ${p.options.length} ${tr('خيارات')}`}</p>
                </div>
                <div className="flex flex-col">
                  <button disabled={ro || busy || idx === 0} onClick={() => moveItem(idx, -1)} aria-label={tr("تقديم")} className="grid size-8 place-items-center disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button disabled={ro || busy || idx === shown.length - 1} onClick={() => moveItem(idx, 1)} aria-label={tr("تأخير")} className="grid size-8 place-items-center disabled:opacity-30"><ArrowDown className="size-4" /></button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button disabled={ro} onClick={() => setAvail({ kind: 'item', id: p.itemId, name: p.name })} className={cn('h-11 flex-1 rounded-xl border px-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50', p.available ? 'border-primary/30 bg-leaf-soft text-primary' : 'border-red-200 bg-red-50 text-destructive')} data-testid={`button-availability-${p.itemId}`}>
                  {p.available ? tr('متاح') : p.unavailableUntil ? `موقوف حتى ${dateTime(p.unavailableUntil)}` : tr('موقوف')}
                </button>
                <Button variant="outline" className="size-11" disabled={ro} onClick={() => setForm({ open: true, product: p })} aria-label={tr("تعديل")} data-testid={`button-edit-${p.itemId}`}><Pencil className="size-4" /></Button>
                <Button variant="outline" className="size-11 border-destructive/40 text-destructive" disabled={ro} onClick={() => setDelItem(p)} aria-label={tr("حذف")} data-testid={`button-delete-${p.itemId}`}><Trash2 className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AvailabilityDialog target={avail} onClose={() => setAvail(null)} />
      <ProductForm open={form.open} product={form.product} defaultCategory={selCat?.id ?? cats[0]?.id ?? ''} onClose={() => setForm({ open: false, product: null })} />
      <CategoryForm open={catForm.open} cat={catForm.cat} onClose={() => setCatForm({ open: false, cat: null })} />
      <Confirm open={!!delItem} onOpenChange={(o) => !o && setDelItem(null)} title={tr("حذف المنتج")} destructive confirmLabel={tr("حذف نهائي")} description={`سيتم حذف «${delItem?.name}» نهائيًا. لإيقافه مؤقتًا استخدم زر التوفر بدل الحذف.`} onConfirm={() => run('item-delete', delItem?.itemId, {}, tr('تم حذف المنتج'))} />
      <Confirm
        open={!!delCat}
        onOpenChange={(o) => !o && setDelCat(null)}
        title={tr("حذف القسم")}
        destructive
        confirmLabel={tr("حذف القسم")}
        description={products.some((p) => p.category === delCat?.id) ? tr('لا يمكن حذف قسم يحتوي على منتجات. انقل المنتجات أو احذفها أولًا.') : `سيتم حذف القسم «${delCat?.name}».`}
        onConfirm={async () => {
          if (products.some((p) => p.category === delCat?.id)) return false;
          const ok = await run('category-delete', delCat?.id, {}, tr('تم حذف القسم'));
          if (ok) setSel('all');
          return ok;
        }}
      />
    </>
  );
}

function CategoryForm({ open, cat, onClose }: { open: boolean; cat: MenuCategory | null; onClose: () => void }) {
  const { run, busy, ro } = useMerchant();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [icon, setIcon] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const k = open ? (cat?.id ?? 'new') : null;
  if (k !== key) {
    setKey(k);
    if (k) { setName(cat?.name ?? ''); setNameEn(cat?.nameEn ?? ''); setIcon(cat?.icon ?? ''); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-[94vw] rounded-2xl sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>{cat ? tr('تعديل القسم') : tr('قسم جديد')}</DialogTitle>
          <DialogDescription>{tr('تعديل الأقسام العامة قد يتطلب حساب مدير.')}</DialogDescription>
        </DialogHeader>
        <FieldRow label={tr("اسم القسم")}><Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} data-testid="input-category-name" /></FieldRow>
        <FieldRow label={tr("الاسم بالإنجليزية (اختياري)")}><Input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} /></FieldRow>
        <FieldRow label={tr("رمز الأيقونة (اختياري)")}><Input dir="ltr" value={icon} onChange={(e) => setIcon(e.target.value)} className={inputCls} /></FieldRow>
        <Button className="h-12 text-base" disabled={ro || busy || !name.trim()} data-testid="button-save-category" onClick={async () => {
          const data: Record<string, unknown> = { name: name.trim() };
          if (nameEn.trim()) data.nameEn = nameEn.trim();
          if (icon.trim()) data.icon = icon.trim();
          if (await run('category-save', cat?.id, data, tr('تم حفظ القسم'))) onClose();
        }}>{tr('حفظ')}</Button>
      </DialogContent>
    </Dialog>
  );
}
