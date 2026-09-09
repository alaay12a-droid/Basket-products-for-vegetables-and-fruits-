import { useEffect, useState } from "react";
import { getDashboardMeQueryKey, useDashboardMe } from "@workspace/api-client-react";
import { apiDel, apiGet, apiPost, apiPut } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, RefreshCw, Trash2, UserCog, ShieldCheck, UsersRound } from "lucide-react";

interface Branch {
  id: number;
  name: string;
  active: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
}

interface ManagedUser {
  id: number;
  username: string;
  role: "admin" | "employee";
  branches: Branch[];
}

interface UserForm {
  id?: number;
  username: string;
  password: string;
  role: "admin" | "employee";
  branchIds: number[];
}

const emptyForm = (): UserForm => ({ username: "", password: "", role: "employee", branchIds: [] });

function BranchBadges({ branch }: { branch: Branch }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-sm font-medium">{branch.name}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Badge variant={branch.active ? "default" : "secondary"} className="text-[10px]">{branch.active ? "نشط" : "موقوف"}</Badge>
        <Badge variant={branch.deliveryEnabled ? "outline" : "secondary"} className="text-[10px]">توصيل {branch.deliveryEnabled ? "مفعّل" : "موقوف"}</Badge>
        <Badge variant={branch.pickupEnabled ? "outline" : "secondary"} className="text-[10px]">استلام {branch.pickupEnabled ? "مفعّل" : "موقوف"}</Badge>
      </div>
    </div>
  );
}

