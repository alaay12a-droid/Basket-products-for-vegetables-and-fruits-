import { Router, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { branchesTable, dashboardUserBranchesTable, dashboardUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendPinOtpEmail } from "../lib/sendEmail";

interface OtpEntry { code: string; expiry: number; attempts: number; lastRequest: number; }
const otpStore = new Map<string, OtpEntry>();
const OTP_RATE_LIMIT_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const router = Router();

const JWT_SECRET = process.env["DASHBOARD_JWT_SECRET"];
if (!JWT_SECRET) throw new Error("DASHBOARD_JWT_SECRET env var is required");
const JWT_SECRET_STR: string = JWT_SECRET;
const COOKIE_NAME = "dashboard_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET_STR, { expiresIn: "7d" });
}

function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET_STR) as { userId: number; role: string };
    return payload;
  } catch {
    return null;
  }
}

export interface DashboardActor {
  id: number;
  username: string;
  role: string;
  branchIds: number[];
}

/**
 * Resolves the dashboard_token cookie to the user's current database access.
 * The token's role is deliberately not used as an authorization decision.
 */
export async function resolveOptionalDashboardActor(req: Parameters<RequestHandler>[0]): Promise<DashboardActor | null> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const [user] = await db
    .select({
      id: dashboardUsersTable.id,
      username: dashboardUsersTable.username,
      role: dashboardUsersTable.role,
    })
    .from(dashboardUsersTable)
    .where(eq(dashboardUsersTable.id, payload.userId))
    .limit(1);
  if (!user) return null;

  const branchRows = user.role === "admin"
    ? await db.select({ id: branchesTable.id }).from(branchesTable)
    : await db
      .select({ id: dashboardUserBranchesTable.branchId })
      .from(dashboardUserBranchesTable)
      .where(eq(dashboardUserBranchesTable.dashboardUserId, user.id));

  return {
    ...user,
    branchIds: branchRows.map((branch) => branch.id),
  };
}

function rejectCrossOriginRequest(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    res.status(403).json({ error: "مصدر الطلب غير مسموح" });
    return true;
  }
  const requestHost = req.get("host");
  if (!requestHost || originHost !== requestHost) {
    res.status(403).json({ error: "مصدر الطلب غير مسموح" });
    return true;
  }
  return false;
}

/** Requires a current database-backed dashboard session. */
export const requireDashboardUser: RequestHandler = async (req, res, next) => {
  if (rejectCrossOriginRequest(req, res)) return;
  const actor = await resolveOptionalDashboardActor(req);
  if (!actor) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  res.locals.dashboardActor = actor;
  next();
};

/**
 * Require a current dashboard admin session authenticated by the existing
 * httpOnly dashboard_token cookie.
 */
export const requireDashboardAdmin: RequestHandler = async (req, res, next) => {
  if (rejectCrossOriginRequest(req, res)) return;
  const actor = await resolveOptionalDashboardActor(req);
  if (!actor) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  if (actor.role !== "admin") {
    res.status(403).json({ error: "صلاحيات المشرف مطلوبة" });
    return;
  }
  res.locals.dashboardActor = actor;
  next();
};

router.post("/dashboard/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  req.log.info({ username, ip: req.ip, ua: req.headers["user-agent"] }, "[LOGIN] Attempt received");

  if (!username || !password) {
    req.log.warn({ username }, "[LOGIN] Missing username or password");
    res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    return;
  }

  let user: typeof dashboardUsersTable.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(dashboardUsersTable)
      .where(eq(dashboardUsersTable.username, username))
      .limit(1);
    user = rows[0];
  } catch (dbErr) {
    req.log.error({ err: dbErr }, "[LOGIN] DB error during user lookup");
    res.status(500).json({ error: "خطأ في قاعدة البيانات" });
    return;
  }

  if (!user) {
    req.log.warn({ username }, "[LOGIN] User not found in DB");
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  req.log.info({ username, userId: user.id }, "[LOGIN] User found, verifying password");

  let valid = false;
  try {
    valid = await bcrypt.compare(password, user.passwordHash);
  } catch (bcryptErr) {
    req.log.error({ err: bcryptErr }, "[LOGIN] bcrypt error");
    res.status(500).json({ error: "خطأ في التحقق من كلمة المرور" });
    return;
  }

  req.log.info({ username, userId: user.id, valid }, "[LOGIN] Password verification result");

  if (!valid) {
    req.log.warn({ username }, "[LOGIN] Wrong password");
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const token = signToken(user.id, user.role);
  const isProduction = process.env["NODE_ENV"] === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE,
  });

  req.log.info(
    { username: user.username, userId: user.id, secure: isProduction, sameSite: isProduction ? "none" : "lax" },
    "[LOGIN] Success — cookie set"
  );
  res.json({ id: user.id, username: user.username, role: user.role });
});

