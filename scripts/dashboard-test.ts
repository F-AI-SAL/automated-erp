import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { recordDailyClosing } from "@/modules/finance/daily-closing.service";
import { addFixedCost } from "@/modules/finance/fixed-cost.service";
import { getDailyTrend } from "@/modules/finance/report.service";

/**
 * Daily-trend test — the series that powers the web dashboard chart.
 *   establishment/day = 300000/30 = 10000 ; panda rate 32%
 *   Day1: 50000 − (10000×0.32 + 5000 + 10000) = 50000 − 18200 = 31800
 *   Day2: 40000 − (0        + 2000 + 10000) = 40000 − 12000 = 28000
 * Also asserts a same-day correction is de-duplicated (latest wins).
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "Dash Demo",
    ownerEmail: `dash-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);
  const c = reg.companyId, b = branch.id;

  await addFixedCost(c, b, "Establishment", 300000); // → 10000/day

  await recordDailyClosing({
    companyId: c, branchId: b, source: "manual", sourceHash: "d1",
    data: {
      date: "2026-06-01",
      saleTotal: 50000, saleCard: 0, saleBkash: 0, salePanda: 10000, saleDue: 0,
      openingCash: 0, addedCash: 0, cashInHand: 0,
      expenses: [{ name: "bazar", amount: 5000 }],
    },
  });
  await recordDailyClosing({
    companyId: c, branchId: b, source: "manual", sourceHash: "d2",
    data: {
      date: "2026-06-02",
      saleTotal: 40000, saleCard: 0, saleBkash: 0, salePanda: 0, saleDue: 0,
      openingCash: 0, addedCash: 0, cashInHand: 0,
      expenses: [{ name: "gas", amount: 2000 }],
    },
  });
  // Correction for Day1 (should replace the earlier Day1 in the trend).
  await recordDailyClosing({
    companyId: c, branchId: b, source: "manual", sourceHash: "d1-fix",
    data: {
      date: "2026-06-01",
      saleTotal: 50000, saleCard: 0, saleBkash: 0, salePanda: 10000, saleDue: 0,
      openingCash: 0, addedCash: 0, cashInHand: 0,
      expenses: [{ name: "bazar", amount: 5000 }],
    },
  });

  const { monthLabel, days } = await getDailyTrend(c, b);
  assert(monthLabel === "2026-06", `monthLabel 2026-06, got ${monthLabel}`);
  assert(days.length === 2, `2 distinct days, got ${days.length}`);

  const [d1, d2] = days;
  assert(d1!.date === "2026-06-01", `day1 date, got ${d1!.date}`);
  assert(d1!.sale === 50000, `day1 sale 50000, got ${d1!.sale}`);
  assert(d1!.profit === 31800, `day1 profit 31800, got ${d1!.profit}`);
  assert(d2!.date === "2026-06-02", `day2 date, got ${d2!.date}`);
  assert(d2!.profit === 28000, `day2 profit 28000, got ${d2!.profit}`);

  console.log("✅ DASHBOARD TEST PASSED — daily trend (31800 / 28000) + dedup correct");
}

main()
  .then(async () => { await pool.end(); await workerPool.end(); process.exit(0); })
  .catch(async (err) => { console.error("❌", err); await pool.end().catch(() => {}); await workerPool.end().catch(() => {}); process.exit(1); });
