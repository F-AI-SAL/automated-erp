import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { addWithdrawal, listWithdrawals, monthlyWithdrawn } from "@/modules/finance/withdrawal.service";

/** Owner withdrawal test: record per person, monthly totals, grand total. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "WD Demo",
    ownerEmail: `wd-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);
  const c = reg.companyId, b = branch.id;

  await addWithdrawal(c, b, "Faisal", 45000);
  await addWithdrawal(c, b, "Protick", 10000);
  await addWithdrawal(c, b, "Faisal", 5000); // same person accumulates

  const { items, total } = await listWithdrawals(c, b);
  assert(total === 60000, `total 60000, got ${total}`);
  assert(items[0]!.person === "Faisal" && items[0]!.total === 50000, `Faisal 50000 top, got ${items[0]!.person} ${items[0]!.total}`);
  assert(items.length === 2, `2 people, got ${items.length}`);

  const m = await monthlyWithdrawn(c, b);
  assert(m === 60000, `monthly withdrawn 60000, got ${m}`);

  console.log("✅ WITHDRAWAL TEST PASSED — per-person totals + monthly grand total");
}

main()
  .then(async () => { await pool.end(); await workerPool.end(); process.exit(0); })
  .catch(async (err) => { console.error("❌", err); await pool.end().catch(()=>{}); await workerPool.end().catch(()=>{}); process.exit(1); });
