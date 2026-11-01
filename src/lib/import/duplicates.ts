import { daysBetween } from '../dates';
import { normalizeMerchant } from '../merchant';
import { signedCents } from '../money';
import type { Transaction } from '../types';

export type DuplicateKind = 'none' | 'exact' | 'likely' | 'recurring';
export interface DuplicateMatch {
  kind: DuplicateKind;
  matchId?: string;
}
export interface DupCandidate {
  date: string;
  signedCents: number;
  merchants: string[];
}

interface PoolEntry {
  id: string;
  date: string;
  signedCents: number;
  recurring: boolean;
  merchants: string[];
}

/** Normalisiert Händlernamen und entfernt leere Einträge. */
function normalizedList(list: readonly string[]): string[] {
  return list.map((m) => normalizeMerchant(m)).filter((m) => m !== '');
}

/** Gleich oder einer enthält den anderen. */
function containsEither(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

/** Exakt: eine Liste leer -> true; sonst irgendein Paar gleich oder enthält einander. */
function merchantsExact(rowMerchants: string[], txMerchants: string[]): boolean {
  if (rowMerchants.length === 0 || txMerchants.length === 0) return true;
  return rowMerchants.some((a) => txMerchants.some((b) => containsEither(a, b)));
}

/** Gemeinsames Wort mit mindestens 4 Zeichen. */
function sharesLongWord(a: string, b: string): boolean {
  const wordsB = new Set(b.split(' ').filter((w) => w.length >= 4));
  return a.split(' ').some((w) => w.length >= 4 && wordsB.has(w));
}

/** Ähnlich: beide Listen nicht leer; ein Paar enthält einander oder hat ein gemeinsames Wort (Länge >= 4). */
function merchantsSimilar(rowMerchants: string[], txMerchants: string[]): boolean {
  if (rowMerchants.length === 0 || txMerchants.length === 0) return false;
  return rowMerchants.some((a) =>
    txMerchants.some((b) => containsEither(a, b) || sharesLongWord(a, b)),
  );
}

type Kind = Exclude<DuplicateKind, 'none'>;

/** Erste passende (exact) bzw. nächste passende (recurring, likely) noch nicht verbrauchte Buchung. */
function findBest(row: DupCandidate, kind: Kind, used: Set<string>, pool: PoolEntry[]): string | null {
  let best: PoolEntry | null = null;
  let bestDist = Infinity;
  for (const tx of pool) {
    if (used.has(tx.id) || tx.signedCents !== row.signedCents) continue;
    const dist = Math.abs(daysBetween(row.date, tx.date));
    if (kind === 'exact') {
      if (tx.date === row.date && merchantsExact(row.merchants, tx.merchants)) return tx.id;
      continue;
    }
    if (kind === 'recurring') {
      if (!tx.recurring || dist > 5) continue;
    } else {
      if (dist > 3 || !merchantsSimilar(row.merchants, tx.merchants)) continue;
    }
    if (dist < bestDist) {
      best = tx;
      bestDist = dist;
    }
  }
  return best ? best.id : null;
}

/**
 * Drei globale Durchläufe (exact, dann recurring, dann likely); jede bestehende Buchung höchstens einmal (Set usedIds).
 * Vergleichswerte einer bestehenden Buchung: signedCents(tx), Händler [tx.merchant, tx.originalText].
 * Händlerlisten werden normalisiert (normalizeMerchant) und leere Einträge entfernt.
 * exact:     gleiche date, gleicher signedCents, merchantsMatch. Erste passende Buchung in Listenreihenfolge.
 * recurring: tx.recurringId !== null, gleicher signedCents, |daysBetween| <= 5. Händler egal. Kleinster Abstand, bei Gleichstand die erste.
 * likely:    gleicher signedCents, |daysBetween| <= 3, merchantsSimilar. Kleinster Abstand, dann erste.
 */
export function markDuplicates(rows: DupCandidate[], existing: Transaction[]): DuplicateMatch[] {
  const pool: PoolEntry[] = existing.map((tx) => ({
    id: tx.id,
    date: tx.date,
    signedCents: signedCents(tx),
    recurring: tx.recurringId !== null,
    merchants: normalizedList([tx.merchant, tx.originalText]),
  }));
  const candidates: DupCandidate[] = rows.map((row) => ({
    date: row.date,
    signedCents: row.signedCents,
    merchants: normalizedList(row.merchants),
  }));

  const result: DuplicateMatch[] = rows.map(() => ({ kind: 'none' }));
  const used = new Set<string>();

  for (const kind of ['exact', 'recurring', 'likely'] as const) {
    candidates.forEach((row, i) => {
      if (result[i].kind !== 'none') return;
      const id = findBest(row, kind, used, pool);
      if (id !== null) {
        used.add(id);
        result[i] = { kind, matchId: id };
      }
    });
  }
  return result;
}
