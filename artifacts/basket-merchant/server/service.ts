import express, { type Request } from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { z } from "zod";
import pino from "pino";
import { database, enabled, rows, tokenHash, verifyBasketDatabase, verifySchema } from "./database";
import { snapshot, setting, effectiveHours, type Actor } from "./snapshot";
import { runCommand, type CoreRequest } from "./commands";
import { defaultHours, isOpenAt } from "./defaults";

const log = pino({ redact: ["token", "password", "cookie", "authorization"] });
const nativeOrigins = new Set(["https://localhost", "http://localhost", "capacitor://localhost"]);
const bodySchema = z.object({ kind: z.string().min(1).max(60), id: z.string().max(100).optional(), requestId: z.string().uuid(), data: z.record(z.unknown()) });
const authAttempts = new Map<string, { count: number; until: number }>();
let readyPromise: Promise<void> | undefined;
async function ready() {
  if (!enabled()) throw Object.assign(new Error("خدمة التاجر غير مفعّلة بعد. يلزم مراجعة اتصال قاعدة السلة وتثبيت الجداول المستقلة ثم التفعيل؛ تطبيقاتك الحالية لم تتغير."), { status: 503 });
  const coreUrl = process.env.MERCHANT_CORE_API_URL ?? "";
  if (!/^https:\/\/[^/@?#]+\/api\/?$/.test(coreUrl) || !process.env.MERCHANT_CORE_JWT_SECRET) {
    throw Object.assign(new Error("يلزم ضبط رابط API الحالي للسلة عبر HTTPS وتوقيع الجلسات قبل تفعيل خدمة التاجر"), { status: 503 });
  }
  if (!readyPromise) readyPromise = Promise.all([verifyBasketDatabase(), verifySchema()]).then(async () => {
    // A matching catalog alone is insufficient: commands must authenticate
    // against the same live API before sessions or background events are written.
    const admin = (await rows("SELECT id,role FROM dashboard_users WHERE role='admin' ORDER BY id LIMIT 1"))[0];
    if (!admin) throw Object.assign(new Error("يلزم وجود حساب مدير السلة الحالي لإثبات الربط"), { status: 503 });
    const token = jwt.sign({ userId: admin.id, role: admin.role }, process.env.MERCHANT_CORE_JWT_SECRET!, { expiresIn: "30s" });
    const response = await fetch(`${coreUrl.replace(/\/$/, "")}/dashboard/auth/me`, {
      redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { cookie: `dashboard_token=${token}` },
    });
    if (!response.ok) throw Object.assign(new Error("API السلة لم يقبل توقيع خدمة التاجر؛ لم يتم تفعيل الربط"), { status: 503 });
  }).catch(error => { readyPromise = undefined; throw error; });
  await readyPromise;
}
export async function sessionActor(req: Pick<Request, "headers" | "cookies">): Promise<Actor | null> {
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const token = bearer ?? req.cookies?.basket_merchant_session;
  if (!token) return null;
  const user = (await rows("SELECT u.id,u.username,u.role FROM merchant_sessions s JOIN dashboard_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", [tokenHash(token)]))[0];
  if (!user || !["admin", "employee"].includes(user.role)) return null;
  const memberships = user.role === "admin" ? [] : await rows("SELECT branch_id FROM dashboard_user_branches WHERE dashboard_user_id=$1", [user.id]);
  return { id: user.id, username: user.username, role: user.role, branchIds: memberships.map(row => row.branchId) };
}
function checkOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const currentHost = (() => { try { return new URL(origin).host; } catch { return ""; } })();
  if (currentHost !== host && !nativeOrigins.has(origin)) throw Object.assign(new Error("مصدر الطلب غير مسموح"), { status: 403 });
}
export function merchantService(base: string, port: number) {
  const app = express();
  const apiPath = `${base.replace(/\/$/, "")}/api/merchant`;
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(apiPath, (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie, Origin");
    if (req.headers.origin && nativeOrigins.has(req.headers.origin)) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    try { checkOrigin(req); next(); } catch (error) { next(error); }
  });
  app.use(apiPath, express.json({ limit: "2mb" }));
  app.get(`${apiPath}/status`, async (_req, res) => {
    let message = "جاهز لتسجيل الدخول";
    let active = false;
    try { await ready(); active = true; } catch (error) { message = (error as Error).message; }
    res.json({ enabled: active, message, printerNote: "الطباعة الحرارية تعمل داخل تطبيق أندرويد فقط؛ طابعة V3H تحتاج فحص توافق خدمة الشركة." });
  });
  app.post(`${apiPath}/login`, async (req, res) => {
    await ready();
    const ip = req.socket.remoteAddress ?? "unknown";
    const attempt = authAttempts.get(ip);
    if (attempt && attempt.until > Date.now() && attempt.count >= 10) { res.status(429).json({ error: "محاولات كثيرة؛ انتظر 15 دقيقة" }); return; }
    const input = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) }).parse(req.body);
    const user = (await rows("SELECT id,username,role,password_hash FROM dashboard_users WHERE username=$1", [input.username]))[0];
    if (!user || !["admin", "employee"].includes(user.role) || !await bcrypt.compare(input.password, user.passwordHash)) {
      authAttempts.set(ip, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 900000 });
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }); return;
    }
    authAttempts.delete(ip);
    const token = randomBytes(32).toString("base64url");
    await rows("INSERT INTO merchant_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [tokenHash(token), user.id]);
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.cookie("basket_merchant_session", token, { httpOnly: true, secure, sameSite: "lax", maxAge: 7 * 86400000, path: base });
    res.json({ user: { id: user.id, username: user.username, role: user.role }, token: nativeOrigins.has(req.headers.origin ?? "") ? token : undefined });
  });
  app.use(apiPath, async (req, res, next) => {
    await ready();
    const actor = await sessionActor(req);
    if (!actor) { res.status(401).json({ error: "سجّل دخول التاجر" }); return; }
    res.locals.actor = actor; next();
  });
  app.post(`${apiPath}/logout`, async (req, res) => {
    const token = req.headers.authorization?.slice(7) ?? req.cookies.basket_merchant_session;
    if (token) await rows("DELETE FROM merchant_sessions WHERE token_hash=$1", [tokenHash(token)]);
    res.clearCookie("basket_merchant_session", { path: base });
    res.json({ status: "ok" });
  });
  app.get(`${apiPath}/state`, async (_req, res) => res.json(await snapshot(res.locals.actor)));
  app.get(`${apiPath}/history`, async (req, res) => {
    const filters = z.object({
      search: z.string().max(100).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(["pending", "preparing", "ready", "done", "cancelled"]).optional(),
      before: z.coerce.number().int().positive().optional(),
    }).parse(req.query);
    res.json(await snapshot(res.locals.actor, filters));
  });

  const core: CoreRequest = async (actor, path, method, data) => {
    if (!process.env.MERCHANT_CORE_JWT_SECRET) throw new Error("خادم التاجر يحتاج توقيع جلسات API السلة في MERCHANT_CORE_JWT_SECRET");
    if (!path.startsWith("/") || path.includes("..") || /[?#\\]/.test(path)) throw new Error("مسار إجراء غير صالح");
    const token = jwt.sign({ userId: actor.id, role: actor.role }, process.env.MERCHANT_CORE_JWT_SECRET, { expiresIn: "30s" });
    // Reuse the actual running Basket API. Do not start, import or seed a second
    // copy of it; its notification/caching behavior and public links stay intact.
    const coreBase = String(process.env.MERCHANT_CORE_API_URL ?? "").replace(/\/$/, "");
    if (!/^https:\/\/[^/@?#]+\/api$/.test(coreBase)) throw new Error("رابط API الحالي للسلة غير مضبوط");
    const response = await fetch(`${coreBase}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { cookie: `dashboard_token=${token}`, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const result = await response.json() as any;
    if (!response.ok) throw Object.assign(new Error(result.error ?? "تعذّر تنفيذ الإجراء في النظام"), { status: response.status });
    return result;
  };
  app.post(`${apiPath}/actions`, async (req, res) => {
    const command = bodySchema.parse(req.body);
    const actor = res.locals.actor as Actor;
    const digest = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const existing = (await rows("SELECT user_id,payload_hash,status FROM merchant_commands WHERE request_id=$1", [command.requestId]))[0];
    if (existing) {
      if (existing.userId !== actor.id || existing.payloadHash !== digest) throw Object.assign(new Error("معرّف إجراء غير مطابق"), { status: 409 });
      if (existing.status === "done") { res.json({ status: "ok" }); return; }
      throw Object.assign(new Error("تمت محاولة هذا الإجراء؛ حدّث البيانات وتحقق من النتيجة قبل إعادة المحاولة"), { status: 409 });
    }
    await rows("INSERT INTO merchant_commands(request_id,user_id,kind,payload_hash) VALUES($1,$2,$3,$4)", [command.requestId, actor.id, command.kind, digest]);
    const client = await database().connect();
    const lockKey = `merchant:${command.id ?? actor.id}`;
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
      await runCommand(actor, command.kind, command.id, command.data, core);
      await syncManagedHours();
      await rows("UPDATE merchant_commands SET status='done' WHERE request_id=$1", [command.requestId]);
      signal();
      res.json({ status: "ok" });
    } catch (error) {
      await rows("UPDATE merchant_commands SET status='failed' WHERE request_id=$1", [command.requestId]);
      throw error;
    } finally { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]); client.release(); }
  });
  app.use(apiPath, (error: any, _req: Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof z.ZodError ? 400 : error.status ?? 500;
    log.warn({ status, code: error.code }, "Merchant request failed");
    res.status(status).json({ error: error instanceof z.ZodError ? "بيانات الإجراء غير صحيحة" : status < 500 ? error.message : "تعذّر تنفيذ الإجراء؛ تحقق من جاهزية الربط وأعد تحميل البيانات" });
  });
  const clients = new Set<WebSocket>();
  const signal = () => { for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "refresh" })); };
  let lastHoursState: boolean | undefined;
  async function syncManagedHours() {
    if (!await setting("hours-managed", false)) return;
    const hours = await effectiveHours();
    const closure = await setting("closure", { closed: false, forceOpen: false, until: null as string | null });
    const open = isOpenAt(hours, closure.until, closure.closed, new Date(), closure.forceOpen);
    if (lastHoursState === open) return;
    // Use the existing public branch-status contract; never edit the customer app.
    const legacyHours = { enabled: !open, days: Array.from({ length: 7 }, () => ({ enabled: false, open: "00:00", close: "23:59" })) };
    await rows("INSERT INTO app_settings(key,value) VALUES('branch_hours',$1) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()", [JSON.stringify(legacyHours)]);
    lastHoursState = open;
  }
  let ticking = false;
  let previousFingerprint = "";
  async function tick() {
    if (!enabled() || ticking) return;
    ticking = true;
    try {
      await ready();
      const recentOrders = await rows("SELECT id,daily_number,branch_id,status FROM orders WHERE created_at>now()-interval '2 days' ORDER BY id DESC LIMIT 1000");
      await rows(`INSERT INTO merchant_events(event_key,type,title,body,order_id,branch_id)
        SELECT 'order:'||id||':'||status::text,
          CASE WHEN status='cancelled' THEN 'cancel' ELSE 'order' END,
          CASE WHEN status='pending' THEN 'طلب جديد' WHEN status='cancelled' THEN 'إلغاء طلب' ELSE 'تحديث طلب' END,
          'طلب رقم '||daily_number,id,branch_id
        FROM orders WHERE created_at>now()-interval '2 days'
        ON CONFLICT(event_key) DO NOTHING`);
      await rows(`INSERT INTO merchant_events(event_key,type,title,body,order_id,branch_id)
        SELECT 'message:'||m.id,'message','رسالة عميل','رسالة جديدة للطلب '||o.daily_number,m.order_id,o.branch_id
        FROM messages m JOIN orders o ON o.id=m.order_id
        WHERE m.from_cashier=false AND m.driver_id IS NULL AND m.created_at>now()-interval '2 days'
        ON CONFLICT(event_key) DO NOTHING`);
      const expired = await rows("SELECT a.*,a.updated_at::text AS version,u.username,u.role FROM merchant_availability a JOIN dashboard_users u ON u.id=a.actor_id WHERE a.restore_at<=now()");
      for (const item of expired) {
        if (item.role !== "admin") continue;
        await core({ id: item.actorId, username: item.username, role: item.role, branchIds: [] }, `/menu/${encodeURIComponent(item.itemId)}`, "PUT", { available: item.originalAvailable });
        await rows("DELETE FROM merchant_availability WHERE item_id=$1 AND updated_at::text=$2", [item.itemId, item.version]);
      }
      await syncManagedHours();
      const fingerprint = JSON.stringify([
        recentOrders, (await rows("SELECT max(id) AS id,count(*) AS count FROM messages"))[0],
        (await rows("SELECT max(id) AS id FROM merchant_events"))[0],
        (await rows("SELECT count(*) AS count,sum(CASE WHEN available THEN 1 ELSE 0 END) AS available,sum(price) AS price FROM menu_items"))[0],
      ]);
      if (fingerprint !== previousFingerprint) { previousFingerprint = fingerprint; signal(); }
    } catch (error: any) { log.warn({ code: error.code }, "Merchant sync unavailable; no fallback data used"); }
    finally { ticking = false; }
  }
  function attach(server: Server) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    const wsPath = `${base.replace(/\/$/, "")}/events`;
    const onUpgrade = async (req: import("node:http").IncomingMessage, socket: any, head: Buffer) => {
      if (new URL(req.url ?? "/", "http://localhost").pathname !== wsPath) return;
      try {
        await ready();
        checkOrigin(req as Request);
        const rawCookie = String(req.headers.cookie ?? "");
        const cookies = Object.fromEntries(rawCookie.split(";").map(value => value.trim().split("=")).filter(entry => entry.length === 2));
        const actor = await sessionActor({ headers: req.headers, cookies });
        if (!actor) throw new Error("Unauthorized");
        wss.handleUpgrade(req, socket, head, ws => {
          clients.add(ws);
          ws.on("close", () => clients.delete(ws));
          ws.on("error", () => clients.delete(ws));
          ws.send(JSON.stringify({ type: "refresh" }));
        });
      } catch { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); }
    };
    server.on("upgrade", onUpgrade);
    const timer = setInterval(() => { void tick(); for (const ws of clients) ws.ping(); }, 3000);
    server.on("close", () => { clearInterval(timer); wss.close(); server.off("upgrade", onUpgrade); });
  }
  return { app, attach };
}
