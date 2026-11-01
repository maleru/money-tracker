/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultCategories, defaultRules } from '../db/defaults';
import type { Transaction } from '../types';
import { parseBankText, suggestForRow } from './parse';
import type { ParsedRow } from './parse';

const NOW = '2026-10-01T00:00:00.000Z';
const cats = defaultCategories(NOW);
const rules = defaultRules(NOW);

function row(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    date: '2026-10-21',
    type: 'expense',
    amountCents: 700,
    merchant: 'Aldi',
    city: '',
    bankType: 'Kartenzahlung',
    pending: false,
    raw: '',
    ...over,
  };
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'expense',
    amountCents: 100,
    date: '2026-09-01',
    categoryId: 'cat-restaurant',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'Aldi',
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

describe('parseBankText', () => {
  it('nutzt den DKB-Parser, wenn er Zeilen findet', () => {
    const result = parseBankText('Aldi\n21.10.26 • Kartenzahlung\t-1,00 €');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].bankType).toBe('Kartenzahlung');
  });

  it('fällt auf den generischen Parser zurück, wenn der DKB-Parser nichts findet', () => {
    const result = parseBankText('21.10.2026 Kiosk 3,50');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ merchant: 'Kiosk', amountCents: 350, bankType: '' });
  });

  it('leerer Text ergibt 0 rows', () => {
    expect(parseBankText('')).toEqual({ rows: [], unparsedLines: [] });
  });
});

describe('suggestForRow', () => {
  it('Historie gewinnt gegenüber Regeln', () => {
    expect(suggestForRow(row(), [tx()], rules, cats)).toBe('cat-restaurant');
  });

  it('Regel greift (Aldi -> cat-groceries-supermarket)', () => {
    expect(suggestForRow(row(), [], rules, cats)).toBe('cat-groceries-supermarket');
  });

  it('Einnahme mit bankType Gutschrift ergibt cat-refund', () => {
    const r = row({ type: 'income', merchant: 'Unbekannt', bankType: 'Gutschrift' });
    expect(suggestForRow(r, [], rules, cats)).toBe('cat-refund');
  });

  it('Einnahme mit bankType Gehalt ergibt cat-salary', () => {
    const r = row({ type: 'income', merchant: 'Firma GmbH', bankType: 'Gehalt/Rente' });
    expect(suggestForRow(r, [], rules, cats)).toBe('cat-salary');
  });

  it('sonst greift die Fallback-Kategorie des Typs', () => {
    expect(suggestForRow(row({ merchant: 'Unbekannt' }), [], rules, cats)).toBe('cat-other-expense');
    const income = row({ type: 'income', merchant: 'Unbekannt', bankType: 'Überweisung' });
    expect(suggestForRow(income, [], rules, cats)).toBe('cat-other-income');
  });
});

describe('Integration: Fixture -> parseBankText -> suggestForRow', () => {
  it('schlägt für alle Zeilen die erwarteten Kategorien vor', () => {
    const text = readFileSync(new URL('./__fixtures__/dkb-oktober.txt', import.meta.url), 'utf8');
    const { rows, unparsedLines } = parseBankText(text);
    expect(unparsedLines).toEqual([]);
    const suggestions = rows.map((r) => [r.merchant, suggestForRow(r, [], rules, cats)]);
    expect(suggestions).toEqual([
      ['Lidl', 'cat-groceries-supermarket'],
      ['Vodafone GmbH', 'cat-telecom'],
      ['Spotify', 'cat-subscriptions'],
      ['DM', 'cat-drugstore'],
      ['Spotify', 'cat-subscriptions'],
      ['Fashion Outlet Center', 'cat-clothing'],
      ['Parken City Garage', 'cat-mobility'],
      ['Kantine Nord Gastronomie Gmb', 'cat-refund'],
      ['BAECKEREI SONNE', 'cat-groceries-bakery'],
    ]);
  });
});
