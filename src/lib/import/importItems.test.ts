/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultCategories, defaultRules } from '../db/defaults';
import type { Transaction } from '../types';
import { buildImportItems, itemsToTxInputs, newestDate } from './importItems';
import { parseBankText } from './parse';
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
    city: 'Berlin',
    bankType: 'Kartenzahlung',
    raw: '',
    ...over,
  };
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'expense',
    amountCents: 700,
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
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('buildImportItems', () => {
  it('wählt Duplikate ab und markiert sie', () => {
    const rows = [row(), row({ merchant: 'Rewe', amountCents: 900 })];
    const items = buildImportItems(rows, [tx()], rules, cats);
    expect(items.map((i) => i.duplicate)).toEqual([true, false]);
    expect(items.map((i) => i.selected)).toEqual([false, true]);
  });

  it('schlägt die Kategorie vor und vergibt index-basierte Keys', () => {
    const items = buildImportItems([row(), row({ merchant: 'Unbekannt' })], [], rules, cats);
    expect(items[0].categoryId).toBe('cat-groceries-supermarket');
    expect(items[1].categoryId).toBe('cat-other-expense');
    expect(items[0].categoryTouched).toBe(false);
    expect(items[0].key).not.toBe(items[1].key);
  });
});

describe('itemsToTxInputs', () => {
  it('übernimmt nur ausgewählte Items mit korrekten Feldern', () => {
    const items = buildImportItems([row(), row({ merchant: 'Rewe', amountCents: 900 })], [tx()], rules, cats);
    expect(itemsToTxInputs(items, 'text')).toEqual([
      {
        type: 'expense',
        amountCents: 900,
        date: '2026-10-21',
        categoryId: items[1].categoryId,
        accountId: 'acc-checking',
        direction: null,
        merchant: 'Rewe',
        originalText: 'Rewe',
        city: 'Berlin',
        note: '',
        source: 'text',
        recurringId: null,
      },
    ]);
  });

  it('übergibt die Quelle ocr', () => {
    const items = buildImportItems([row()], [], rules, cats);
    expect(itemsToTxInputs(items, 'ocr')[0].source).toBe('ocr');
  });

  it('liefert eine leere Liste ohne Auswahl', () => {
    const items = buildImportItems([row()], [], rules, cats).map((i) => ({ ...i, selected: false }));
    expect(itemsToTxInputs(items, 'text')).toEqual([]);
  });
});

describe('newestDate', () => {
  it('liefert das neueste Datum der ausgewählten Items', () => {
    const items = buildImportItems(
      [row({ date: '2026-10-05' }), row({ date: '2026-10-19', merchant: 'A' }), row({ date: '2026-10-30', merchant: 'B' })],
      [],
      rules,
      cats,
    );
    items[2].selected = false;
    expect(newestDate(items)).toBe('2026-10-19');
  });

  it('liefert null ohne ausgewählte Items', () => {
    expect(newestDate([])).toBeNull();
    const items = buildImportItems([row()], [], rules, cats).map((i) => ({ ...i, selected: false }));
    expect(newestDate(items)).toBeNull();
  });
});

describe('Integration mit DKB-Fixture', () => {
  it('erzeugt 9 Items mit den erwarteten Kategorien', () => {
    const text = readFileSync(new URL('./__fixtures__/dkb-oktober.txt', import.meta.url), 'utf8');
    const { rows } = parseBankText(text);
    const items = buildImportItems(rows, [], rules, cats);
    expect(items).toHaveLength(9);
    expect(items.every((i) => i.selected && !i.duplicate)).toBe(true);
    expect(items.map((i) => [i.row.merchant, i.categoryId])).toEqual([
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
    expect(newestDate(items)).toBe('2026-10-21');
  });
});
