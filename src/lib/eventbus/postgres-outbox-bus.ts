import type { PoolClient } from "pg";
import type { EventBus } from "./event-bus";
import type { DomainEvent } from "./domain-event";

/**
 * Default EventBus driver. Inserts the event into the `outbox` table using the
 * caller's transaction, so it commits atomically with the business data.
 *
 * The Outbox Dispatcher worker then picks up `pending` rows and fans them out.
 */
export class PostgresOutboxBus implements EventBus {
  async publish(event: DomainEvent, tx: PoolClient): Promise<void> {
    await tx.query(
      `INSERT INTO outbox (company_id, branch_id, type, payload, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [
        event.companyId,
        event.branchId ?? null,
        event.type,
        JSON.stringify(event.payload),
      ],
    );
  }
}
