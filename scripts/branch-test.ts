import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { listCompanyBranches, getLinkCode, linkTelegramChat, getBranchByTelegramChat } from "@/modules/messaging/link.service";

/** Multi-branch test: two branches in one company, distinct codes, per-chat isolation. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "Two Branch Co",
    ownerEmail: `2b-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const c = reg.companyId;
  const b1 = await createBranch(c, { name: "60 feet" }, reg.userId);
  const b2 = await createBranch(c, { name: "Pallabi" }, reg.userId);

  const list = await listCompanyBranches(c);
  assert(list.length === 2, `2 branches, got ${list.length}`);
  const code1 = await getLinkCode(b1.id);
  const code2 = await getLinkCode(b2.id);
  assert(code1 && code2 && code1 !== code2, "distinct link codes");

  // link two different chats to the two branches
  const chatA = `chatA-${Date.now()}`;
  const chatB = `chatB-${Date.now()}`;
  const lA = await linkTelegramChat(code1!, chatA);
  const lB = await linkTelegramChat(code2!, chatB);
  assert(lA?.id === b1.id, "chatA → 60 feet");
  assert(lB?.id === b2.id, "chatB → Pallabi");

  // each chat resolves to its own branch (isolation)
  assert((await getBranchByTelegramChat(chatA))?.name === "60 feet", "chatA sees 60 feet");
  assert((await getBranchByTelegramChat(chatB))?.name === "Pallabi", "chatB sees Pallabi");

  console.log("✅ BRANCH TEST PASSED — two branches, distinct codes, per-chat isolation");
}

main()
  .then(async () => { await pool.end(); await workerPool.end(); process.exit(0); })
  .catch(async (err) => { console.error("❌", err); await pool.end().catch(()=>{}); await workerPool.end().catch(()=>{}); process.exit(1); });
