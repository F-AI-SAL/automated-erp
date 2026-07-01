# 🍽️ Food Engineering ERP

Multi-tenant Restaurant ERP SaaS. **Modular monolith** (microservices-ready),
**event-driven** (Postgres Outbox + n8n), **multi-tenant** via Postgres RLS,
**Kafka-ready** through a swappable `EventBus`.

> 📍 Roadmap & progress tracker: [`ROADMAP.md`](./ROADMAP.md)

---

## Architecture in one picture

```
Client (Next.js) ─┐
                  ▼
        Modules (core / sales / inventory / finance / billing)
                  │  write data + publish event  (same DB txn)
                  ▼
        EventBus.publish() ──▶ outbox table (Postgres)
                                     │
                        Outbox Dispatcher (worker)
                          ├─▶ in-app handlers (deplete stock, recompute P&L)
                          └─▶ n8n (WhatsApp report, low-stock alert, AI OCR)
```

**Why no Kafka:** for MVP load the outbox pattern gives durable, at-least-once,
idempotent delivery at **$0 extra infra**. When scale demands it, swap
`PostgresOutboxBus` → `KafkaBus` behind the same `EventBus` interface — no
business-logic change. See the Decision Log in `ROADMAP.md`.

---

## Folder structure

```
src/
├── app/                        # Next.js App Router (UI + API routes)
│   └── api/health/route.ts     # liveness + DB + outbox-depth probe
├── modules/                    # bounded contexts (future microservices)
│   ├── core/                   # tenancy, auth, RBAC, audit
│   ├── sales/                  # sales.service.ts → publishes sale.posted
│   ├── inventory/              # inventory.handlers.ts → consumes sale.posted
│   ├── finance/                # finance.handlers.ts → P&L rollup
│   ├── billing/                # plans/subscriptions (Phase 3)
│   └── bootstrap.ts            # registers all event handlers
├── lib/
│   ├── config/env.ts           # validated env (zod)
│   ├── db/                     # pg pool, withTransaction, withTenant (RLS)
│   └── eventbus/               # EventBus interface + outbox driver + registry
└── workers/
    └── dispatcher/             # standalone outbox → handler pump
db/migrations/                  # SQL migrations (0000_outbox first)
n8n/workflows/                  # exported n8n workflow JSON
```

---

## Local setup

```bash
cp .env.example .env          # fill DATABASE_URL etc.
docker compose up -d          # Postgres + n8n
npm install
# apply migrations (psql or your migrate script):
#   psql "$DATABASE_URL" -f db/migrations/0000_outbox.sql
npm run dev                   # Next.js on :3000
npm run worker:dispatcher     # outbox dispatcher (separate terminal)
```

Health check: <http://localhost:3000/api/health>

---

## The reference flow (read this to understand the whole system)

1. `modules/sales/sales.service.ts` → `postSale()` writes `sales` + `sale_items`
   **and** `eventBus.publish('sale.posted')` in one transaction.
2. `workers/dispatcher` picks up the outbox row, sets the tenant RLS context,
   and calls every handler registered for `sale.posted`.
3. `modules/inventory/inventory.handlers.ts` depletes stock via recipe, maybe
   emits `stock.depleted`.
4. `modules/finance/finance.handlers.ts` recomputes the `profit_loss` rollup.
5. n8n consumes events it cares about (WhatsApp report, low-stock alert).

Copy this pattern for every new module: **service publishes, handlers consume.**
Modules never call each other directly — only through the `EventBus`.
