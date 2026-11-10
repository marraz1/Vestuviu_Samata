import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, ErrorBox, Field, MoneyInput, inputClass } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

/** First run: create the wedding (the database seeds the 22 default categories). */
export function Onboarding() {
  const qc = useQueryClient();
  const { user, signOut } = useSession();
  const [name, setName] = useState('Mūsų vestuvės');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState('80');
  const [budget, setBudget] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await api.rpc<string>('create_wedding_with_defaults', {
        p_name: name.trim(),
        p_date: date || null,
        p_guest_count: Number(guests) || 0,
        p_budget_cents: budget ?? 0,
        p_display_name: user?.name ?? null,
      });
      try { localStorage.setItem('vs.currentWedding', id); } catch { /* ignore */ }
      await qc.invalidateQueries({ queryKey: ['weddings'] });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Sveiki, {user?.name}!</h1>
      <p className="mt-2 text-stone-600">Pradėkime nuo pagrindinių duomenų. Viską galėsite pakeisti vėliau nustatymuose.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Pavadinimas">{(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
        <Field label="Vestuvių data" hint="Jei dar nežinote – palikite tuščią.">
          {(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Preliminarus svečių skaičius">
          {(id) => <input id={id} type="number" inputMode="numeric" min={0} className={inputClass} value={guests} onChange={(e) => setGuests(e.target.value)} />}
        </Field>
        <Field label="Bendras biudžetas" hint="Nuo jo skaičiuojamas rezervas (10 %) ir kategorijų limitai procentais.">
          {(id) => <MoneyInput id={id} value={budget} onChange={setBudget} placeholder="20 000" />}
        </Field>
        {error != null && <ErrorBox error={error} />}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Kuriama…' : 'Sukurti'}</Button>
      </form>
      <p className="mt-8 text-center text-sm text-stone-600">
        Jus pakvietė prisijungti prie kitų vestuvių? Atidarykite gautą kvietimo nuorodą.{' '}
        <button type="button" className="underline" onClick={signOut}>Atsijungti</button>
      </p>
    </main>
  );
}
