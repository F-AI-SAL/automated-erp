import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, toErrorResponse } from "@/lib/http/auth";
import { createManualSale, listSales } from "@/modules/sales/sales.service";

const ListQuery = z.object({ branchId: z.string().uuid() });

// GET /api/sales?branchId=... — requires sales:read.
export async function GET(req: Request) {
  try {
    const ctx = authorize(req, "sales:read");
    const url = new URL(req.url);
    const { branchId } = ListQuery.parse({ branchId: url.searchParams.get("branchId") });
    return NextResponse.json({ sales: await listSales(ctx.companyId, branchId) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const CreateBody = z.object({
  branchId: z.string().uuid(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        discount: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

// POST /api/sales — manual sell-sheet entry. Requires sales:write. Triggers the
// sale.posted event → stock depletion + P&L rollup (same path WhatsApp will use).
export async function POST(req: Request) {
  try {
    const ctx = authorize(req, "sales:write");
    const body = CreateBody.parse(await req.json());
    const result = await createManualSale({ companyId: ctx.companyId, actorId: ctx.sub, ...body });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
