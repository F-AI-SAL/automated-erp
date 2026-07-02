import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, getAuthContext, toErrorResponse } from "@/lib/http/auth";
import { createProduct, listProducts } from "@/modules/sales/products.service";

// GET /api/products — any authenticated tenant user.
export async function GET(req: Request) {
  try {
    const ctx = getAuthContext(req);
    return NextResponse.json({ products: await listProducts(ctx.companyId) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const CreateBody = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  category: z.string().optional(),
  vatPct: z.number().min(0).max(100).optional(),
});

// POST /api/products — requires menu:manage (Owner / Manager / Kitchen).
export async function POST(req: Request) {
  try {
    const ctx = authorize(req, "menu:manage");
    const body = CreateBody.parse(await req.json());
    const product = await createProduct(ctx.companyId, body, ctx.sub);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
