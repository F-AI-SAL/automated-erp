import type { PoolClient } from "pg";
import type { DomainEvent, EventType } from "./domain-event";

/**
 * A handler consumes a delivered event. It receives an open transaction so its
 * writes (and any events IT publishes) stay atomic with marking the event done.
 */
export type EventHandler = (
  event: DomainEvent,
  tx: PoolClient,
) => Promise<void>;

const registry = new Map<EventType, EventHandler[]>();

/** Register a consumer for an event type. Called by each module at bootstrap. */
export function on(type: EventType, handler: EventHandler): void {
  const list = registry.get(type) ?? [];
  list.push(handler);
  registry.set(type, list);
}

/** Look up all handlers for a delivered event. */
export function handlersFor(type: EventType): EventHandler[] {
  return registry.get(type) ?? [];
}

/** For diagnostics / startup logging. */
export function registeredTypes(): EventType[] {
  return [...registry.keys()];
}
