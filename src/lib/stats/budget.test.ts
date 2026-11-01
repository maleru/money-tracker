import { describe, expect, it } from 'vitest';
import type { Category, Transaction, TxType } from '../types';
import { budgetStatus } from './budget';

function cat(id: string, sortOrder: number, budget: number | null, extra: Partial<Category> = {}): Category {
  return {
    id,
    name: id,
    type: 'expense',
    icon: '🛒',
    color: '#112233',
    archived: false,
    sortOrder,
    monthlyBudgetCents: budget,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

let counter = 0;
function tx(type: TxType, amountCents: number, date: string, categoryId: string): Transaction {
  counter += 1;
  return {
    id: 't' + counter,
    type,
    amountCents,
    date,
    categoryId,
    merchant: '',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('budgetStatus', () => {
  it('ohne Budgets leer', () => {
    expect(budgetStatus([tx('expense', 100, '2026-10-01', 'a')], [cat('a', 0, null)], '2026-10')).toEqual([]);
  });

  it('Kategorie ohne Buchungen: spent 0, ok', () => {
    expect(budgetStatus([], [cat('a', 0, 10000)], '2026-10')).toEqual([
      { categoryId: 'a', budgetCents: 10000, spentCents: 0, ratio: 0, level: 'ok' },
    ]);
  });

  it('level-Grenzen: 79,99 % ok, 80 % warn, 100 % warn, 100,01 % over', () => {
    const cats = [cat('a', 0, 10000), cat('b', 1, 10000), cat('c', 2, 10000), cat('d', 3, 10000)];
    const txs = [
      tx('expense', 7999, '2026-10-02', 'a'),
      tx('expense', 8000, '2026-10-02', 'b'),
      tx('expense', 10000, '2026-10-02', 'c'),
      tx('expense', 10001, '2026-10-02', 'd'),
    ];
    const s = budgetStatus(txs, cats, '2026-10');
    expect(s.map((x) => x.level)).toEqual(['ok', 'warn', 'warn', 'over']);
    expect(s[2].ratio).toBe(1);
    expect(s[3].ratio).toBeGreaterThan(1);
  });

  it('zählt nur Ausgaben im gewählten Monat und summiert', () => {
    const txs = [
      tx('expense', 3000, '2026-10-01', 'a'),
      tx('expense', 2000, '2026-10-31', 'a'),
      tx('expense', 9999, '2026-09-30', 'a'),
      tx('expense', 9999, '2026-11-01', 'a'),
      tx('income', 9999, '2026-10-05', 'a'),
    ];
    const s = budgetStatus(txs, [cat('a', 0, 10000)], '2026-10');
    expect(s).toHaveLength(1);
    expect(s[0].spentCents).toBe(5000);
    expect(s[0].ratio).toBe(0.5);
    expect(s[0].level).toBe('ok');
  });

  it('ignoriert archivierte und Einnahmen-Kategorien', () => {
    const cats = [
      cat('a', 0, 1000),
      cat('arch', 1, 1000, { archived: true }),
      cat('inc', 2, 1000, { type: 'income' }),
    ];
    expect(budgetStatus([], cats, '2026-10').map((s) => s.categoryId)).toEqual(['a']);
  });

  it('sortiert nach sortOrder', () => {
    const cats = [cat('z', 5, 1000), cat('a', 1, 1000), cat('m', 3, 1000)];
    expect(budgetStatus([], cats, '2026-10').map((s) => s.categoryId)).toEqual(['a', 'm', 'z']);
  });

  it('verändert die Eingabe nicht', () => {
    const cats = [cat('z', 5, 1000), cat('a', 1, 1000)];
    budgetStatus([], cats, '2026-10');
    expect(cats.map((c) => c.id)).toEqual(['z', 'a']);
  });
});
