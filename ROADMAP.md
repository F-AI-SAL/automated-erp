# 🍽️ Food Engineering ERP — Project Roadmap & Tracker

> **Living document.** Check off `[ ]` → `[x]` as you complete work. Each phase ends with a live demo = a payment gate.
> **Architecture:** Modular Monolith (microservices-ready) · Event-driven (Postgres Outbox + n8n) · Multi-tenant (RLS) · Kafka-ready via `EventBus` abstraction.
> **Target infra cost:** ~$30–80/mo.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

---

## 📊 Progress Summary

| Phase | Scope | Timeline | Payment | Status |
|-------|-------|----------|---------|--------|
| Pre-Flight | Accounts + infra setup | Day 0 | — | ⬜ not started |
| Phase 0 | Foundation + Event Backbone | Week 1–2 | 20% | ✅ **complete** (event backbone + core auth/RBAC + audit) |
| Phase 1 | Core MVP (wow-loop) | Week 3–6 | 35% | ⬜ not started |
| Phase 2 | Financial Depth | Week 7–9 | 20% | ⬜ not started |
| Phase 3 | People & SaaS | Week 10–13 | 15% | ⬜ not started |
| Phase 4 | Scale & Handover | Week 14+ | 10% | ⬜ not started |

---

## ⚙️ Pre-Flight — before Phase 0 (Day 0, ~2–3 hrs)

Accounts + tools ready করো:

- [ ] Hetzner VPS (CX22, 2 vCPU / 4GB) + Coolify install
- [x] GitHub repo (private) + branch protection — `F-AI-SAL/automated-erp`, main protected (CI Gate + CodeQL required, PR + CODEOWNERS, linear history, no force-push)
- [ ] Supabase project (Postgres + Auth + Storage)
- [ ] Meta WhatsApp Cloud API app + test number
- [ ] OpenAI / Claude API key
- [ ] Sentry + PostHog projects (free tier)
- [ ] `.env` template + secrets stored in Coolify

**DoD:** `git push` → Coolify auto-deploys a "Hello World" to a live URL ✅

---

## 🧱 PHASE 0 — Foundation + Event Backbone
**Goal:** deployed skeleton + event system working. **Timeline: Week 1–2. Payment: 20%.**

- [x] Next.js + TypeScript scaffold
- [x] Folder structure: `/modules/{core,sales,inventory,finance,billing}`, `/lib/eventbus`, `/workers/dispatcher`
- [x] DB migration — all tables: `0000_outbox.sql` + `0001_schema.sql` (parser-validated, columns matched to handler queries; not yet run on a live DB)
  - [ ] companies, branches, users, roles, permissions, role_permissions
  - [ ] products, recipes, raw_materials, suppliers
  - [ ] purchase_orders, purchase_items
  - [ ] sales, sale_items
  - [ ] expenses, expense_categories
  - [ ] employees, salaries
  - [ ] stock, stock_movements
  - [ ] plans, subscriptions, payments
  - [ ] notifications, ai_logs, audit_logs
  - [x] **outbox** (event backbone) — `0000_outbox.sql`
