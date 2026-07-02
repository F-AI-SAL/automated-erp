# Deploy — Coolify (24/7, no session needed)

The Telegram bot runs as a webhook: Telegram POSTs updates to `/api/telegram/webhook`,
the app does OCR + DB + reply inline. No long-running poller needed. (The outbox
dispatcher is only for the sales/menu event flow — not the daily-closing workflow.)

## Prerequisites
1. A **VPS** (Hetzner CX22, ~€4/mo) — any Ubuntu 22.04+ box.
2. **Coolify** installed on it:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
   Then open `http://<vps-ip>:8000` and create the admin account.
3. A **domain** (or use Coolify's generated `sslip.io` URL) — Telegram webhooks need HTTPS.

## Steps in Coolify
1. **New Resource → Public/Private Git Repository** → `F-AI-SAL/automated-erp` (branch `main`).
2. **Build pack: Dockerfile** (repo already has one). Port **3000**.
3. **Environment variables** (Settings → Environment) — copy from your `.env`:
   ```
   DATABASE_URL=<Supabase session pooler URI>
   DISPATCHER_DATABASE_URL=<same>
   JWT_SECRET=<...>
   JWT_REFRESH_SECRET=<...>
   ANTHROPIC_API_KEY=<...>
   TELEGRAM_BOT_TOKEN=<...>
   TELEGRAM_WEBHOOK_SECRET=<...>
   ```
4. **Deploy.** Coolify builds the Docker image and gives an HTTPS URL
   (e.g. `https://app.<your-domain>` or a generated one). Enable HTTPS.

## After first deploy
1. **Run migrations once** (Coolify → your app → Terminal, or locally against the same DB):
   ```bash
   npm run db:migrate
   ```
   (Already applied to your Supabase — safe to re-run, migrations are idempotent.)
2. **Register the Telegram webhook** (once) — from the app terminal or your machine:
   ```bash
   npm run set-webhook -- https://<your-app-url>
   ```
   This points Telegram at `/api/telegram/webhook` with your secret token.
3. Send `/report` to the bot — it now replies via the deployed app, 24/7. You can stop
   the local `telegram:poll`.

## Notes
- **Webhook vs polling are mutually exclusive.** Setting the webhook stops Telegram from
  serving `getUpdates`, so the local poller goes quiet — that's expected.
- **Redeploys** happen automatically on push to `main` (Coolify GitHub webhook), or click Deploy.
- Optional: add a **second Coolify service** from the same image with command
  `npm run worker:dispatcher` if/when you use the sales event flow.
