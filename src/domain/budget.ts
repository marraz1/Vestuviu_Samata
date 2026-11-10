import { expenseForecast } from './forecast';
import { pctOf, sum } from './money';
import type { Category, Cents, Expense, ForecastContext } from './types';

export function categoryLimitCents(c: Category, totalBudgetCents: Cents): Cents | null {
  if (c.limitType == null || c.limitValue == null) return null;
  return c.limitType === 'percent' ? pctOf(totalBudgetCents, c.limitValue) : c.limitValue;
}

export interface CategoryUsage {
  category: Category;
  limitCents: Cents | null;
  forecastCents: Cents;
  contractedCents: Cents;
  /** null when the category has no limit. */
  usagePct: number | null;
  /** forecast − limit; positive = over the limit. */
  differenceCents: Cents | null;
}

export function categoryUsage(
  categories: Category[],
  expenses: Expense[],
  totalBudgetCents: Cents,
  ctx: ForecastContext,
): CategoryUsage[] {
  return [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => {
      const own = expenses.filter((e) => e.categoryId === category.id && e.status !== 'cancelled');
      const forecastCents = sum(own.map((e) => expenseForecast(e, ctx)));
      const contractedCents = sum(own.map((e) => e.contractedCents ?? 0));
      const limitCents = categoryLimitCents(category, totalBudgetCents);
      return {
        category,
        limitCents,
        forecastCents,
        contractedCents,
        usagePct: limitCents ? (forecastCents / limitCents) * 100 : null,
        differenceCents: limitCents == null ? null : forecastCents - limitCents,
      };
    });
}
