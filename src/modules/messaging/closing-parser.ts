import type { DailyClosingInput } from "@/modules/finance/daily-closing.service";

/**
 * Parses a structured /closing text message into DailyClosingInput — no OCR, so
 * it is 100% accurate. Very forgiving: NO section marker needed.
 *   - A line whose label is a known field (sale/card/bkash/due/opening/cash/date)
 *     sets that field.
 *   - ANY other `name amount` line is treated as an expense.
 * Tolerates `:`/`=`/space separators, commas, ৳/tk, and DD-MM-YYYY or YYYY-MM-DD.
 */
export function parseClosingText(text: string): DailyClosingInput {
  const out: DailyClosingInput = {
    date: "",
    saleTotal: 0,
    saleCard: 0,
    saleBkash: 0,
    salePanda: 0,
    saleDue: 0,
    openingCash: 0,
    addedCash: 0,
    cashInHand: 0,
    expenses: [],
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\/(closing|entry)\b/i.test(line)) continue;
    if (/^(expenses|খরচ|koroch)\s*[:：]?\s*$/i.test(line)) continue; // optional header, ignored

    // Date line (value has dashes, not a plain amount).
    const dateM = line.match(/^date\b\s*[:=]?\s*(.+)$/i);
    if (dateM) {
      out.date = normalizeDate(dateM[1]!.trim());
      continue;
    }

    // Everything else must end in a number (the amount / value).
    const numM = line.match(/(-?[\d][\d.,]*)\s*(tk|৳|taka)?\s*$/i);
    if (!numM || numM.index === undefined) continue;
    const amount = parseFloat(numM[1]!.replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;

    const label = line.slice(0, numM.index).replace(/[:=]\s*$/, "").trim();
    const key = label.toLowerCase().replace(/[\s.:=]+/g, "");

    if (/^(sale|total|bikri|বিক্রি)$/.test(key)) out.saleTotal = amount;
    else if (/^card$/.test(key)) out.saleCard = amount;
    else if (/^(bkash|bikash|nagad|mobile)$/.test(key)) out.saleBkash = amount;
    else if (/^(panda|foodpanda|online)$/.test(key)) out.salePanda = amount;
    else if (/^(due|baki|বাকি)$/.test(key)) out.saleDue = amount;
    else if (/^(opening|petty|openingcash|pettycash)$/.test(key)) out.openingCash = amount;
    else if (/^(addcash|addedcash|cashadd|add)$/.test(key)) out.addedCash = amount;
    else if (/^(cash|cashinhand|inhand|hand)$/.test(key)) out.cashInHand = amount;
    else if (label) out.expenses.push({ name: label, amount }); // ← anything else = expense
  }

  return out;
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
  "date 01-07-2026",
  "sale 53923",
  "card 11826",
  "bkash 6448",
  "panda 4159",
  "due 672",
  "opening 20730",
  "add cash 0",
  "cash in hand 25080",
  "vegetable 680",
  "staff bazar 460",
  "mudi bazar 3165",
  "gas 1500",
  "staff house 2000",
].join("\n");
