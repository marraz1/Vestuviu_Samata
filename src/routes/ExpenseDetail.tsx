import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Chip, ErrorBox, Field, Money, MoneyInput, Sheet, Spinner, inputClass, useToast } from '../components/ui';
import { expenseForecast } from '../domain/forecast';
import { formatDate } from '../domain/money';
import { dueState, remainingForExpense } from '../domain/payments';
import type { CalcType } from '../domain/types';
import { lt } from '../i18n/lt';
import { api, ConflictError } from '../lib/api';
import { toExpense, useBundle, useInvalidate, useMutate, useSummary, type ExpenseRow, type PaymentRow } from '../lib/data';
import { useWedding } from '../lib/session';
import { STATUSES } from './Expenses';

const CALC: Record<CalcType, string> = {
  fixed: 'Fiksuota suma',
  per_guest: 'Kaina vienam svečiui',
  hourly: 'Pagal valandas',
  per_unit: 'Pagal vienetus',
  per_table: 'Kaina vienam stalui',
};

const KIND = { deposit: 'Avansas', interim: 'Tarpinis', final: 'Galutinis' } as const;
const METHOD = { transfer: 'Pavedimu', cash: 'Grynais', card: 'Kortele' } as const;

type Draft = Pick<ExpenseRow, 'title' | 'category_id' | 'status' | 'calc_type' | 'unit_price_cents' | 'quantity' | 'fixed_part_cents' | 'planned_cents' | 'contracted_cents' | 'vat_pct' | 'service_fee_cents' | 'notes'>;

function draftOf(e: ExpenseRow): Draft {
  const { title, category_id, status, calc_type, unit_price_cents, quantity, fixed_part_cents, planned_cents, contracted_cents, vat_pct, service_fee_cents, notes } = e;
  return { title, category_id, status, calc_type, unit_price_cents, quantity, fixed_part_cents, planned_cents, contracted_cents, vat_pct, service_fee_cents, notes };
}

