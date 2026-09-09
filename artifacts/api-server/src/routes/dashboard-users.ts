import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, branchesTable, dashboardUserBranchesTable, dashboardUsersTable } from "@workspace/db";
import { count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireDashboardAdmin, type DashboardActor } from "./dashboard-auth";

const router = Router();
const roleSchema = z.enum(["admin", "employee"]);
const branchIdsSchema = z.array(z.number().int().positive()).refine(
  (ids) => new Set(ids).size === ids.length,
  "duplicate branch IDs",
);
const createSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(256),
  role: roleSchema,
  branchIds: branchIdsSchema,
});
const updateSchema = z.object({
  username: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(8).max(256).optional(),
  role: roleSchema.optional(),
  branchIds: branchIdsSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "empty update");

async function requireExistingBranches(branchIds: number[], tx: Pick<typeof db, "select"> = db): Promise<void> {
  if (branchIds.length === 0) return;
  const found = await tx.select({ id: branchesTable.id }).from(branchesTable).where(inArray(branchesTable.id, branchIds));
  if (found.length !== branchIds.length) throw new Error("BRANCH_NOT_FOUND");
}

async function userResponse(user: Pick<typeof dashboardUsersTable.$inferSelect, "id" | "username" | "role" | "createdAt">) {
  const memberships = await db
    .select({
      id: branchesTable.id,
      name: branchesTable.name,
      address: branchesTable.address,
      phone: branchesTable.phone,
      mapsUrl: branchesTable.mapsUrl,
      active: branchesTable.active,
      lat: branchesTable.lat,
      lng: branchesTable.lng,
      deliveryEnabled: branchesTable.deliveryEnabled,
      pickupEnabled: branchesTable.pickupEnabled,
      createdAt: branchesTable.createdAt,
    })
    .from(dashboardUserBranchesTable)
    .innerJoin(branchesTable, eq(dashboardUserBranchesTable.branchId, branchesTable.id))
    .where(eq(dashboardUserBranchesTable.dashboardUserId, user.id));
  return { ...user, branches: memberships };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function actorFromResponse(res: { locals: Record<string, unknown> }): DashboardActor {
  return res.locals.dashboardActor as DashboardActor;
}

router.get("/dashboard/users", requireDashboardAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: dashboardUsersTable.id,
      username: dashboardUsersTable.username,
      role: dashboardUsersTable.role,
      createdAt: dashboardUsersTable.createdAt,
    })
    .from(dashboardUsersTable);
  res.json(await Promise.all(users.map(userResponse)));
});

router.post("/dashboard/users", requireDashboardAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات المستخدم غير صحيحة" }); return; }
  try {
    const user = await db.transaction(async (tx) => {
      await requireExistingBranches(parsed.data.branchIds, tx);
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const [created] = await tx.insert(dashboardUsersTable).values({
        username: parsed.data.username,
        passwordHash,
        role: parsed.data.role,
      }).returning({
        id: dashboardUsersTable.id,
        username: dashboardUsersTable.username,
        role: dashboardUsersTable.role,
        createdAt: dashboardUsersTable.createdAt,
      });
      if (parsed.data.branchIds.length) {
        await tx.insert(dashboardUserBranchesTable).values(
          parsed.data.branchIds.map((branchId) => ({ dashboardUserId: created.id, branchId })),
        );
      }
      return created;
    });
    res.status(201).json(await userResponse(user));
  } catch (error) {
    if (isUniqueViolation(error)) { res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }
    if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") { res.status(400).json({ error: "فرع غير موجود" }); return; }
    throw error;
  }
});

router.put("/dashboard/users/:id", requireDashboardAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) { res.status(400).json({ error: "بيانات المستخدم غير صحيحة" }); return; }
  try {
    const user = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(dashboardUsersTable).where(eq(dashboardUsersTable.id, id)).limit(1);
      if (!existing) throw new Error("USER_NOT_FOUND");
      if (existing.role === "admin" && parsed.data.role && parsed.data.role !== "admin") {
        const [admins] = await tx.select({ value: count() }).from(dashboardUsersTable).where(eq(dashboardUsersTable.role, "admin"));
        if (admins.value <= 1) throw new Error("LAST_ADMIN");
      }
      if (parsed.data.branchIds) await requireExistingBranches(parsed.data.branchIds, tx);
      const changes: Partial<typeof dashboardUsersTable.$inferInsert> = {};
      if (parsed.data.username !== undefined) changes.username = parsed.data.username;
      if (parsed.data.role !== undefined) changes.role = parsed.data.role;
      if (parsed.data.password !== undefined) changes.passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const updated = Object.keys(changes).length > 0
        ? (await tx.update(dashboardUsersTable).set(changes).where(eq(dashboardUsersTable.id, id)).returning({
            id: dashboardUsersTable.id, username: dashboardUsersTable.username, role: dashboardUsersTable.role, createdAt: dashboardUsersTable.createdAt,
          }))[0]
        : {
            id: existing.id,
            username: existing.username,
            role: existing.role,
            createdAt: existing.createdAt,
          };
      if (parsed.data.branchIds !== undefined) {
        await tx.delete(dashboardUserBranchesTable).where(eq(dashboardUserBranchesTable.dashboardUserId, id));
        if (parsed.data.branchIds.length) await tx.insert(dashboardUserBranchesTable).values(
          parsed.data.branchIds.map((branchId) => ({ dashboardUserId: id, branchId })),
        );
      }
      return updated;
    });
    res.json(await userResponse(user));
  } catch (error) {
    if (isUniqueViolation(error)) { res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }
    if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") { res.status(400).json({ error: "فرع غير موجود" }); return; }
    if (error instanceof Error && error.message === "USER_NOT_FOUND") { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
    if (error instanceof Error && error.message === "LAST_ADMIN") { res.status(400).json({ error: "لا يمكن تخفيض آخر مشرف" }); return; }
    throw error;
  }
});

router.delete("/dashboard/users/:id", requireDashboardAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "معرّف غير صحيح" }); return; }
  if (actorFromResponse(res).id === id) { res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" }); return; }
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx.select({ role: dashboardUsersTable.role }).from(dashboardUsersTable).where(eq(dashboardUsersTable.id, id)).limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.role === "admin") {
        const [admins] = await tx.select({ value: count() }).from(dashboardUsersTable).where(eq(dashboardUsersTable.role, "admin"));
        if (admins.value <= 1) throw new Error("LAST_ADMIN");
      }
      await tx.delete(dashboardUsersTable).where(eq(dashboardUsersTable.id, id));
    });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
    if (error instanceof Error && error.message === "LAST_ADMIN") { res.status(400).json({ error: "لا يمكن حذف آخر مشرف" }); return; }
    throw error;
  }
});

export default router;