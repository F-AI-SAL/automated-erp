import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * Applies every db/migrations/*.sql file in filename order.
 * Used locally (`npm run db:migrate`) and by CI against a real Postgres service.
 */
async function main() {
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const url = process.env.DATABASE_URL ?? "";
  const ssl = /@(localhost|127\.0\.0\.1)/.test(url) ? undefined : { rejectUnauthorized: false };
  const client = new Client({ connectionString: url, ssl });
  await client.connect();
  try {
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      process.stdout.write(`→ applying ${f} ... `);
      await client.query(sql);
      console.log("ok");
    }
    console.log(`✅ ${files.length} migration(s) applied`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ migration failed:", err);
  process.exit(1);
});
