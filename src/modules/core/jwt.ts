import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";
import type { AuthClaims } from "./core.types";

/**
 * Minimal, dependency-free HS256 JWT (header.payload.signature).
 * Access tokens are short-lived; refresh tokens long-lived + `typ: "refresh"`.
 */
type TokenType = "access" | "refresh";

const ttlSeconds: Record<TokenType, number> = {
  access: 15 * 60, // 15m
  refresh: 30 * 24 * 60 * 60, // 30d
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

function secretFor(type: TokenType): string {
  return type === "refresh" ? env.JWT_REFRESH_SECRET : env.JWT_SECRET;
}

function sign(type: TokenType, claims: AuthClaims, nowSec: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    ...claims,
    typ: type,
    iat: nowSec,
    exp: nowSec + ttlSeconds[type],
  };
  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = b64url(createHmac("sha256", secretFor(type)).update(data).digest());
  return `${data}.${sig}`;
}

export function signAccessToken(claims: AuthClaims): string {
  return sign("access", claims, Math.floor(Date.now() / 1000));
}

export function signRefreshToken(claims: AuthClaims): string {
  return sign("refresh", claims, Math.floor(Date.now() / 1000));
}

export class InvalidTokenError extends Error {
  constructor(msg = "invalid token") {
    super(msg);
    this.name = "InvalidTokenError";
  }
}

/** Verifies signature + expiry + token type. Returns the claims or throws. */
export function verifyToken(token: string, type: TokenType): AuthClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new InvalidTokenError("malformed");
  const [head, body, sig] = parts as [string, string, string];

  const expectedSig = b64url(
    createHmac("sha256", secretFor(type)).update(`${head}.${body}`).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InvalidTokenError("bad signature");
  }

  const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
  if (payload.typ !== type) throw new InvalidTokenError("wrong token type");
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new InvalidTokenError("expired");
  }
  return {
    sub: payload.sub,
    companyId: payload.companyId,
    branchId: payload.branchId,
    role: payload.role,
  };
}
