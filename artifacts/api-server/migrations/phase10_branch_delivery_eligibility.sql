-- Phase 10: branch delivery eligibility.
-- Additive only: this migration does not update or assign any existing rows.
-- Prerequisite: Phase 2 multi-branch foundation must already be installed.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.branches') IS NULL
    OR to_regclass('public.orders') IS NULL
    OR to_regclass('public.menu_items') IS NULL THEN
    RAISE EXCEPTION 'Required existing tables are missing; Phase 10 migration aborted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'branch_id'
  ) THEN
    RAISE EXCEPTION 'Required Phase 2 column orders.branch_id is missing; Phase 10 migration aborted';
  END IF;
END
$$;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS weekly_operating_hours JSONB,
  ADD COLUMN IF NOT EXISTS delivery_capacity INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_delivery_capacity_positive'
      AND conrelid = 'public.branches'::regclass
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT branches_delivery_capacity_positive
      CHECK (delivery_capacity IS NULL OR delivery_capacity > 0);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS branch_product_availability (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL
    REFERENCES branches(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL
    REFERENCES menu_items(item_id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_product_availability_branch_item_unique
  ON branch_product_availability (branch_id, item_id);

CREATE INDEX IF NOT EXISTS orders_delivery_capacity_lookup_idx
  ON orders (order_type, status, branch_id);

COMMIT;