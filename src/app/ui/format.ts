/** ৳ with Indian/BD grouping (1,00,000). Rounds to whole taka for compact display. */
export function taka(n: number): string {
  const sign = n < 0 ? "−" : "";
  const v = Math.round(Math.abs(n));
  return `${sign}৳${v.toLocaleString("en-IN")}`;
}

/** Same but keeps 2 decimals (for precise figures like commission). */
export function taka2(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}৳${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-07" → "July 2026"; "2026-07-03" → "3 Jul 2026". */
export function monthName(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(m)] ?? ""} ${y}`;
}

export function dayLabel(ymd: string): string {
  if (!ymd) return "";
  const [, m, d] = ymd.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m)] ?? ""}`;
}
