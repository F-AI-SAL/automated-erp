import { env } from "@/lib/config/env";
import { registeredTypes } from "@/lib/eventbus";
import { registerAllHandlers } from "@/modules/bootstrap";
import { dispatchOnce } from "./dispatcher";

/**
 * Standalone long-running worker. Run with: `npm run worker:dispatcher`.
 * Deployed as its own tiny process next to the Next.js app (Coolify service).
 */
async function main() {
  registerAllHandlers();
  console.log(
    `[dispatcher] up. listening for: ${registeredTypes().join(", ") || "(none)"}`,
  );

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    try {
      const n = await dispatchOnce();
      // Only sleep when idle; drain fast when there's a backlog.
      if (n === 0) await sleep(env.DISPATCHER_POLL_INTERVAL_MS);
    } catch (err) {
      console.error("[dispatcher] tick error", err);
      await sleep(env.DISPATCHER_POLL_INTERVAL_MS);
    }
  }

  console.log("[dispatcher] shutting down.");
  process.exit(0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error("[dispatcher] fatal", err);
  process.exit(1);
});