export default function Users() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: isMeLoading } = useDashboardMe({
    query: { retry: false, queryKey: getDashboardMeQueryKey() },
  });
  const isAdmin = currentUser?.role === "admin";
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async (quiet = false) => {
    if (!isAdmin) return;
    if (!quiet) setLoading(true);
    try {
      const [userData, branchData] = await Promise.all([
        apiGet<ManagedUser[]>("/dashboard/users"),
        apiGet<Branch[]>("/branches"),
      ]);
      setUsers(userData);
      setBranches(branchData);
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذّر تحميل المستخدمين", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isMeLoading && isAdmin) load();
    if (!isMeLoading && !isAdmin) setLoading(false);
  }, [isMeLoading, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setForm(emptyForm());
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (user: ManagedUser) => {
    setForm({ id: user.id, username: user.username, password: "", role: user.role, branchIds: user.branches.map(branch => branch.id) });
    setFormError("");
    setDialogOpen(true);
  };

  const toggleBranch = (branchId: number) => {
    setForm(current => ({
      ...current,
      branchIds: current.branchIds.includes(branchId)
        ? current.branchIds.filter(id => id !== branchId)
        : [...current.branchIds, branchId],
    }));
  };

  const handleSave = async () => {
    if (!form.username.trim()) { setFormError("اسم المستخدم مطلوب"); return; }
    if (!form.id && form.password.length < 8) { setFormError("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    if (form.id && form.password && form.password.length < 8) { setFormError("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    setSaving(true);
    setFormError("");
    const branchIds = form.role === "admin" ? [] : form.branchIds;
    try {
      if (form.id) {
        const payload: { username: string; role: "admin" | "employee"; branchIds: number[]; password?: string } = {
          username: form.username.trim(), role: form.role, branchIds,
        };
        if (form.password) payload.password = form.password;
        await apiPut(`/dashboard/users/${form.id}`, payload);
        toast({ title: "تم تعديل المستخدم" });
      } else {
        await apiPost("/dashboard/users", { username: form.username.trim(), password: form.password, role: form.role, branchIds });
        toast({ title: "تمت إضافة المستخدم" });
      }
      setDialogOpen(false);
      load(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "تعذّر حفظ المستخدم");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      await apiDel(`/dashboard/users/${deleteUser.id}`);
      toast({ title: "تم حذف المستخدم" });
      setDeleteUser(null);
      load(true);
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذّر حذف المستخدم", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!isMeLoading && !isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-xl font-bold">الوصول غير مسموح</h1>
        <p className="mt-2 text-sm text-muted-foreground">إدارة المستخدمين متاحة لحسابات المشرفين فقط.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><UsersRound className="h-6 w-6 text-indigo-600" />إدارة المستخدمين</h1>
          <p className="mt-1 text-sm text-muted-foreground">أنشئ الحسابات وحدد الفروع التي يستطيع الموظف الوصول إليها.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw className="ml-1 h-4 w-4" />تحديث</Button>
          <Button size="sm" onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700"><Plus className="ml-1 h-4 w-4" />إضافة مستخدم</Button>
        </div>
      </div>

      {loading || isMeLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(item => <Skeleton key={item} className="h-36 w-full rounded-xl" />)}</div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground"><UserCog className="mx-auto mb-3 h-12 w-12 opacity-30" /><p className="font-medium">لا توجد حسابات مستخدمين</p><p className="mt-1 text-sm">اضغط «إضافة مستخدم» لإنشاء أول حساب.</p></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {users.map(user => (
            <div key={user.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-bold">{user.username}</h2>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role === "admin" ? "مشرف" : "مستخدم فرع"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{user.role === "admin" ? "صلاحية كاملة على جميع الفروع" : "الفروع المعيّنة لهذا المستخدم"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(user)} aria-label={`تعديل ${user.username}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteUser(user)} aria-label={`حذف ${user.username}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              {user.role === "employee" && (
                <div className="mt-4 border-t pt-3">
                  {user.branches.length ? <div className="grid gap-2 sm:grid-cols-2">{user.branches.map(branch => <BranchBadges key={branch.id} branch={branch} />)}</div> : <p className="text-sm text-muted-foreground">لم تُعيّن أي فروع لهذا المستخدم.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>{form.id ? "تعديل المستخدم" : "إضافة مستخدم جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>اسم المستخدم <span className="text-destructive">*</span></Label><Input value={form.username} onChange={event => setForm(current => ({ ...current, username: event.target.value }))} autoComplete="username" /></div>
            <div className="space-y-1"><Label>كلمة المرور {form.id ? <span className="text-muted-foreground">(اتركها فارغة للاحتفاظ بها)</span> : <span className="text-destructive">*</span>}</Label><Input type="password" value={form.password} minLength={8} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} autoComplete="new-password" /><p className="text-xs text-muted-foreground">8 أحرف على الأقل.</p></div>
            <div className="space-y-2">
              <Label>الدور <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {(["employee", "admin"] as const).map(role => <button key={role} type="button" onClick={() => setForm(current => ({ ...current, role }))} className={`rounded-lg border p-3 text-right text-sm transition-colors ${form.role === role ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "hover:bg-muted/50"}`}><span className="block font-semibold">{role === "admin" ? "مشرف" : "مستخدم فرع"}</span><span className="mt-1 block text-xs text-muted-foreground">{role === "admin" ? "وصول كامل" : "حسب الفروع المحددة"}</span></button>)}
              </div>
            </div>
            {form.role === "admin" ? <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">للمشرف صلاحية كاملة على جميع الفروع. لن تُحفظ أي تعيينات فروع لهذا الحساب.</div> : (
              <div className="space-y-2"><Label>الفروع المسموح بها <span className="text-muted-foreground">(يمكن اختيار أكثر من فرع)</span></Label>
                {branches.length ? <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3">{branches.map(branch => <label key={branch.id} className="flex cursor-pointer items-center gap-3 rounded-md p-1 hover:bg-muted/50"><Checkbox checked={form.branchIds.includes(branch.id)} onCheckedChange={() => toggleBranch(branch.id)} /><span className="text-sm">{branch.name}</span></label>)}</div> : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">لا توجد فروع متاحة للتعيين.</p>}
              </div>
            )}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>إلغاء</Button><Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving ? "جارٍ الحفظ…" : form.id ? "حفظ التعديلات" : "إضافة المستخدم"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteUser !== null} onOpenChange={open => !open && setDeleteUser(null)}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>تأكيد حذف المستخدم</AlertDialogTitle><AlertDialogDescription>سيُحذف حساب «{deleteUser?.username}» نهائياً. لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">{deleting ? "جارٍ الحذف…" : "حذف"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}