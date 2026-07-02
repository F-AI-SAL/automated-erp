import { NextResponse } from "next/server";
import { authorize, toErrorResponse } from "@/lib/http/auth";
import { listBranches } from "@/modules/core/company.service";
import { getBranchPL, getExpenseBreakdown, getDailyTrend } from "@/modules/finance/report.service";
import { listWithdrawals } from "@/modules/finance/withdrawal.service";
import { listFixedCosts } from "@/modules/finance/fixed-cost.service";

/**
 * GET /api/dashboard?branchId=…
 * One authenticated call that returns everything the web dashboard renders for a
 * branch: branch list, P&L, expense breakdown, withdrawals, fixed costs, daily trend.
 * Tenant is taken from the JWT (never the query); branch is validated to belong to it.
 */
export async function GET(req: Request) {
  try {
    const ctx = authorize(req, "reports:read");
    const { companyId } = ctx;

    const branches = (await listBranches(companyId)).map((b) => ({ id: b.id, name: b.name }));
    if (branches.length === 0) {
      return NextResponse.json({ branches: [], branchId: null, hasData: false });
    }

    const requested = new URL(req.url).searchParams.get("branchId");
    const branchId =
      (requested && branches.some((b) => b.id === requested) && requested) ||
      (ctx.branchId && branches.some((b) => b.id === ctx.branchId) && ctx.branchId) ||
      branches[0]!.id;

    const [pl, expenses, withdrawals, fixedCosts, trend] = await Promise.all([
      getBranchPL(companyId, branchId),
      getExpenseBreakdown(companyId, branchId),
      listWithdrawals(companyId, branchId),
      listFixedCosts(companyId, branchId),
      getDailyTrend(companyId, branchId),
    ]);

    return NextResponse.json({
      branches,
      branchId,
      branchName: branches.find((b) => b.id === branchId)?.name ?? "",
      pl,
      expenses,
      withdrawals,
      fixedCosts,
      trend,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
