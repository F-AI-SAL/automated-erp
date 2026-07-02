import { withTenant } from "@/lib/db/with-tenant";

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

/** Create a branch under the caller's company (RLS-scoped). */
export async function createBranch(
  companyId: string,
  input: { name: string; address?: string; phone?: string },
): Promise<Branch> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<Branch>(
      `INSERT INTO branches (company_id, name, address, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, address, phone, is_active`,
      [companyId, input.name, input.address ?? null, input.phone ?? null],
    );
    return res.rows[0]!;
  });
}

/** List branches for the caller's company (RLS-scoped). */
export async function listBranches(companyId: string): Promise<Branch[]> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<Branch>(
      `SELECT id, name, address, phone, is_active
         FROM branches
        WHERE company_id = $1
        ORDER BY name`,
      [companyId],
    );
    return res.rows;
  });
}
