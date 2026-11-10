import type { Cents } from './types';

const eur = new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR' });
const dateFmt = new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });

/** 125000 → "1 250,00 €" (lt-LT uses a narrow no-break space as the group separator). */
export function formatEur(cents: Cents): string {
  return eur.format(cents / 100);
}

/** Parses user input such as "1 250,50", "1250.5" or "1250" into cents. Returns null if invalid. */
export function parseEur(input: string): Cents | null {
  const cleaned = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00`));
}

/** Rounds a cents value multiplied by a percentage, half away from zero. */
export function pctOf(cents: Cents, pct: number): Cents {
  return Math.round((cents * pct) / 100);
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}
