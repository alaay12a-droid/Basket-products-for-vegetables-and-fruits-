import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { MerchantProduct } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FieldRow, SectionLabel, inputCls } from '@/components/kit';
import { useMerchant } from '@/lib/merchant';

interface Choice { name: string; extraPrice: string; available: boolean }
interface Group { groupName: string; required: boolean; choices: Choice[] }
interface Size { name: string; price: string; enabled: boolean }

export function ProductForm({ open, product, defaultCategory, onClose }: { open: boolean; product: MerchantProduct | null; defaultCategory: string; onClose: () => void }) {
  const { snap, run, busy, ro } = useMerchant();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sizes, setSizes] = useState<Size[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? '');
    setNameEn(product?.nameEn ?? '');
    setCategory(product?.category ?? defaultCategory);
    setPrice(product ? String(product.price) : '');
    setImageUrl(product?.imageUrl ?? '');
    setSizes((product?.sizes ?? []).map((s) => ({ name: s.name, price: String(s.price), enabled: s.enabled })));
    setGroups((product?.options ?? []).map((g) => ({ groupName: g.groupName, required: g.required, choices: g.choices.map((c) => ({ name: c.name, extraPrice: String(c.extraPrice), available: c.available })) })));
  }, [open, product, defaultCategory]);

  const valid = name.trim() && category && price !== '' && Number(price) >= 0 && sizes.every((s) => s.name.trim() && s.price !== '') && groups.every((g) => g.groupName.trim() && g.choices.length > 0 && g.choices.every((c) => c.name.trim()));

  const save = async () => {
    const data: Record<string, unknown> = {
      name: name.trim(),
      category,
      price: Number(price),
      sizes: sizes.map((s) => ({ name: s.name.trim(), price: Number(s.price), enabled: s.enabled })),
      options: groups.map((g) => ({ groupName: g.groupName.trim(), required: g.required, choices: g.choices.map((c) => ({ name: c.name.trim(), extraPrice: Number(c.extraPrice || 0), available: c.available })) })),
    };
    if (product) { data.itemId = product.itemId; data.sortOrder = product.sortOrder; }
    if (nameEn.trim()) data.nameEn = nameEn.trim();
    if (imageUrl.trim()) data.imageUrl = imageUrl.trim();
    if (await run('item-save', product?.itemId, data, tr('تم حفظ المنتج'))) onClose();
  };

  const setGroup = (i: number, g: Partial<Group>) => setGroups((a) => a.map((x, j) => (j === i ? { ...x, ...g } : x)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="flex max-h-[94dvh] max-w-[96vw] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-4 text-start">
          <DialogTitle>{product ? tr('تعديل منتج') : tr('منتج جديد')}</DialogTitle>
          <DialogDescription>{tr('الأسعار بالريال السعودي. تعديل المنتجات العامة قد يتطلب حساب مدير.')}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <FieldRow label={tr("اسم المنتج")}><Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} data-testid="input-product-name" /></FieldRow>
          <FieldRow label={tr("الاسم بالإنجليزية (اختياري)")}><Input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} data-testid="input-product-name-en" /></FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label={tr("القسم")}>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-12 w-full rounded-xl border bg-card px-3 text-base" data-testid="select-product-category">
                <option value="">{tr('اختر')}</option>
                {(snap?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FieldRow>
            <FieldRow label={tr("السعر (ر.س)")}><Input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls + ' num'} data-testid="input-product-price" /></FieldRow>
          </div>
          <FieldRow label={tr("رابط الصورة")}>
            <Input dir="ltr" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" className={inputCls} data-testid="input-product-image" />
          </FieldRow>
          {imageUrl.trim() && <img src={imageUrl} alt={tr("معاينة")} className="h-32 w-full rounded-xl border object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />}

          <div>
            <SectionLabel>{tr('الأحجام')}</SectionLabel>
            {sizes.map((s, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <Input value={s.name} onChange={(e) => setSizes((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={tr("الاسم")} className={inputCls + ' flex-1'} />
                <Input type="number" min={0} step="0.01" value={s.price} onChange={(e) => setSizes((a) => a.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder={tr("السعر")} className={inputCls + ' w-24 num'} />
                <Switch checked={s.enabled} onCheckedChange={(v) => setSizes((a) => a.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} aria-label={tr("مفعل")} />
                <button onClick={() => setSizes((a) => a.filter((_, j) => j !== i))} aria-label={tr("حذف الحجم")} className="grid size-10 place-items-center text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Button variant="outline" className="h-11" onClick={() => setSizes((a) => [...a, { name: '', price: '', enabled: true }])} data-testid="button-add-size"><Plus className="size-4" /> {tr('إضافة حجم')}</Button>
          </div>

          <div>
            <SectionLabel>{tr('الخيارات')}</SectionLabel>
            {groups.map((g, i) => (
              <div key={i} className="mb-3 rounded-xl border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <Input value={g.groupName} onChange={(e) => setGroup(i, { groupName: e.target.value })} placeholder={tr("اسم المجموعة (مثال: التقطيع)")} className={inputCls + ' flex-1'} />
                  <button onClick={() => setGroups((a) => a.filter((_, j) => j !== i))} aria-label={tr("حذف المجموعة")} className="grid size-10 place-items-center text-destructive"><Trash2 className="size-4" /></button>
                </div>
                <label className="my-2 flex items-center gap-2 text-sm"><Switch checked={g.required} onCheckedChange={(v) => setGroup(i, { required: v })} /> {tr('اختيار إلزامي')}</label>
                {g.choices.map((c, k) => (
                  <div key={k} className="mb-2 flex items-center gap-2">
                    <Input value={c.name} onChange={(e) => setGroup(i, { choices: g.choices.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} placeholder={tr("الخيار")} className="h-11 flex-1 rounded-xl bg-card" />
                    <Input type="number" min={0} step="0.01" value={c.extraPrice} onChange={(e) => setGroup(i, { choices: g.choices.map((x, j) => (j === k ? { ...x, extraPrice: e.target.value } : x)) })} placeholder={tr("زيادة")} className="h-11 w-20 rounded-xl bg-card num" />
                    <Switch checked={c.available} onCheckedChange={(v) => setGroup(i, { choices: g.choices.map((x, j) => (j === k ? { ...x, available: v } : x)) })} aria-label={tr("متاح")} />
                    <button onClick={() => setGroup(i, { choices: g.choices.filter((_, j) => j !== k) })} aria-label={tr("حذف الخيار")} className="grid size-9 place-items-center text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-10 bg-card" onClick={() => setGroup(i, { choices: [...g.choices, { name: '', extraPrice: '0', available: true }] })}><Plus className="size-4" /> {tr('خيار')}</Button>
              </div>
            ))}
            <Button variant="outline" className="h-11" onClick={() => setGroups((a) => [...a, { groupName: '', required: false, choices: [{ name: '', extraPrice: '0', available: true }] }])} data-testid="button-add-group"><Plus className="size-4" /> {tr('مجموعة خيارات')}</Button>
          </div>
        </div>
        <div className="border-t p-3">
          <Button className="h-14 w-full text-base font-bold" disabled={ro || busy || !valid} onClick={save} data-testid="button-save-product">{tr('حفظ المنتج')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
