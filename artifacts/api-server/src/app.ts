import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildReferralPage } from "./lib/referralLanding";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

const dashboardDist = path.resolve(__dirname, "../../dashboard/dist/public");
app.use("/dashboard", express.static(dashboardDist));
app.get(["/dashboard", "/dashboard/", "/dashboard/*splat"], (_req, res) => {
  res.sendFile(path.join(dashboardDist, "index.html"));
});

// ── Root landing page — referral deep link fallback ──────────────────────────
// Handles referral links on this project's own root URL.
// Also handles any unmatched path so WhatsApp/browsers don't show a white screen.
app.get(["/", "/invite", "/ref"], (req: Request, res: Response) => {
  const ref = (req.query.ref as string | undefined) ?? (req.query.code as string | undefined);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(buildReferralPage(ref));
});

// JSON error handler — must have 4 params for Express to treat it as error middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log the full technical error (including SQL details) server-side only
  logger.error(
    { err, pgMessage: (err as any)?.cause?.message ?? (err as any)?.detail, method: req.method, url: req.url },
    "Unhandled error"
  );
  // Return a generic Arabic message — never expose raw SQL or stack traces to clients
  res.status(500).json({ error: "حدث خطأ في الخادم، يرجى المحاولة مرة أخرى" });
});

export default app;
