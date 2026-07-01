-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0001 — Full business schema (multi-tenant, RLS)
-- Columns here are matched EXACTLY to the queries in:
--   modules/sales/sales.service.ts, inventory.handlers.ts, finance.handlers.ts
-- Run AFTER 0000_outbox.sql.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper: standard RLS policy = row belongs to the current tenant.
-- Applied per-table below (USING also acts as WITH CHECK on INSERT).

-- ─── Tenancy & Access ───────────────────────────────────────────────────────
CREATE TABLE companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  plan_id    uuid,
  status     text NOT NULL DEFAULT 'active',
  currency   text NOT NULL DEFAULT 'BDT',
  timezone   text NOT NULL DEFAULT 'Asia/Dhaka',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  address    text,
  phone      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_company ON branches(company_id);

CREATE TABLE roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  description text
);

CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  role_id       uuid REFERENCES roles(id) ON DELETE SET NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  is_2fa        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);
CREATE INDEX idx_users_company ON users(company_id);

-- ─── Menu, Materials, Recipes ───────────────────────────────────────────────
CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category     text,
  name         text NOT NULL,
  price        numeric(12,2) NOT NULL DEFAULT 0,
  vat_pct      numeric(5,2)  NOT NULL DEFAULT 0,
  discount     numeric(12,2) NOT NULL DEFAULT 0,
  image_url    text,
  is_available boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_company_cat ON products(company_id, category);

CREATE TABLE raw_materials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  base_unit     text NOT NULL DEFAULT 'g',
  reorder_level numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost     numeric(12,4) NOT NULL DEFAULT 0,  -- for COGS in Phase 2
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_raw_materials_company ON raw_materials(company_id);

CREATE TABLE recipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  raw_material_id uuid NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
  quantity        numeric(14,3) NOT NULL,
  unit            text NOT NULL DEFAULT 'g',
  UNIQUE (product_id, raw_material_id)
);
CREATE INDEX idx_recipes_product ON recipes(product_id);

CREATE TABLE suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);

-- ─── Sales ──────────────────────────────────────────────────────────────────
CREATE TABLE sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  sale_date   date NOT NULL,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','whatsapp_ai')),
  source_hash text NOT NULL,
  total       numeric(14,2) NOT NULL DEFAULT 0,
  vat_total   numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'posted',
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- idempotency: a re-sent sell-sheet cannot double-post (see sales.service.ts)
  UNIQUE (branch_id, source_hash)
);
CREATE INDEX idx_sales_scope_date ON sales(company_id, branch_id, sale_date);

CREATE TABLE sale_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty        numeric(14,3) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  discount   numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

-- ─── Purchasing & Stock ─────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  po_date     date NOT NULL DEFAULT current_date,
  invoice_url text,
  total       numeric(14,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'received',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_company_date ON purchase_orders(company_id, po_date);

CREATE TABLE purchase_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  raw_material_id uuid NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
  qty             numeric(14,3) NOT NULL,
  unit_cost       numeric(12,4) NOT NULL,
  line_total      numeric(14,2) NOT NULL
);
CREATE INDEX idx_purchase_items_po ON purchase_items(po_id);

CREATE TABLE stock (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  raw_material_id  uuid NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity_on_hand numeric(16,3) NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, raw_material_id)
);
CREATE INDEX idx_stock_scope ON stock(company_id, branch_id);

CREATE TABLE stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  raw_material_id uuid NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  change_qty      numeric(16,3) NOT NULL,
  reason          text NOT NULL CHECK (reason IN ('purchase','sale_consumption','adjustment')),
  ref_type        text,
  ref_id          uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_moves ON stock_movements(branch_id, raw_material_id, created_at);

-- ─── Finance & People ───────────────────────────────────────────────────────
CREATE TABLE expense_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount       numeric(14,2) NOT NULL,
  expense_date date NOT NULL DEFAULT current_date,
  is_recurring boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_scope_date ON expenses(company_id, branch_id, expense_date);

CREATE TABLE employees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  name           text NOT NULL,
  role_title     text,
  monthly_salary numeric(14,2) NOT NULL DEFAULT 0,
  join_date      date,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_scope ON employees(company_id, branch_id);

CREATE TABLE salaries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month      text NOT NULL,             -- 'YYYY-MM'
  base       numeric(14,2) NOT NULL DEFAULT 0,
  advance    numeric(14,2) NOT NULL DEFAULT 0,
  bonus      numeric(14,2) NOT NULL DEFAULT 0,
  deduction  numeric(14,2) NOT NULL DEFAULT 0,
  net_paid   numeric(14,2) NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'pending',
  UNIQUE (employee_id, month)
);

CREATE TABLE profit_loss (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  period     date NOT NULL,
  revenue    numeric(16,2) NOT NULL DEFAULT 0,
  cogs       numeric(16,2) NOT NULL DEFAULT 0,
  expenses   numeric(16,2) NOT NULL DEFAULT 0,
  net_profit numeric(16,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, period)
);

-- ─── SaaS, AI, Audit ────────────────────────────────────────────────────────
CREATE TABLE plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  price_month numeric(10,2) NOT NULL DEFAULT 0,
  price_year  numeric(10,2) NOT NULL DEFAULT 0,
  limits      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id            uuid REFERENCES plans(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'trialing',
  trial_ends         timestamptz,
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_company ON subscriptions(company_id);

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  gateway         text NOT NULL CHECK (gateway IN ('sslcommerz','bkash','nagad','stripe','paddle')),
  amount          numeric(12,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  txn_ref         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_subscription ON payments(subscription_id);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel    text NOT NULL,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_company ON notifications(company_id, status);

CREATE TABLE ai_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_msg text,
  image_url  text,
  model      text,
  tokens     int,
  extracted  jsonb,
  confidence numeric(5,2),
  cost       numeric(10,4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_logs_company ON ai_logs(company_id, created_at);

CREATE TABLE audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_scope ON audit_logs(company_id, entity, created_at);

-- FK deferred from companies → plans (plans created above; add now).
ALTER TABLE companies
  ADD CONSTRAINT fk_companies_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- Row-Level Security — every tenant table isolated on company_id.
-- The USING expression also acts as WITH CHECK for INSERT.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'branches','roles','role_permissions','users','products','raw_materials',
    'recipes','suppliers','sales','sale_items','purchase_orders','purchase_items',
    'stock','stock_movements','expense_categories','expenses','employees','salaries',
    'profit_loss','subscriptions','payments','notifications','ai_logs','audit_logs'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- Tables that carry company_id directly:
    IF t NOT IN ('role_permissions','sale_items','purchase_items') THEN
      EXECUTE format(
        'CREATE POLICY %1$s_tenant ON %1$s
           USING (company_id = current_setting(''app.current_company'', true)::uuid);', t);
    END IF;
  END LOOP;
END $$;

-- Child tables without company_id inherit isolation via their parent FK.
CREATE POLICY sale_items_tenant ON sale_items
  USING (EXISTS (SELECT 1 FROM sales s
                  WHERE s.id = sale_items.sale_id
                    AND s.company_id = current_setting('app.current_company', true)::uuid));

CREATE POLICY purchase_items_tenant ON purchase_items
  USING (EXISTS (SELECT 1 FROM purchase_orders p
                  WHERE p.id = purchase_items.po_id
                    AND p.company_id = current_setting('app.current_company', true)::uuid));

CREATE POLICY role_permissions_tenant ON role_permissions
  USING (EXISTS (SELECT 1 FROM roles r
                  WHERE r.id = role_permissions.role_id
                    AND r.company_id = current_setting('app.current_company', true)::uuid));
