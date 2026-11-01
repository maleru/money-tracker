import type { TxDirection, TxType } from './types';

const MAX_CENTS = 99_999_999_99;
const MINUS = '\u2212';

const currencyFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** Liefert positive Cents oder null. Vorzeichen, Leerzeichen, '€' werden ignoriert. 0 => null. */
export function parseAmountToCents(input: string): number | null {
  let s = input.replace(/[\s€+\-−]/g, '');
  if (s === '') return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Das zuletzt vorkommende Zeichen ist der Dezimaltrenner, das andere wird entfernt.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (s.split(',').length > 2) return null;
    s = s.replace(',', '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    } else if (s.split('.').length > 2) {
      return null;
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [intPart, fracPart = ''] = s.split('.');
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  if (cents === 0 || cents > MAX_CENTS) return null;
  return cents;
}

/** "42,15 €"; mit sign:'always' => "+42,15 €" / "−42,15 €" (U+2212 Minus). */
export function formatCents(cents: number, opts?: { sign?: 'auto' | 'always' }): string {
  const text = currencyFormat.format(Math.abs(cents) / 100);
  if (cents < 0) return MINUS + text;
  if (opts?.sign === 'always') return '+' + text;
  return text;
}

/** Vorbelegung fürs Betragsfeld: 4215 -> "42,15", 123456 -> "1234,56" (ohne Tausenderpunkt, Währung und Vorzeichen). */
export function centsToInput(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${whole},${frac}`;
}

/** expense negativ, income positiv, transfer: out negativ, in positiv. */
export function signedCents(tx: { type: TxType; amountCents: number; direction?: TxDirection | null }): number {
  if (tx.type === 'expense') return -tx.amountCents;
  if (tx.type === 'income') return tx.amountCents;
  return tx.direction === 'in' ? tx.amountCents : -tx.amountCents;
}

/** Beitrag zum Überschuss: income positiv, expense negativ, transfer immer 0 (Umbuchungen sind weder Einnahme noch Ausgabe). */
export function surplusCents(tx: { type: TxType; amountCents: number; direction?: TxDirection | null }): number {
  if (tx.type === 'income') return tx.amountCents;
  if (tx.type === 'expense') return -tx.amountCents;
  return 0;
}
