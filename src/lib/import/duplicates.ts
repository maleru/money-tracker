import type { Transaction } from '../types';
import { normalizeMerchant } from '../merchant';
import type { ParsedRow } from './parse';

function key(date: string, type: string, amountCents: number): string {
  return `${date}|${type}|${amountCents}`;
}

/** Gleich, enthalten oder mindestens einer leer (normalisierte Händler). */
function merchantsMatch(a: string, b: string): boolean {
  if (a === '' || b === '') return true;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Markiert Import-Zeilen, die bereits als Buchung existieren (Schlüssel date|type|amountCents + Händler-Abgleich).
 * Multiset-Logik: jede bestehende Buchung markiert höchstens eine Import-Zeile.
 */
export function markDuplicates(rows: ParsedRow[], existing: Transaction[]): boolean[] {
  const buckets = new Map<string, string[]>(); // Schlüssel -> normalisierte Händler (noch nicht verbraucht)
  for (const tx of existing) {
    const k = key(tx.date, tx.type, tx.amountCents);
    const list = buckets.get(k);
    const merchant = normalizeMerchant(tx.merchant);
    if (list) list.push(merchant);
    else buckets.set(k, [merchant]);
  }

  return rows.map((row) => {
    const list = buckets.get(key(row.date, row.type, row.amountCents));
    if (!list) return false;
    const merchant = normalizeMerchant(row.merchant);
    const idx = list.findIndex((m) => merchantsMatch(merchant, m));
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  });
}
