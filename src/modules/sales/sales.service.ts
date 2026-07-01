import { withTenant } from "@/lib/db/with-tenant";
import { eventBus } from "@/lib/eventbus";
import type { SalePostedPayload } from "@/lib/eventbus/domain-event";

export interface PostSaleInput {
  companyId: string;
  branchId: string;
  saleDate: string; // ISO date
  source: "manual" | "whatsapp_ai";
  sourceHash: string; // hash(branch+date+image) → idempotency
  items: Array<{ productId: string; qty: number; unitPrice: number; discount?: number }>;
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

    return { saleId };
  });
}
