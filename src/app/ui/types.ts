/** Shapes returned by GET /api/dashboard (mirror of the finance services). */

export interface TrendDay {
  date: string;
  sale: number;
  profit: number;
  shortage: number;
  status: string;
}

export interface PLReport {
  hasData: boolean;
  monthLabel: string;
  pandaRate: number;
  fixedMonthly: number;
  establishmentPerDay: number;
  latest: {
    date: string;
    sale: number;
    pandaSale: number;
    pandaCommission: number;
    expenses: number;
    establishment: number;
    totalCost: number;
    profit: number;
    cashShortage: number;
    cashStatus: string;
  } | null;
  month: {
    sale: number;
    pandaCommission: number;
    expenses: number;
    establishment: number;
    totalCost: number;
    profit: number;
    days: number;
    shortDays: number;
    surplusDays: number;
  };
}

export interface NamedTotal {
  name: string;
  total: number;
}

export interface DashboardData {
  branches: { id: string; name: string }[];
  branchId: string | null;
  branchName: string;
  pl: PLReport;
  expenses: { monthLabel: string; items: NamedTotal[]; total: number };
  withdrawals: { monthLabel: string; items: { person: string; total: number }[]; total: number };
  fixedCosts: { items: { id: string; name: string; monthly_amount: string }[]; monthlyTotal: number };
  trend: { monthLabel: string; days: TrendDay[] };
}
