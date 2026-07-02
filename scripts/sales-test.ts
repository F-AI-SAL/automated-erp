import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { roleHasPermission } from "@/modules/core/rbac";
import { createProduct, listProducts } from "@/modules/sales/products.service";
import { createManualSale, listSales } from "@/modules/sales/sales.service";
import { registerAllHandlers } from "@/modules/bootstrap";
import { dispatchOnce } from "@/workers/dispatcher/dispatcher";

/**
 * Phase 1 integration test (real Postgres in CI) — the manual sales API path
 * that WhatsApp/AI will later reuse. Proves: product create/list, manual sale
 * → sale.posted event → P&L rollup, sales list, RBAC on menu:manage, and audit.
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  registerAllHandlers();
  const today = new Date().toISOString().slice(0, 10);

  const reg = await register({
    companyName: "Food Engineering",
    ownerEmail: `owner-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "s3cret-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);

  // ── product create + list (menu:manage path) ──
  const product = await createProduct(
    reg.companyId,
    { name: "Chicken Burger", price: 250, category: "Burgers", vatPct: 5 },
    reg.userId,
  );
  assert(product.id, "product created");
  const products = await listProducts(reg.companyId);
  assert(products.some((p) => p.id === product.id), "product listed");

  // ── manual sale → event flow ──
  const sale = await createManualSale({
    companyId: reg.companyId,
    branchId: branch.id,
    saleDate: today,
    items: [{ productId: product.id, qty: 3, unitPrice: 250 }],
    actorId: reg.userId,
  });
  assert(sale.saleId, "manual sale created");

  let processed = 0;
  for (let i = 0; i < 5; i++) processed += await dispatchOnce();
  assert(processed >= 1, "dispatcher processed the sale.posted event");

  // ── P&L rollup reflects revenue (3 * 250 = 750) ──
  const pnl = await pool.query<{ revenue: string; net_profit: string }>(
    `SELECT revenue, net_profit FROM profit_loss WHERE branch_id = $1 AND period = current_date`,
    [branch.id],
  );
  assert(Number(pnl.rows[0]?.revenue) === 750, `P&L revenue should be 750, got ${pnl.rows[0]?.revenue}`);
  // Regression guard: net_profit must be computed on the FIRST sale of the day too.
  assert(Number(pnl.rows[0]?.net_profit) === 750, `P&L net_profit should be 750, got ${pnl.rows[0]?.net_profit}`);

  // ── sales list ──
  const sales = await listSales(reg.companyId, branch.id);
  assert(sales.length === 1 && sales[0]!.id === sale.saleId, "sale appears in list");

  // ── RBAC on the new permission ──
  assert(roleHasPermission("Manager", "menu:manage"), "Manager can manage menu");
  assert(!roleHasPermission("Cashier", "menu:manage"), "Cashier CANNOT manage menu");
  assert(roleHasPermission("Cashier", "sales:write"), "Cashier can post sales");

  // ── audit captured product + sale ──
  const audit = await workerPool.query<{ action: string }>(
    `SELECT action FROM audit_logs WHERE company_id = $1`,
    [reg.companyId],
  );
  const actions = audit.rows.map((r) => r.action);
  assert(actions.includes("product.created"), "audit: product.created");
  assert(actions.includes("sale.posted"), "audit: sale.posted");

  console.log("✅ SALES TEST PASSED — product + manual sale → event → P&L + list + RBAC + audit all verified");
}

main()
  .then(async () => {
    await pool.end();
    await workerPool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌", err);
    await pool.end().catch(() => {});
    await workerPool.end().catch(() => {});
    process.exit(1);
  });
