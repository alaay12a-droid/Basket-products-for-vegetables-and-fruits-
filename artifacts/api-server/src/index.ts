import { schedule } from "node-cron";
import app from "./app";
import { logger } from "./lib/logger";
import { seedMenu } from "./routes/menu";
import { seedOccasions } from "./routes/occasions";
import { cleanupExpiredDiscountCodes } from "./routes/discounts";
import { seedDashboardAdmin } from "./routes/dashboard-auth";
import { sql, and, eq, isNull, isNotNull, lt } from "drizzle-orm";
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

async function runMigrationsAndSeed() {
  // ── Enums ────────────────────────────────────────────────────────────────────
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE order_status AS ENUM ('pending','preparing','ready','out_for_delivery','done','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  // Idempotent: adds 'out_for_delivery' to existing enums that predate this value.
  // ADD VALUE IF NOT EXISTS is purely additive and safe to run repeatedly.
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'out_for_delivery' BEFORE 'done';
    EXCEPTION WHEN others THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE order_type AS ENUM ('delivery','pickup');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE wallet_transaction_type AS ENUM ('deposit','withdrawal','expiry');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  // ── Core tables ──────────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      item_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_en TEXT,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      available BOOLEAN NOT NULL DEFAULT TRUE,
      image_key TEXT,
      image_url TEXT,
      stock INTEGER,
      sizes JSONB NOT NULL DEFAULT '[]',
      options JSONB NOT NULL DEFAULT '[]',
      calories INTEGER,
      walking_minutes INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      daily_number INTEGER NOT NULL DEFAULT 0,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT,
      items JSONB NOT NULL,
      total_price INTEGER NOT NULL,
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      discount_code TEXT,
      discount_amount INTEGER,
      order_type order_type DEFAULT 'delivery' NOT NULL,
      status order_status DEFAULT 'pending' NOT NULL,
      payment_method TEXT DEFAULT 'cash' NOT NULL,
      notes TEXT,
      customer_push_token TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    INSERT INTO app_settings (key, value)
    VALUES ('menu_template', 'classic')
    ON CONFLICT (key) DO NOTHING
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      fcm_token TEXT,
      role TEXT NOT NULL DEFAULT 'cashier',
      driver_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS occasions (
      id SERIAL PRIMARY KEY,
      occasion_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      image_key TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS banners (
      id SERIAL PRIMARY KEY,
      banner_id TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      image_key TEXT,
      title TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS combos (
      id SERIAL PRIMARY KEY,
      combo_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      image_url TEXT,
      image_key TEXT,
      components JSONB NOT NULL DEFAULT '[]',
      available BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wallets (
      phone TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      type wallet_transaction_type NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      note TEXT,
      order_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      from_cashier BOOLEAN NOT NULL DEFAULT FALSE,
      driver_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      read_at TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_ratings (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE,
      stars INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS driver_ratings (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE,
      driver_id INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delivery_drivers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      photo_url TEXT,
      photo_key TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      pin TEXT NOT NULL DEFAULT '0000',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE delivery_drivers ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await db.execute(sql`ALTER TABLE delivery_drivers ADD COLUMN IF NOT EXISTS last_lat REAL`);
  await db.execute(sql`ALTER TABLE delivery_drivers ADD COLUMN IF NOT EXISTS last_lng REAL`);
  await db.execute(sql`ALTER TABLE delivery_drivers ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_driver_assignments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE,
      driver_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'assigned',
      assigned_at TIMESTAMP DEFAULT NOW() NOT NULL,
      picked_up_at TIMESTAMP,
      delivered_at TIMESTAMP,
      driver_lat REAL,
      driver_lng REAL,
      location_updated_at TIMESTAMP,
      driver_rating INTEGER
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'fixed',
      value INTEGER NOT NULL DEFAULT 0,
      min_order INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMP,
      max_uses INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS discount_code_usages (
      id SERIAL PRIMARY KEY,
      discount_code_id INTEGER NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      order_id INTEGER,
      used_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      polygon JSONB NOT NULL DEFAULT '[]',
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      min_order INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dashboard_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_phone TEXT NOT NULL,
      referrer_name TEXT NOT NULL DEFAULT '',
      referred_phone TEXT NOT NULL UNIQUE,
      referred_name TEXT NOT NULL DEFAULT '',
      order_id INTEGER,
      reward_amount INTEGER NOT NULL DEFAULT 0,
      rewarded BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      rewarded_at TIMESTAMP
    )
  `);

  // ── Column additions (idempotent — for tables that existed before new columns) ──
  await db.execute(sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS fcm_token TEXT`);
  await db.execute(sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS driver_id INTEGER`);
  await db.execute(sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS customer_name TEXT`);
  await db.execute(sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS re_engagement_sent_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sizes JSONB NOT NULL DEFAULT '[]'`);
  await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'`);
  await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS calories INTEGER`);
  await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS walking_minutes INTEGER`);
  await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS rice_types JSONB NOT NULL DEFAULT '[]'`);
  await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS additions JSONB NOT NULL DEFAULT '[]'`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS daily_number INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_push_token TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash'`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type order_type DEFAULT 'delivery' NOT NULL`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status order_status DEFAULT 'pending' NOT NULL`);

  // ── Branches table (added after initial deploy) ───────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      maps_url TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      lat REAL,
      lng REAL,
      delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      weekly_operating_hours JSONB,
      delivery_capacity INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.execute(sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.execute(sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS weekly_operating_hours JSONB`);
  await db.execute(sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS delivery_capacity INTEGER`);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE branches ADD CONSTRAINT branches_delivery_capacity_positive
        CHECK (delivery_capacity IS NULL OR delivery_capacity > 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS branch_product_availability (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
      available BOOLEAN NOT NULL,
      UNIQUE(branch_id, item_id)
    )
  `);

  // ── Branch columns on orders (added after initial deploy) ─────────────────
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_name TEXT`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS orders_delivery_capacity_lookup_idx ON orders (order_type, status, branch_id)`);

  logger.info("All migrations complete");

  // ── Seed data (only after all schema is ready) ───────────────────────────────
  await seedMenu().catch((e) => logger.error({ err: e }, "Menu seed failed"));
  await seedOccasions().catch((e) => logger.error({ err: e }, "Occasions seed failed"));
  await seedDashboardAdmin().catch((e) => logger.error({ err: e }, "Dashboard admin seed failed"));
}

runMigrationsAndSeed()
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
                  title: "سلة الخضار 🥬",
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
    logger.error({ err: e }, "Migration failed — server refusing to start");
    process.exit(1);
  });
