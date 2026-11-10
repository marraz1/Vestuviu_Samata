import { expenseForecast } from './forecast';
import { pctOf } from './money';
import type { Cents, Expense, ExpenseFunding, ForecastContext, FundingSource, Payment } from './types';

export interface SourceBalance {
  source: FundingSource;
  /** What this source has agreed to cover (assigned expense shares). */
  committedCents: Cents;
  /** What this source has actually paid. */
  paidCents: Cents;
  /** committed − paid: still owed by this source. Negative = paid more than its share. */
  owesCents: Cents;
}

/**
 * Balances per funding source (F12/F13). Each expense share is either a % of the
 * expense forecast or a fixed amount.
 */
export function sourceBalances(
  sources: FundingSource[],
  links: ExpenseFunding[],
  expenses: Expense[],
  payments: Payment[],
  ctx: ForecastContext,
): SourceBalance[] {
  const byId = new Map(expenses.map((e) => [e.id, e]));
  return sources.map((source) => {
    const committedCents = links
      .filter((l) => l.fundingSourceId === source.id)
      .reduce((acc, l) => {
        const e = byId.get(l.expenseId);
        if (!e || e.status === 'cancelled') return acc;
        if (l.amountCents != null) return acc + l.amountCents;
        return acc + pctOf(expenseForecast(e, ctx), l.sharePct ?? 0);
      }, 0);
    const paidCents = payments
      .filter((p) => p.isPaid && p.paidBySourceId === source.id)
      .reduce((a, p) => a + p.amountCents, 0);
    return { source, committedCents, paidCents, owesCents: committedCents - paidCents };
  });
}

export interface Transfer {
  fromId: string;
  toId: string;
  amountCents: Cents;
}

/**
 * Settles balances: sources that paid less than their share pay those that paid more.
 * Greedy largest-first matching gives at most n−1 transfers.
 */
export function settle(balances: SourceBalance[]): Transfer[] {
  const debtors = balances.filter((b) => b.owesCents > 0).map((b) => ({ id: b.source.id, v: b.owesCents }));
  const creditors = balances.filter((b) => b.owesCents < 0).map((b) => ({ id: b.source.id, v: -b.owesCents }));
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ fromId: debtors[i].id, toId: creditors[j].id, amountCents: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

/** Money still missing: forecast minus everything pledged by all sources. */
export function fundingShortfall(totalForecastCents: Cents, sources: FundingSource[]): Cents {
  const pledged = sources.reduce((a, s) => a + s.pledgedCents, 0);
  return Math.max(0, totalForecastCents - pledged);
}
