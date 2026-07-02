/** The 8 roles from the RBAC design (Phase 5). */
export type RoleName =
  | "Owner"
  | "Manager"
  | "Accountant"
  | "Cashier"
  | "Kitchen"
  | "Inventory"
  | "Staff"
  | "Viewer";

export const ROLE_NAMES: RoleName[] = [
  "Owner",
  "Manager",
  "Accountant",
  "Cashier",
  "Kitchen",
  "Inventory",
  "Staff",
  "Viewer",
];

/** Fine-grained permission keys. "*" (Owner) means all permissions. */
export type Permission =
  | "sales:read"
  | "sales:write"
  | "inventory:read"
  | "inventory:write"
  | "purchase:read"
  | "purchase:write"
  | "expenses:read"
  | "expenses:write"
  | "salary:read"
  | "salary:write"
  | "reports:read"
  | "pnl:read"
  | "branches:manage"
  | "settings:manage";

/** The claims we put in the JWT. */
export interface AuthClaims {
  sub: string; // user id
  companyId: string;
  branchId?: string;
  role: RoleName;
}

export interface AuthContext extends AuthClaims {}