router.get("/dashboard/auth/me", async (req, res) => {
  const actor = await resolveOptionalDashboardActor(req);
  if (!actor) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  res.json(actor);
});

router.post("/dashboard/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// Temporary: returns admin username for the logged-in user (requires valid JWT cookie)
router.get("/dashboard/auth/admin-info", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) { res.status(401).json({ error: "غير مصرح" }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "جلسة منتهية" }); return; }
  const [user] = await db.select({ id: dashboardUsersTable.id, username: dashboardUsersTable.username, role: dashboardUsersTable.role })
    .from(dashboardUsersTable).where(eq(dashboardUsersTable.id, payload.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json({ username: user.username, role: user.role });
});

router.post("/dashboard/auth/forgot-password", async (req, res) => {
  const key = "admin-reset";
  const existing = otpStore.get(key);
  if (existing && Date.now() - existing.lastRequest < OTP_RATE_LIMIT_MS) {
    res.status(429).json({ error: "انتظر دقيقة قبل طلب رمز جديد" });
    return;
  }
  const code = generateOtp();
  otpStore.set(key, { code, expiry: Date.now() + 10 * 60 * 1000, attempts: 0, lastRequest: Date.now() });
  try {
    await sendPinOtpEmail(code);
    req.log.info("Reset OTP email sent successfully");
    res.json({ ok: true });
  } catch (e) {
    // Clear the OTP so rate-limit doesn't block the next attempt
    otpStore.delete(key);
    const errMsg = e instanceof Error ? e.message : String(e);
    req.log.error({ err: e, message: errMsg }, "Failed to send reset OTP email");
    res.status(500).json({ error: `فشل إرسال البريد: ${errMsg}` });
  }
});

router.post("/dashboard/auth/reset-password", async (req, res) => {
  const { code, newPassword } = req.body as { code?: string; newPassword?: string };
  if (!code || !newPassword) {
    res.status(400).json({ error: "الرمز وكلمة المرور الجديدة مطلوبان" });
    return;
  }

  const entry = otpStore.get("admin-reset");
  if (!entry || Date.now() > entry.expiry) {
    res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
    return;
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete("admin-reset");
    res.status(400).json({ error: "تم تجاوز عدد المحاولات، اطلب رمزاً جديداً" });
    return;
  }
  if (entry.code !== code) {
    entry.attempts++;
    res.status(400).json({ error: "الرمز غير صحيح" });
    return;
  }

  otpStore.delete("admin-reset");

  const [admin] = await db
    .select({ id: dashboardUsersTable.id })
    .from(dashboardUsersTable)
    .where(eq(dashboardUsersTable.role, "admin"))
    .limit(1);

  if (!admin) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(dashboardUsersTable)
    .set({ passwordHash })
    .where(eq(dashboardUsersTable.id, admin.id));

  req.log.info("Dashboard admin password reset successfully");
  res.json({ ok: true });
});

export async function seedDashboardAdmin(): Promise<void> {
  const adminUsername = process.env["ADMIN_USERNAME"];
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminUsername || !adminPassword) {
    logger.warn("ADMIN_USERNAME / ADMIN_PASSWORD not set — skipping admin seed");
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const [existing] = await db
    .select({ id: dashboardUsersTable.id })
    .from(dashboardUsersTable)
    .where(eq(dashboardUsersTable.role, "admin"))
    .limit(1);

  if (existing) {
    // Admin exists — always sync password from ADMIN_PASSWORD env var so it is predictable
    await db
      .update(dashboardUsersTable)
      .set({ passwordHash, username: adminUsername })
      .where(eq(dashboardUsersTable.id, existing.id));
    logger.info({ username: adminUsername }, "Dashboard admin password synced from env var");
    return;
  }

  await db.insert(dashboardUsersTable).values({
    username: adminUsername,
    passwordHash,
    role: "admin",
  });
  logger.info({ username: adminUsername }, "Dashboard admin seeded");
}

export default router;
