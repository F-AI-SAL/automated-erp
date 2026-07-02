import { NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/modules/core/auth.service";
import { toErrorResponse } from "@/lib/http/auth";

const Body = z.object({
  companyName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const result = await register(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
