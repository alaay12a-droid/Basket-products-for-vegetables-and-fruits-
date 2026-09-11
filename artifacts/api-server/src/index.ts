import { schedule } from "node-cron";
import app from "./app";
import { logger } from "./lib/logger";
import { seedOccasions } from "./routes/occasions";
import { cleanupExpiredDiscountCodes } from "./routes/discounts";
import { seedDashboardAdmin } from "./routes/dashboard-auth";
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { db, pushTokensTable, appSettingsTable } from "@workspace/db";
import { sendPushToToken } from "./lib/sendPushNotification";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runRuntimeSeeds() {
  await seedOccasions().catch((e) => logger.error({ err: e }, "Occasions seed failed"));
  await seedDashboardAdmin().catch((e) => logger.error({ err: e }, "Dashboard admin seed failed"));
}

runRuntimeSeeds()
  .then(() => {
    app.listen(port, "0.0.0.0", (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");

      schedule(
        "0 0 * * *",
        () => {
          cleanupExpiredDiscountCodes()
            .then((n) => logger.info({ deleted: n }, "Scheduled cleanup: expired discount codes removed"))
            .catch((e) => logger.error({ err: e }, "Scheduled cleanup: failed to remove expired discount codes"));
        },
        { timezone: "Asia/Riyadh" },
      );
      logger.info("Scheduled daily discount-code cleanup at midnight (Riyadh time)");

      schedule(
        "0 2 * * *",
        async () => {
          try {
            const [setting] = await db
              .select()
              .from(appSettingsTable)
              .where(eq(appSettingsTable.key, "reengagement_days"));
            const days = Math.max(1, parseInt(setting?.value ?? "30", 10) || 30);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);

            const inactive = await db
              .select()
              .from(pushTokensTable)
              .where(
                and(
                  eq(pushTokensTable.role, "customer"),
                  isNotNull(pushTokensTable.lastActiveAt),
                  isNull(pushTokensTable.reEngagementSentAt),
                  lt(pushTokensTable.lastActiveAt, cutoff),
                ),
              );

            logger.info({ count: inactive.length, days }, "Re-engagement: found inactive customers");

            for (const row of inactive) {
              const name = row.customerName?.trim() || "عزيزنا";
              try {
                await sendPushToToken(row.token, {
                  title: "منتجات السلة للخضار والفواكه 🥬",
                  body: `وحشتنا يا ${name} 👋 مرت فترة ما زرتنا فيها، تعال شوف عروضنا الجديدة 🥬`,
                  data: { type: "reengagement" },
                });
                await db
                  .update(pushTokensTable)
                  .set({ reEngagementSentAt: new Date() })
                  .where(eq(pushTokensTable.token, row.token));
                logger.info({ token: row.token.slice(0, 20), name }, "Re-engagement: notification sent");
              } catch (e) {
                logger.error({ err: e, token: row.token.slice(0, 20) }, "Re-engagement: failed to send notification");
              }
            }
          } catch (e) {
            logger.error({ err: e }, "Re-engagement cron: unexpected error");
          }
        },
        { timezone: "Asia/Riyadh" },
      );
      logger.info("Scheduled daily re-engagement notifications at 02:00 (Riyadh time)");
    });
  })
  .catch((e) => {
    logger.error({ err: e }, "Runtime seed failed — server refusing to start");
    process.exit(1);
  });