- [x] Enable **RLS** on every tenant table _(all 24 tenant tables + child-table policies in `0001`)_
- [x] `EventBus` interface + `PostgresOutboxBus` driver
- [x] **Outbox Dispatcher worker** — poll `pending` → route → mark `done` → retry w/ backoff
- [x] Auth: register/login, JWT + refresh, RBAC middleware — HS256 JWT + scrypt, `node:crypto` only (PR #11)
- [x] Seed 8 roles (Owner, Manager, Accountant, Cashier, Kitchen, Inventory, Staff, Viewer) + RBAC matrix
- [x] Company + Branch CRUD (RLS-scoped) — API routes + services _(branch switcher = UI, later)_
- [x] Audit-log writer (every mutation) — `writeAudit()` wired into register/login/branch (PR #12)

**DoD:** create a company → RLS isolates its data; publish a test event → dispatcher processes it → row in `audit_logs`. Live staging URL. ✅
**Deliverable:** PRD PDF + ER diagram + deployed skeleton → **Payment 20%**

---

## 🔥 PHASE 1 — Core MVP (the wow-loop)
**Goal:** photo → AI → profit on WhatsApp. **Timeline: Week 3–6. Payment: 35%.** *(Money phase.)*

- [ ] **Products/Menu** module — CRUD, category, price, VAT, availability
- [ ] **Raw Materials + Recipes (BoM)** — link product → materials + qty
- [ ] **Sales** module — sell-sheet header + line items; `source` field; publish `sale.posted`
- [ ] **Inventory handler** — on `sale.posted` → recipe lookup → negative `stock_movements` → update `stock`
- [ ] **Purchase** module — PO + items → publish `purchase.received` → stock increase
- [ ] **Expenses** module — categories + entries → publish `expense.recorded`
- [ ] **Finance handler** — on `sale.posted` / `expense.recorded` → recompute `profit_loss` rollup
- [ ] **Dashboard** — Today's Sales / Profit / Cash / Low-stock tiles + trend chart (Supabase realtime)
- [ ] **n8n WhatsApp pipeline** (10 nodes):
  - [ ] inbound image trigger
  - [ ] identify tenant (by phone)
  - [ ] store image to bucket
  - [ ] idempotency guard (`source_hash`)
  - [ ] AI Vision extract (OCR → JSON)
  - [ ] validate data (schema + product match + math)
  - [ ] insert sale + sale_items (txn) + `ai_logs`
  - [ ] publish `sale.posted`
  - [ ] low-stock check
  - [ ] WhatsApp report reply
- [ ] Idempotency: `source_hash` UNIQUE on sales (re-sent photo ≠ double post)

**DoD:** send a real sell-sheet photo → within 60s: sales posted, stock reduced, P&L updated, WhatsApp replies "Sales ৳X · Profit ৳Y". ✅
**Deliverable:** live demo of the wow-loop → **Payment 35%**

---

## 📊 PHASE 2 — Financial Depth
**Goal:** true margins + automated alerts. **Timeline: Week 7–9. Payment: 20%.**

- [ ] Recipe **costing** — live cost / price / margin% per product
- [ ] P&L reports — daily → yearly, COGS, VAT report
- [ ] Reports module — sales / inventory / expense, PDF + CSV export
- [ ] **Low-stock alert** — `stock.depleted` event → n8n → WhatsApp/email to manager
- [ ] Inventory valuation report

**DoD:** edit a recipe qty → margin recalculates live; stock crosses reorder level → manager gets alert. ✅
**Deliverable:** reports + alerts demo → **Payment 20%**

---

## 👥 PHASE 3 — People & SaaS
**Goal:** payroll + monetization. **Timeline: Week 10–13. Payment: 15%.**

- [ ] **Salary** — employees, attendance, monthly run (advance/bonus/deduction), payslip; `salary.paid` → P&L
- [ ] **Plans + Subscriptions** — Starter/Pro/Enterprise, trial, coupon
- [ ] **Billing** — bKash / Nagad / SSLCommerz + Stripe; auto-renew; `subscription.renewed`
- [ ] **Notifications** — WhatsApp / email / push (low-stock, daily report, renewal)
- [ ] **WhatsApp Q&A bot** — "আজ লাভ কত?" → scoped query → "১৮,২০০ টাকা"

**DoD:** run payroll for a month; a tenant subscribes + auto-renews; bot answers profit query. ✅
**Deliverable:** full SaaS demo → **Payment 15%**

---

## 🛡️ PHASE 4 — Scale & Handover
**Goal:** production-hardened + documented. **Timeline: Week 14+. Payment: 10%.**

- [ ] 2FA, rate limiting, session control
- [ ] Audit-log **UI** (data already captured)
- [ ] Sentry + PostHog wired, health checks
- [ ] Docker/Coolify auto-deploy + **automated daily backup + PITR**
- [ ] Load test the outbox dispatcher; document the Kafka-swap path
- [ ] **Handover:** README, env docs, architecture doc, **Loom walkthrough**

**DoD:** kill the VPS → restore from backup; onboarding docs let a new dev deploy in <30 min. ✅
**Deliverable:** hardened + documented handover → **Payment 10%** → ask for 5★ + retainer

---

## 🗓️ First 5 Days (start NOW)

- [ ] **Day 1** — Pre-flight: VPS + Coolify + Supabase + GitHub, Hello-World deploy
- [ ] **Day 2** — Next.js scaffold + folder structure + `.env` + auth skeleton
- [ ] **Day 3** — DB migration (all tables) + enable RLS
- [ ] **Day 4** — `EventBus` + `outbox` table + Dispatcher worker + test event
- [ ] **Day 5** — Company/Branch CRUD + branch switcher + audit writer

→ **End of Week 1 = Phase 0 half done, live URL running.**

---

## 🧭 Reference — Event Catalog

| Event | Published by | Consumers | Effect |
|-------|--------------|-----------|--------|
| `sale.posted` | Sales module | Inventory, Finance, n8n | deplete stock → recompute P&L → WhatsApp report |
| `stock.depleted` | Inventory handler | Inventory, n8n | if < reorder_level → low-stock alert |
| `purchase.received` | Purchase module | Inventory handler | increase stock |
| `expense.recorded` | Finance module | Finance | recompute P&L |
| `salary.paid` | Payroll module | Finance | recompute P&L |
| `sellsheet.received` | n8n (WhatsApp) | AI worker | OCR → extract → creates `sale.posted` |
| `subscription.renewed` | Billing | Notifications (n8n) | receipt + WhatsApp confirm |

---

## 🏗️ Reference — Tech Stack & Infra

- **Frontend:** Next.js + TypeScript
- **Backend/DB:** Supabase (PostgreSQL + Auth + Storage), RLS multi-tenancy
- **Automation:** n8n (self-hosted container)
- **AI:** OpenAI Vision / Claude (OCR + extraction)
- **Hosting:** Coolify + Hetzner VPS (CX22)
- **Payments:** SSLCommerz, bKash, Nagad, Stripe/Paddle (international)
- **Monitoring:** Sentry + PostHog

**Deployment topology (one VPS):** Next.js app · Outbox Dispatcher worker · n8n container · Postgres (Supabase managed or self-hosted).

**Scalability path (no rewrite — swap `EventBus` driver):**
1. Now: Postgres Outbox + in-app handlers + n8n → $30–80/mo
2. Growth: + Redis/BullMQ for heavy async (AI retries)
3. Scale: swap `EventBus` → NATS/Redpanda, split AI worker to own node
4. Large: swap `EventBus` → Kafka, extract Sales/Inventory into own service

---

## 🔧 CI/CD & DevOps (live)

Repo: **github.com/F-AI-SAL/automated-erp** (private). `main` is protected — no broken code can merge.

| Workflow | Trigger | What it enforces |
|----------|---------|------------------|
| **CI** (`ci.yml`) | PR + push + manual | `quality` (typecheck·lint·build) + `integration` (real Postgres: migrate + event-flow/RLS smoke test) → **CI Gate** (required check) |
| **CodeQL** (`codeql.yml`) | PR + push + weekly | security-and-quality static analysis (required check) |
| **Sync lockfile** (`sync-lockfile.yml`) | manual | regenerate `package-lock.json` on Linux (Windows dev → strict `npm ci` in CI) |
| **Dependabot** | weekly | npm + github-actions updates, grouped |

Branch protection on `main`: required checks = **CI Gate** + **Analyze (JS/TS)**; PR + CODEOWNERS review; linear history; no force-push / no deletion.

> ⚠️ Gotcha solved: Windows-generated lockfiles break Linux `npm ci` (platform-specific esbuild/picomatch). Fix = the `sync-lockfile` workflow; run it after any dependency change made on Windows.
> 🔸 Minor: workflows warn "Node 20 deprecated" — bump `actions/*` + CodeQL to v4 later (non-blocking until Dec 2026).

> ✅ Deprecation warnings resolved: actions bumped (checkout v7, setup-node v6, codeql v4). Dependabot now ignores **all npm majors** — majors are adopted deliberately, minor/patch flow automatically.

- **2026-07-02 (Phase 0 ✅)** — Audit-log writer merged (**PR #12**): `writeAudit()` atomic-with-mutation, wired into register/login/branch, CI core-test asserts the rows. **Phase 0 fully complete** — foundation, event backbone, core auth/RBAC, audit all done + CI-verified. Next: Phase 1 MVP (Products/Recipes → manual Sales → wow-loop; WhatsApp/AI once Pre-Flight accounts exist).
- **2026-07-02 (core module)** — First feature via the protected PR flow (**PR #11**, feat/core-auth-rbac → squash-merge). Built **auth** (register/login/refresh, HS256 JWT + scrypt, **zero new deps** — `node:crypto`), **RBAC** (8-role matrix + `requirePermission`), **company/branch CRUD** (RLS), API routes (`/api/auth/*`, `/api/branches`). New **core-test** runs in CI on real Postgres (register/login/refresh + JWT + RBAC + branch CRUD — all ✅). All 5 required checks green; branch protection verified working. Left in Phase 0: audit-log writer.

## 📌 Working Rules

1. **One event = one handler = one job.** Modules talk only via `EventBus` — never direct coupling.
2. **Every phase ends with a live demo**, not code. That's the payment trigger.
3. **MVP discipline** — nothing outside Phase 1 leaks into Phase 1 (scope creep = death).
4. **Ship to staging daily** — Coolify auto-deploy so the client sees progress every day.

---

## 🗒️ Decision Log

| Date | Decision | Why |
|------|----------|-----|
| — | Modular Monolith, not microservices day-1 | Lightweight + cost-effective; extract services only under real load |
| — | Postgres Outbox + n8n, **not Kafka** | Kafka = $50–150/mo overkill for MVP; outbox = $0, Kafka-ready via `EventBus` |
| — | Shared DB + RLS multi-tenancy | Cheapest isolation model; graduate big tenants to own schema later |

---

## ✅ Changelog

- **2026-07-02** — Phase 0 scaffold created: modular-monolith layout, `EventBus` + `PostgresOutboxBus`, outbox dispatcher worker, `sale.posted` → inventory/finance reference flow, health check, `0000_outbox.sql`, docker-compose (Postgres + n8n).
- **2026-07-02 (audit)** — Deep audit + real verification: `git init` + commits; `npm install`; **`tsc` found & fixed 4 type bugs** (DomainEvent payload → `unknown`); **fixed dispatcher RLS bug** (dedicated `workerPool` w/ BYPASSRLS role, else it silently drains 0 rows); dispatcher **boot-verified** (registers handlers, resolves `@/` aliases). Wrote **`0001_schema.sql`** (all tables, FK, indexes, RLS) — **parser-validated** against real Postgres grammar (0 errors).
- **2026-07-02 (ci/cd + deploy)** — Pushed to **github.com/F-AI-SAL/automated-erp** (private). Built enterprise CI: typecheck·lint·build + **real-Postgres integration job**. Debugged CI to green through: npm-ci lockfile out-of-sync → cross-platform (Windows→Linux) lockfile incompatibility, solved with a **`sync-lockfile` Linux workflow**. **CI now green** — the smoke test proves the FULL event flow on real Postgres: sale→stock(760g)→P&L(500) + idempotency + **RLS tenant isolation**. Added CodeQL + Dependabot + PR template + CODEOWNERS. **`main` branch protection live** (CI Gate + CodeQL required). Next: `core` module (auth + RBAC + company/branch CRUD) — via PR now, not direct push.
