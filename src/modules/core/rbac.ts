import type { AuthContext, Permission, RoleName } from "./core.types";
import { ROLE_PERMISSIONS } from "./roles";

/** Does this role hold this permission? Owner ("*") holds everything. */
export function roleHasPermission(role: RoleName, perm: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (perms === "*") return true;
  return perms.includes(perm);
}

export function hasPermission(ctx: AuthContext, perm: Permission): boolean {
  return roleHasPermission(ctx.role, perm);
}

/** Thrown when an authenticated user lacks a required permission. */
export class ForbiddenError extends Error {
  constructor(perm: Permission) {
    super(`Forbidden: missing permission "${perm}"`);
    this.name = "ForbiddenError";
  }
}

/** Guard for use in route handlers / services. */
export function requirePermission(ctx: AuthContext, perm: Permission): void {
  if (!hasPermission(ctx, perm)) throw new ForbiddenError(perm);
}
