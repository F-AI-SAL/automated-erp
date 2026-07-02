import { randomUUID } from "node:crypto";
import { withTenant } from "@/lib/db/with-tenant";
import { eventBus } from "@/lib/eventbus";
import { writeAudit } from "@/modules/core/audit.service";
import type { SalePostedPayload } from "@/lib/eventbus/domain-event";

export interface PostSaleInput {
  companyId: string;
  branchId: string;
  saleDate: string; // ISO date
  source: "manual" | "whatsapp_ai";
  sourceHash: string; // hash(branch+date+image) → idempotency
  items: Array<{ productId: string; qty: number; unitPrice: number; discount?: number }>;
  actorId?: string;
}

export interface SaleSummary {
  id: string;
  branch_id: string;
  sale_date: string;
  source: string;
  total: string;
}

/**
 * Reference flow for the whole architecture:
 *   1. Write business data + publish the event IN THE SAME TRANSACTION.
 *   2. The dispatcher later delivers `sale.posted` to Inventory + Finance.
 *
 * Idempotency: the UNIQUE(branch_id, source_hash) constraint means a re-sent
 * WhatsApp photo cannot double-post a day's sales — the INSERT is a no-op on conflict.
 */
export async function postSale(input: PostSaleInput): Promise<{ saleId: string | null }> {
  return withTenant(input.companyId, async (tx) => {
    const total = input.items.reduce(
      (sum, it) => sum + it.qty * it.unitPrice - (it.discount ?? 0),
      0,
    );

    const saleRes = await tx.query<{ id: string }>(
      `INSERT INTO sales (company_id, branch_id, sale_date, source, source_hash, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'posted')
       ON CONFLICT (branch_id, source_hash) DO NOTHING
       RETURNING id`,
      [input.companyId, input.branchId, input.saleDate, input.source, input.sourceHash, total],
    );

    // Duplicate sheet → nothing inserted → skip silently (idempotent).
    if (saleRes.rows.length === 0) return { saleId: null };
    const saleId = saleRes.rows[0]!.id;

    for (const it of input.items) {
      await tx.query(
        `INSERT INTO sale_items (sale_id, product_id, qty, unit_price, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, it.productId, it.qty, it.unitPrice, it.discount ?? 0, it.qty * it.unitPrice - (it.discount ?? 0)],
      );
    }

    const payload: SalePostedPayload = {
      saleId,
      branchId: input.branchId,
      saleDate: input.saleDate,
      total,
      items: input.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice })),
      source: input.source,
    };
    await eventBus.publish(
      { type: "sale.posted", companyId: input.companyId, branchId: input.branchId, payload },
      tx,
    );

    await writeAudit(tx, {
      companyId: input.companyId,
      userId: input.actorId,
      action: "sale.posted",
      entity: "sale",
      entityId: saleId,
      after: { total, source: input.source, items: input.items.length },
    });

    return { saleId };
  });
}

/**
 * Manual sell-sheet entry (the UI/API path). Generates a unique source_hash so
 * each manual submission is its own sale; the WhatsApp/AI path reuses postSale
 * with a deterministic hash (branch+date+image) for idempotency.
 */
export async function createManualSale(input: {
  companyId: string;
  branchId: string;
  saleDate: string;
  items: PostSaleInput["items"];
  actorId?: string;
}): Promise<{ saleId: string | null }> {
  return postSale({
    ...input,
    source: "manual",
    sourceHash: `manual-${randomUUID()}`,
  });
}

/** Recent sales for a branch (RLS-scoped). */
export async function listSales(
  companyId: string,
  branchId: string,
  limit = 50,
): Promise<SaleSummary[]> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<SaleSummary>(
      `SELECT id, branch_id, sale_date, source, total
         FROM sales WHERE company_id = $1 AND branch_id = $2
        ORDER BY sale_date DESC, created_at DESC LIMIT $3`,
      [companyId, branchId, limit],
    );
    return res.rows;
  });
}
