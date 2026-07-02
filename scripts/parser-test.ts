import { parseClosingText } from "@/modules/messaging/closing-parser";

/**
 * Pure parser test (no DB, no OCR). Known fields set headers (incl. panda);
 * every other `name amount` line is an expense — no section marker required.
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const SAMPLE = `/closing
date 01-07-2026
sale 53,923
card 11826
bkash 6448
panda 4159
due 672
opening 20730
add cash 0
cash in hand 22640
vegetable 680
staff bazar 460
mudi bazar 3165
gas 1500
staff house 2000 tk`;

const d = parseClosingText(SAMPLE);
assert(d.date === "2026-07-01", `date should be 2026-07-01, got ${d.date}`);
assert(d.saleTotal === 53923, `sale 53923 (comma stripped), got ${d.saleTotal}`);
assert(d.saleCard === 11826, `card 11826, got ${d.saleCard}`);
assert(d.saleBkash === 6448, `bkash 6448, got ${d.saleBkash}`);
assert(d.salePanda === 4159, `panda 4159, got ${d.salePanda}`);
assert(d.saleDue === 672, `due 672, got ${d.saleDue}`);
assert(d.openingCash === 20730, `opening 20730, got ${d.openingCash}`);
assert(d.addedCash === 0, `add cash 0, got ${d.addedCash}`);
assert(d.cashInHand === 22640, `cash in hand 22640, got ${d.cashInHand}`);
assert(d.expenses.length === 5, `5 expenses, got ${d.expenses.length}`);
assert(d.expenses[4]!.name === "staff house" && d.expenses[4]!.amount === 2000, "staff house 2000 (tk stripped)");

const only = parseClosingText(`/closing
Beef 1000
cola 3570
Chicken 3000`);
assert(only.expenses.length === 3, `expenses-only should give 3, got ${only.expenses.length}`);

console.log("✅ PARSER TEST PASSED — forgiving parse incl. panda payment channel");
