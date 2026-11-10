import { weddingForecast } from './forecast';
import type { Cents, Expense, ForecastContext, Wedding } from './types';

export function costPerGuest(totalCents: Cents, guestCount: number): Cents {
  return guestCount > 0 ? Math.round(totalCents / guestCount) : 0;
}

export interface GuestScenario {
  guestCount: number;
  totalCents: Cents;
  perGuestCents: Cents;
  deltaCents: Cents;
}

/** How the total and the cost per guest change with the guest count (report 5). */
export function guestSensitivity(
  w: Pick<Wedding, 'totalBudgetCents' | 'reservePct'>,
  expenses: Expense[],
  ctx: ForecastContext,
  deltas: number[] = [-20, -10, 0, 10, 20],
): GuestScenario[] {
  const base = weddingForecast(w, expenses, ctx).totalCents;
  return deltas
    .map((d) => ctx.guestCount + d)
    .filter((n) => n > 0)
    .map((guestCount) => {
      const totalCents = weddingForecast(w, expenses, { ...ctx, guestCount }).totalCents;
      return { guestCount, totalCents, perGuestCents: costPerGuest(totalCents, guestCount), deltaCents: totalCents - base };
    });
}

/** Days left until the wedding (negative when it has passed). */
export function daysUntil(todayIso: string, weddingDateIso: string): number {
  return Math.round((Date.parse(`${weddingDateIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
}
