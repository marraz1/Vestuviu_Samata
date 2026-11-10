// Domain types mirror the database (db/migrations). All money is integer cents.

export type Cents = number;

export type Role = 'owner' | 'partner' | 'editor' | 'viewer';

export type ExpenseStatus =
  | 'idea'
  | 'offer'
  | 'contract'
  | 'partly_paid'
  | 'paid'
  | 'cancelled';

export type CalcType = 'fixed' | 'per_guest' | 'hourly' | 'per_unit' | 'per_table';

export type LimitType = 'amount' | 'percent';

export interface Wedding {
  id: string;
  name: string;
  date: string | null; // ISO date (YYYY-MM-DD)
  venue: string | null;
  guestCount: number;
  totalBudgetCents: Cents;
  reservePct: number; // 0–100
  currency: 'EUR';
}

export interface Category {
  id: string;
  name: string;
  limitType: LimitType | null;
  limitValue: number | null; // cents when amount, percent (0–100) when percent
  color: string;
  sortOrder: number;
}

export interface Expense {
  id: string;
  categoryId: string;
  supplierId: string | null;
  title: string;
  status: ExpenseStatus;
  calcType: CalcType;
  /** Price per guest / hour / unit / table, depending on calcType. */
  unitPriceCents: Cents | null;
  /** Hours or units; ignored for per_guest and per_table (derived). */
  quantity: number | null;
  /** Fixed part added on top of a variable price ("fiksuota + vienam svečiui"). */
  fixedPartCents: Cents | null;
  /** Manual planned amount, used for fixed expenses or when no unit price. */
  plannedCents: Cents | null;
  /** Agreed amount from the contract; when set it wins over everything else. */
  contractedCents: Cents | null;
  vatPct: number | null;
  serviceFeeCents: Cents | null;
}

export interface Payment {
  id: string;
  expenseId: string;
  kind: 'deposit' | 'interim' | 'final';
  amountCents: Cents;
  dueDate: string | null;
  paidDate: string | null;
  isPaid: boolean;
  paidBySourceId: string | null;
}

export interface FundingSource {
  id: string;
  name: string;
  pledgedCents: Cents;
}

export interface ExpenseFunding {
  expenseId: string;
  fundingSourceId: string;
  /** Either a share of the expense forecast (0–100) or a fixed amount. */
  sharePct: number | null;
  amountCents: Cents | null;
}

export interface ForecastContext {
  guestCount: number;
  tableCount: number;
}
