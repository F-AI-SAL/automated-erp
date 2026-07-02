/**
 * Normalises a free-form expense name into a canonical category, so spelling
 * variations merge (e.g. "water"/"water jun" → Water, "c.glory"/"coffe glory" →
 * Coffee, "s.house"/"staff house" → Staff House). Order matters — more specific
 * rules come first. Unknown names are Title-Cased and kept as-is (nothing lost).
 */
const RULES: Array<[string, RegExp]> = [
  ["Chinese Mudi", /chinese/],
  ["Staff House", /s[.\s]?house|staff\s*house/],
  ["Staff Bazar", /staff\s*ba|s[.\s]?boz|s[.\s]?baz/],
  ["Coffee", /coffe|glory/],
  ["Water", /water/],
  ["Chicken", /chicken|murgi/],
  ["Beef", /beef/],
  ["Vegetable", /veg/],
  ["Mudi Bazar", /mudi/],
  ["Gas", /\bgas\b/],
  ["Cable", /cable/],
  ["Cheese", /cheese/],
  ["Tissues", /tissue/],
  ["Milk+Yogurt", /milk|yogurt|yougart|yougurt/],
  ["Fish", /fish/],
  ["Shakil", /shakil|prawn/],
  ["Sufiyan", /sufiyan/],
  ["Hasan", /hasan|hason/],
  ["Tomato", /tomato/],
  ["Liquid", /liqu/],
  ["Nasta", /nasta|nasto/],
  ["Electric", /electric|mohsin|mohas/],
];

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function normalizeCategory(raw: string): string {
  const key = raw.toLowerCase().trim();
  for (const [canonical, re] of RULES) {
    if (re.test(key)) return canonical;
  }
  return titleCase(raw);
}
