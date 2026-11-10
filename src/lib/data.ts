// Database rows, mapping to domain types, and React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { categoryUsage } from '../domain/budget';
import { contractedTotal, weddingForecast } from '../domain/forecast';
import { paidCents, remainingTotal } from '../domain/payments';
import type { Category, Expense, ExpenseStatus, CalcType, LimitType, Payment, Role, Wedding } from '../domain/types';
import { computeWarnings } from '../domain/warnings';
import { api } from './api';

export interface WeddingRow {
  id: string;
  name: string;
  wedding_date: string | null;
  venue: string | null;
  guest_count: number;
  total_budget_cents: number;
  reserve_pct: number;
  currency: 'EUR';
  updated_at: string;
}

export interface MemberRow {
  wedding_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: Role;
}

export interface CategoryRow {
  id: string;
  wedding_id: string;
  name: string;
  limit_type: LimitType | null;
  limit_value: number | null;
  color: string;
  sort_order: number;
  calc_hint: string | null;
}

export interface ExpenseRow {
  id: string;
  wedding_id: string;
  category_id: string;
  supplier_id: string | null;
  title: string;
  status: ExpenseStatus;
  calc_type: CalcType;
  unit_price_cents: number | null;
  quantity: number | null;
  fixed_part_cents: number | null;
  planned_cents: number | null;
  contracted_cents: number | null;
  vat_pct: number | null;
  service_fee_cents: number | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  wedding_id: string;
  expense_id: string;
  kind: Payment['kind'];
  amount_cents: number;
  due_date: string | null;
  paid_date: string | null;
  is_paid: boolean;
  method: 'cash' | 'transfer' | 'card' | null;
  paid_by_source_id: string | null;
}

const num = (v: number | string | null) => (v == null ? null : Number(v));

export const toWedding = (r: WeddingRow): Wedding => ({
  id: r.id,
  name: r.name,
  date: r.wedding_date,
  venue: r.venue,
  guestCount: r.guest_count,
  totalBudgetCents: Number(r.total_budget_cents),
  reservePct: Number(r.reserve_pct),
  currency: 'EUR',
});

export const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  limitType: r.limit_type,
  limitValue: num(r.limit_value),
  color: r.color,
  sortOrder: r.sort_order,
});

export const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  categoryId: r.category_id,
  supplierId: r.supplier_id,
  title: r.title,
  status: r.status,
  calcType: r.calc_type,
  unitPriceCents: num(r.unit_price_cents),
  quantity: num(r.quantity),
  fixedPartCents: num(r.fixed_part_cents),
  plannedCents: num(r.planned_cents),
  contractedCents: num(r.contracted_cents),
  vatPct: num(r.vat_pct),
  serviceFeeCents: num(r.service_fee_cents),
});

export const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  expenseId: r.expense_id,
  kind: r.kind,
  amountCents: Number(r.amount_cents),
  dueDate: r.due_date,
  paidDate: r.paid_date,
  isPaid: r.is_paid,
  paidBySourceId: r.paid_by_source_id,
});

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- queries ----------

export function useMyWeddings(enabled: boolean) {
  return useQuery({
    queryKey: ['weddings'],
    enabled,
    queryFn: async () => {
      const members = await api.get<(MemberRow & { weddings: WeddingRow })[]>(
        '/wedding_members?select=*,weddings(*)&order=created_at',
      );
      return members.map((m) => ({ role: m.role, wedding: m.weddings }));
    },
  });
}

export interface Bundle {
  wedding: WeddingRow;
  categories: CategoryRow[];
  expenses: ExpenseRow[];
  payments: PaymentRow[];
}

export function useBundle(weddingId: string) {
  return useQuery({
    queryKey: ['bundle', weddingId],
    queryFn: async (): Promise<Bundle> => {
      const w = `wedding_id=eq.${weddingId}`;
      const [weddings, categories, expenses, payments] = await Promise.all([
        api.get<WeddingRow[]>(`/weddings?id=eq.${weddingId}`),
        api.get<CategoryRow[]>(`/categories?${w}&order=sort_order`),
        api.get<ExpenseRow[]>(`/expenses?${w}&deleted_at=is.null&order=created_at.desc`),
        api.get<PaymentRow[]>(`/payments?${w}&order=due_date.asc.nullslast`),
      ]);
      if (!weddings[0]) throw new Error('Vestuvės nerastos arba neturite prieigos.');
      return { wedding: weddings[0], categories, expenses, payments };
    },
  });
}

/** All derived numbers for the dashboard, lists and warnings, from one place. */
export function useSummary(b: Bundle | undefined) {
  return useMemo(() => {
    if (!b) return null;
    const wedding = toWedding(b.wedding);
    const categories = b.categories.map(toCategory);
    const expenses = b.expenses.map(toExpense);
    const payments = b.payments.filter((p) => expenses.some((e) => e.id === p.expense_id)).map(toPayment);
    const ctx = { guestCount: wedding.guestCount, tableCount: Math.ceil(wedding.guestCount / 10) };
    const forecast = weddingForecast(wedding, expenses, ctx);
    const usage = categoryUsage(categories, expenses, wedding.totalBudgetCents, ctx);
    const today = todayIso();
    const warnings = computeWarnings({
      forecast,
      categories: usage,
      expenses,
      payments,
      expenseTitles: Object.fromEntries(expenses.map((e) => [e.id, e.title])),
      todayIso: today,
      weddingDateIso: wedding.date,
    });
    return {
      wedding,
      categories,
      expenses,
      payments,
      ctx,
      forecast,
      usage,
      warnings,
      today,
      contractedCents: contractedTotal(expenses),
      paidCents: paidCents(payments),
      remainingCents: remainingTotal(expenses, payments),
    };
  }, [b]);
}

// ---------- mutations ----------

export function useInvalidate(weddingId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['bundle', weddingId] });
}

export function useMutate<A, R>(weddingId: string, fn: (a: A) => Promise<R>) {
  const invalidate = useInvalidate(weddingId);
  return useMutation({ mutationFn: fn, onSettled: invalidate });
}
