import type { CategoryUsage } from './budget';
import type { WeddingForecast } from './forecast';
import { formatEur } from './money';
import { daysBetween, dueState } from './payments';
import type { Expense, Payment } from './types';

export type Level = 'green' | 'yellow' | 'red';

export interface Warning {
  level: Exclude<Level, 'green'>;
  kind: 'category' | 'total' | 'payment' | 'contracts';
  message: string;
  refId?: string;
}

/** Traffic-light level for a usage percentage: < 80 green, 80–100 yellow, > 100 red. */
export function usageLevel(pct: number | null): Level {
  if (pct == null || pct < 80) return 'green';
  return pct > 100 ? 'red' : 'yellow';
}

export interface WarningInput {
  forecast: WeddingForecast;
  categories: CategoryUsage[];
  expenses: Expense[];
  payments: Payment[];
  expenseTitles: Record<string, string>;
  todayIso: string;
  weddingDateIso: string | null;
  /** Warn about missing contracts when at least this many active expenses lack one. */
  uncontractedThreshold?: number;
}

const CONTRACTED: Expense['status'][] = ['contract', 'partly_paid', 'paid', 'cancelled'];

export function computeWarnings(i: WarningInput): Warning[] {
  const out: Warning[] = [];

  if (i.forecast.differenceCents > 0) {
    out.push({
      level: 'red',
      kind: 'total',
      message: `Prognozė viršija biudžetą ${formatEur(i.forecast.differenceCents)}.`,
    });
  }

  for (const c of i.categories) {
    if (c.usagePct == null || c.usagePct < 80) continue;
    const over = c.usagePct >= 100;
    out.push({
      level: over ? 'red' : 'yellow',
      kind: 'category',
      refId: c.category.id,
      message: over
        ? `„${c.category.name}“ pasiekė ${Math.round(c.usagePct)} % limito.`
        : `„${c.category.name}“ artėja prie limito (${Math.round(c.usagePct)} %).`,
    });
  }

  for (const p of i.payments) {
    const s = dueState(p, i.todayIso, 7);
    const title = i.expenseTitles[p.expenseId] ?? 'Mokėjimas';
    if (s === 'overdue') {
      out.push({ level: 'red', kind: 'payment', refId: p.id, message: `Praleistas mokėjimo terminas: ${title} (${formatEur(p.amountCents)}).` });
    } else if (s === 'soon') {
      const d = daysBetween(i.todayIso, p.dueDate!);
      out.push({
        level: 'yellow',
        kind: 'payment',
        refId: p.id,
        message: `${title}: ${formatEur(p.amountCents)} reikia sumokėti ${d === 0 ? 'šiandien' : `per ${d} d.`}`,
      });
    }
  }

  if (i.weddingDateIso) {
    const daysLeft = daysBetween(i.todayIso, i.weddingDateIso);
    const without = i.expenses.filter((e) => !CONTRACTED.includes(e.status)).length;
    if (daysLeft >= 0 && daysLeft < 90 && without >= (i.uncontractedThreshold ?? 3)) {
      out.push({
        level: 'yellow',
        kind: 'contracts',
        message: `Liko ${daysLeft} d., o ${without} išlaidų dar be pasirašytos sutarties.`,
      });
    }
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
}
