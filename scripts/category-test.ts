import { normalizeCategory } from "@/modules/finance/categories";

/** Pure test — spelling variations merge into canonical categories. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const cases: Array<[string, string]> = [
  ["water", "Water"],
  ["water jun", "Water"],
  ["WATER (JUN)", "Water"],
  ["c.glory", "Coffee"],
  ["coffe glory", "Coffee"],
  ["C.GLORY", "Coffee"],
  ["s.house", "Staff House"],
  ["staff house", "Staff House"],
  ["staff bazar", "Staff Bazar"],
  ["s.boz", "Staff Bazar"],
  ["chicken", "Chicken"],
  ["murgi", "Chicken"],
  ["vegitable", "Vegetable"],
  ["chinese mudi", "Chinese Mudi"],
  ["mudi bazar", "Mudi Bazar"],
  ["some random thing", "Some Random Thing"], // unknown → title case, kept
];

for (const [raw, expected] of cases) {
  const got = normalizeCategory(raw);
  assert(got === expected, `"${raw}" → expected "${expected}", got "${got}"`);
}
console.log("✅ CATEGORY TEST PASSED — spelling variations merge to canonical categories");
