import { describe, expect, it } from 'vitest';
import { categoryUsage } from './budget';
import { contractedTotal, expenseForecast, weddingForecast } from './forecast';
import { settle, sourceBalances, fundingShortfall } from './funding';
import { costPerGuest, daysUntil, guestSensitivity } from './guests';
import { formatEur, parseEur } from './money';
import { dueState, monthlyCalendar, remainingForExpense, upcomingPayments } from './payments';
import type { Category, Expense, Payment } from './types';
import { computeWarnings, usageLevel } from './warnings';

const ctx = { guestCount: 100, tableCount: 10 };
const wedding = { totalBudgetCents: 2_000_000, reservePct: 10 }; // 20 000 €, 10 % reserve

function exp(p: Partial<Expense>): Expense {
  return {
    id: 'e', categoryId: 'c', supplierId: null, title: 'X', status: 'idea', calcType: 'fixed',
    unitPriceCents: null, quantity: null, fixedPartCents: null, plannedCents: null,
    contractedCents: null, vatPct: null, serviceFeeCents: null, ...p,
  };
}
function pay(p: Partial<Payment>): Payment {
  return { id: 'p', expenseId: 'e', kind: 'deposit', amountCents: 0, dueDate: null, paidDate: null, isPaid: false, paidBySourceId: null, ...p };
}

describe('money', () => {
  it('formats in Lithuanian style', () => {
    expect(formatEur(125000).replace(/[  ]/g, ' ')).toBe('1 250,00 €');
  });
  it('parses user input', () => {
    expect(parseEur('1 250,5')).toBe(125050);
    expect(parseEur('1250.55 €')).toBe(125055);
    expect(parseEur('abc')).toBeNull();
    expect(parseEur('1,234')).toBeNull();
  });
});

describe('forecast', () => {
  it('prefers contracted, then computed, then planned', () => {
    expect(expenseForecast(exp({ plannedCents: 500, contractedCents: 700 }), ctx)).toBe(700);
    expect(expenseForecast(exp({ plannedCents: 500 }), ctx)).toBe(500);
    expect(expenseForecast(exp({ calcType: 'per_guest', unitPriceCents: 5000, plannedCents: 1 }), ctx)).toBe(500_000);
  });
  it('recalculates per-guest cost when guests change', () => {
    const e = exp({ calcType: 'per_guest', unitPriceCents: 5000, fixedPartCents: 100_000 });
    expect(expenseForecast(e, ctx)).toBe(600_000);
    expect(expenseForecast(e, { ...ctx, guestCount: 80 })).toBe(500_000);
  });
  it('handles hourly and per-table', () => {
    expect(expenseForecast(exp({ calcType: 'hourly', unitPriceCents: 8000, quantity: 5 }), ctx)).toBe(40_000);
    expect(expenseForecast(exp({ calcType: 'per_table', unitPriceCents: 2000 }), ctx)).toBe(20_000);
  });
  it('adds VAT and service fee to non-contracted amounts only', () => {
    expect(expenseForecast(exp({ plannedCents: 10_000, vatPct: 21, serviceFeeCents: 500 }), ctx)).toBe(12_600);
    expect(expenseForecast(exp({ plannedCents: 10_000, contractedCents: 11_000, vatPct: 21 }), ctx)).toBe(11_000);
  });
  it('excludes cancelled and adds reserve', () => {
    const f = weddingForecast(wedding, [exp({ plannedCents: 1_000_000 }), exp({ plannedCents: 999_999, status: 'cancelled' })], ctx);
    expect(f.expensesCents).toBe(1_000_000);
    expect(f.reserveCents).toBe(200_000);
    expect(f.totalCents).toBe(1_200_000);
    expect(f.differenceCents).toBe(-800_000);
    expect(f.usagePct).toBeCloseTo(60);
  });
  it('sums contracted', () => {
    expect(contractedTotal([exp({ contractedCents: 5 }), exp({ contractedCents: 7, status: 'cancelled' })])).toBe(5);
  });
});

describe('budget', () => {
  const cats: Category[] = [
    { id: 'a', name: 'Vieta', limitType: 'percent', limitValue: 25, color: '', sortOrder: 1 },
    { id: 'b', name: 'Foto', limitType: 'amount', limitValue: 200_000, color: '', sortOrder: 0 },
    { id: 'c', name: 'Kita', limitType: null, limitValue: null, color: '', sortOrder: 2 },
  ];
  it('computes % and amount limits and usage', () => {
    const u = categoryUsage(cats, [exp({ categoryId: 'a', plannedCents: 400_000 }), exp({ categoryId: 'b', plannedCents: 250_000 })], wedding.totalBudgetCents, ctx);
    expect(u.map((x) => x.category.id)).toEqual(['b', 'a', 'c']);
    expect(u[1].limitCents).toBe(500_000);
    expect(u[1].usagePct).toBeCloseTo(80);
    expect(u[0].differenceCents).toBe(50_000);
    expect(u[2].usagePct).toBeNull();
  });
});

