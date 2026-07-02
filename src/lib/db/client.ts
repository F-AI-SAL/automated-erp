import { Pool, type PoolClient } from "pg";
import { env } from "@/lib/config/env";

/**
 * Managed Postgres (Supabase, Railway, …) requires TLS; a local dev/CI Postgres
 * does not. Detect by host so the same code works everywhere.
 */
function sslFor(url: string): { rejectUnauthorized: boolean } | undefined {
  return /@(localhost|127\.0\.0\.1)/.test(url) ? undefined : { rejectUnauthorized: false };
}

/**
 * App pool — connects with the tenant-scoped role. Every request goes through
 * `withTenant()`, so RLS isolates each company.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslFor(env.DATABASE_URL),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

/**
 * Worker pool — used ONLY by the outbox dispatcher, which must drain events for
 * every tenant. Connects with a BYPASSRLS / service role so the cross-tenant
 * claim query in dispatchOnce() is not filtered to zero rows by RLS.
 */
const workerUrl = env.DISPATCHER_DATABASE_URL ?? env.DATABASE_URL;
export const workerPool = new Pool({
  connectionString: workerUrl,
  ssl: sslFor(workerUrl),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
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
