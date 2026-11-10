import { useState } from 'react';
import { Button, Card, Chip, ErrorBox, Field, Money, MoneyInput, PageTitle, ProgressBar, Sheet, Spinner, inputClass, useToast } from '../components/ui';
import type { CategoryUsage } from '../domain/budget';
import { usageLevel } from '../domain/warnings';
import { lt } from '../i18n/lt';
import { api } from '../lib/api';
import { useBundle, useMutate, useSummary, type CategoryRow } from '../lib/data';
import { useWedding } from '../lib/session';

export function Categories() {
  const { weddingId, canPlan } = useWedding();
  const q = useBundle(weddingId);
  const s = useSummary(q.data);
  const [editing, setEditing] = useState<CategoryRow | 'new' | null>(null);
  if (q.isPending) return <Spinner />;
  if (q.isError || !s) return <ErrorBox error={q.error} />;

  const limited = s.usage.filter((u) => u.limitCents != null);
  const limitsTotal = limited.reduce((a, u) => a + (u.limitCents ?? 0), 0);

  return (
    <section>
      <PageTitle action={canPlan && <Button variant="secondary" onClick={() => setEditing('new')}>+ Kategorija</Button>}>{lt.nav.categories}</PageTitle>
      <p className="mb-4 text-sm text-stone-600">
        Limitai paskirstyti: <Money cents={limitsTotal} className="font-medium text-stone-900" /> iš <Money cents={s.wedding.totalBudgetCents} />.
        Paspauskite kategoriją, kad nustatytumėte limitą.
      </p>
      <ul className="space-y-2">
        {s.usage.map((u) => (
          <li key={u.category.id}>
            <CategoryItem u={u} onClick={canPlan ? () => setEditing(q.data!.categories.find((c) => c.id === u.category.id)!) : undefined} />
          </li>
        ))}
      </ul>
      {editing && <CategorySheet category={editing === 'new' ? null : editing} count={s.categories.length} onClose={() => setEditing(null)} />}
    </section>
  );
}

function CategoryItem({ u, onClick }: { u: CategoryUsage; onClick?: () => void }) {
  const level = usageLevel(u.usagePct);
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: u.category.color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{u.category.name}</span>
        <span className="text-right text-sm">
          <Money cents={u.forecastCents} className="font-semibold" />
          {u.limitCents != null && <span className="text-stone-600"> / <Money cents={u.limitCents} /></span>}
        </span>
      </div>
      {u.limitCents != null ? (
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar pct={u.usagePct ?? 0} level={level} label={`${u.category.name}: panaudota`} />
          <Chip level={level}>{Math.round(u.usagePct ?? 0)} %</Chip>
        </div>
      ) : (
        <p className="mt-1 text-xs text-stone-500">Limitas nenustatytas</p>
      )}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="block w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-teal-600">{body}</button>
  ) : (
    <Card className="p-3">{body}</Card>
  );
}

const COLORS = ['#0f766e', '#b45309', '#9f1239', '#4d7c0f', '#be185d', '#6d28d9', '#1d4ed8', '#0369a1', '#a16207', '#57534e'];

function CategorySheet({ category, count, onClose }: { category: CategoryRow | null; count: number; onClose: () => void }) {
  const { weddingId } = useWedding();
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState<'none' | 'amount' | 'percent'>(category?.limit_type ?? 'none');
  const [amount, setAmount] = useState<number | null>(category?.limit_type === 'amount' ? Number(category.limit_value) : null);
  const [pct, setPct] = useState(category?.limit_type === 'percent' ? String(category.limit_value) : '');
  const [color, setColor] = useState(category?.color ?? COLORS[count % COLORS.length]);

  const save = useMutate(weddingId, async () => {
    const row = {
      name: name.trim(),
      color,
      limit_type: type === 'none' ? null : type,
      limit_value: type === 'amount' ? amount : type === 'percent' ? Math.round(Number(pct)) : null,
    };
    if (category) await api.update('categories', `id=eq.${category.id}`, row);
    else await api.insert('categories', { ...row, wedding_id: weddingId, sort_order: count });
  });
  const del = useMutate(weddingId, () => api.remove('categories', `id=eq.${category!.id}`));

  return (
    <Sheet open onClose={onClose} title={category ? category.name : 'Nauja kategorija'}>
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await save.mutateAsync(undefined); onClose(); }}>
        <Field label="Pavadinimas">{(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
        {category?.calc_hint && <p className="text-sm text-stone-600">Įprastas skaičiavimas: {category.calc_hint}</p>}
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Limitas</legend>
          <div className="flex gap-2">
            {(['none', 'amount', 'percent'] as const).map((t) => (
              <label key={t} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${type === t ? 'border-teal-700 bg-teal-50 font-medium' : 'border-stone-300'}`}>
                <input type="radio" name="limit" className="sr-only" checked={type === t} onChange={() => setType(t)} />
                {{ none: 'Be limito', amount: 'Suma', percent: '% biudžeto' }[t]}
              </label>
            ))}
          </div>
        </fieldset>
        {type === 'amount' && <Field label="Limito suma">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>}
        {type === 'percent' && (
          <Field label="Procentai nuo bendro biudžeto">
            {(id) => <input id={id} type="number" min={0} max={100} inputMode="numeric" className={inputClass} value={pct} onChange={(e) => setPct(e.target.value)} required />}
          </Field>
        )}
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Spalva</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <label key={c} className={`h-8 w-8 cursor-pointer rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-stone-900' : ''}`} style={{ background: c }}>
                <input type="radio" name="color" className="sr-only" checked={color === c} onChange={() => setColor(c)} aria-label={c} />
              </label>
            ))}
          </div>
        </fieldset>
        {(save.error || del.error) && <ErrorBox error={save.error ?? (del.error?.message.includes('foreign key') ? new Error('Kategorijoje yra išlaidų – pirma jas perkelkite.') : del.error)} />}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={save.isPending}>Išsaugoti</Button>
          {category && (
            <Button variant="ghost" className="text-red-700" onClick={async () => {
              if (!confirm(`Ištrinti kategoriją „${category.name}“?`)) return;
              await del.mutateAsync(undefined); toast({ text: 'Kategorija ištrinta' }); onClose();
            }}>Ištrinti</Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
