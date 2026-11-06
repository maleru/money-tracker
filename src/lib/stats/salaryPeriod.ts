import { rootCategoryId } from '../categoryTree';
import { addDays, addMonthsToDate, daysBetween } from '../dates';
import type { Category, Transaction } from '../types';
import { summarizeTransactions } from './month';

export const SALARY_CATEGORY_ID = 'cat-salary';
export const SALARY_MERGE_DAYS = 7; // Gehaltsbuchungen innerhalb von 7 Tagen = ein Eingang
export const SALARY_MAX_AGE_DAYS = 45; // älter → kein aktueller Gehaltszeitraum

export interface SalaryPeriod {
  start: string;
  end: string;
  isCurrent: boolean;
  nextExpected: string | null;
}

function catMap(cats: Category[]): Map<string, Category> {
  return new Map(cats.map((c) => [c.id, c]));
}

/** Einnahme, deren Hauptkategorie das Gehalt ist. */
export function isSalaryTx(tx: Transaction, cats: Category[]): boolean {
  return tx.type === 'income' && rootCategoryId(tx.categoryId, catMap(cats)) === SALARY_CATEGORY_ID;
}

/** Aufsteigende Gehaltseingänge; Buchungen innerhalb von SALARY_MERGE_DAYS nach dem letzten Eingang zählen nicht. */
export function salaryStartDates(txs: Transaction[], cats: Category[]): string[] {
  const dates = txs
    .filter((tx) => isSalaryTx(tx, cats))
    .map((tx) => tx.date)
    .sort();
  const starts: string[] = [];
  for (const d of dates) {
    const last = starts[starts.length - 1];
    if (last !== undefined && daysBetween(last, d) <= SALARY_MERGE_DAYS) continue;
    starts.push(d);
  }
  return starts;
}

/** Gehaltszeiträume aufsteigend. Startdaten nach today werden ignoriert. */
export function salaryPeriods(txs: Transaction[], cats: Category[], today: string): SalaryPeriod[] {
  const starts = salaryStartDates(txs, cats).filter((d) => d <= today);
  const periods: SalaryPeriod[] = [];
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k];
    const next = starts[k + 1];
    if (next !== undefined) {
      periods.push({ start, end: addDays(next, -1), isCurrent: false, nextExpected: null });
      continue;
    }
    if (daysBetween(start, today) <= SALARY_MAX_AGE_DAYS) {
      periods.push({ start, end: today, isCurrent: true, nextExpected: addMonthsToDate(start, 1) });
    } else {
      const monthEnd = addDays(addMonthsToDate(start, 1), -1);
      periods.push({ start, end: today < monthEnd ? today : monthEnd, isCurrent: false, nextExpected: null });
    }
  }
  return periods;
}

/** Zusammenfassung für Buchungen mit start <= date <= end (Grenzen eingeschlossen). */
export function summarizeRange(
  txs: Transaction[],
  start: string,
  end: string,
  cats: Category[],
): ReturnType<typeof summarizeTransactions> {
  const inRange = txs.filter((tx) => tx.date >= start && tx.date <= end);
  return summarizeTransactions(inRange, catMap(cats));
}
