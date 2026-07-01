import { PostgresOutboxBus } from "./postgres-outbox-bus";
import type { EventBus } from "./event-bus";

/**
 * Composition root for the event system. This is the ONE line you change the day
 * you outgrow Postgres:
 *
 *   export const eventBus: EventBus = new KafkaBus(...);
 */
export const eventBus: EventBus = new PostgresOutboxBus();

export type { EventBus } from "./event-bus";
export type { DomainEvent, EventType } from "./domain-event";
export { on, handlersFor, registeredTypes } from "./handler-registry";
