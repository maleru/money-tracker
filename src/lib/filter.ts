import { rootCategoryId } from './categoryTree';
import { monthKey } from './dates';
import { centsToInput, surplusCents } from './money';
import type { Category, Transaction, TxType } from './types';

export interface TxFilter {
  /** Ist year gesetzt, gilt es vor month: gefiltert wird das ganze Jahr. */
  year: number | null;
  month: string | null;
  type: 'all' | TxType;
  categoryId: string | null;
  /** false: categoryId passt auch auf Unterkategorien (rootCategoryId). true: nur exakt. */
  categoryExact: boolean;
  accountId: string | null;
  search: string;
}

/** year gesetzt = ganzes Jahr (hat Vorrang vor month). month null (und year null) = alle Monate. Suche case-insensitive über merchant, note, city, Kategoriename und centsToInput(amountCents) (z.B. '42,15'). */
export function filterTransactions(txs: Transaction[], cats: Map<string, Category>, f: TxFilter): Transaction[] {
  const needle = f.search.trim().toLowerCase();
  const yearPrefix = f.year === null ? null : String(f.year).padStart(4, '0') + '-';
  return txs.filter((tx) => {
    if (yearPrefix !== null) {
      if (!tx.date.startsWith(yearPrefix)) return false;
    } else if (f.month !== null && monthKey(tx.date) !== f.month) return false;
    if (f.type !== 'all' && tx.type !== f.type) return false;
    if (f.categoryId !== null) {
      const matches =
        tx.categoryId === f.categoryId || (!f.categoryExact && rootCategoryId(tx.categoryId, cats) === f.categoryId);
      if (!matches) return false;
    }
    if (f.accountId !== null && tx.accountId !== f.accountId) return false;
    if (needle === '') return true;
    const haystack = [tx.merchant, tx.note, tx.city, cats.get(tx.categoryId)?.name ?? '', centsToInput(tx.amountCents)];
    return haystack.some((s) => s.toLowerCase().includes(needle));
  });
}

export interface DayGroup {
  date: string;
  items: Transaction[];
  surplusCents: number; // Summe surplusCents (Umbuchungen = 0)
  hasSurplusItems: boolean; // mind. eine Einnahme oder Ausgabe an diesem Tag
}

/** Behält Eingabereihenfolge (Store ist date desc). surplusCents = Einnahmen − Ausgaben des Tages, ohne Umbuchungen. */
export function groupByDay(txs: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const byDate = new Map<string, DayGroup>();
  for (const tx of txs) {
    let group = byDate.get(tx.date);
    if (!group) {
      group = { date: tx.date, items: [], surplusCents: 0, hasSurplusItems: false };
      byDate.set(tx.date, group);
      groups.push(group);
    }
    group.items.push(tx);
    group.surplusCents += surplusCents(tx);
    if (tx.type !== 'transfer') group.hasSurplusItems = true;
  }
  return groups;
}

/** Einnahmen − Ausgaben, Umbuchungen nicht enthalten. */
export function sumSurplus(txs: Transaction[]): number {
  return txs.reduce((sum, tx) => sum + surplusCents(tx), 0);
}

export function hasSurplusItems(txs: Transaction[]): boolean {
  return txs.some((tx) => tx.type !== 'transfer');
}
