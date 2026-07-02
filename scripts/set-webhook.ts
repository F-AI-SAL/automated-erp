import { setWebhook } from "@/modules/messaging/telegram.service";

/**
 * Point Telegram at the deployed webhook (run once after deploy):
 *   npm run set-webhook -- https://your-app.example.com
 * It appends /api/telegram/webhook and registers the secret from TELEGRAM_WEBHOOK_SECRET.
 */
async function main() {
  const base = process.argv[2];
  if (!base) throw new Error("usage: npm run set-webhook -- https://your-app-host");
  const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;
  const res = await setWebhook(url);
  console.log("setWebhook →", url);
  console.log(JSON.stringify(res, null, 2));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
