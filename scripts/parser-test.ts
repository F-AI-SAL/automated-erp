import { parseClosingText } from "@/modules/messaging/closing-parser";

/**
 * Pure parser test (no DB, no OCR) — proves the structured /closing format is
 * read exactly (this is the "100% accurate" path).
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const SAMPLE = `/closing
date 28-06-2026
opening 28,330
sale 41396
card 870
bkash 14670
due 0
cash 25080
expenses
staff bazar 500
OH 2000
kalyanpur mudi 28330 tk`;

const d = parseClosingText(SAMPLE);
assert(d.date === "2026-06-28", `date should be 2026-06-28, got ${d.date}`);
assert(d.openingCash === 28330, `opening 28330, got ${d.openingCash}`); // comma stripped
assert(d.saleTotal === 41396, `sale 41396, got ${d.saleTotal}`);
assert(d.saleCard === 870, `card 870, got ${d.saleCard}`);
assert(d.saleBkash === 14670, `bkash 14670, got ${d.saleBkash}`);
assert(d.saleDue === 0, `due 0, got ${d.saleDue}`);
assert(d.cashInHand === 25080, `cash 25080, got ${d.cashInHand}`);
assert(d.expenses.length === 3, `3 expenses, got ${d.expenses.length}`);
assert(d.expenses[2]!.name === "kalyanpur mudi", `name parse, got ${d.expenses[2]!.name}`);
assert(d.expenses[2]!.amount === 28330, `amount parse (tk stripped), got ${d.expenses[2]!.amount}`);
const total = d.expenses.reduce((s, e) => s + e.amount, 0);
assert(total === 30830, `expenses total 30830, got ${total}`);

console.log("✅ PARSER TEST PASSED — structured /closing text parsed exactly");
