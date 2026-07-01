/**
 * The domain event catalog. Every cross-module side effect flows through one of these.
 * Add new event types here — this is the single source of truth.
 */
export type EventType =
  | "sale.posted"
  | "stock.depleted"
  | "purchase.received"
  | "expense.recorded"
  | "salary.paid"
  | "sellsheet.received"
  | "subscription.renewed";

export interface DomainEvent<TPayload = unknown> {
  /** what happened */
  type: EventType;
  /** tenant that owns this event (drives RLS + routing) */
  companyId: string;
  /** branch scope, when applicable */
  branchId?: string;
  /** event-specific data — cast to the matching payload type inside handlers */
  payload: TPayload;
}

/** ---- Strongly-typed payloads (extend as modules grow) ---- */

export interface SalePostedPayload {
  saleId: string;
  branchId: string;
  saleDate: string;
  total: number;
  items: Array<{ productId: string; qty: number; unitPrice: number }>;
  source: "manual" | "whatsapp_ai";
}

export interface StockDepletedPayload {
  branchId: string;
  rawMaterialId: string;
  remaining: number;
  reorderLevel: number;
}

export interface ExpenseRecordedPayload {
  expenseId: string;
  branchId: string;
  amount: number;
  categoryId: string;
}
