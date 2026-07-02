import { parseClosingText } from "@/modules/messaging/closing-parser";

/**
 * Pure parser test (no DB, no OCR). Proves the forgiving /closing format:
 * known fields set headers; every other `name amount` line is an expense —
 * no section marker required.
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

// Real-world shape: header fields mixed with free-form expense lines, no marker.
const SAMPLE = `/closing
date 01-07-2026
sale 41,396
card 870
bkash 14670
due 0
opening 28330
cash in hand 25080
vegetable 680
staff bazar 460
mudi bazar 3165
gas 1500
staff house 2000 tk`;

const d = parseClosingText(SAMPLE);
assert(d.date === "2026-07-01", `date should be 2026-07-01, got ${d.date}`);
assert(d.saleTotal === 41396, `sale 41396 (comma stripped), got ${d.saleTotal}`);
assert(d.saleCard === 870, `card 870, got ${d.saleCard}`);
assert(d.saleBkash === 14670, `bkash 14670, got ${d.saleBkash}`);
assert(d.saleDue === 0, `due 0, got ${d.saleDue}`);
assert(d.openingCash === 28330, `opening 28330, got ${d.openingCash}`);
assert(d.cashInHand === 25080, `cash in hand 25080, got ${d.cashInHand}`);
// the 5 free-form lines become expenses automatically (no marker)
assert(d.expenses.length === 5, `5 expenses, got ${d.expenses.length}`);
assert(d.expenses[0]!.name === "vegetable" && d.expenses[0]!.amount === 680, "vegetable 680");
assert(d.expenses[1]!.name === "staff bazar", `staff bazar name, got ${d.expenses[1]!.name}`);
assert(d.expenses[4]!.name === "staff house" && d.expenses[4]!.amount === 2000, "staff house 2000 (tk stripped)");

// Expenses-only message (what the user naturally typed) — all lines are expenses.
const only = parseClosingText(`/closing
Beef 1000
cola 3570
Chicken 3000`);
assert(only.expenses.length === 3, `expenses-only should give 3, got ${only.expenses.length}`);
assert(only.saleTotal === 0, "no sale header → 0");

console.log("✅ PARSER TEST PASSED — forgiving /closing parse (headers + auto-expenses)");
