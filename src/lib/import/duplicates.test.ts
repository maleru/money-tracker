import { describe, expect, it } from 'vitest';
import type { Transaction, TxType } from '../types';
import { markDuplicates } from './duplicates';
import type { ParsedRow } from './parse';

function row(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    date: '2026-10-21',
    type: 'expense',
    amountCents: 4215,
    merchant: 'Aldi',
    city: '',
    bankType: 'Kartenzahlung',
    raw: '',
    ...over,
  };
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'expense' as TxType,
    amountCents: 4215,
    date: '2026-10-21',
    categoryId: 'cat-groceries',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'Aldi',
    originalText: '',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('markDuplicates', () => {
  it('ohne bestehende Buchungen ist nichts ein Duplikat', () => {
    expect(markDuplicates([row()], [])).toEqual([false]);
    expect(markDuplicates([], [tx()])).toEqual([]);
  });

  it('gleicher Schlüssel und gleicher Händler ist ein Duplikat', () => {
    expect(markDuplicates([row()], [tx()])).toEqual([true]);
  });

  it('Händler wird normalisiert verglichen', () => {
    expect(markDuplicates([row({ merchant: 'ALDI' })], [tx({ merchant: 'aldi' })])).toEqual([true]);
  });

  it('einer enthält den anderen', () => {
    expect(markDuplicates([row({ merchant: 'Aldi Süd Musterhausen' })], [tx({ merchant: 'Aldi' })])).toEqual([true]);
    expect(markDuplicates([row({ merchant: 'Aldi' })], [tx({ merchant: 'Aldi Süd Musterhausen' })])).toEqual([true]);
  });

  it('ist einer der Händler leer, zählt es als Duplikat', () => {
    expect(markDuplicates([row({ merchant: '' })], [tx()])).toEqual([true]);
    expect(markDuplicates([row()], [tx({ merchant: '' })])).toEqual([true]);
  });

  it('verschiedene Händler sind kein Duplikat', () => {
    expect(markDuplicates([row({ merchant: 'Lidl' })], [tx()])).toEqual([false]);
  });

  it('abweichendes Datum, Typ oder Betrag ist kein Duplikat', () => {
    expect(markDuplicates([row({ date: '2026-10-22' })], [tx()])).toEqual([false]);
    expect(markDuplicates([row({ type: 'income' })], [tx()])).toEqual([false]);
    expect(markDuplicates([row({ amountCents: 7008 })], [tx()])).toEqual([false]);
  });

  it('Multiset: zwei identische Import-Zeilen bei einer bestehenden Buchung ergeben [true, false]', () => {
    expect(markDuplicates([row(), row()], [tx()])).toEqual([true, false]);
  });

  it('Multiset: zwei bestehende Buchungen markieren beide Zeilen', () => {
    expect(markDuplicates([row(), row()], [tx({ id: 'a' }), tx({ id: 'b' })])).toEqual([true, true]);
  });

  it('Multiset: eine bestehende Buchung wird dem passenden Händler zugeordnet', () => {
    const rows = [row({ merchant: 'Lidl' }), row({ merchant: 'Aldi' })];
    expect(markDuplicates(rows, [tx({ merchant: 'Aldi' })])).toEqual([false, true]);
  });
});
