import { workerPool as pool } from "@/lib/db/client";
import { env } from "@/lib/config/env";
import { handlersFor } from "@/lib/eventbus";
import type { DomainEvent, EventType } from "@/lib/eventbus";

interface OutboxRow {
  id: string;
  company_id: string;
  branch_id: string | null;
  type: EventType;
  payload: Record<string, unknown>;
  retries: number;
}

/**
 * One dispatch tick:
 *  1. Atomically claim a batch of `pending` rows (SKIP LOCKED = safe to run N workers).
 *  2. For each event: set tenant context, run every registered handler in a txn.
 *  3. Mark `done`, or bump retries / mark `failed` past the retry ceiling.
 */
export async function dispatchOnce(): Promise<number> {
  const claimed = await pool.query<OutboxRow>(
    `UPDATE outbox
       SET status = 'processing', updated_at = now()
     WHERE id IN (
       SELECT id FROM outbox
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, company_id, branch_id, type, payload, retries`,
    [env.DISPATCHER_BATCH_SIZE],
  );

  for (const row of claimed.rows) {
    await handleRow(row);
  }
  return claimed.rows.length;
}

async function handleRow(row: OutboxRow): Promise<void> {
  const event: DomainEvent = {
    type: row.type,
    companyId: row.company_id,
    branchId: row.branch_id ?? undefined,
    payload: row.payload,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_company', $1, true)", [
      row.company_id,
    ]);

    for (const handler of handlersFor(row.type)) {
      await handler(event, client);
    }

    await client.query(
      `UPDATE outbox SET status = 'done', processed_at = now() WHERE id = $1`,
      [row.id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    await onFailure(row, err);
  } finally {
    client.release();
  }
}

async function onFailure(row: OutboxRow, err: unknown): Promise<void> {
  const nextRetries = row.retries + 1;
  const dead = nextRetries >= env.DISPATCHER_MAX_RETRIES;
  console.error(
    `[dispatcher] event ${row.type} (${row.id}) failed ` +
      `(attempt ${nextRetries}/${env.DISPATCHER_MAX_RETRIES})`,
    err,
  );
  await pool.query(
    `UPDATE outbox
       SET status = $2, retries = $3, updated_at = now(), last_error = $4
     WHERE id = $1`,
    [
      row.id,
      dead ? "failed" : "pending", // back to pending for retry, or dead-letter
      nextRetries,
      err instanceof Error ? err.message : String(err),
    ],
  );
}
