import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/modules/core/auth.service";
import { toErrorResponse } from "@/lib/http/auth";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { email, password } = Body.parse(await req.json());
    const result = await login(email, password);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