describe('payments', () => {
  const today = '2026-11-10';
  it('remaining = contracted − paid', () => {
    const e = exp({ id: 'e1', contractedCents: 100_000 });
    expect(remainingForExpense(e, [pay({ expenseId: 'e1', amountCents: 30_000, isPaid: true }), pay({ expenseId: 'e1', amountCents: 50_000 })])).toBe(70_000);
    expect(remainingForExpense(exp({ plannedCents: 1 }), [])).toBe(0);
  });
  it('classifies due dates', () => {
    expect(dueState(pay({ dueDate: '2026-11-09' }), today)).toBe('overdue');
    expect(dueState(pay({ dueDate: '2026-11-17' }), today)).toBe('soon');
    expect(dueState(pay({ dueDate: '2026-11-18' }), today)).toBe('later');
    expect(dueState(pay({ dueDate: '2026-11-01', isPaid: true }), today)).toBe('paid');
    expect(upcomingPayments([pay({ id: 'b', dueDate: '2026-11-12' }), pay({ id: 'a', dueDate: '2026-11-01' }), pay({ id: 'c', dueDate: '2027-01-01' })], today).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('buckets payments by month until the wedding', () => {
    const cal = monthlyCalendar([
      pay({ dueDate: '2026-10-01', amountCents: 100 }),
      pay({ dueDate: '2026-12-05', amountCents: 200 }),
      pay({ dueDate: '2026-12-20', amountCents: 300, isPaid: true }),
    ], today, '2027-02-14');
    expect(cal.map((b) => b.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(cal[0].dueCents).toBe(100); // overdue moved to current month
    expect(cal[1].dueCents).toBe(200);
    expect(cal[1].paidCents).toBe(300);
  });
});

describe('warnings', () => {
  it('maps usage to traffic lights', () => {
    expect(usageLevel(79)).toBe('green');
    expect(usageLevel(80)).toBe('yellow');
    expect(usageLevel(101)).toBe('red');
  });
  it('produces total, category, payment and contract warnings', () => {
    const expenses = [exp({ id: 'e1', categoryId: 'b', plannedCents: 2_500_000 }), exp({ id: 'e2' }), exp({ id: 'e3' })];
    const forecast = weddingForecast(wedding, expenses, ctx);
    const cats = categoryUsage([{ id: 'b', name: 'Foto', limitType: 'amount', limitValue: 2_000_000, color: '', sortOrder: 0 }], expenses, wedding.totalBudgetCents, ctx);
    const w = computeWarnings({
      forecast, categories: cats, expenses,
      payments: [pay({ expenseId: 'e1', dueDate: '2026-11-01', amountCents: 100 }), pay({ expenseId: 'e1', dueDate: '2026-11-12', amountCents: 100 })],
      expenseTitles: { e1: 'Fotografas' }, todayIso: '2026-11-10', weddingDateIso: '2027-01-10',
    });
    expect(w.map((x) => x.kind).sort()).toEqual(['category', 'contracts', 'payment', 'payment', 'total']);
    expect(w[0].level).toBe('red');
  });
});

describe('funding and guests', () => {
  it('computes balances and settles debts', () => {
    const sources = [{ id: 'pora', name: 'Pora', pledgedCents: 1_000_000 }, { id: 'teva', name: 'Tėvai', pledgedCents: 500_000 }];
    const expenses = [exp({ id: 'e1', contractedCents: 100_000 })];
    const b = sourceBalances(sources, [
      { expenseId: 'e1', fundingSourceId: 'pora', sharePct: 50, amountCents: null },
      { expenseId: 'e1', fundingSourceId: 'teva', sharePct: 50, amountCents: null },
    ], expenses, [pay({ expenseId: 'e1', amountCents: 100_000, isPaid: true, paidBySourceId: 'pora' })], ctx);
    expect(b.map((x) => x.owesCents)).toEqual([-50_000, 50_000]);
    expect(settle(b)).toEqual([{ fromId: 'teva', toId: 'pora', amountCents: 50_000 }]);
    expect(fundingShortfall(2_000_000, sources)).toBe(500_000);
  });
  it('cost per guest and sensitivity', () => {
    expect(costPerGuest(1_000_000, 100)).toBe(10_000);
    const s = guestSensitivity(wedding, [exp({ calcType: 'per_guest', unitPriceCents: 5000 })], ctx, [-10, 0, 10]);
    expect(s.map((x) => x.deltaCents)).toEqual([-50_000, 0, 50_000]);
    expect(daysUntil('2026-11-10', '2026-12-10')).toBe(30);
  });
});
