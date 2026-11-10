import { pctOf, sum } from './money';
import type { Cents, Expense, ForecastContext, Wedding } from './types';

/** Base amount before VAT and service fees, using the most reliable value available. */
function baseAmount(e: Expense, ctx: ForecastContext): Cents {
  if (e.contractedCents != null) return e.contractedCents;

  const unit = e.unitPriceCents;
  const fixed = e.fixedPartCents ?? 0;
  if (unit != null) {
    switch (e.calcType) {
      case 'per_guest':
        return fixed + unit * ctx.guestCount;
      case 'per_table':
        return fixed + unit * ctx.tableCount;
      case 'hourly':
      case 'per_unit':
        return fixed + unit * (e.quantity ?? 0);
      case 'fixed':
        break;
    }
  }
  return e.plannedCents ?? fixed;
}

/**
 * Forecast final cost of one expense: the contracted sum if agreed, otherwise the
 * computed or planned sum, plus VAT and service fees. Cancelled expenses cost 0.
 * A contracted sum is taken as final and does not get fees added again.
 */
export function expenseForecast(e: Expense, ctx: ForecastContext): Cents {
  if (e.status === 'cancelled') return 0;
  const base = baseAmount(e, ctx);
  if (e.contractedCents != null) return base;
  return base + pctOf(base, e.vatPct ?? 0) + (e.serviceFeeCents ?? 0);
}

export function reserveCents(w: Pick<Wedding, 'totalBudgetCents' | 'reservePct'>): Cents {
  return pctOf(w.totalBudgetCents, w.reservePct);
}

export interface WeddingForecast {
  expensesCents: Cents;
  reserveCents: Cents;
  totalCents: Cents;
  budgetCents: Cents;
  /** Positive = over budget, negative = money left. */
  differenceCents: Cents;
  usagePct: number;
}

export function weddingForecast(
  w: Pick<Wedding, 'totalBudgetCents' | 'reservePct'>,
  expenses: Expense[],
  ctx: ForecastContext,
): WeddingForecast {
  const expensesCents = sum(expenses.map((e) => expenseForecast(e, ctx)));
  const reserve = reserveCents(w);
  const totalCents = expensesCents + reserve;
  return {
    expensesCents,
    reserveCents: reserve,
    totalCents,
    budgetCents: w.totalBudgetCents,
    differenceCents: totalCents - w.totalBudgetCents,
    usagePct: w.totalBudgetCents > 0 ? (totalCents / w.totalBudgetCents) * 100 : 0,
  };
}

/** Sum of contracted amounts (what is actually agreed so far). */
export function contractedTotal(expenses: Expense[]): Cents {
  return sum(
    expenses.filter((e) => e.status !== 'cancelled').map((e) => e.contractedCents ?? 0),
  );
}

/** Sum of planned amounts (what was planned before contracts). */
export function plannedTotal(expenses: Expense[], ctx: ForecastContext): Cents {
  return sum(
    expenses
      .filter((e) => e.status !== 'cancelled')
      .map((e) => expenseForecast({ ...e, contractedCents: null }, ctx)),
  );
}
