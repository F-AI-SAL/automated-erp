import type { PoolClient } from "pg";
import type { Permission, RoleName } from "./core.types";
import { ROLE_NAMES } from "./core.types";

/**
 * The RBAC matrix (Phase 5). Owner = "*" (all). Everyone else is least-privilege.
 * Kept in code (not DB) so permission checks are fast and versioned with the app;
 * the `roles` table still holds one row per role per company for the FK from users.
 */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[] | "*"> = {
  Owner: "*",
  Manager: [
    "sales:read", "sales:write",
    "inventory:read", "inventory:write",
    "purchase:read", "purchase:write",
    "expenses:read", "expenses:write",
    "salary:read",
    "reports:read", "pnl:read",
    "branches:manage",
  ],
  Accountant: [
    "sales:read",
    "expenses:read", "expenses:write",
    "salary:read", "salary:write",
    "reports:read", "pnl:read",
  ],
  Cashier: ["sales:read", "sales:write"],
  Kitchen: ["inventory:read", "inventory:write", "sales:read"],
  Inventory: ["inventory:read", "inventory:write", "purchase:read", "purchase:write"],
  Staff: ["sales:read"],
  Viewer: ["sales:read", "inventory:read", "reports:read", "pnl:read"],
};

/**
 * Seeds the 8 roles for a company (called once at registration).
 * Returns a name→id map so the caller can assign the Owner role to the first user.
 */
export async function seedRoles(
  tx: PoolClient,
  companyId: string,
): Promise<Record<RoleName, string>> {
  const map = {} as Record<RoleName, string>;
  for (const name of ROLE_NAMES) {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO roles (company_id, name) VALUES ($1, $2)
       ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [companyId, name],
    );
    map[name] = res.rows[0]!.id;
  }
  return map;
}
