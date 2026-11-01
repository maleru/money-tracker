import { describe, expect, it } from 'vitest';
import { defaultCategories } from '../db/defaults';
import type { Transaction } from '../types';
import { toCsv } from './csv';

const NOW = '2026-11-01T12:00:00.000Z';
const catMap = new Map(defaultCategories(NOW).map((c) => [c.id, c]));

function tx(over: Partial<Transaction> & Pick<Transaction, 'type' | 'amountCents'>): Transaction {
  return {
    id: 't',
    date: '2026-10-10',
    categoryId: 'cat-transfer-savings',
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

function dataLines(csv: string): string[] {
  return csv.split('\r\n').slice(1).filter((l) => l !== '');
}

describe('toCsv Umbuchungen (E3)', () => {
  it('Umbuchung Abgang wird negativ mit Typ Umbuchung exportiert', () => {
    const csv = toCsv(
      [tx({ type: 'transfer', direction: 'out', amountCents: 2000 })],
      catMap,
    );
    expect(dataLines(csv)[0]).toContain(';Umbuchung;-20,00;');
  });

  it('Umbuchung Zugang wird positiv mit Typ Umbuchung exportiert', () => {
    const csv = toCsv(
      [tx({ type: 'transfer', direction: 'in', amountCents: 700 })],
      catMap,
    );
    expect(dataLines(csv)[0]).toContain(';Umbuchung;7,00;');
  });

  it('Ausgabe bleibt negativ, Einnahme positiv', () => {
    const csv = toCsv(
      [
        tx({ type: 'expense', amountCents: 1500, categoryId: 'cat-groceries' }),
        tx({ type: 'income', amountCents: 300, categoryId: 'cat-salary' }),
      ],
      catMap,
    );
    const [exp, inc] = dataLines(csv);
    expect(exp).toContain(';Ausgabe;-15,00;');
    expect(inc).toContain(';Einnahme;3,00;');
  });
});
