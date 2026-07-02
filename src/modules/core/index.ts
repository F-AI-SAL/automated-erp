/**
 * Core / Tenancy module — companies, branches, users, roles, auth, RBAC.
 * The module that (almost) never gets extracted into its own service.
 *
 * Phase 0 scope (DONE):
 *   - auth: register (company + owner + seed roles), login, refresh — JWT (HS256)
 *   - password hashing (scrypt), all via Node built-ins (no external deps)
 *   - RBAC: 8 roles, permission matrix, requirePermission guard
 *   - company + branch CRUD (RLS-scoped)
 */
export { register, login, refresh, verifyToken, AuthError } from "./auth.service";
export { createBranch, listBranches } from "./company.service";
export { seedRoles, ROLE_PERMISSIONS } from "./roles";
export { hasPermission, requirePermission, roleHasPermission, ForbiddenError } from "./rbac";
export type { RoleName, Permission, AuthContext, AuthClaims } from "./core.types";
