import { NextResponse } from "next/server";
import { verifyToken, InvalidTokenError } from "@/modules/core/jwt";
import { ForbiddenError, requirePermission } from "@/modules/core/rbac";
import type { AuthContext, Permission } from "@/modules/core/core.types";

/** Extracts + verifies the Bearer access token from a request. Throws if absent/invalid. */
export function getAuthContext(req: Request): AuthContext {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new InvalidTokenError("missing bearer token");
  return verifyToken(token, "access");
}

/** Convenience: auth + permission check in one call. */
export function authorize(req: Request, perm: Permission): AuthContext {
  const ctx = getAuthContext(req);
  requirePermission(ctx, perm);
  return ctx;
}

/** Maps auth/authz errors to proper HTTP responses; rethrows anything else. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof InvalidTokenError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  const message = err instanceof Error ? err.message : "internal error";
  return NextResponse.json({ error: message }, { status: 400 });
}
