import { useState, type FormEvent } from 'react';
import { requestPasswordReset, resetPassword, signIn, signUp } from '../lib/auth';
import { useSession } from '../lib/session';
import { Button, ErrorBox, Field, inputClass } from '../components/ui';
import { lt } from '../i18n/lt';

type Mode = 'login' | 'register' | 'forgot';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <p className="mb-1 text-center text-sm font-medium uppercase tracking-wide text-teal-800">{lt.appName}</p>
      <h1 className="mb-6 text-center text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

export function AuthScreen() {
  const { refresh } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else if (mode === 'register') await signUp(name, email, password);
      else { await requestPasswordReset(email); setSent(true); return; }
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const title = { login: 'Prisijungimas', register: 'Registracija', forgot: 'Slaptažodžio priminimas' }[mode];

  return (
    <Shell title={title}>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <Field label="Vardas">{(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}</Field>
        )}
        <Field label="El. paštas">
          {(id) => <input id={id} type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />}
        </Field>
        {mode !== 'forgot' && (
          <Field label="Slaptažodis" hint={mode === 'register' ? 'Bent 8 simboliai.' : undefined}>
            {(id) => (
              <input id={id} type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            )}
          </Field>
        )}
        {error != null && <ErrorBox error={error} />}
        {sent && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900" role="status">Jei toks paskyra yra, išsiuntėme nuorodą slaptažodžiui pakeisti.</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Palaukite…' : { login: 'Prisijungti', register: 'Sukurti paskyrą', forgot: 'Siųsti nuorodą' }[mode]}
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm">
        {mode === 'login' && (
          <>
            <p>Neturite paskyros? <button type="button" className="font-medium text-teal-800 underline" onClick={() => { setMode('register'); setError(null); }}>Registruotis</button></p>
            <p><button type="button" className="text-stone-600 underline" onClick={() => { setMode('forgot'); setError(null); setSent(false); }}>Pamiršote slaptažodį?</button></p>
          </>
        )}
        {mode !== 'login' && (
          <p><button type="button" className="font-medium text-teal-800 underline" onClick={() => { setMode('login'); setError(null); }}>Grįžti į prisijungimą</button></p>
        )}
      </div>
    </Shell>
  );
}

/** Shown when the user arrives from a password-reset email (?token=…). */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <Shell title="Naujas slaptažodis">
      {done ? (
        <div className="space-y-4 text-center">
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Slaptažodis pakeistas. Galite prisijungti.</p>
          <Button className="w-full" onClick={onDone}>Prisijungti</Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError(null);
          try { await resetPassword(token, password); setDone(true); } catch (err) { setError(err); } finally { setBusy(false); }
        }}>
          <Field label="Naujas slaptažodis" hint="Bent 8 simboliai.">
            {(id) => <input id={id} type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />}
          </Field>
          {error != null && <ErrorBox error={error} />}
          <Button type="submit" className="w-full" disabled={busy}>Išsaugoti</Button>
        </form>
      )}
    </Shell>
  );
}
