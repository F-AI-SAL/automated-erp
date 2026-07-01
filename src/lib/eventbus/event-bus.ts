import type { PoolClient } from "pg";
import type { DomainEvent } from "./domain-event";

/**
 * The abstraction that makes this system Kafka-ready without Kafka.
 *
 * TODAY:  PostgresOutboxBus  → writes to the `outbox` table ($0 infra)
 * FUTURE: KafkaBus / NatsBus → same signature, swap one line in the composition root
 *
 * `publish` takes the SAME transaction client as the business write, so the event
 * and the data commit atomically. That is the outbox pattern — events are never lost.
 */
export interface EventBus {
  publish(event: DomainEvent, tx: PoolClient): Promise<void>;
}
