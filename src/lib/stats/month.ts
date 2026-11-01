import { rootCategoryId } from '../categoryTree';
import { monthKey } from '../dates';
import type { Category, Transaction, TxType } from '../types';

export interface CategoryTotal {
  categoryId: string;
  totalCents: number;
  count: number;
  share: number; // 0..1, bezogen auf die Summe des jeweiligen Typs
}

export interface MonthSummary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number; // income - expense
  savingsRate: number | null; // balance / income, null wenn income === 0
  expenseByCategory: CategoryTotal[]; // absteigend nach totalCents, Gleichstand nach categoryId
  incomeByCategory: CategoryTotal[];
  count: number;
}

type CatMap = ReadonlyMap<string, Category>;

interface Group {
  totalCents: number;
  count: number;
}

export function inMonth(tx: Transaction, month: string): boolean {
  return monthKey(tx.date) === month;
}

function addTo(groups: Map<string, Group>, key: string, cents: number): void {
  const entry = groups.get(key);
  if (entry) {
    entry.totalCents += cents;
    entry.count += 1;
  } else {
    groups.set(key, { totalCents: cents, count: 1 });
  }
}

function toTotals(groups: Map<string, Group>, total: number): CategoryTotal[] {
  const list: CategoryTotal[] = [...groups.entries()].map(([categoryId, e]) => ({
    categoryId,
    totalCents: e.totalCents,
    count: e.count,
    share: total === 0 ? 0 : e.totalCents / total,
  }));
  list.sort(
    (a, b) =>
      b.totalCents - a.totalCents || (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0),
  );
  return list;
}

/** Summen je Hauptkategorie (Unterkategorien werden über rootCategoryId zusammengefasst). */
function totalsByCategory(
  txs: Transaction[],
  type: TxType,
  cats: CatMap,
): { total: number; list: CategoryTotal[] } {
  const groups = new Map<string, Group>();
  let total = 0;
  for (const tx of txs) {
    if (tx.type !== type) continue;
    total += tx.amountCents;
    addTo(groups, rootCategoryId(tx.categoryId, cats), tx.amountCents);
  }
  return { total, list: toTotals(groups, total) };
}

/** Gemeinsam genutzt (auch für das Jahr). */
export function summarizeTransactions(
  txs: Transaction[],
  cats: CatMap = new Map<string, Category>(),
): Omit<MonthSummary, 'month'> {
  const expense = totalsByCategory(txs, 'expense', cats);
  const income = totalsByCategory(txs, 'income', cats);
  const balanceCents = income.total - expense.total;
  return {
    incomeCents: income.total,
    expenseCents: expense.total,
    balanceCents,
    savingsRate: income.total === 0 ? null : balanceCents / income.total,
    expenseByCategory: expense.list,
    incomeByCategory: income.list,
    count: txs.length,
  };
}

export function summarizeMonth(
  txs: Transaction[],
  month: string,
  cats: CatMap = new Map<string, Category>(),
): MonthSummary {
  return { month, ...summarizeTransactions(txs.filter((tx) => inMonth(tx, month)), cats) };
}

/**
 * Aufteilung einer Hauptkategorie nach Unterkategorien. Berücksichtigt Buchungen mit rootCategoryId === rootId
 * und tx.type === Typ der Hauptkategorie. Einträge: categoryId = Kind-id oder rootId („Ohne Unterkategorie“).
 * share bezogen auf die Summe dieser Hauptkategorie. Sortierung wie expenseByCategory.
 * Unbekannte Hauptkategorie -> [].
 */
export function subcategoryBreakdown(txs: Transaction[], rootId: string, cats: CatMap): CategoryTotal[] {
  const root = cats.get(rootId);
  if (!root) return [];
  const groups = new Map<string, Group>();
  let total = 0;
  for (const tx of txs) {
    if (tx.type !== root.type) continue;
    if (rootCategoryId(tx.categoryId, cats) !== rootId) continue;
    total += tx.amountCents;
    addTo(groups, tx.categoryId, tx.amountCents);
  }
  return toTotals(groups, total);
}
