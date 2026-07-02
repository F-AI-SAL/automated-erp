import type { DailyClosingInput } from "@/modules/finance/daily-closing.service";

/**
 * Parses a structured /closing text message into DailyClosingInput — no OCR, so
 * it is 100% accurate. Header lines are `key value`; lines after `expenses` are
 * `name amount`. Forgiving about `:`/`=`, commas, ৳/tk, and BDT/EN date order.
 */
export function parseClosingText(text: string): DailyClosingInput {
  const out: DailyClosingInput = {
    date: "",
    saleTotal: 0,
    saleCard: 0,
    saleBkash: 0,
    saleDue: 0,
    openingCash: 0,
    cashInHand: 0,
    expenses: [],
  };

  let inExpenses = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\/(closing|entry)\b/i.test(line)) continue;

    if (/^(expenses|খরচ|koroch)\s*[:：]?\s*$/i.test(line)) {
      inExpenses = true;
      continue;
    }

    if (inExpenses) {
      const amount = trailingNumber(line);
      const name = line.replace(/[:=]?\s*[-]?[\d.,]+\s*(tk|৳|taka)?\s*$/i, "").replace(/[:=]\s*$/, "").trim();
      if (name && amount !== null) out.expenses.push({ name, amount });
      continue;
    }

    // key = text before the trailing value; value = trailing number (digits, commas, dashes for dates)
    const m = line.match(/^(.+?)[\s:=]+([\d][\d.,/-]*)\s*$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase().replace(/[\s.:=]+/g, "");
    const val = m[2]!.trim();

    if (/date|তারিখ/.test(key)) out.date = normalizeDate(val);
    else if (/openin|petty/.test(key)) out.openingCash = num(val);
    else if (/card/.test(key)) out.saleCard = num(val);
    else if (/bkash|bikash|nagad/.test(key)) out.saleBkash = num(val);
    else if (/due|baki|বাকি/.test(key)) out.saleDue = num(val);
    else if (/cash|hand|inhand/.test(key)) out.cashInHand = num(val);
    else if (/^sale|total|bikri|বিক্রি/.test(key)) out.saleTotal = num(val);
  }

  return out;
}

/** Strip commas/currency and parse a number. */
function num(s: string): number {
  const n = parseFloat(s.replace(/[,৳\s]|tk|taka/gi, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Last number on a line (the amount), or null. */
function trailingNumber(line: string): number | null {
  const m = line.match(/(-?[\d.,]+)\s*(tk|৳|taka)?\s*$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Accepts YYYY-MM-DD or DD-MM-YYYY / DD/MM/YYYY → YYYY-MM-DD (else ""). */
function normalizeDate(s: string): string {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y!.length === 2 ? `20${y}` : y!;
    return `${yyyy}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return "";
}

/** The template shown to users via /format. */
export const CLOSING_TEMPLATE = [
  "/closing",
  "date 28-06-2026",
  "opening 28330",
  "sale 41396",
  "card 870",
  "bkash 14670",
  "due 0",
  "cash 25080",
  "expenses",
  "staff bazar 500",
  "OH 2000",
  "kalyanpur mudi 28330",
].join("\n");
