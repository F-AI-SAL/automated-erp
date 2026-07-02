import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, getAuthContext, toErrorResponse } from "@/lib/http/auth";
import { createBranch, listBranches } from "@/modules/core/company.service";

// GET /api/branches — any authenticated user of the tenant.
export async function GET(req: Request) {
  try {
    const ctx = getAuthContext(req);
    const branches = await listBranches(ctx.companyId);
    return NextResponse.json({ branches });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const CreateBody = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  phone: z.string().optional(),
});

// POST /api/branches — requires the branches:manage permission (Owner/Manager).
export async function POST(req: Request) {
  try {
    const ctx = authorize(req, "branches:manage");
    const body = CreateBody.parse(await req.json());
    const branch = await createBranch(ctx.companyId, body, ctx.sub);
    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
