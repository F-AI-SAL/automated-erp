"use client";

import type { DashboardData, NamedTotal } from "./types";
import { taka, taka2, monthName, dayLabel } from "./format";
import { TrendChart } from "./TrendChart";

function Bar({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="row">
      <span className="name">{name}</span>
      <span className="bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="amt">{taka(value)}</span>
    </div>
  );
}

export function Dashboard({
  data,
  onBranchChange,
  onLogout,
}: {
  data: DashboardData;
  onBranchChange: (id: string) => void;
  onLogout: () => void;
}) {
  const { pl, expenses, withdrawals, fixedCosts, trend } = data;
  const m = pl.month;
  const latest = pl.latest;

  const beshi = latest ? latest.cashShortage < 0 : false; // negative shortage = surplus (beshi)
  const short = latest ? latest.cashShortage > 0 : false;

  const expMax = Math.max(1, ...expenses.items.map((i) => i.total));
  const wdMax = Math.max(1, ...withdrawals.items.map((i) => i.total));
  const profitClass = m.profit >= 0 ? "green" : "red";

  return (
    <>
      <header className="topbar">
        <span className="brand">🍽️ Food Engineering</span>
        <span className="spacer" />
        {data.branches.length > 1 && (
          <select value={data.branchId ?? ""} onChange={(e) => onBranchChange(e.target.value)}>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <button className="logout" onClick={onLogout}>লগআউট</button>
      </header>

      <div className="wrap">
        <div className="month-label">
          📍 {data.branchName || "Branch"} · 🗓️ {monthName(pl.monthLabel || trend.monthLabel) || "এই মাস"}
        </div>

        {!pl.hasData ? (
          <div className="card"><p className="empty">এই ব্রাঞ্চে এখনো কোনো হিসাব নেই।<br />Telegram-এ /closing পাঠালে এখানে দেখা যাবে।</p></div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="kpis">
              <div className="kpi">
                <div className="label">মাসের সেল</div>
                <div className="value">{taka(m.sale)}</div>
                <div className="sub">{m.days} দিন</div>
              </div>
              <div className="kpi accent">
                <div className="label">লাভ / ক্ষতি</div>
                <div className={`value ${profitClass}`}>{taka(m.profit)}</div>
                <div className="sub">সেল − মোট খরচ</div>
              </div>
              <div className="kpi">
                <div className="label">মোট খরচ</div>
                <div className="value">{taka(m.totalCost)}</div>
                <div className="sub">commission + খরচ + establishment</div>
              </div>
              <div className="kpi">
                <div className="label">উইথড্র</div>
                <div className="value">{taka(withdrawals.total)}</div>
                <div className="sub">মালিক নিয়েছেন</div>
              </div>
            </div>

            {/* Latest day */}
            {latest && (
              <div className="card">
                <h2>📅 শেষ দিন — {dayLabel(latest.date)}
                  <span style={{ flex: 1 }} />
                  {beshi && <span className="badge green">বেশি {taka(-latest.cashShortage)}</span>}
                  {short && <span className="badge red">শর্ট {taka(latest.cashShortage)}</span>}
                  {!beshi && !short && <span className="badge green">মিলেছে ✓</span>}
                </h2>
                <div className="latest-grid">
                  <div className="stat"><div className="k">সেল</div><div className="v">{taka(latest.sale)}</div></div>
                  <div className="stat"><div className="k">Panda commission</div><div className="v">{taka2(latest.pandaCommission)}</div></div>
                  <div className="stat"><div className="k">খরচ</div><div className="v">{taka(latest.expenses)}</div></div>
                  <div className="stat"><div className="k">Establishment</div><div className="v">{taka2(latest.establishment)}</div></div>
                  <div className="stat"><div className="k">মোট খরচ</div><div className="v">{taka2(latest.totalCost)}</div></div>
                  <div className="stat"><div className="k">লাভ</div><div className="v" style={{ color: latest.profit >= 0 ? "var(--green)" : "var(--red)" }}>{taka2(latest.profit)}</div></div>
                </div>
              </div>
            )}

            {/* Trend */}
            <div className="card">
              <h2>📈 দৈনিক সেল ও লাভ</h2>
              <TrendChart days={trend.days} />
            </div>

            {/* Expense breakdown */}
            <div className="card">
              <h2>🧾 খরচের ভাগ ({expenses.items.length})</h2>
              {expenses.items.length === 0 ? (
                <p className="empty">কোনো খরচ নেই</p>
              ) : (
                <>
                  {expenses.items.map((i: NamedTotal) => (
                    <Bar key={i.name} name={i.name} value={i.total} max={expMax} />
                  ))}
                  <div className="row total"><span className="name">মোট</span><span className="amt">{taka(expenses.total)}</span></div>
                </>
              )}
            </div>

            {/* Withdrawals */}
            {withdrawals.items.length > 0 && (
              <div className="card">
                <h2>💸 উইথড্র (কে কত নিয়েছেন)</h2>
                {withdrawals.items.map((i) => (
                  <Bar key={i.person} name={i.person} value={i.total} max={wdMax} />
                ))}
                <div className="row total"><span className="name">মোট</span><span className="amt">{taka(withdrawals.total)}</span></div>
              </div>
            )}

            {/* Fixed costs */}
            {fixedCosts.items.length > 0 && (
              <div className="card">
                <h2>🏢 Fixed cost (মাসিক) — {taka(fixedCosts.monthlyTotal)}/মাস · {taka2(pl.establishmentPerDay)}/দিন</h2>
                {fixedCosts.items.map((i) => (
                  <div className="row" key={i.id}>
                    <span className="name">{i.name}</span>
                    <span style={{ flex: 1 }} />
                    <span className="amt">{taka(Number(i.monthly_amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
