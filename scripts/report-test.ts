import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { recordDailyClosing } from "@/modules/finance/daily-closing.service";
import { addFixedCost } from "@/modules/finance/fixed-cost.service";
import { getBranchReport } from "@/modules/finance/report.service";

/** Report integration test (real Postgres in CI): daily net + monthly profit incl. fixed cost. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "Report Demo",
    ownerEmail: `report-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);
  const c = reg.companyId;
  const b = branch.id;

  // fixed cost 30,000/mo → 1,000/day
  await addFixedCost(c, b, "Rent", 30000);

  const base = {
    saleTotal: 10000, saleCard: 0, saleBkash: 0, salePanda: 0, saleDue: 0,
    openingCash: 0, addedCash: 0, cashInHand: 0,
    expenses: [{ name: "bazar", amount: 3000 }],
  };
  // two days this month
  await recordDailyClosing({ companyId: c, branchId: b, source: "manual", sourceHash: "r1",
    data: { ...base, date: "2026-07-01" } });
  await recordDailyClosing({ companyId: c, branchId: b, source: "manual", sourceHash: "r2",
    data: { ...base, date: "2026-07-02" } });

  const rep = await getBranchReport(c, b);
  assert(rep.hasData, "has data");
  assert(rep.monthLabel === "2026-07", `month 2026-07, got ${rep.monthLabel}`);
  assert(rep.month.days === 2, `2 days, got ${rep.month.days}`);
  assert(rep.month.sale === 20000, `month sale 20000, got ${rep.month.sale}`);
  assert(rep.month.expenses === 6000, `month expenses 6000, got ${rep.month.expenses}`);
  assert(rep.month.fixed === 30000, `month fixed 30000, got ${rep.month.fixed}`);
  // profit = 20000 − 6000 − 30000 = −16000
  assert(rep.month.profit === -16000, `month profit −16000, got ${rep.month.profit}`);
  // latest day: gross 10000−3000=7000; fixed/day=1000; net=6000
  assert(rep.latest!.date === "2026-07-02", `latest 2026-07-02, got ${rep.latest!.date}`);
  assert(rep.latest!.gross === 7000, `gross 7000, got ${rep.latest!.gross}`);
  assert(rep.latest!.fixedPerDay === 1000, `fixed/day 1000, got ${rep.latest!.fixedPerDay}`);
  assert(rep.latest!.net === 6000, `net 6000, got ${rep.latest!.net}`);

  console.log("✅ REPORT TEST PASSED — daily net + monthly profit (incl. fixed cost) verified");
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
