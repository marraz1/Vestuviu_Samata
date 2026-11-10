import { Link } from 'react-router-dom';
import { Card, Chip, ErrorBox, Money, PageTitle, Spinner } from '../components/ui';
import { formatDate } from '../domain/money';
import { dueState, monthlyCalendar } from '../domain/payments';
import { lt } from '../i18n/lt';
import { useBundle, useSummary } from '../lib/data';
import { useWedding } from '../lib/session';

// Nominative month name, e.g. "Lapkritis 2026"
const MONTHS = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export function PaymentsCalendar() {
  const { weddingId } = useWedding();
  const q = useBundle(weddingId);
  const s = useSummary(q.data);
  if (q.isPending) return <Spinner />;
  if (q.isError || !s) return <ErrorBox error={q.error} />;

  const months = monthlyCalendar(s.payments, s.today, s.wedding.date);
  const titles = Object.fromEntries(s.expenses.map((e) => [e.id, e.title]));
  const undated = s.payments.filter((p) => !p.isPaid && !p.dueDate);

  return (
    <section>
      <PageTitle>{lt.nav.calendar}</PageTitle>
      <p className="mb-4 text-sm text-stone-600">Kiek ir kada reikia sumokėti kiekvieną mėnesį iki vestuvių. Pradelsti mokėjimai rodomi šio mėnesio sąraše.</p>
      {s.payments.length === 0 && <Card className="text-center text-stone-700">Mokėjimų dar nėra. Juos pridėsite atidarę išlaidą.</Card>}
      <ol className="space-y-3">
        {months.map((m) => (
          <li key={m.month}>
            <Card className="p-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{monthName(m.month)}</h2>
                <span className="text-sm">
                  {m.dueCents > 0 ? <>Mokėti <Money cents={m.dueCents} className="font-semibold" /></> : <span className="text-stone-500">Mokėjimų nėra</span>}
                </span>
              </div>
              {m.payments.length > 0 && (
                <ul className="mt-2 divide-y divide-stone-100">
                  {m.payments.map((p) => {
                    const st = dueState(p, s.today);
                    return (
                      <li key={p.id}>
                        <Link to={`/islaidos/${p.expenseId}`} className="flex items-center gap-2 py-2 text-sm">
                          <span className="w-16 shrink-0 text-stone-600">{p.dueDate ? formatDate(p.dueDate).slice(5) : ''}</span>
                          <span className={`min-w-0 flex-1 truncate ${p.isPaid ? 'text-stone-500 line-through' : ''}`}>{titles[p.expenseId]}</span>
                          {st === 'overdue' && <Chip level="red">Pradelsta</Chip>}
                          {st === 'soon' && <Chip level="yellow">Artėja</Chip>}
                          {st === 'paid' && <Chip level="green">Sumokėta</Chip>}
                          <Money cents={p.amountCents} className="font-medium" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </li>
        ))}
      </ol>
      {undated.length > 0 && (
        <Card className="mt-3 p-3">
          <h2 className="font-semibold">Be termino</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {undated.map((p) => (
              <li key={p.id}><Link to={`/islaidos/${p.expenseId}`} className="flex justify-between py-2 text-sm"><span>{titles[p.expenseId]}</span><Money cents={p.amountCents} /></Link></li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
