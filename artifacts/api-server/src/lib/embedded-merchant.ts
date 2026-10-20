import express, { type RequestHandler } from "express";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logger } from "./logger";

const base = "/basket-merchant";
type MerchantService = { app: RequestHandler; attach(server: Server): void };
type MerchantModule = { merchantService(base: string, port: number): MerchantService };

// No source import across artifacts. The deployment build emits this isolated
// module alongside index.mjs; it is never loaded unless explicitly enabled.
const dist = path.dirname(fileURLToPath(import.meta.url));
const loadModule = async (): Promise<MerchantModule> => import(pathToFileURL(path.join(dist, "merchant-service.mjs")).href);

export function createEmbeddedMerchant(
  load = loadModule,
  isEnabled = () => process.env.MERCHANT_EMBEDDED === "true",
  publicDir = path.resolve(dist, "../../basket-merchant/dist/public"),
) {
  let pending: Promise<MerchantService> | undefined;
  function service() {
    return pending ??= load().then(({ merchantService }) => {
      const merchant = merchantService(`${base}/`, Number(process.env.PORT ?? 0));
      const app = express();
      app.use(merchant.app);
      // Unknown API paths must not receive HTML from the SPA fallback.
      app.use(`${base}/api`, (_req, res) => res.status(404).json({ error: "مسار التاجر غير موجود" }));
      app.use(base, express.static(publicDir));
      app.get([base, `${base}/`, `${base}/*splat`], (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path.join(publicDir, "index.html"));
      });
      return { app, attach: merchant.attach };
    });
  }
  const middleware: RequestHandler = (req, res, next) => {
    if (req.path !== base && !req.path.startsWith(`${base}/`)) { next(); return; }
    if (!isEnabled()) {
      res.status(503).json({ error: "خدمة التاجر على هذا الخادم لم تُفعّل بعد" });
      return;
    }
    void service().then(merchant => merchant.app(req, res, next)).catch(error => {
      logger.error({ err: error }, "Embedded merchant route unavailable");
      res.status(503).json({ error: "تعذّر تشغيل خدمة التاجر على هذا الخادم" });
    });
  };
  return {
    middleware,
    async attach(server: Server) {
      if (!isEnabled()) return;
      try { (await service()).attach(server); }
      catch (error) {
        // A merchant packaging/config problem must not take the customer API down.
        logger.error({ err: error }, "Embedded merchant unavailable; core API remains active");
      }
    },
  };
}

export const embeddedMerchant = createEmbeddedMerchant();
