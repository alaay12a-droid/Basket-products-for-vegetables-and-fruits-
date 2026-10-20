-- Additive, independent merchant tables only. No existing table is altered.
-- Run explicitly only after verifying this is the Basket database.
BEGIN;
CREATE TABLE IF NOT EXISTS merchant_sessions (
  token_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_order_details (
  order_id integer PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  preparation_minutes integer CHECK (preparation_minutes BETWEEN 5 AND 180),
  rejection_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_assignment_history (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  driver_id integer NOT NULL REFERENCES delivery_drivers(id),
  previous_driver_id integer,
  actor_id integer NOT NULL REFERENCES dashboard_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_refunds (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  type text NOT NULL CHECK (type IN ('cancel','refund')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  decision_reason text,
  actor_id integer REFERENCES dashboard_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_refunds_pending_unique ON merchant_refunds(order_id, type) WHERE status='pending';
CREATE TABLE IF NOT EXISTS merchant_availability (
  item_id text PRIMARY KEY REFERENCES menu_items(item_id) ON DELETE CASCADE,
  restore_at timestamptz,
  original_available boolean NOT NULL DEFAULT true,
  actor_id integer NOT NULL REFERENCES dashboard_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_events (
  id serial PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  order_id integer REFERENCES orders(id),
  branch_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_notification_reads (
  event_id integer NOT NULL REFERENCES merchant_events(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS merchant_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_commands (
  request_id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES dashboard_users(id),
  kind text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
