import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { createProduct } from "@/modules/sales/products.service";
import { pool, workerPool } from "@/lib/db/client";

/** Seeds a demo restaurant + branch + menu, prints the Telegram link code. */
async function main() {
  const email = `demo-${Date.now().toString(36)}@fe.test`;
  const reg = await register({
    companyName: "Food Engineering Demo",
    ownerEmail: email,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main Branch" }, reg.userId);

  const menu: Array<[string, number]> = [
    ["Chicken Burger", 250],
    ["Beef Burger", 300],
    ["Cheese Fries", 120],
    ["Cola", 50],
  ];
  for (const [name, price] of menu) {
    await createProduct(reg.companyId, { name, price }, reg.userId);
  }

  const code = await workerPool.query<{ telegram_link_code: string }>(
    `SELECT telegram_link_code FROM branches WHERE id = $1`,
    [branch.id],
  );

  console.log("=== DEMO SEEDED ===");
  console.log("Company     :", reg.companyId);
  console.log("Branch      :", branch.name, `(${branch.id})`);
  console.log("Login       :", email, "/ demo-password");
  console.log("Menu        :", menu.map((m) => m[0]).join(", "));
  console.log("LINK CODE   :", code.rows[0]?.telegram_link_code);
  console.log("===================");

  await pool.end();
  await workerPool.end();
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
