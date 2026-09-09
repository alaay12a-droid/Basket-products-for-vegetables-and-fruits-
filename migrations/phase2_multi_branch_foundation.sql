-- Phase 2: additive multi-branch foundation.
-- This file is intentionally explicit and must be run only after inspecting the
-- target database. It does not assign orders, zones, drivers, or users to a branch.
-- It does not enable nearest-branch routing or alter existing operational behavior.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.branches') IS NULL
    OR to_regclass('public.orders') IS NULL
    OR to_regclass('public.delivery_zones') IS NULL
    OR to_regclass('public.delivery_drivers') IS NULL
    OR to_regclass('public.dashboard_users') IS NULL THEN
    RAISE EXCEPTION 'Required existing tables are missing; Phase 2 migration aborted';
  END IF;
END
$$;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS branch_id INTEGER;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_lat REAL,
  ADD COLUMN IF NOT EXISTS delivery_lng REAL,
  ADD COLUMN IF NOT EXISTS delivery_zone_id INTEGER,
  ADD COLUMN IF NOT EXISTS branch_assignment_method TEXT,
  ADD COLUMN IF NOT EXISTS branch_distance_km REAL,
  ADD COLUMN IF NOT EXISTS branch_assigned_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS driver_branch_memberships (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_user_branches (
  id SERIAL PRIMARY KEY,
  dashboard_user_id INTEGER NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_branch_id_idx
  ON orders(branch_id);

CREATE INDEX IF NOT EXISTS orders_delivery_zone_id_idx
  ON orders(delivery_zone_id);

CREATE INDEX IF NOT EXISTS delivery_zones_branch_id_idx
  ON delivery_zones(branch_id);

CREATE INDEX IF NOT EXISTS driver_branch_memberships_branch_id_idx
  ON driver_branch_memberships(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS driver_branch_memberships_driver_branch_idx
  ON driver_branch_memberships(driver_id, branch_id);

CREATE INDEX IF NOT EXISTS dashboard_user_branches_branch_id_idx
  ON dashboard_user_branches(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_user_branches_user_branch_idx
  ON dashboard_user_branches(dashboard_user_id, branch_id);

COMMIT;