import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import {
  addFixedCost,
  listFixedCosts,
  removeFixedCost,
} from "@/modules/finance/fixed-cost.service";

/** Fixed-cost integration test (real Postgres in CI): add/upsert/total/remove. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "Fixed Demo",
    ownerEmail: `fixed-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);
  const c = reg.companyId;
  const b = branch.id;

  await addFixedCost(c, b, "Shop Rent", 15000);
  await addFixedCost(c, b, "Staff Salary", 40000);
  await addFixedCost(c, b, "Staff House Rent", 8000);

  let { items, monthlyTotal } = await listFixedCosts(c, b);
  assert(items.length === 3, `3 fixed costs, got ${items.length}`);
  assert(monthlyTotal === 63000, `total should be 63000, got ${monthlyTotal}`);

  // upsert: same name (case-insensitive) updates amount, not a duplicate
  await addFixedCost(c, b, "shop rent", 16000);
  ({ items, monthlyTotal } = await listFixedCosts(c, b));
  assert(items.length === 3, `still 3 after upsert, got ${items.length}`);
  assert(monthlyTotal === 64000, `total should be 64000 after upsert, got ${monthlyTotal}`);

  // remove
  const removed = await removeFixedCost(c, b, "Shop Rent");
  assert(removed, "shop rent removed");
  ({ items, monthlyTotal } = await listFixedCosts(c, b));
  assert(items.length === 2 && monthlyTotal === 48000, `after remove: ${items.length} items, ${monthlyTotal}`);

  console.log("✅ FIXED-COST TEST PASSED — add/upsert/total/remove verified");
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
