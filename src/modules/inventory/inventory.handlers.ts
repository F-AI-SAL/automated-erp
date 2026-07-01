import type { PoolClient } from "pg";
import { on } from "@/lib/eventbus";
import { eventBus } from "@/lib/eventbus";
import type { DomainEvent, SalePostedPayload, StockDepletedPayload } from "@/lib/eventbus/domain-event";

/**
 * Inventory reacts to sales: for each sold product, look up its recipe (BoM) and
 * write negative stock movements, then emit `stock.depleted` if a material crosses
 * its reorder level (n8n turns that into a low-stock WhatsApp alert in Phase 2).
 *
 * Runs inside the dispatcher's transaction → stock changes + the follow-up event
 * commit atomically with marking `sale.posted` done.
 */
export function registerInventoryHandlers(): void {
  on("sale.posted", depleteStockForSale);
}

async function depleteStockForSale(event: DomainEvent, tx: PoolClient): Promise<void> {
  const { items, branchId } = event.payload as SalePostedPayload;

  for (const item of items) {
    // recipe: product_id → raw_material_id + quantity per unit sold
    const recipe = await tx.query<{ raw_material_id: string; quantity: string }>(
      `SELECT raw_material_id, quantity FROM recipes WHERE product_id = $1`,
      [item.productId],
    );

    for (const line of recipe.rows) {
      const consumed = Number(line.quantity) * item.qty;

      // append-only ledger
      await tx.query(
        `INSERT INTO stock_movements
           (company_id, branch_id, raw_material_id, change_qty, reason, ref_type, ref_id)
         VALUES ($1, $2, $3, $4, 'sale_consumption', 'sale', $5)`,
        [event.companyId, branchId, line.raw_material_id, -consumed, (event.payload as SalePostedPayload).saleId],
      );

      // cached balance + reorder check
      const bal = await tx.query<{ quantity_on_hand: string; reorder_level: string }>(
        `UPDATE stock
            SET quantity_on_hand = quantity_on_hand - $3
          WHERE branch_id = $1 AND raw_material_id = $2
          RETURNING quantity_on_hand,
            (SELECT reorder_level FROM raw_materials WHERE id = $2) AS reorder_level`,
        [branchId, line.raw_material_id, consumed],
      );

      const row = bal.rows[0];
      if (row && Number(row.quantity_on_hand) <= Number(row.reorder_level)) {
        const payload: StockDepletedPayload = {
          branchId,
          rawMaterialId: line.raw_material_id,
          remaining: Number(row.quantity_on_hand),
          reorderLevel: Number(row.reorder_level),
        };
        await eventBus.publish(
          { type: "stock.depleted", companyId: event.companyId, branchId, payload },
          tx,
        );
      }
    }
  }
}
