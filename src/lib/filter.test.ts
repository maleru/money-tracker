import { describe, expect, it } from 'vitest';
import { filterTransactions, groupByDay, sumBalance, type TxFilter } from './filter';
import type { Category, Transaction, TxType } from './types';

function cat(id: string, name: string, type: TxType): Category {
  return {
    id,
    name,
    type,
    parentId: null,
    icon: '🛒',
    color: '#112233',
    archived: false,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const cats = new Map<string, Category>([
  ['food', cat('food', 'Lebensmittel', 'expense')],
  ['fun', cat('fun', 'Freizeit', 'expense')],
  ['salary', cat('salary', 'Gehalt', 'income')],
]);

let counter = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amountCents' | 'date' | 'categoryId'>): Transaction {
  counter += 1;
  return {
    id: 't' + counter,
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
    ...p,
  };
}

const rewe = tx({ type: 'expense', amountCents: 4215, date: '2026-10-21', categoryId: 'food', merchant: 'REWE', city: 'Hamburg' });
const kino = tx({ type: 'expense', amountCents: 1500, date: '2026-10-21', categoryId: 'fun', merchant: 'Cinemaxx', note: 'Film mit Anna' });
const lohn = tx({ type: 'income', amountCents: 250000, date: '2026-10-01', categoryId: 'salary', merchant: 'Firma GmbH' });
const alt = tx({ type: 'expense', amountCents: 999, date: '2026-09-15', categoryId: 'food', merchant: 'Bäcker' });
const all = [rewe, kino, lohn, alt];

const base: TxFilter = {
  year: null,
  month: null,
  type: 'all',
  categoryId: null,
  categoryExact: false,
  accountId: null,
  search: '',
};
const alt2025 = tx({ type: 'expense', amountCents: 500, date: '2025-12-31', categoryId: 'food', merchant: 'Silvester' });

describe('filterTransactions', () => {
  it('ohne Filter bleibt alles erhalten', () => {
    expect(filterTransactions(all, cats, base)).toEqual(all);
  });

  it('filtert nach Monat', () => {
    expect(filterTransactions(all, cats, { ...base, month: '2026-10' })).toEqual([rewe, kino, lohn]);
    expect(filterTransactions(all, cats, { ...base, month: '2026-09' })).toEqual([alt]);
  });

  it('filtert nach Typ', () => {
    expect(filterTransactions(all, cats, { ...base, type: 'income' })).toEqual([lohn]);
    expect(filterTransactions(all, cats, { ...base, type: 'expense' })).toEqual([rewe, kino, alt]);
  });

  it('filtert nach Kategorie', () => {
    expect(filterTransactions(all, cats, { ...base, categoryId: 'food' })).toEqual([rewe, alt]);
  });

  it('kombiniert Filter', () => {
    expect(
      filterTransactions(all, cats, {
        year: null,
        month: '2026-10',
        type: 'expense',
        categoryId: 'food',
        categoryExact: false,
        accountId: null,
        search: '',
      }),
    ).toEqual([rewe]);
  });

  it('filtert nach Jahr (ganzes Jahr)', () => {
    const list = [...all, alt2025];
    expect(filterTransactions(list, cats, { ...base, year: 2026 })).toEqual(all);
    expect(filterTransactions(list, cats, { ...base, year: 2025 })).toEqual([alt2025]);
    expect(filterTransactions(list, cats, { ...base, year: 2024 })).toEqual([]);
  });

  it('year hat Vorrang vor month', () => {
    const list = [...all, alt2025];
    expect(filterTransactions(list, cats, { ...base, year: 2026, month: '2025-12' })).toEqual(all);
    expect(filterTransactions(list, cats, { ...base, year: 2025, month: '2026-10' })).toEqual([alt2025]);
  });

  it('year kombiniert sich mit Kategorie und Typ', () => {
    const list = [...all, alt2025];
    expect(filterTransactions(list, cats, { ...base, year: 2026, categoryId: 'food' })).toEqual([rewe, alt]);
    expect(filterTransactions(list, cats, { ...base, year: 2026, type: 'income' })).toEqual([lohn]);
  });

  it('sucht case-insensitive im Händler', () => {
    expect(filterTransactions(all, cats, { ...base, search: 'rewe' })).toEqual([rewe]);
  });

  it('sucht in Notiz, Stadt und Kategoriename', () => {
    expect(filterTransactions(all, cats, { ...base, search: 'ANNA' })).toEqual([kino]);
    expect(filterTransactions(all, cats, { ...base, search: 'hamburg' })).toEqual([rewe]);
    expect(filterTransactions(all, cats, { ...base, search: 'gehalt' })).toEqual([lohn]);
  });

  it('sucht im Betrag "42,15"', () => {
    expect(filterTransactions(all, cats, { ...base, search: '42,15' })).toEqual([rewe]);
  });

  it('month null sucht über alle Monate, ein Monat schränkt ein', () => {
    expect(filterTransactions(all, cats, { ...base, search: 'bäcker' })).toEqual([alt]);
    expect(filterTransactions(all, cats, { ...base, month: '2026-10', search: 'bäcker' })).toEqual([]);
  });

  it('ignoriert Leerzeichen um den Suchtext', () => {
    expect(filterTransactions(all, cats, { ...base, search: '  rewe ' })).toEqual([rewe]);
  });
});

describe('filterTransactions E3 (Unterkategorien, Konto, Umbuchung)', () => {
  const bakery = tx({ type: 'expense', amountCents: 500, date: '2026-10-04', categoryId: 'food-bakery', merchant: 'Bäcker' });
  const transfer = tx({
    type: 'transfer',
    direction: 'out',
    amountCents: 2000,
    date: '2026-10-02',
    categoryId: 'cat-transfer-savings',
    merchant: 'Sparen',
  });
  const card = tx({
    type: 'expense',
    amountCents: 5000,
    date: '2026-10-05',
    categoryId: 'fun',
    accountId: 'acc-credit-card',
    merchant: 'Kartenumsatz',
  });
  const e3cats = new Map<string, Category>([
    ...cats,
    ['food-bakery', { ...cat('food-bakery', 'Bäckerei', 'expense'), parentId: 'food' }],
    ['cat-transfer-savings', cat('cat-transfer-savings', 'Tagesgeld', 'transfer')],
  ]);
  const e3all = [rewe, bakery, transfer, card];

  it('type transfer liefert nur Umbuchungen', () => {
    expect(filterTransactions(e3all, e3cats, { ...base, type: 'transfer' })).toEqual([transfer]);
  });

  it('Kategorie ohne exact schließt Unterkategorien ein', () => {
    expect(filterTransactions(e3all, e3cats, { ...base, categoryId: 'food' })).toEqual([rewe, bakery]);
  });

  it('Kategorie mit categoryExact nur exakt', () => {
    expect(filterTransactions(e3all, e3cats, { ...base, categoryId: 'food', categoryExact: true })).toEqual([rewe]);
    expect(filterTransactions(e3all, e3cats, { ...base, categoryId: 'food-bakery', categoryExact: true })).toEqual([bakery]);
  });

  it('Konto-Filter', () => {
    expect(filterTransactions(e3all, e3cats, { ...base, accountId: 'acc-credit-card' })).toEqual([card]);
  });
});

describe('groupByDay / sumBalance', () => {
  it('gruppiert nach Tag in Eingabereihenfolge mit Tagessalden', () => {
    const groups = groupByDay(all);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-21', '2026-10-01', '2026-09-15']);
    expect(groups[0].items).toEqual([rewe, kino]);
    expect(groups[0].balanceCents).toBe(-5715);
    expect(groups[1].balanceCents).toBe(250000);
    expect(groups[2].balanceCents).toBe(-999);
  });

  it('leere Liste ergibt keine Gruppen', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('sumBalance summiert vorzeichenbehaftet', () => {
    expect(sumBalance(all)).toBe(-4215 - 1500 + 250000 - 999);
    expect(sumBalance([])).toBe(0);
  });
});
