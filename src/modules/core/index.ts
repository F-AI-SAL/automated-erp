/**
 * Core / Tenancy module — companies, branches, users, roles, permissions, auth.
 * This is the module that (almost) never gets extracted into its own service.
 *
 * Phase 0 scope:
 *   - company + branch CRUD
 *   - auth (register/login, JWT + refresh)
 *   - RBAC middleware + 8 seeded roles
 *   - audit-log writer
 *
 * Add: core.service.ts, auth.service.ts, rbac.ts, core.types.ts
 */
export {};
