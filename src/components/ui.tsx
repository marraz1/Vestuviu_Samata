// Small shared UI pieces. Colours: teal = primary, green/amber/red = status.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatEur, parseEur } from '../domain/money';
import type { Level } from '../domain/warnings';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-stone-400',
    secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
    danger: 'bg-red-700 text-white hover:bg-red-800',
    ghost: 'text-teal-800 hover:bg-teal-50',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-800">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-xs text-stone-500">{hint}</p>}
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export const inputClass =
  'block w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:border-teal-700';

/** Money input that edits in euros and reports cents (null when empty). */
export function MoneyInput({
  id, value, onChange, placeholder, required, autoFocus,
}: { id: string; value: number | null; onChange: (cents: number | null) => void; placeholder?: string; required?: boolean; autoFocus?: boolean }) {
  const toText = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, ''));
  const [text, setText] = useState(toText(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { setText(toText(value)); last.current = value; }
  }, [value]);
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={`${inputClass} pr-8`}
        value={text}
        placeholder={placeholder ?? '0'}
        required={required}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          const c = e.target.value.trim() === '' ? null : parseEur(e.target.value);
          if (c !== null || e.target.value.trim() === '') { last.current = c; onChange(c); }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-500">€</span>
    </div>
  );
}

export function Money({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatEur(cents)}</span>;
}

const levelStyle: Record<Level, string> = {
  green: 'bg-green-100 text-green-900',
  yellow: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-900',
};

export function Chip({ level, children }: { level: Level | 'neutral'; children: ReactNode }) {
  const s = level === 'neutral' ? 'bg-stone-200 text-stone-800' : levelStyle[level];
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s}`}>{children}</span>;
}

export function ProgressBar({ pct, level, label }: { pct: number; level: Level; label: string }) {
  const color = { green: 'bg-green-600', yellow: 'bg-amber-500', red: 'bg-red-600' }[level];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-label={label}
      aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`}>{children}</div>;
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Kraunama…' }: { label?: string }) {
  return <p className="py-10 text-center text-stone-500" role="status">{label}</p>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{msg}</p>;
}

/** Bottom sheet on phones, centred dialog on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl p-0 backdrop:bg-black/40 md:m-auto md:max-w-lg md:rounded-2xl"
      aria-label={title}
    >
      <div className="max-h-[90vh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-2xl leading-none text-stone-500 hover:bg-stone-100" aria-label="Uždaryti">×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

// ---------- toasts with optional undo ----------

interface Toast { id: number; text: string; undo?: () => void }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts([{ ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.undo ? 10_000 : 4_000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
            <span>{t.text}</span>
            {t.undo && (
              <button type="button" className="font-semibold text-teal-300"
                onClick={() => { t.undo!(); setToasts((all) => all.filter((x) => x.id !== t.id)); }}>
                Atšaukti
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
