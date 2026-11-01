import { describe, expect, it } from 'vitest';
import { defaultAccounts, defaultCategories } from '../db/defaults';
import type { Account, Category, Transaction } from '../types';
import { budgetStatus } from './budget';
import { creditCardReconciliation } from './creditCard';
import { subcategoryBreakdown, summarizeMonth } from './month';
import { transferFlows } from './transfers';
import { summarizeYear } from './year';

const NOW = '2026-11-01T12:00:00.000Z';
const cats: Category[] = defaultCategories(NOW);
const catMap = new Map(cats.map((c) => [c.id, c]));
const accs: Account[] = defaultAccounts(NOW);

function tx(
  over: Pick<Transaction, 'id' | 'type' | 'amountCents' | 'date' | 'categoryId'> & Partial<Transaction>,
): Transaction {
  return {
    accountId: 'acc-checking',
    direction: null,
    merchant: '',
    originalText: '',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

// Gemeinsamer Testdatensatz (E3.1), alle Buchungen im Oktober 2026.
const a = tx({ id: 'a', type: 'expense', amountCents: 1000, date: '2026-10-03', categoryId: 'cat-groceries' });
const b = tx({ id: 'b', type: 'expense', amountCents: 500, date: '2026-10-04', categoryId: 'cat-groceries-bakery' });
const c = tx({ id: 'c', type: 'expense', amountCents: 300, date: '2026-10-05', categoryId: 'cat-restaurant' });
const d = tx({ id: 'd', type: 'income', amountCents: 5000, date: '2026-10-01', categoryId: 'cat-salary' });
const e = tx({
  id: 'e',
  type: 'transfer',
  direction: 'out',
  amountCents: 2000,
  date: '2026-10-02',
  categoryId: 'cat-transfer-savings',
});
const f = tx({
  id: 'f',
  type: 'transfer',
  direction: 'in',
  amountCents: 700,
  date: '2026-10-20',
  categoryId: 'cat-transfer-savings',
});
const g = tx({
  id: 'g',
  type: 'transfer',
  direction: 'out',
  amountCents: 1500,
  date: '2026-10-02',
  categoryId: 'cat-transfer-invest',
});
const h = tx({
  id: 'h',
  type: 'transfer',
  direction: 'in',
  amountCents: 200,
  date: '2026-10-25',
  categoryId: 'cat-transfer-invest',
});
const i = tx({
  id: 'i',
  type: 'transfer',
  direction: 'out',
  amountCents: 9000,
  date: '2026-10-02',
  categoryId: 'cat-transfer-credit-card',
});
const j = tx({
  id: 'j',
  type: 'expense',
  amountCents: 5000,
  date: '2026-10-05',
  categoryId: 'cat-restaurant',
  accountId: 'acc-credit-card',
});
const k = tx({
  id: 'k',
  type: 'expense',
  amountCents: 4500,
  date: '2026-10-20',
  categoryId: 'cat-clothing',
  accountId: 'acc-credit-card',
});
const l = tx({
  id: 'l',
  type: 'income',
  amountCents: 300,
  date: '2026-10-21',
  categoryId: 'cat-refund',
  accountId: 'acc-credit-card',
});
const m = tx({
  id: 'm',
  type: 'transfer',
  direction: 'in',
  amountCents: 9000,
  date: '2026-10-03',
  categoryId: 'cat-transfer-credit-card',
  accountId: 'acc-credit-card',
});
const ALL = [a, b, c, d, e, f, g, h, i, j, k, l, m];

describe('summarizeMonth mit Kategorie-Map', () => {
  it('summiert den Monat, Unterkategorien werden zur Hauptkategorie zusammengefasst', () => {
    const s = summarizeMonth(ALL, '2026-10', catMap);
    expect(s.incomeCents).toBe(5300);
    expect(s.expenseCents).toBe(11300);
    expect(s.balanceCents).toBe(-6000);
    expect(s.savingsRate).toBeCloseTo(-6000 / 5300, 10);
    expect(s.count).toBe(13);
    expect(s.expenseByCategory.map((x) => [x.categoryId, x.totalCents, x.count])).toEqual([
      ['cat-restaurant', 5300, 2],
      ['cat-clothing', 4500, 1],
      ['cat-groceries', 1500, 2],
    ]);
  });

  it('ohne Kategorie-Map bleiben Unterkategorien eigenständig', () => {
    const s = summarizeMonth([a, b, c, d], '2026-10');
    expect(s.expenseByCategory.map((x) => x.categoryId)).toEqual([
      'cat-groceries',
      'cat-groceries-bakery',
      'cat-restaurant',
    ]);
  });

  it('mit Map: Ausgaben werden zur Hauptkategorie zusammengefasst', () => {
    const s = summarizeMonth([a, b, c, d], '2026-10', catMap);
    expect(s.expenseCents).toBe(1800);
    expect(s.savingsRate).toBeCloseTo(0.64, 10);
    expect(s.expenseByCategory[0]).toEqual({
      categoryId: 'cat-groceries',
      totalCents: 1500,
      count: 2,
      share: 1500 / 1800,
    });
  });

  it('Transfers zählen nicht zu Einnahmen oder Ausgaben, wohl aber zu count', () => {
    const s = summarizeMonth([e, f], '2026-10', catMap);
    expect(s.expenseCents).toBe(0);
    expect(s.incomeCents).toBe(0);
    expect(s.count).toBe(2);
  });
});

describe('subcategoryBreakdown', () => {
  it('teilt Lebensmittel nach Unterkategorien auf', () => {
    expect(subcategoryBreakdown(ALL, 'cat-groceries', catMap)).toEqual([
      { categoryId: 'cat-groceries', totalCents: 1000, count: 1, share: 2 / 3 },
      { categoryId: 'cat-groceries-bakery', totalCents: 500, count: 1, share: 1 / 3 },
    ]);
  });
});

describe('transferFlows', () => {
  const expected = {
    toReservesCents: 2000,
    fromReservesCents: 700,
    netReservesCents: 1300,
    investedOutCents: 1500,
    investedInCents: 200,
    investedNetCents: 1300,
  };

  it('Oktober 2026', () => {
    expect(transferFlows(ALL, '2026-10', catMap)).toEqual(expected);
  });

  it('Jahr 2026 liefert dasselbe', () => {
    expect(transferFlows(ALL, '2026', catMap)).toEqual(expected);
  });

  it('September 2026 ist leer', () => {
    expect(transferFlows(ALL, '2026-09', catMap)).toEqual({
      toReservesCents: 0,
      fromReservesCents: 0,
      netReservesCents: 0,
      investedOutCents: 0,
      investedInCents: 0,
      investedNetCents: 0,
    });
  });
});

describe('creditCardReconciliation', () => {
  it('Oktober: Abbuchung 9000 gegen Kartenumsätze 9200', () => {
    expect(creditCardReconciliation(ALL, accs, '2026-10', catMap)).toEqual({
      settledCents: 9000,
      cardSpentCents: 9200,
      diffCents: -200,
      hasData: true,
    });
  });

  it('September: keine Daten', () => {
    expect(creditCardReconciliation(ALL, accs, '2026-09', catMap)).toEqual({
      settledCents: 0,
      cardSpentCents: 0,
      diffCents: 0,
      hasData: false,
    });
  });

  it('Abbuchung auf ein Sparkonto zählt nicht als Kartenabbuchung', () => {
    const savings: Account = { ...accs[0], id: 'acc-savings', kind: 'savings', name: 'Tagesgeld' };
    const r = creditCardReconciliation([{ ...i, accountId: 'acc-savings' }], [...accs, savings], '2026-10', catMap);
    expect(r.settledCents).toBe(0);
  });
});

describe('budgetStatus mit Unterkategorien', () => {
  it('Unterkategorien fließen in das Budget der Hauptkategorie ein', () => {
    const budgeted = cats.map((x) => (x.id === 'cat-groceries' ? { ...x, monthlyBudgetCents: 2000 } : x));
    expect(budgetStatus([a, b], budgeted, '2026-10')).toEqual([
      { categoryId: 'cat-groceries', budgetCents: 2000, spentCents: 1500, ratio: 0.75, level: 'ok' },
    ]);
  });

  it('Unterkategorie mit eigenem Budget erscheint nicht', () => {
    const budgeted = cats.map((x) => {
      if (x.id === 'cat-groceries') return { ...x, monthlyBudgetCents: 2000 };
      if (x.id === 'cat-groceries-bakery') return { ...x, monthlyBudgetCents: 100 };
      return x;
    });
    const result = budgetStatus([a, b], budgeted, '2026-10');
    expect(result.map((r) => r.categoryId)).toEqual(['cat-groceries']);
  });
});

describe('summarizeYear', () => {
  it('expenseByCategory entspricht dem Monatsergebnis', () => {
    const year = summarizeYear(ALL, 2026, catMap);
    const month = summarizeMonth(ALL, '2026-10', catMap);
    expect(year.expenseByCategory).toEqual(month.expenseByCategory);
  });
});
