import { describe, it, expect } from 'vitest';
import type { Category, Transaction, TxType } from '../types';
import {
  SALARY_CATEGORY_ID,
  isSalaryTx,
  salaryPeriods,
  salaryStartDates,
  summarizeRange,
} from './salaryPeriod';

const cats: Category[] = [
  mkCat('cat-salary', 'income', null),
  mkCat('cat-salary-bonus', 'income', 'cat-salary'),
  mkCat('cat-food', 'expense', null),
  mkCat('cat-move', 'transfer', null),
];

function mkCat(id: string, type: TxType, parentId: string | null): Category {
  return {
    id,
    name: id,
    type,
    parentId,
    icon: '',
    color: '',
    archived: false,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function mkTx(date: string, type: TxType, categoryId: string, amountCents = 100): Transaction {
  return {
    id: `tx-${date}-${type}-${categoryId}-${amountCents}`,
    type,
    amountCents,
    date,
    categoryId,
    accountId: 'acc-test',
    direction: type === 'transfer' ? 'out' : null,
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

const salary = (date: string, amountCents = 300000): Transaction =>
  mkTx(date, 'income', SALARY_CATEGORY_ID, amountCents);

describe('salaryPeriods', () => {
  it('Fall 1: ohne Gehalt gibt es keine Zeiträume', () => {
    expect(salaryPeriods([mkTx('2026-10-10', 'expense', 'cat-food')], cats, '2026-11-06')).toEqual([]);
  });

  it('Fall 2: ein aktueller Zeitraum mit nextExpected', () => {
    expect(salaryPeriods([salary('2026-10-29')], cats, '2026-11-06')).toEqual([
      { start: '2026-10-29', end: '2026-11-06', isCurrent: true, nextExpected: '2026-11-29' },
    ]);
  });

  it('Fall 3: vorheriger Zeitraum endet am Tag vor dem nächsten Gehalt', () => {
    expect(salaryPeriods([salary('2026-09-29'), salary('2026-10-29')], cats, '2026-11-06')).toEqual([
      { start: '2026-09-29', end: '2026-10-28', isCurrent: false, nextExpected: null },
      { start: '2026-10-29', end: '2026-11-06', isCurrent: true, nextExpected: '2026-11-29' },
    ]);
  });

  it('Fall 4: Buchungen innerhalb von 7 Tagen zählen als ein Eingang', () => {
    expect(salaryStartDates([salary('2026-10-29'), salary('2026-10-30')], cats)).toEqual(['2026-10-29']);
  });

  it('Fall 5: veralteter Gehaltszeitraum ist nicht aktuell und endet am Monatsende', () => {
    expect(salaryPeriods([salary('2026-08-01')], cats, '2026-11-06')).toEqual([
      { start: '2026-08-01', end: '2026-08-31', isCurrent: false, nextExpected: null },
    ]);
  });

  it('Fall 6: nextExpected begrenzt den Monatstag', () => {
    const [p] = salaryPeriods([salary('2027-01-31')], cats, '2027-02-10');
    expect(p.nextExpected).toBe('2027-02-28');
    expect(p.isCurrent).toBe(true);
  });

  it('Fall 7: Ausgabe oder Umbuchung in cat-salary zählt nicht als Gehalt', () => {
    const txs = [mkTx('2026-10-29', 'expense', SALARY_CATEGORY_ID), mkTx('2026-10-30', 'transfer', SALARY_CATEGORY_ID)];
    expect(txs.some((tx) => isSalaryTx(tx, cats))).toBe(false);
    expect(salaryPeriods(txs, cats, '2026-11-06')).toEqual([]);
  });

  it('Fall 8: Gehalt nach today wird ignoriert', () => {
    expect(salaryPeriods([salary('2026-11-10')], cats, '2026-11-06')).toEqual([]);
  });

  it('Unterkategorien des Gehalts zählen als Gehalt', () => {
    expect(isSalaryTx(mkTx('2026-10-29', 'income', 'cat-salary-bonus'), cats)).toBe(true);
  });
});

describe('summarizeRange', () => {
  it('Fall 9: Grenzen eingeschlossen, außerhalb ignoriert, Umbuchungen nicht in Einnahmen oder Ausgaben', () => {
    const txs = [
      mkTx('2026-10-28', 'expense', 'cat-food', 9999), // außerhalb
      mkTx('2026-10-29', 'income', SALARY_CATEGORY_ID, 300000), // Start, eingeschlossen
      mkTx('2026-11-06', 'expense', 'cat-food', 5000), // Ende, eingeschlossen
      mkTx('2026-11-07', 'expense', 'cat-food', 7777), // außerhalb
      mkTx('2026-11-01', 'transfer', 'cat-move', 40000), // Umbuchung
    ];
    const s = summarizeRange(txs, '2026-10-29', '2026-11-06', cats);
    expect(s.incomeCents).toBe(300000);
    expect(s.expenseCents).toBe(5000);
    expect(s.balanceCents).toBe(295000);
    expect(s.count).toBe(3);
  });
});
