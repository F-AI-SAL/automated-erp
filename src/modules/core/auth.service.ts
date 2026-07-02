import { pool, workerPool } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { hashPassword, verifyPassword } from "./password";
import { signAccessToken, signRefreshToken, verifyToken } from "./jwt";
import { seedRoles } from "./roles";
import { writeAudit } from "./audit.service";
import type { AuthClaims, RoleName } from "./core.types";

export interface AuthResult {
  companyId: string;
  userId: string;
  role: RoleName;
  accessToken: string;
  refreshToken: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "co";
}

function tokens(claims: AuthClaims) {
  return { accessToken: signAccessToken(claims), refreshToken: signRefreshToken(claims) };
}

export class AuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AuthError";
  }
}

/**
 * Registers a new tenant: creates the company, seeds the 8 roles, and creates
 * the first user as Owner. All tenant writes run inside the RLS context.
 */
export async function register(input: {
  companyName: string;
  ownerEmail: string;
  ownerPassword: string;
}): Promise<AuthResult> {
  if (input.ownerPassword.length < 8) throw new AuthError("password too short (min 8)");

  // companies has no RLS (it defines the tenant), so create it first.
  const slug = `${slugify(input.companyName)}-${Date.now().toString(36)}`;
  const companyRes = await workerPool.query<{ id: string }>(
    `INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id`,
    [input.companyName, slug],
  );
  const companyId = companyRes.rows[0]!.id;
  const passwordHash = await hashPassword(input.ownerPassword);

  return withTenant(companyId, async (tx) => {
    const roleIds = await seedRoles(tx, companyId);
    const userRes = await tx.query<{ id: string }>(
      `INSERT INTO users (company_id, role_id, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, roleIds.Owner, input.ownerEmail.toLowerCase(), passwordHash],
    );
    const userId = userRes.rows[0]!.id;
    await writeAudit(tx, {
      companyId,
      userId,
      action: "company.registered",
      entity: "company",
      entityId: companyId,
      after: { companyName: input.companyName, ownerEmail: input.ownerEmail.toLowerCase() },
    });
    const claims: AuthClaims = { sub: userId, companyId, role: "Owner" };
    return { companyId, userId, role: "Owner", ...tokens(claims) };
  });
}

/**
 * Logs a user in. The lookup is cross-tenant (we don't know the company yet),
 * so it uses the BYPASSRLS worker connection — the one place auth sits above tenancy.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await workerPool.query<{
    id: string;
    company_id: string;
    password_hash: string;
    role: RoleName;
    branch_id: string | null;
  }>(
    `SELECT u.id, u.company_id, u.password_hash, u.branch_id, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1
      LIMIT 1`,
    [email.toLowerCase()],
  );
  const user = res.rows[0];
  if (!user) throw new AuthError("invalid credentials");
  if (!(await verifyPassword(password, user.password_hash))) {
    throw new AuthError("invalid credentials");
  }
  // Login sits above tenancy → audit via the bypass connection with explicit company_id.
  await writeAudit(workerPool, {
    companyId: user.company_id,
    userId: user.id,
    action: "auth.login",
    entity: "user",
    entityId: user.id,
  });
  const claims: AuthClaims = {
    sub: user.id,
    companyId: user.company_id,
    branchId: user.branch_id ?? undefined,
    role: user.role,
  };
  return {
    companyId: user.company_id,
    userId: user.id,
    role: user.role,
    ...tokens(claims),
  };
}

/** Issues a fresh access token from a valid refresh token. */
export function refresh(refreshToken: string): { accessToken: string } {
  const claims = verifyToken(refreshToken, "refresh");
  return { accessToken: signAccessToken(claims) };
}

/** Verifies an access token and returns the auth context. */
export { verifyToken };
