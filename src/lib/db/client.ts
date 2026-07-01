import { Pool, type PoolClient } from "pg";
import { env } from "@/lib/config/env";

/**
 * Single shared pg Pool for the whole app + the dispatcher worker.
 * Supabase is plain Postgres, so `pg` works with its connection string.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

/** A minimal executor interface so services/EventBus don't care about Pool vs Client. */
export interface Executor {
  query: PoolClient["query"];
}

/**
 * Run a function inside a single DB transaction.
 * The same client is passed to the callback so business writes + outbox insert
 * commit atomically (that is the whole point of the outbox pattern).
 */
export async function withTransaction<T>(
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
