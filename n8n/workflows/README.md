# n8n Workflows

Exported workflow JSON lives here (version-controlled alongside the app).

## Planned (Phase 1)

- **`sellsheet-ingestion.json`** — the 10-node WhatsApp pipeline:
  WhatsApp Trigger → Identify Tenant → Download Media → Store to Bucket →
  Idempotency Guard → AI Vision Extract → Validate → Persist Sale (calls the app
  API, which publishes `sale.posted`) → Low-Stock Check → WhatsApp Report.

- **`whatsapp-qa-bot.json`** (Phase 3) — "আজ লাভ কত?" → intent → scoped query → reply.

## Convention

- n8n calls the app over an internal API (e.g. `POST /api/internal/sales`) rather
  than writing to Postgres directly — so all writes go through the same service
  layer + `EventBus`, keeping one source of truth.
- Export after every change: n8n UI → workflow → ⋯ → Download, commit the JSON here.
