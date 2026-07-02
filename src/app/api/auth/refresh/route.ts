import { NextResponse } from "next/server";
import { z } from "zod";
import { refresh } from "@/modules/core/auth.service";
import { toErrorResponse } from "@/lib/http/auth";

const Body = z.object({ refreshToken: z.string().min(10) });

export async function POST(req: Request) {
  try {
    const { refreshToken } = Body.parse(await req.json());
    return NextResponse.json(refresh(refreshToken), { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
