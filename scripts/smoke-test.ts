import { pool, workerPool } from "@/lib/db/client";
import { postSale } from "@/modules/sales/sales.service";
import { registerAllHandlers } from "@/modules/bootstrap";
import { dispatchOnce } from "@/workers/dispatcher/dispatcher";

/**
 * End-to-end integration test — runs in CI against a real Postgres service.
 * Proves the whole architecture actually works:
 *   1. postSale() writes sale + publishes sale.posted (same txn)
 *   2. idempotency: a re-sent sheet does NOT double-post
 *   3. dispatcher delivers the event → stock depletes via recipe
 *   4. finance handler recomputes the P&L rollup
 *   5. RLS actually isolates tenants (non-superuser role cannot see other company)
 *
 * Exits non-zero on any failed assertion → CI turns red → bad code cannot merge.
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  registerAllHandlers();

  const seed = await seedTenant();
  const {
    companyId,
    branchId,
    productId,
    materialId,
    otherCompanyId,
  } = seed;

  // Use today's date so it matches the finance handler's `current_date` rollup.
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. post a sale: 2 burgers. recipe = 120g chicken/burger. stock = 1000g ──
  const sourceHash = `smoke-sheet-${today}`;
  const first = await postSale({
    companyId,
    branchId,
    saleDate: today,
    source: "manual",
    sourceHash,
    items: [{ productId, qty: 2, unitPrice: 250 }],
  });
  assert(first.saleId, "sale should be created");

  // ── 2. idempotency: same sourceHash again must be a no-op ──
  const dup = await postSale({
    companyId,
    branchId,
    saleDate: today,
    source: "manual",
    sourceHash,
    items: [{ productId, qty: 2, unitPrice: 250 }],
  });
  assert(dup.saleId === null, "duplicate sell-sheet must NOT double-post");

  // ── 3. drain the outbox (dispatcher) ──
  let processed = 0;
  for (let i = 0; i < 5; i++) processed += await dispatchOnce();
  assert(processed >= 1, `dispatcher should process >=1 event, got ${processed}`);

  // ── 4. assert stock depleted: 1000 - (2 * 120) = 760 ──
  const stockRes = await pool.query<{ quantity_on_hand: string }>(
    `SELECT quantity_on_hand FROM stock WHERE branch_id = $1 AND raw_material_id = $2`,
    [branchId, materialId],
  );
  const onHand = Number(stockRes.rows[0]?.quantity_on_hand);
  assert(onHand === 760, `stock should be 760g, got ${onHand}`);

  // ── 5. assert P&L rollup recomputed (finance handler writes period = current_date) ──
  const pnl = await pool.query<{ revenue: string }>(
    `SELECT revenue FROM profit_loss WHERE branch_id = $1 AND period = current_date`,
    [branchId],
  );
  assert(Number(pnl.rows[0]?.revenue) === 500, `P&L revenue should be 500, got ${pnl.rows[0]?.revenue}`);

  // ── 6. RLS isolation: a non-superuser role scoped to company A sees NO company-B rows ──
  await assertRlsIsolation(companyId, otherCompanyId);

  console.log("✅ SMOKE TEST PASSED — sale→stock→P&L flow + idempotency + RLS isolation all verified");
}

interface Seed {
  companyId: string;
  branchId: string;
  productId: string;
  materialId: string;
  otherCompanyId: string;
}

async function seedTenant(): Promise<Seed> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const company = await c.query<{ id: string }>(
      `INSERT INTO companies (name, slug) VALUES ('Food Engineering','food-eng') RETURNING id`,
    );
    const companyId = company.rows[0]!.id;
    await c.query("SELECT set_config('app.current_company', $1, true)", [companyId]);

    const branch = await c.query<{ id: string }>(
      `INSERT INTO branches (company_id, name) VALUES ($1,'Main Branch') RETURNING id`,
      [companyId],
    );
    const branchId = branch.rows[0]!.id;

    const product = await c.query<{ id: string }>(
      `INSERT INTO products (company_id, name, price) VALUES ($1,'Chicken Burger',250) RETURNING id`,
      [companyId],
    );
    const productId = product.rows[0]!.id;

    const material = await c.query<{ id: string }>(
      `INSERT INTO raw_materials (company_id, name, base_unit, reorder_level, unit_cost)
       VALUES ($1,'Chicken','g',200,0.5) RETURNING id`,
      [companyId],
    );
    const materialId = material.rows[0]!.id;

    await c.query(
      `INSERT INTO recipes (company_id, product_id, raw_material_id, quantity, unit)
       VALUES ($1,$2,$3,120,'g')`,
      [companyId, productId, materialId],
    );
    await c.query(
      `INSERT INTO stock (company_id, branch_id, raw_material_id, quantity_on_hand)
       VALUES ($1,$2,$3,1000)`,
      [companyId, branchId, materialId],
    );

    // a second tenant, for the isolation check
    const other = await c.query<{ id: string }>(
      `INSERT INTO companies (name, slug) VALUES ('Rival Cafe','rival') RETURNING id`,
    );
    const otherCompanyId = other.rows[0]!.id;
    await c.query(
      `INSERT INTO products (company_id, name, price) VALUES ($1,'Secret Dish',999)`,
      [otherCompanyId],
    );

    await c.query("COMMIT");
    return { companyId, branchId, productId, materialId, otherCompanyId };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function assertRlsIsolation(companyA: string, companyB: string): Promise<void> {
  const c = await pool.connect();
  try {
    // A non-owner, non-superuser role IS subject to RLS.
    await c.query(`DROP ROLE IF EXISTS smoke_app`);
    await c.query(`CREATE ROLE smoke_app NOSUPERUSER`);
    await c.query(`GRANT USAGE ON SCHEMA public TO smoke_app`);
    await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO smoke_app`);

    await c.query("BEGIN");
    await c.query("SET ROLE smoke_app");
    await c.query("SELECT set_config('app.current_company', $1, true)", [companyA]);

    const mine = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM products`);
    const leak = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM products WHERE company_id = $1`,
      [companyB],
    );
    await c.query("RESET ROLE");
    await c.query("COMMIT");

    assert(Number(mine.rows[0]?.n) >= 1, "tenant A must see its own products");
    assert(Number(leak.rows[0]?.n) === 0, "RLS breach: tenant A can see tenant B's rows!");
  } finally {
    await c.query(`RESET ROLE`).catch(() => {});
    await c.query(`DROP ROLE IF EXISTS smoke_app`).catch(() => {});
    c.release();
  }
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
