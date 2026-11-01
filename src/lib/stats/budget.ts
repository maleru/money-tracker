import type { Category, Transaction } from '../types';
import { inMonth } from './month';

export interface BudgetStatus {
  categoryId: string;
  budgetCents: number;
  spentCents: number;
  ratio: number;
  level: 'ok' | 'warn' | 'over';
}

/** Für alle nicht archivierten Ausgaben-Kategorien mit monthlyBudgetCents != null. ratio = spent/budget; level ok <0.8, warn 0.8..1.0 (inkl. 1.0), over >1.0. Sortiert nach sortOrder. */
export function budgetStatus(txs: Transaction[], cats: Category[], month: string): BudgetStatus[] {
  const spent = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== 'expense' || !inMonth(tx, month)) continue;
    spent.set(tx.categoryId, (spent.get(tx.categoryId) ?? 0) + tx.amountCents);
  }

  const result: BudgetStatus[] = [];
  const budgeted = cats
    .filter((c) => c.type === 'expense' && !c.archived && c.monthlyBudgetCents !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const c of budgeted) {
    const budgetCents = c.monthlyBudgetCents;
    // Budget 0 oder negativ ist kein sinnvolles Budget (im Formular nicht erfassbar) und wird übersprungen.
    if (budgetCents === null || budgetCents <= 0) continue;
    const spentCents = spent.get(c.id) ?? 0;
    const ratio = spentCents / budgetCents;
    result.push({
      categoryId: c.id,
      budgetCents,
      spentCents,
      ratio,
      level: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok',
    });
  }
  return result;
}
