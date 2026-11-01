import { monthKey } from '../dates';
import type { Transaction, TxType } from '../types';

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

export function inMonth(tx: Transaction, month: string): boolean {
  return monthKey(tx.date) === month;
}

function totalsByCategory(txs: Transaction[], type: TxType): { total: number; list: CategoryTotal[] } {
  const byId = new Map<string, { totalCents: number; count: number }>();
  let total = 0;
  for (const tx of txs) {
    if (tx.type !== type) continue;
    total += tx.amountCents;
    const entry = byId.get(tx.categoryId);
    if (entry) {
      entry.totalCents += tx.amountCents;
      entry.count += 1;
    } else {
      byId.set(tx.categoryId, { totalCents: tx.amountCents, count: 1 });
    }
  }
  const list: CategoryTotal[] = [...byId.entries()].map(([categoryId, e]) => ({
    categoryId,
    totalCents: e.totalCents,
    count: e.count,
    share: total === 0 ? 0 : e.totalCents / total,
  }));
  list.sort(
    (a, b) =>
      b.totalCents - a.totalCents || (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0),
  );
  return { total, list };
}

/** Gemeinsam genutzt (auch für das Jahr). */
export function summarizeTransactions(txs: Transaction[]): Omit<MonthSummary, 'month'> {
  const expense = totalsByCategory(txs, 'expense');
  const income = totalsByCategory(txs, 'income');
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

export function summarizeMonth(txs: Transaction[], month: string): MonthSummary {
  return { month, ...summarizeTransactions(txs.filter((tx) => inMonth(tx, month))) };
}