export function ExpenseDetail() {
  const { id = '' } = useParams();
  const { weddingId, canEdit, canPlan } = useWedding();
  const q = useBundle(weddingId);
  const s = useSummary(q.data);
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidate(weddingId);
  const row = q.data?.expenses.find((e) => e.id === id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  useEffect(() => {
    if (row && (!draft || row.updated_at !== loadedAt) && !conflict) { setDraft(draftOf(row)); setLoadedAt(row.updated_at); }
  }, [row, draft, loadedAt, conflict]);

  const save = useMutate(weddingId, async (overwrite: boolean) => {
    if (!draft || !row) return;
    if (overwrite) await api.update('expenses', `id=eq.${row.id}`, draft);
    else await api.updateChecked('expenses', row.id, loadedAt!, draft);
  });

  if (q.isPending) return <Spinner />;
  if (q.isError || !s) return <ErrorBox error={q.error} />;
  if (!row || !draft) return <Card>Išlaida nerasta. <Link className="underline" to="/islaidos">Grįžti</Link></Card>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft({ ...draft, [k]: v }); setSaved(false); };
  const preview = expenseForecast(toExpense({ ...row, ...draft }), s.ctx);
  const payments = s.payments.filter((p) => p.expenseId === row.id);
  const remaining = remainingForExpense(toExpense({ ...row, ...draft }), payments);
  const scheduled = payments.reduce((a, p) => a + p.amountCents, 0);
  const variable = draft.calc_type !== 'fixed';
  const hint = q.data!.categories.find((c) => c.id === draft.category_id)?.calc_hint;

  async function submit(e: FormEvent, overwrite = false) {
    e.preventDefault();
    try {
      await save.mutateAsync(overwrite);
      setConflict(false); setSaved(true);
      toast({ text: 'Išsaugota' });
    } catch (err) {
      if (err instanceof ConflictError) setConflict(true);
    }
  }

  async function remove() {
    if (!confirm(`Ištrinti „${row!.title}“?`)) return;
    await api.update('expenses', `id=eq.${row!.id}`, { deleted_at: new Date().toISOString() });
    await invalidate();
    navigate('/islaidos');
    toast({
      text: `Ištrinta: ${row!.title}`,
      undo: async () => { await api.update('expenses', `id=eq.${row!.id}`, { deleted_at: null }); await invalidate(); },
    });
  }

  const ro = !canEdit;

  return (
    <section className="pb-8">
      <Link to="/islaidos" className="text-sm text-teal-800 underline">← Išlaidos</Link>
      <div className="mb-4 mt-2 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{row.title}</h1>
        <div className="text-right">
          <p className="text-xs text-stone-600">Prognozė</p>
          <p className="text-xl font-semibold"><Money cents={preview} /></p>
        </div>
      </div>

      {conflict && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">
          <p className="font-medium">Kažkas ką tik pakeitė šią išlaidą.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => { setConflict(false); setDraft(draftOf(row)); setLoadedAt(row.updated_at); void invalidate(); }}>Perkrauti jų versiją</Button>
            <Button variant="danger" onClick={(e) => submit(e as unknown as FormEvent, true)}>Perrašyti mano</Button>
          </div>
        </div>
      )}

      <form onSubmit={submit}>
        <fieldset disabled={ro} className="space-y-4">
          <Card className="space-y-4">
            <Field label="Pavadinimas">{(fid) => <input id={fid} className={inputClass} value={draft.title} onChange={(e) => set('title', e.target.value)} required />}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategorija">
                {(fid) => (
                  <select id={fid} className={inputClass} value={draft.category_id} onChange={(e) => set('category_id', e.target.value)}>
                    {s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Būsena">
                {(fid) => (
                  <select id={fid} className={inputClass} value={draft.status} onChange={(e) => set('status', e.target.value as Draft['status'])}>
                    {STATUSES.map((st) => <option key={st} value={st}>{lt.status[st]}</option>)}
                  </select>
                )}
              </Field>
            </div>
          </Card>

          <Card className="space-y-4">
            <h2 className="font-semibold">Kaina</h2>
            <Field label="Skaičiavimas" hint={hint ? `Kategorijai įprasta: ${hint}` : undefined}>
              {(fid) => (
                <select id={fid} className={inputClass} value={draft.calc_type} onChange={(e) => set('calc_type', e.target.value as CalcType)}>
                  {Object.entries(CALC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </Field>
            {variable ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={{ per_guest: 'Kaina svečiui', per_table: 'Kaina stalui', hourly: 'Valandos kaina', per_unit: 'Vieneto kaina', fixed: '' }[draft.calc_type]}>
                  {(fid) => <MoneyInput id={fid} value={draft.unit_price_cents} onChange={(v) => set('unit_price_cents', v)} />}
                </Field>
                {(draft.calc_type === 'hourly' || draft.calc_type === 'per_unit') ? (
                  <Field label={draft.calc_type === 'hourly' ? 'Valandų' : 'Vienetų'}>
                    {(fid) => <input id={fid} type="number" inputMode="decimal" min={0} step="0.5" className={inputClass} value={draft.quantity ?? ''} onChange={(e) => set('quantity', e.target.value === '' ? null : Number(e.target.value))} />}
                  </Field>
                ) : (
                  <p className="self-end pb-3 text-sm text-stone-600">
                    × {draft.calc_type === 'per_guest' ? `${s.ctx.guestCount} svečių` : `${s.ctx.tableCount} stalų`} (iš nustatymų)
                  </p>
                )}
                <Field label="Fiksuota dalis" hint="pvz., salės nuoma">
                  {(fid) => <MoneyInput id={fid} value={draft.fixed_part_cents} onChange={(v) => set('fixed_part_cents', v)} />}
                </Field>
              </div>
            ) : (
              <Field label="Planuojama suma">{(fid) => <MoneyInput id={fid} value={draft.planned_cents} onChange={(v) => set('planned_cents', v)} />}</Field>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sutarta suma" hint="Kai įrašyta, ji laikoma galutine.">
                {(fid) => <MoneyInput id={fid} value={draft.contracted_cents} onChange={(v) => set('contracted_cents', v)} />}
              </Field>
              <Field label="PVM, %" hint="Jei kaina be PVM">
                {(fid) => <input id={fid} type="number" inputMode="decimal" min={0} max={100} className={inputClass} value={draft.vat_pct ?? ''} onChange={(e) => set('vat_pct', e.target.value === '' ? null : Number(e.target.value))} />}
              </Field>
              <Field label="Aptarnavimo mokestis">{(fid) => <MoneyInput id={fid} value={draft.service_fee_cents} onChange={(v) => set('service_fee_cents', v)} />}</Field>
            </div>
          </Card>

          <Card>
            <Field label="Pastabos">{(fid) => <textarea id={fid} rows={3} className={inputClass} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />}</Field>
          </Card>

          {!ro && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saugoma…' : 'Išsaugoti'}</Button>
              {saved && <span className="text-sm text-green-800" role="status">Išsaugota</span>}
              {save.error && !(save.error instanceof ConflictError) && <ErrorBox error={save.error} />}
              <span className="flex-1" />
              <Button variant="ghost" className="text-red-700" onClick={remove}>Ištrinti</Button>
            </div>
          )}
        </fieldset>
      </form>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Mokėjimai</h2>
          {canEdit && <Button variant="secondary" onClick={() => setPayOpen(true)}>+ Mokėjimas</Button>}
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-stone-600">Mokėjimų grafikas dar nesudarytas.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {payments.map((p) => <PaymentItem key={p.id} p={q.data!.payments.find((x) => x.id === p.id)!} state={dueState(p, s.today)} />)}
          </ul>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
          <dt className="text-stone-600">Suplanuota mokėjimų</dt><dd className="text-right"><Money cents={scheduled} /></dd>
          {draft.contracted_cents != null && <><dt className="text-stone-600">Liko sumokėti</dt><dd className="text-right font-semibold"><Money cents={remaining} /></dd></>}
        </dl>
        {draft.contracted_cents != null && scheduled !== draft.contracted_cents && payments.length > 0 && (
          <p className="mt-2 text-xs text-amber-800">Mokėjimų suma nesutampa su sutarta suma.</p>
        )}
      </Card>

      {canPlan && <PrivateNotes expenseId={row.id} weddingId={weddingId} />}
      <PaymentSheet open={payOpen} onClose={() => setPayOpen(false)} expenseId={row.id} suggested={remaining || null} />
    </section>
  );
}

function PaymentItem({ p, state }: { p: PaymentRow; state: ReturnType<typeof dueState> }) {
  const { weddingId, canEdit } = useWedding();
  const toggle = useMutate(weddingId, () =>
    api.update('payments', `id=eq.${p.id}`, p.is_paid ? { is_paid: false, paid_date: null } : { is_paid: true, paid_date: new Date().toISOString().slice(0, 10) }));
  const del = useMutate(weddingId, () => api.remove('payments', `id=eq.${p.id}`));
  return (
    <li className="flex items-center gap-3 py-2">
      <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={p.is_paid} disabled={!canEdit || toggle.isPending}
        onChange={() => toggle.mutate(undefined)} aria-label={p.is_paid ? 'Pažymėti nesumokėtu' : 'Pažymėti sumokėtu'} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{KIND[p.kind]}</span>
        <span className="block text-xs text-stone-600">
          {p.is_paid ? `Sumokėta ${p.paid_date ? formatDate(p.paid_date) : ''}` : p.due_date ? `Iki ${formatDate(p.due_date)}` : 'Be termino'}
          {p.method ? ` · ${METHOD[p.method]}` : ''}
        </span>
      </span>
      {state === 'overdue' && <Chip level="red">Pradelsta</Chip>}
      {state === 'soon' && <Chip level="yellow">Artėja</Chip>}
      <Money cents={Number(p.amount_cents)} className="text-sm font-semibold" />
      {canEdit && <button type="button" className="px-1 text-stone-400 hover:text-red-700" aria-label="Ištrinti mokėjimą" onClick={() => confirm('Ištrinti mokėjimą?') && del.mutate(undefined)}>×</button>}
    </li>
  );
}

function PaymentSheet({ open, onClose, expenseId, suggested }: { open: boolean; onClose: () => void; expenseId: string; suggested: number | null }) {
  const { weddingId } = useWedding();
  const [kind, setKind] = useState<PaymentRow['kind']>('deposit');
  const [amount, setAmount] = useState<number | null>(suggested);
  const [due, setDue] = useState('');
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState<NonNullable<PaymentRow['method']>>('transfer');
  useEffect(() => { if (open) setAmount(suggested); }, [open, suggested]);
  const add = useMutate(weddingId, (row: Partial<PaymentRow>) => api.insert('payments', row));
  return (
    <Sheet open={open} onClose={onClose} title="Naujas mokėjimas">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (amount == null) return;
        await add.mutateAsync({
          wedding_id: weddingId, expense_id: expenseId, kind, amount_cents: amount, due_date: due || null,
          is_paid: paid, paid_date: paid ? new Date().toISOString().slice(0, 10) : null, method,
        });
        setDue(''); setPaid(false); onClose();
      }}>
        <Field label="Tipas">
          {(id) => <select id={id} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as PaymentRow['kind'])}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>}
        </Field>
        <Field label="Suma">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Mokėjimo terminas">{(id) => <input id={id} type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
        <Field label="Būdas">
          {(id) => <select id={id} className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>}
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-teal-700" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Jau sumokėta</label>
        {add.error && <ErrorBox error={add.error} />}
        <Button type="submit" className="w-full" disabled={add.isPending || amount == null}>Pridėti</Button>
      </form>
    </Sheet>
  );
}

/** Notes only the couple can see (separate table with stricter access rules). */
function PrivateNotes({ expenseId, weddingId }: { expenseId: string; weddingId: string }) {
  const q = useQuery({
    queryKey: ['private', expenseId],
    queryFn: () => api.get<{ body: string }[]>(`/expense_private_notes?expense_id=eq.${expenseId}`).then((r) => r[0]?.body ?? ''),
  });
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const value = text ?? q.data ?? '';
  async function save() {
    setState('saving');
    await api.remove('expense_private_notes', `expense_id=eq.${expenseId}`);
    if (value.trim()) await api.insert('expense_private_notes', { expense_id: expenseId, wedding_id: weddingId, body: value });
    setState('saved');
  }
  return (
    <Card className="mt-4">
      <Field label="Asmeninės pastabos" hint="Mato tik jūs ir partneris.">
        {(id) => <textarea id={id} rows={2} className={inputClass} value={value} onChange={(e) => { setText(e.target.value); setState('idle'); }} onBlur={() => text != null && save()} />}
      </Field>
      {state === 'saved' && <p className="mt-1 text-xs text-green-800" role="status">Išsaugota</p>}
    </Card>
  );
}
