import { Link } from 'react-router-dom';
import { Card, Chip, ErrorBox, Money, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { QuickAddButton } from './Expenses';
import { formatDate } from '../domain/money';
import { daysUntil } from '../domain/guests';
import { dueState, upcomingPayments } from '../domain/payments';
import { usageLevel } from '../domain/warnings';
import { useBundle, useSummary } from '../lib/data';
import { useWedding } from '../lib/session';

function Kpi({ label, cents, emphasis, className = '' }: { label: string; cents: number; emphasis?: 'red' | 'green'; className?: string }) {
  const color = emphasis === 'red' ? 'text-red-700' : emphasis === 'green' ? 'text-green-800' : 'text-stone-900';
  return (
    <Card className={`p-3 ${className}`}>
      <p className="text-xs text-stone-600">{label}</p>
      <p className={`mt-1 text-lg font-semibold sm:text-xl ${color}`}><Money cents={cents} /></p>
    </Card>
  );
}

export function Dashboard() {
  const { weddingId } = useWedding();
  const q = useBundle(weddingId);
  const s = useSummary(q.data);
  if (q.isPending) return <Spinner />;
  if (q.isError || !s) return <ErrorBox error={q.error} />;

  const { wedding, forecast } = s;
  const over = forecast.differenceCents > 0;
  const days = wedding.date ? daysUntil(s.today, wedding.date) : null;
  const upcoming = upcomingPayments(s.payments, s.today, 30).slice(0, 5);
  const titles = Object.fromEntries(s.expenses.map((e) => [e.id, e.title]));
  const level = usageLevel(forecast.usagePct);

  return (
    <section>
      <PageTitle action={days != null && days >= 0 ? <Chip level="neutral">Liko {days} d.</Chip> : undefined}>
        {wedding.name}
      </PageTitle>
      {wedding.date && <p className="-mt-3 mb-4 text-sm text-stone-600">{formatDate(wedding.date)}{wedding.venue ? ` · ${wedding.venue}` : ''} · {wedding.guestCount} svečių</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Biudžetas" cents={forecast.budgetCents} />
        <Kpi label="Prognozė" cents={forecast.totalCents} emphasis={over ? 'red' : undefined} />
        <Kpi label="Sutarta" cents={s.contractedCents} />
        <Kpi label="Sumokėta" cents={s.paidCents} emphasis="green" />
        <Kpi label="Liko mokėti" cents={s.remainingCents} className="col-span-2 md:col-span-1" />
      </div>

      <Card className="mt-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span>Biudžeto panaudojimas (su {wedding.reservePct} % rezervu)</span>
          <span className="whitespace-nowrap font-semibold tabular-nums">{Math.round(forecast.usagePct)} %</span>
        </div>
        <ProgressBar pct={forecast.usagePct} level={level} label="Biudžeto panaudojimas" />
        <p className={`mt-2 text-sm ${over ? 'text-red-700' : 'text-stone-600'}`}>
          {over ? <>Viršijama <Money cents={forecast.differenceCents} /></> : <>Dar liko <Money cents={-forecast.differenceCents} /></>}
        </p>
      </Card>

      {s.warnings.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">Įspėjimai</h2>
          <ul className="space-y-2">
            {s.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Chip level={w.level}>{w.level === 'red' ? '!' : 'i'}</Chip>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Artimiausi mokėjimai</h2>
          <Link to="/mokejimai" className="text-sm text-teal-800 underline">Visi</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-stone-600">Per artimiausias 30 dienų mokėjimų nėra.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {upcoming.map((p) => (
              <li key={p.id}>
                <Link to={`/islaidos/${p.expenseId}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{titles[p.expenseId]}</span>
                    <span className="text-xs text-stone-600">{formatDate(p.dueDate!)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {dueState(p, s.today) === 'overdue' && <Chip level="red">Pradelsta</Chip>}
                    <Money cents={p.amountCents} className="text-sm font-semibold" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {s.expenses.length === 0 && (
        <Card className="mt-4 text-center">
          <p className="text-stone-700">Dar nėra išlaidų. Pridėkite pirmą – užtenka pavadinimo, kategorijos ir sumos.</p>
        </Card>
      )}
      <QuickAddButton />
    </section>
  );
}
