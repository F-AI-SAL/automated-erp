import { pool, workerPool } from "@/lib/db/client";
import { register, login, refresh, verifyToken } from "@/modules/core/auth.service";
import { createBranch, listBranches } from "@/modules/core/company.service";
import { roleHasPermission } from "@/modules/core/rbac";
import { AuthError } from "@/modules/core/auth.service";
import { InvalidTokenError } from "@/modules/core/jwt";

/**
 * Integration test for the core module — runs in CI against real Postgres.
 * Proves: registration, JWT issue/verify, login (+ wrong-password rejection),
 * refresh, the RBAC matrix, and RLS-scoped branch CRUD.
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const email = `owner-${Date.now().toString(36)}@food-eng.test`;
  const password = "s3cret-password";

  // ── 1. register a tenant + owner ──
  const reg = await register({ companyName: "Food Engineering", ownerEmail: email, ownerPassword: password });
  assert(reg.companyId && reg.userId, "register returns ids");
  assert(reg.role === "Owner", "first user is Owner");
  assert(reg.accessToken && reg.refreshToken, "register issues tokens");

  // ── 2. access token verifies & carries the right claims ──
  const claims = verifyToken(reg.accessToken, "access");
  assert(claims.companyId === reg.companyId, "token companyId matches");
  assert(claims.role === "Owner", "token role matches");

  // ── 3. short password is rejected ──
  let rejectedShort = false;
  try {
    await register({ companyName: "X", ownerEmail: "x@x.test", ownerPassword: "short" });
  } catch (e) {
    rejectedShort = e instanceof AuthError;
  }
  assert(rejectedShort, "short password rejected");

  // ── 4. login works; wrong password is rejected ──
  const li = await login(email, password);
  assert(li.userId === reg.userId, "login returns same user");

  let rejectedWrong = false;
  try {
    await login(email, "wrong-password");
  } catch (e) {
    rejectedWrong = e instanceof AuthError;
  }
  assert(rejectedWrong, "wrong password rejected");

  // ── 5. refresh issues a new, valid access token ──
  const { accessToken: fresh } = refresh(reg.refreshToken);
  assert(verifyToken(fresh, "access").sub === reg.userId, "refreshed token valid");

  // an access token must NOT verify as a refresh token
  let wrongType = false;
  try {
    verifyToken(reg.accessToken, "refresh");
  } catch (e) {
    wrongType = e instanceof InvalidTokenError;
  }
  assert(wrongType, "access token rejected as refresh");

  // ── 6. RBAC matrix ──
  assert(roleHasPermission("Owner", "salary:read"), "Owner sees salary");
  assert(roleHasPermission("Cashier", "sales:write"), "Cashier can write sales");
  assert(!roleHasPermission("Cashier", "salary:read"), "Cashier CANNOT see salary");
  assert(!roleHasPermission("Cashier", "pnl:read"), "Cashier CANNOT see P&L");
  assert(!roleHasPermission("Viewer", "sales:write"), "Viewer is read-only");

  // ── 7. RLS-scoped branch CRUD ──
  const branch = await createBranch(reg.companyId, { name: "Main Branch", phone: "017" });
  assert(branch.id, "branch created");
  const list = await listBranches(reg.companyId);
  assert(list.length === 1 && list[0]!.name === "Main Branch", "branch listed under tenant");

  console.log("✅ CORE TEST PASSED — register/login/refresh + JWT + RBAC matrix + branch CRUD all verified");
}

main()
  .then(async () => {
    await pool.end();
    await workerPool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌", err);
    await pool.end().catch(() => {});
    await workerPool.end().catch(() => {});
    process.exit(1);
  });
