"use client";

import type { TrendDay } from "./types";
import { taka, dayLabel } from "./format";

/**
 * Responsive dual-line chart: Sale (teal, filled area) + Profit (green line) per day.
 * Pure SVG, no dependencies. Scales to a 720×280 viewBox and stretches to width.
 */
export function TrendChart({ days }: { days: TrendDay[] }) {
  if (days.length === 0) return <p className="empty">এখনো কোনো দিনের হিসাব নেই</p>;

  const W = 720, H = 280;
  const padL = 56, padR = 16, padT = 16, padB = 34;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const sales = days.map((d) => d.sale);
  const profits = days.map((d) => d.profit);
  const maxY = Math.max(1, ...sales, ...profits);
  const minY = Math.min(0, ...profits);
  const spanY = maxY - minY || 1;

  const x = (i: number) => padL + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => padT + ih - ((v - minY) / spanY) * ih;

  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line(sales)} L${x(days.length - 1).toFixed(1)},${y(minY).toFixed(1)} L${x(0).toFixed(1)},${y(minY).toFixed(1)} Z`;

  // 4 horizontal gridlines
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minY + t * spanY);
  // show at most ~7 x-labels
  const step = Math.max(1, Math.ceil(days.length / 7));

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sale and profit trend">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eef1f6" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#98a2b3">
              {Math.round(t / 1000)}k
            </text>
          </g>
        ))}
        {y(0) > padT && y(0) < padT + ih && (
          <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="#d7dbe3" strokeWidth={1} />
        )}

        <path d={area} fill="rgba(13,148,136,0.10)" />
        <path d={line(sales)} fill="none" stroke="#0d9488" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <path d={line(profits)} fill="none" stroke="#16a34a" strokeWidth={2.5} strokeDasharray="1 0" strokeLinejoin="round" strokeLinecap="round" />

        {days.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.sale)} r={days.length > 20 ? 2 : 3} fill="#0d9488" />
            <circle cx={x(i)} cy={y(d.profit)} r={days.length > 20 ? 2 : 3} fill="#16a34a" />
            {i % step === 0 && (
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="#98a2b3">
                {dayLabel(d.date).split(" ")[0]}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: "#0d9488" }} />Sale · সর্বোচ্চ {taka(Math.max(...sales))}</span>
        <span><i style={{ background: "#16a34a" }} />Profit</span>
      </div>
    </div>
  );
}
