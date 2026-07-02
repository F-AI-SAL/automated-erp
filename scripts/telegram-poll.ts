import { getUpdates } from "@/modules/messaging/telegram.service";
import { handleUpdate } from "@/modules/messaging/telegram.handler";
import { pool, workerPool } from "@/lib/db/client";

/**
 * Local dev runner — long-polls Telegram and processes updates through the same
 * handler the webhook uses. No public URL needed. Production uses the webhook route.
 * Run: npm run telegram:poll
 */
async function main() {
  console.log("[telegram] polling… (Ctrl+C to stop)");
  let offset = 0;
  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });

  while (running) {
    let updates;
    try {
      updates = await getUpdates(offset);
    } catch (err) {
      console.error("[telegram] getUpdates error:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      const kind = update.message?.photo ? "photo" : update.message?.text ?? "(other)";
      console.log(`[telegram] update ${update.update_id}: ${kind}`);
      await handleUpdate(update).catch((e) => console.error("handler error:", e));
    }
  }

  await pool.end().catch(() => {});
  await workerPool.end().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error("[telegram] fatal:", err);
  process.exit(1);
});
