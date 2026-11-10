import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Chip, ErrorBox, Field, Money, MoneyInput, PageTitle, Sheet, Spinner, inputClass, useToast } from '../components/ui';
import { expenseForecast } from '../domain/forecast';
import type { ExpenseStatus } from '../domain/types';
import { lt } from '../i18n/lt';
import { api } from '../lib/api';
import { useBundle, useMutate, useSummary, type ExpenseRow } from '../lib/data';
import { useWedding } from '../lib/session';

export const STATUSES: ExpenseStatus[] = ['idea', 'offer', 'contract', 'partly_paid', 'paid', 'cancelled'];

export function statusLevel(s: ExpenseStatus) {
  if (s === 'paid') return 'green' as const;
  if (s === 'cancelled') return 'neutral' as const;
  if (s === 'contract' || s === 'partly_paid') return 'yellow' as const;
  return 'neutral' as const;
}

/** Quick add: only title, category and amount are needed (≤ 30 s on a phone). */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { weddingId } = useWedding();
  const q = useBundle(weddingId);
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const add = useMutate(weddingId, (row: Partial<ExpenseRow>) => api.insert<ExpenseRow>('expenses', row));

  async function submit(e: FormEvent, openAfter = false) {
    e.preventDefault();
    const cat = categoryId || q.data?.categories[0]?.id;
    if (!cat) return;
    const created = await add.mutateAsync({ wedding_id: weddingId, category_id: cat, title: title.trim(), planned_cents: amount });
    toast({ text: `Pridėta: ${created.title}` });
    setTitle(''); setAmount(null);
    onClose();
    if (openAfter) navigate(`/islaidos/${created.id}`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nauja išlaida">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Pavadinimas">
          {(id) => <input id={id} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="pvz., Fotografas" autoFocus />}
        </Field>
        <Field label="Kategorija">
          {(id) => (
            <select id={id} className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {q.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Planuojama suma">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        {add.error && <ErrorBox error={add.error} />}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={add.isPending}>Išsaugoti</Button>
          <Button variant="secondary" disabled={add.isPending || !title.trim()} onClick={(e) => submit(e as unknown as FormEvent, true)}>Daugiau…</Button>
        </div>
      </form>
    </Sheet>
  );
}

export function QuickAddButton() {
  const { canEdit } = useWedding();
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Pridėti išlaidą"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-3xl text-white shadow-lg hover:bg-teal-800 md:bottom-8 md:right-8">
        +
      </button>
      <QuickAdd open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type Sort = 'new' | 'amount' | 'title' | 'category';

export function Expenses() {
  const { weddingId } = useWedding();
  const q = useBundle(weddingId);
  const s = useSummary(q.data);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>('new');

  const rows = useMemo(() => {
    if (!s || !q.data) return [];
    const cats = Object.fromEntries(s.categories.map((c) => [c.id, c]));
    const created = Object.fromEntries(q.data.expenses.map((e) => [e.id, e.created_at]));
    const needle = search.trim().toLowerCase();
    const list = s.expenses
      .filter((e) => !needle || e.title.toLowerCase().includes(needle))
      .filter((e) => !category || e.categoryId === category)
      .filter((e) => !status || e.status === status)
      .map((e) => ({ e, cat: cats[e.categoryId], forecast: expenseForecast(e, s.ctx) }));
    const by: Record<Sort, (a: typeof list[0], b: typeof list[0]) => number> = {
      new: (a, b) => (created[b.e.id] > created[a.e.id] ? 1 : -1),
      amount: (a, b) => b.forecast - a.forecast,
      title: (a, b) => a.e.title.localeCompare(b.e.title, 'lt'),
      category: (a, b) => (a.cat?.sortOrder ?? 0) - (b.cat?.sortOrder ?? 0),
    };
    return list.sort(by[sort]);
  }, [s, q.data, search, category, status, sort]);

  if (q.isPending) return <Spinner />;
  if (q.isError || !s) return <ErrorBox error={q.error} />;
  const total = rows.reduce((a, r) => a + r.forecast, 0);

  return (
    <section>
      <PageTitle>{lt.nav.expenses}</PageTitle>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <input aria-label="Paieška" placeholder="Ieškoti…" className={`${inputClass} col-span-2 md:col-span-1`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Kategorija" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Visos kategorijos</option>
          {s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Būsena" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Visos būsenos</option>
          {STATUSES.map((st) => <option key={st} value={st}>{lt.status[st]}</option>)}
        </select>
        <select aria-label="Rikiuoti" className={`${inputClass} col-span-2 md:col-span-1`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="new">Naujausios viršuje</option>
          <option value="amount">Pagal sumą</option>
          <option value="title">Pagal pavadinimą</option>
          <option value="category">Pagal kategoriją</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <Card className="text-center text-stone-700">{s.expenses.length ? 'Nieko nerasta pagal filtrus.' : 'Dar nėra išlaidų. Spauskite „+“.'}</Card>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map(({ e, cat, forecast }) => (
              <li key={e.id}>
                <Link to={`/islaidos/${e.id}`} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 hover:border-teal-600">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: cat?.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${e.status === 'cancelled' ? 'text-stone-500 line-through' : ''}`}>{e.title}</span>
                    <span className="block truncate text-xs text-stone-600">{cat?.name}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Money cents={forecast} className="font-semibold" />
                    <Chip level={statusLevel(e.status)}>{lt.status[e.status]}</Chip>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-right text-sm text-stone-600">Iš viso ({rows.length}): <Money cents={total} className="font-semibold text-stone-900" /></p>
        </>
      )}
      <QuickAddButton />
    </section>
  );
}
