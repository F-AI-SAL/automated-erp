import { NextResponse } from "next/server";
import { pool } from "@/lib/db/client";

/**
 * Liveness + DB connectivity probe. Coolify / uptime monitors hit this.
 * GET /api/health → { status, db, outboxPending }
 */
export async function GET() {
  try {
    const pending = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM outbox WHERE status = 'pending'`,
    );
    return NextResponse.json({
      status: "ok",
      db: "up",
      outboxPending: Number(pending.rows[0]?.count ?? 0),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "degraded", db: "down", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
