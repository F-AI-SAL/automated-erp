import { registerInventoryHandlers } from "./inventory/inventory.handlers";
import { registerFinanceHandlers } from "./finance/finance.handlers";

/**
 * Composition root for event consumers. Called once at process start
 * (by the dispatcher worker, and by the Next.js server for any in-process needs).
 *
 * Add each module's `register*Handlers()` here as it comes online.
 */
export function registerAllHandlers(): void {
  registerInventoryHandlers();
  registerFinanceHandlers();
  // registerNotificationHandlers();  // Phase 3
}
