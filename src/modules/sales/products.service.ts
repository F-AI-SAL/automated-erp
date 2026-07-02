import { withTenant } from "@/lib/db/with-tenant";
import { writeAudit } from "@/modules/core/audit.service";

export interface Product {
  id: string;
  category: string | null;
  name: string;
  price: string;
  vat_pct: string;
  is_available: boolean;
}

/** Create a menu product (RLS-scoped) + audit. */
export async function createProduct(
  companyId: string,
  input: { name: string; price: number; category?: string; vatPct?: number },
  actorId?: string,
): Promise<Product> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<Product>(
      `INSERT INTO products (company_id, name, price, category, vat_pct)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, category, name, price, vat_pct, is_available`,
      [companyId, input.name, input.price, input.category ?? null, input.vatPct ?? 0],
    );
    const product = res.rows[0]!;
    await writeAudit(tx, {
      companyId,
      userId: actorId,
      action: "product.created",
      entity: "product",
      entityId: product.id,
      after: product,
    });
    return product;
  });
}

/** List menu products (RLS-scoped). */
export async function listProducts(companyId: string): Promise<Product[]> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<Product>(
      `SELECT id, category, name, price, vat_pct, is_available
         FROM products WHERE company_id = $1 ORDER BY category NULLS FIRST, name`,
      [companyId],
    );
    return res.rows;
  });
}
