import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, Money, MoneyInput, PageTitle, Spinner, inputClass, useToast } from '../components/ui';
import { costPerGuest } from '../domain/guests';
import { lt } from '../i18n/lt';
import { api } from '../lib/api';
import { useBundle, useMutate, useSummary, type WeddingRow } from '../lib/data';
import { useSession, useWedding } from '../lib/session';

const ROLE = { owner: 'Savininkas', partner: 'Partneris', editor: 'Redaktorius', viewer: 'Žiūrėtojas' } as const;

export function Settings() {
  const { weddingId, canPlan, role, weddings, select } = useWedding();
  const { user, signOut } = useSession();
  const q = useBundle(weddingId);
  const s = useSummary(q.data);
  const toast = useToast();
  const [w, setW] = useState<WeddingRow | null>(null);
  useEffect(() => { if (q.data && !w) setW(q.data.wedding); }, [q.data, w]);

  const save = useMutate(weddingId, (row: WeddingRow) =>
    api.updateChecked('weddings', row.id, q.data!.wedding.updated_at, {
      name: row.name, wedding_date: row.wedding_date || null, venue: row.venue || null,
      guest_count: row.guest_count, total_budget_cents: row.total_budget_cents, reserve_pct: row.reserve_pct,
    }));

  if (q.isPending || !w) return <Spinner />;
  if (q.isError || !s) return <ErrorBox error={q.error} />;
  const set = <K extends keyof WeddingRow>(k: K, v: WeddingRow[K]) => setW({ ...w, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(w!);
      toast({ text: 'Nustatymai išsaugoti' });
    } catch { /* shown below */ }
  }

  async function exportJson() {
    const data = await api.rpc('export_wedding', { w: weddingId });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `vestuves-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="space-y-4 pb-8">
      <PageTitle>{lt.nav.settings}</PageTitle>

      <Card>
        <form onSubmit={submit}>
          <fieldset disabled={!canPlan} className="space-y-4">
            <h2 className="font-semibold">Vestuvės</h2>
            <Field label="Pavadinimas">{(id) => <input id={id} className={inputClass} value={w.name} onChange={(e) => set('name', e.target.value)} required />}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data">{(id) => <input id={id} type="date" className={inputClass} value={w.wedding_date ?? ''} onChange={(e) => set('wedding_date', e.target.value || null)} />}</Field>
              <Field label="Vieta">{(id) => <input id={id} className={inputClass} value={w.venue ?? ''} onChange={(e) => set('venue', e.target.value)} />}</Field>
              <Field label="Svečių skaičius" hint="Vienintelė vieta, kur keičiamas svečių skaičius – nuo jo perskaičiuojamos „vienam svečiui“ išlaidos.">
                {(id) => <input id={id} type="number" min={0} inputMode="numeric" className={inputClass} value={w.guest_count} onChange={(e) => set('guest_count', Number(e.target.value) || 0)} />}
              </Field>
              <Field label="Bendras biudžetas">{(id) => <MoneyInput id={id} value={Number(w.total_budget_cents)} onChange={(v) => set('total_budget_cents', v ?? 0)} />}</Field>
              <Field label="Rezervas, % biudžeto" hint="Rekomenduojama 5–10 %.">
                {(id) => <input id={id} type="number" min={0} max={100} inputMode="decimal" className={inputClass} value={w.reserve_pct} onChange={(e) => set('reserve_pct', Number(e.target.value) || 0)} />}
              </Field>
            </div>
            {save.error && <ErrorBox error={save.error} />}
            {canPlan && <Button type="submit" disabled={save.isPending}>Išsaugoti</Button>}
          </fieldset>
        </form>
        <p className="mt-4 text-sm text-stone-600">Dabartinė kaina vienam svečiui: <Money cents={costPerGuest(s.forecast.totalCents, s.wedding.guestCount)} className="font-semibold text-stone-900" /></p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Paskyra</h2>
        <p className="text-sm">{user?.name} · {user?.email} · <span className="text-stone-600">{ROLE[role]}</span></p>
        {weddings.length > 1 && (
          <Field label="Rodyti vestuves">
            {(id) => (
              <select id={id} className={inputClass} value={weddingId} onChange={(e) => select(e.target.value)}>
                {weddings.map((x) => <option key={x.wedding.id} value={x.wedding.id}>{x.wedding.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          {canPlan && <Button variant="secondary" onClick={exportJson}>Atsisiųsti visus duomenis (JSON)</Button>}
          <Button variant="secondary" onClick={signOut}>Atsijungti</Button>
        </div>
      </Card>

      {role === 'owner' && <DangerZone />}
    </section>
  );
}

function DangerZone() {
  const qc = useQueryClient();
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-red-200">
      <h2 className="font-semibold text-red-800">Ištrinti visus duomenis</h2>
      <p className="mt-1 text-sm text-stone-600">Ištrinamos visos vestuvės, kurių savininkas esate, su visomis išlaidomis ir mokėjimais. Šio veiksmo atšaukti negalima.</p>
      <Button variant="danger" className="mt-3" disabled={busy} onClick={async () => {
        if (prompt('Įrašykite TRINTI, kad patvirtintumėte') !== 'TRINTI') return;
        setBusy(true);
        await api.rpc('delete_my_data');
        qc.clear();
        await signOut();
      }}>Ištrinti</Button>
    </Card>
  );
}

/** #/kvietimas/:token – joins the wedding the invitation is for. */
export function AcceptInvite() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useSession();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Kvietimas</h1>
      <p className="mt-2 text-stone-600">Jus pakvietė prisidėti prie vestuvių planavimo. Prisijungėte kaip <b>{user?.email}</b> – kvietimas turi būti išsiųstas šiuo adresu.</p>
      {error != null && <div className="mt-4"><ErrorBox error={error} /></div>}
      <Button className="mt-6 w-full" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const id = await api.rpc<string>('accept_invitation', { p_token: token, p_display_name: user?.name ?? null });
          try { localStorage.setItem('vs.currentWedding', id); } catch { /* ignore */ }
          await qc.invalidateQueries({ queryKey: ['weddings'] });
          navigate('/');
        } catch (e) { setError(e); setBusy(false); }
      }}>Priimti kvietimą</Button>
    </main>
  );
}
