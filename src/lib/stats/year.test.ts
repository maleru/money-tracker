import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction, TxType } from '../types';
import type { CategoryTotal } from './month';
import { compareCategories, summarizeYear, yearsWithData } from './year';

let counter = 0;
function tx(
  type: TxType,
  amountCents: number,
  date: string,
  categoryId: string,
  merchant = '',
): Transaction {
  counter += 1;
  return {
    id: 't' + counter,
    type,
    amountCents,
    date,
    categoryId,
    accountId: 'acc-checking',
    direction: null,
    merchant,
    originalText: '',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function total(categoryId: string, totalCents: number): CategoryTotal {
  return { categoryId, totalCents, count: 1, share: 0 };
}

describe('summarizeYear', () => {
  it('liefert immer 12 Monate Jan..Dez', () => {
    const s = summarizeYear([], 2026);
    expect(s.months).toHaveLength(12);
    expect(s.months[0].month).toBe('2026-01');
    expect(s.months[11].month).toBe('2026-12');
    expect(s.months.every((m) => m.incomeCents === 0 && m.expenseCents === 0 && m.balanceCents === 0)).toBe(true);
  });

  it('leeres Jahr: Nullen, savingsRate null, avg 0', () => {
    const s = summarizeYear([], 2026);
    expect(s.year).toBe(2026);
    expect(s.incomeCents).toBe(0);
    expect(s.expenseCents).toBe(0);
    expect(s.balanceCents).toBe(0);
    expect(s.savingsRate).toBeNull();
    expect(s.avgMonthlyExpenseCents).toBe(0);
    expect(s.topMerchants).toEqual([]);
    expect(s.expenseByCategory).toEqual([]);
    expect(s.incomeByCategory).toEqual([]);
  });

  it('summiert pro Monat und über das Jahr, ignoriert andere Jahre', () => {
    const txs = [
      tx('income', 300000, '2026-01-01', 'salary'),
      tx('expense', 10000, '2026-01-15', 'food'),
      tx('expense', 5000, '2026-03-02', 'food'),
      tx('income', 100000, '2026-03-05', 'salary'),
      tx('expense', 99999, '2025-12-31', 'food'),
      tx('expense', 99999, '2027-01-01', 'food'),
    ];
    const s = summarizeYear(txs, 2026);
    expect(s.incomeCents).toBe(400000);
    expect(s.expenseCents).toBe(15000);
    expect(s.balanceCents).toBe(385000);
    expect(s.savingsRate).toBeCloseTo(385000 / 400000);
    expect(s.months[0]).toEqual({ month: '2026-01', incomeCents: 300000, expenseCents: 10000, balanceCents: 290000 });
    expect(s.months[1]).toEqual({ month: '2026-02', incomeCents: 0, expenseCents: 0, balanceCents: 0 });
    expect(s.months[2]).toEqual({ month: '2026-03', incomeCents: 100000, expenseCents: 5000, balanceCents: 95000 });
    expect(s.expenseByCategory).toHaveLength(1);
    expect(s.expenseByCategory[0]).toMatchObject({ categoryId: 'food', totalCents: 15000, count: 2 });
    expect(s.incomeByCategory[0]).toMatchObject({ categoryId: 'salary', totalCents: 400000 });
  });

  it('Monatssummen ergeben die Jahressumme', () => {
    const txs = [
      tx('expense', 111, '2026-02-10', 'a'),
      tx('expense', 222, '2026-07-10', 'a'),
      tx('income', 5000, '2026-12-31', 'b'),
    ];
    const s = summarizeYear(txs, 2026);
    expect(s.months.reduce((sum, m) => sum + m.expenseCents, 0)).toBe(s.expenseCents);
    expect(s.months.reduce((sum, m) => sum + m.incomeCents, 0)).toBe(s.incomeCents);
    expect(s.months[11].incomeCents).toBe(5000);
  });

  it('avgMonthlyExpenseCents zählt nur Monate mit Buchungen und rundet', () => {
    // Zwei Monate mit Buchungen (Jan: Ausgabe, Mär: nur Einnahme), 1001 Cent Ausgaben -> 500,5 -> 501
    const txs = [tx('expense', 1001, '2026-01-10', 'a'), tx('income', 100, '2026-03-10', 'b')];
    const s = summarizeYear(txs, 2026);
    expect(s.avgMonthlyExpenseCents).toBe(501);
    expect(Number.isInteger(s.avgMonthlyExpenseCents)).toBe(true);
  });

  it('avgMonthlyExpenseCents: Monate ohne Buchungen zählen nicht', () => {
    const txs = [tx('expense', 3000, '2026-02-10', 'a'), tx('expense', 6000, '2026-11-10', 'a')];
    expect(summarizeYear(txs, 2026).avgMonthlyExpenseCents).toBe(4500);
  });

  it('gruppiert Top-Händler über normalizeMerchant ("Apple" und "APPLE" zusammen)', () => {
    const txs = [
      tx('expense', 1000, '2026-01-10', 'a', 'Apple'),
      tx('expense', 2000, '2026-02-10', 'a', 'APPLE'),
      tx('expense', 500, '2026-03-10', 'a', 'Apple'),
      tx('expense', 700, '2026-03-11', 'a', 'Rewe'),
    ];
    const s = summarizeYear(txs, 2026);
    expect(s.topMerchants).toEqual([
      { merchant: 'Apple', totalCents: 3500, count: 3 },
      { merchant: 'Rewe', totalCents: 700, count: 1 },
    ]);
  });

  it('Top-Händler: nur Ausgaben, leere Händler ignoriert, max. 5', () => {
    const txs = [
      tx('income', 999999, '2026-01-01', 's', 'Firma'),
      tx('expense', 5000, '2026-01-02', 'a', ''),
      tx('expense', 5000, '2026-01-02', 'a', '   '),
      tx('expense', 100, '2026-01-03', 'a', 'A1'),
      tx('expense', 200, '2026-01-03', 'a', 'B2'),
      tx('expense', 300, '2026-01-03', 'a', 'C3'),
      tx('expense', 400, '2026-01-03', 'a', 'D4'),
      tx('expense', 500, '2026-01-03', 'a', 'E5'),
      tx('expense', 600, '2026-01-03', 'a', 'F6'),
    ];
    const s = summarizeYear(txs, 2026);
    expect(s.topMerchants.map((m) => m.merchant)).toEqual(['F6', 'E5', 'D4', 'C3', 'B2']);
  });

  it('Top-Händler: Anzeige = häufigste Schreibweise', () => {
    const txs = [
      tx('expense', 100, '2026-01-01', 'a', 'REWE'),
      tx('expense', 100, '2026-01-02', 'a', 'Rewe'),
      tx('expense', 100, '2026-01-03', 'a', 'Rewe'),
    ];
    expect(summarizeYear(txs, 2026).topMerchants[0].merchant).toBe('Rewe');
  });
});

describe('yearsWithData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enthält ohne Buchungen das aktuelle Jahr', () => {
    expect(yearsWithData([])).toEqual([2026]);
  });

  it('ist absteigend, eindeutig und enthält das aktuelle Jahr auch ohne Buchungen darin', () => {
    const txs = [
      tx('expense', 100, '2024-05-01', 'a'),
      tx('expense', 100, '2024-06-01', 'a'),
      tx('expense', 100, '2025-01-01', 'a'),
    ];
    expect(yearsWithData(txs)).toEqual([2026, 2025, 2024]);
  });

  it('enthält auch zukünftige Jahre mit Daten', () => {
    expect(yearsWithData([tx('expense', 100, '2028-01-01', 'a')])).toEqual([2028, 2026]);
  });
});

describe('compareCategories', () => {
  it('liefert die Vereinigung, absteigend nach curCents', () => {
    const cur = [total('a', 500), total('b', 1000)];
    const prev = [total('b', 800), total('c', 300)];
    expect(compareCategories(cur, prev)).toEqual([
      { categoryId: 'b', curCents: 1000, prevCents: 800, diffCents: 200 },
      { categoryId: 'a', curCents: 500, prevCents: 0, diffCents: 500 },
      { categoryId: 'c', curCents: 0, prevCents: 300, diffCents: -300 },
    ]);
  });

  it('leere Listen ergeben eine leere Liste', () => {
    expect(compareCategories([], [])).toEqual([]);
  });

  it('nur Vorjahr: curCents 0, diff negativ', () => {
    expect(compareCategories([], [total('x', 100)])).toEqual([
      { categoryId: 'x', curCents: 0, prevCents: 100, diffCents: -100 },
    ]);
  });
});
