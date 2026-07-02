import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { recordDailyClosing } from "@/modules/finance/daily-closing.service";
import { addFixedCost } from "@/modules/finance/fixed-cost.service";
import { getBranchPL } from "@/modules/finance/report.service";

/**
 * P&L report test — reproduces a REAL Excel day (1 June Pallabi):
 *   panda comm = 5162 × 32% = 1651.84 ; establishment/day = 412560/30 = 13752
 *   total cost = 1651.84 + 9030 + 13752 = 24433.84 ; profit = 57890 − 24433.84 = 33456.16
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "PL Demo",
    ownerEmail: `pl-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Pallabi" }, reg.userId);
  const c = reg.companyId, b = branch.id;

  await addFixedCost(c, b, "Establishment", 412560); // → 13752/day

  await recordDailyClosing({
    companyId: c, branchId: b, source: "manual", sourceHash: "pl1",
    data: {
      date: "2026-06-01",
      saleTotal: 57890, saleCard: 21980, saleBkash: 1534, salePanda: 5162, saleDue: 0,
      openingCash: 0, addedCash: 0, cashInHand: 0,
      expenses: [{ name: "from sale cost", amount: 9030 }],
    },
  });

  const rep = await getBranchPL(c, b);
  assert(rep.hasData, "has data");
  assert(rep.pandaRate === 0.32, `panda rate 0.32, got ${rep.pandaRate}`);
  assert(rep.establishmentPerDay === 13752, `establishment/day 13752, got ${rep.establishmentPerDay}`);

  const L = rep.latest!;
  assert(L.pandaCommission === 1651.84, `panda comm 1651.84, got ${L.pandaCommission}`);
  assert(L.establishment === 13752, `establishment 13752, got ${L.establishment}`);
  assert(L.totalCost === 24433.84, `total cost 24433.84, got ${L.totalCost}`);
  assert(L.profit === 33456.16, `profit 33456.16, got ${L.profit}`);

  // month (1 day) mirrors the day
  assert(rep.month.profit === 33456.16, `month profit 33456.16, got ${rep.month.profit}`);
  assert(rep.month.pandaCommission === 1651.84, `month panda comm 1651.84, got ${rep.month.pandaCommission}`);

  console.log("✅ REPORT TEST PASSED — reproduces real Excel day (profit 33,456.16)");
}

main()
  .then(async () => { await pool.end(); await workerPool.end(); process.exit(0); })
  .catch(async (err) => { console.error("❌", err); await pool.end().catch(()=>{}); await workerPool.end().catch(()=>{}); process.exit(1); });
