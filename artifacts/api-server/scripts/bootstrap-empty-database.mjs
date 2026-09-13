import pg from "pg";

const { Client } = pg;

const bootstrapDatabaseUrl = process.env.SCHEMA_BOOTSTRAP_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;

if (!bootstrapDatabaseUrl) {
  throw new Error("SCHEMA_BOOTSTRAP_DATABASE_URL is required. DATABASE_URL is never used by this script.");
}

if (applicationDatabaseUrl && bootstrapDatabaseUrl === applicationDatabaseUrl) {
  throw new Error("Refusing to bootstrap: SCHEMA_BOOTSTRAP_DATABASE_URL must not match DATABASE_URL.");
}

const client = new Client({
  connectionString: bootstrapDatabaseUrl,
  ssl: {
    rejectUnauthorized: true,
  },
});

const statements = [
  `
    DO $$ BEGIN
      CREATE TYPE order_status AS ENUM ('pending','preparing','ready','out_for_delivery','done','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `,
  `
    DO $$ BEGIN
      ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'out_for_delivery' BEFORE 'done';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `,
  `
    DO $$ BEGIN
      CREATE TYPE order_type AS ENUM ('delivery','pickup');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `,
  `
    DO $$ BEGIN
      CREATE TYPE wallet_transaction_type AS ENUM ('deposit','withdrawal','expiry');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `,
  `
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
      rice_types JSONB NOT NULL DEFAULT '[]',
      additions JSONB NOT NULL DEFAULT '[]',
      calories INTEGER,
      walking_minutes INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
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
      branch_id INTEGER,
      branch_name TEXT,
      delivery_lat REAL,
      delivery_lng REAL,
      delivery_zone_id INTEGER,
      branch_assignment_method TEXT,
      branch_distance_km REAL,
      branch_assigned_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS push_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      fcm_token TEXT,
      role TEXT NOT NULL DEFAULT 'cashier',
      driver_id INTEGER,
      customer_name TEXT,
      last_active_at TIMESTAMP,
      re_engagement_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
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
  `,
  `
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
  `,
  `
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
  `,
  `
    CREATE TABLE IF NOT EXISTS wallets (
      phone TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
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
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      from_cashier BOOLEAN NOT NULL DEFAULT FALSE,
      driver_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      read_at TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS order_ratings (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE,
      stars INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS driver_ratings (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE,
      driver_id INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS delivery_drivers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      photo_url TEXT,
      photo_key TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      pin TEXT NOT NULL DEFAULT '0000',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      last_lat REAL,
      last_lng REAL,
      last_location_at TIMESTAMP
    )
  `,
  `
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
  `,
  `
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
  `,
  `
    CREATE TABLE IF NOT EXISTS discount_code_usages (
      id SERIAL PRIMARY KEY,
      discount_code_id INTEGER NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      order_id INTEGER,
      used_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      polygon JSONB NOT NULL DEFAULT '[]',
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      min_order INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      branch_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS dashboard_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
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
  `,
  `
    CREATE TABLE IF NOT EXISTS deleted_accounts (
      phone TEXT PRIMARY KEY,
      deleted_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
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
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      CONSTRAINT branches_delivery_capacity_positive
        CHECK (delivery_capacity IS NULL OR delivery_capacity > 0)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS branch_product_availability (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
      available BOOLEAN NOT NULL,
      CONSTRAINT branch_product_availability_branch_item_unique UNIQUE(branch_id, item_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS driver_branch_memberships (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS dashboard_user_branches (
      id SERIAL PRIMARY KEY,
      dashboard_user_id INTEGER NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `,
  `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat REAL
  `,
  `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng REAL
  `,
  `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_id INTEGER
  `,
  `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_assignment_method TEXT
  `,
  `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_distance_km REAL
  `,
  `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_assigned_at TIMESTAMP
  `,
  `
    ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS branch_id INTEGER
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS branch_product_availability_branch_item_unique
      ON branch_product_availability (branch_id, item_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS orders_delivery_capacity_lookup_idx
      ON orders (order_type, status, branch_id)
  `,
];

async function bootstrap() {
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    console.log("Bootstrap completed. No menu products were inserted.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

bootstrap().catch((error) => {
  console.error("Bootstrap failed without exposing the connection URL.", error);
  process.exitCode = 1;
});