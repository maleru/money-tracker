import { describe, expect, it } from 'vitest';
import type { Transaction, TxType } from '../types';
import { inMonth, summarizeMonth, summarizeTransactions } from './month';

let counter = 0;
function tx(type: TxType, amountCents: number, date: string, categoryId: string): Transaction {
  counter += 1;
  return {
    id: 't' + counter,
    type,
    amountCents,
    date,
    categoryId,
    accountId: 'acc-checking',
    direction: null,
    merchant: '',
    originalText: '',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('inMonth', () => {
  it('prüft den Monatsschlüssel', () => {
    expect(inMonth(tx('expense', 100, '2026-10-31', 'a'), '2026-10')).toBe(true);
    expect(inMonth(tx('expense', 100, '2026-11-01', 'a'), '2026-10')).toBe(false);
  });
});

describe('summarizeMonth', () => {
  it('leerer Monat ergibt nur Nullen und savingsRate null', () => {
    const s = summarizeMonth([], '2026-10');
    expect(s).toEqual({
      month: '2026-10',
      incomeCents: 0,
      expenseCents: 0,
      balanceCents: 0,
      savingsRate: null,
      expenseByCategory: [],
      incomeByCategory: [],
      count: 0,
    });
  });

  it('ignoriert Buchungen anderer Monate', () => {
    const txs = [
      tx('expense', 500, '2026-10-05', 'a'),
      tx('expense', 700, '2026-09-30', 'a'),
      tx('income', 900, '2026-11-01', 'b'),
    ];
    const s = summarizeMonth(txs, '2026-10');
    expect(s.count).toBe(1);
    expect(s.expenseCents).toBe(500);
    expect(s.incomeCents).toBe(0);
    expect(s.balanceCents).toBe(-500);
  });

  it('berechnet Summen, Saldo und Sparquote (1000 Einnahmen, 250 Ausgaben => 0.75)', () => {
    const txs = [tx('income', 100000, '2026-10-01', 'salary'), tx('expense', 25000, '2026-10-02', 'food')];
    const s = summarizeMonth(txs, '2026-10');
    expect(s.incomeCents).toBe(100000);
    expect(s.expenseCents).toBe(25000);
    expect(s.balanceCents).toBe(75000);
    expect(s.savingsRate).toBe(0.75);
  });

  it('Sparquote ist negativ, wenn mehr ausgegeben als eingenommen wird', () => {
    const txs = [tx('income', 1000, '2026-10-01', 'salary'), tx('expense', 1500, '2026-10-02', 'food')];
    expect(summarizeMonth(txs, '2026-10').savingsRate).toBe(-0.5);
  });

  it('Sparquote ist null ohne Einnahmen', () => {
    expect(summarizeMonth([tx('expense', 1500, '2026-10-02', 'food')], '2026-10').savingsRate).toBeNull();
  });
});

describe('summarizeTransactions', () => {
  it('gruppiert nach Kategorie, sortiert absteigend und bei Gleichstand nach categoryId', () => {
    const txs = [
      tx('expense', 100, '2026-10-01', 'c'),
      tx('expense', 100, '2026-10-02', 'b'),
      tx('expense', 300, '2026-10-03', 'a'),
      tx('expense', 200, '2026-10-04', 'a'),
      tx('expense', 50, '2026-10-05', 'z'),
    ];
    const s = summarizeTransactions(txs);
    expect(s.expenseByCategory.map((c) => c.categoryId)).toEqual(['a', 'b', 'c', 'z']);
    expect(s.expenseByCategory[0]).toMatchObject({ categoryId: 'a', totalCents: 500, count: 2 });
  });

  it('share bezieht sich auf die Summe des jeweiligen Typs und summiert sich auf 1', () => {
    const txs = [
      tx('expense', 333, '2026-10-01', 'a'),
      tx('expense', 333, '2026-10-02', 'b'),
      tx('expense', 334, '2026-10-03', 'c'),
      tx('income', 1000, '2026-10-04', 'x'),
      tx('income', 3000, '2026-10-05', 'y'),
    ];
    const s = summarizeTransactions(txs);
    const expenseSum = s.expenseByCategory.reduce((sum, c) => sum + c.share, 0);
    const incomeSum = s.incomeByCategory.reduce((sum, c) => sum + c.share, 0);
    expect(Math.abs(expenseSum - 1)).toBeLessThan(1e-9);
    expect(Math.abs(incomeSum - 1)).toBeLessThan(1e-9);
    expect(s.incomeByCategory[0]).toMatchObject({ categoryId: 'y', share: 0.75 });
    expect(s.expenseByCategory[0].share).toBeCloseTo(0.334, 9);
  });
});
