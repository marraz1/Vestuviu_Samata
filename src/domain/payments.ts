import { sum } from './money';
import type { Cents, Expense, Payment } from './types';

const DAY = 86_400_000;

function toDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / DAY;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(toDay(toIso) - toDay(fromIso));
}

export function paidCents(payments: Payment[]): Cents {
  return sum(payments.filter((p) => p.isPaid).map((p) => p.amountCents));
}

/** Remaining to pay for one expense = contracted − paid (never negative). */
export function remainingForExpense(e: Expense, payments: Payment[]): Cents {
  if (e.status === 'cancelled' || e.contractedCents == null) return 0;
  const paid = paidCents(payments.filter((p) => p.expenseId === e.id));
  return Math.max(0, e.contractedCents - paid);
}

export function remainingTotal(expenses: Expense[], payments: Payment[]): Cents {
  return sum(expenses.map((e) => remainingForExpense(e, payments)));
}

export type DueState = 'paid' | 'overdue' | 'soon' | 'later' | 'undated';

/** "soon" = due within `soonDays` days (inclusive), "overdue" = due date passed. */
export function dueState(p: Payment, todayIso: string, soonDays = 7): DueState {
  if (p.isPaid) return 'paid';
  if (!p.dueDate) return 'undated';
  const d = daysBetween(todayIso, p.dueDate);
  if (d < 0) return 'overdue';
  if (d <= soonDays) return 'soon';
  return 'later';
}

/** Unpaid payments that are overdue or due soon, earliest first. */
export function upcomingPayments(payments: Payment[], todayIso: string, soonDays = 7): Payment[] {
  return payments
    .filter((p) => {
      const s = dueState(p, todayIso, soonDays);
      return s === 'overdue' || s === 'soon';
    })
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
}

export interface MonthBucket {
  month: string; // YYYY-MM
  dueCents: Cents;
  paidCents: Cents;
  payments: Payment[];
}

/**
 * Groups payments by month (due date, or paid date if paid without a due date)
 * from the current month until the wedding month, including empty months.
 * Unpaid payments due before the current month are put in the current month.
 */
export function monthlyCalendar(
  payments: Payment[],
  todayIso: string,
  weddingDateIso: string | null,
): MonthBucket[] {
  const start = todayIso.slice(0, 7);
  const dated = payments.map((p) => ({ p, month: (p.dueDate ?? p.paidDate)?.slice(0, 7) ?? null }));
  const lastPaymentMonth = dated.reduce<string>((m, d) => (d.month && d.month > m ? d.month : m), start);
  const end = weddingDateIso && weddingDateIso.slice(0, 7) > lastPaymentMonth
    ? weddingDateIso.slice(0, 7)
    : lastPaymentMonth;

  const buckets = new Map<string, MonthBucket>();
  let [y, m] = start.split('-').map(Number);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    buckets.set(key, { month: key, dueCents: 0, paidCents: 0, payments: [] });
    if (key >= end) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  for (const { p, month } of dated) {
    if (!month) continue;
    const key = month < start ? (p.isPaid ? null : start) : month;
    if (!key) continue;
    const b = buckets.get(key)!;
    b.payments.push(p);
    if (p.isPaid) b.paidCents += p.amountCents;
    else b.dueCents += p.amountCents;
  }
  return [...buckets.values()];
}
