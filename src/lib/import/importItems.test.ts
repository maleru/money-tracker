import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultAccounts, defaultCategories, defaultRules } from '../db/defaults';
import type { MerchantRule, Transaction } from '../types';
import { parseDkb } from './dkbParser';
import {
  buildImportItems,
  classifyRow,
  itemsToTxInputs,
  newestDate,
  suggestForEdit,
  type ImportContext,
} from './importItems';

const NOW = '2026-11-01T12:00:00.000Z';
const fixtureNov = readFileSync(new URL('./__fixtures__/dkb-november.txt', import.meta.url), 'utf8');

const cats = defaultCategories(NOW);
const accounts = defaultAccounts(NOW);

const customRule: MerchantRule = {
  id: 'u1',
  pattern: 'ERIKA UND HANS MUSTER',
  categoryId: 'cat-housing-rent',
  displayName: 'Miete Wohnung',
  source: 'manual',
  updatedAt: NOW,
};

function ctx(over: Partial<ImportContext> = {}): ImportContext {
  return {
    txs: [],
    rules: [...defaultRules(NOW), customRule],
    cats,
    account: accounts[0],
    ownNames: ['Max Mustermann'],
    ...over,
  };
}

const rows = parseDkb(fixtureNov).rows;

function existingTx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    amountCents: 1000,
    date: '2026-10-01',
    categoryId: 'cat-groceries',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'X',
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

describe('Klassifizierung der November-Fixture (Girokonto)', () => {
  const items = buildImportItems(rows, ctx());

  const EXPECTED: { merchant: string; type: string; direction: string | null; categoryId: string; transferDetected: boolean }[] = [
    { merchant: 'CITYfit Fitness- und Gesund-heitsclub Musterstadt GmbH', type: 'expense', direction: null, categoryId: 'cat-memberships', transferDetected: false },
    { merchant: 'ARAG SE', type: 'expense', direction: null, categoryId: 'cat-insurance', transferDetected: false },
    { merchant: 'Miete Wohnung', type: 'expense', direction: null, categoryId: 'cat-housing-rent', transferDetected: false },
    { merchant: 'REWE', type: 'expense', direction: null, categoryId: 'cat-groceries-supermarket', transferDetected: false },
    { merchant: 'REWE', type: 'expense', direction: null, categoryId: 'cat-groceries-supermarket', transferDetected: false },
    { merchant: 'KANTINE MUSTERSTADT M211', type: 'expense', direction: null, categoryId: 'cat-other-expense', transferDetected: false },
    { merchant: 'BrotHaus', type: 'expense', direction: null, categoryId: 'cat-groceries-bakery', transferDetected: false },
    { merchant: 'Muster Aktiengesellschaft', type: 'expense', direction: null, categoryId: 'cat-other-expense', transferDetected: false },
    { merchant: "L'Osteria", type: 'expense', direction: null, categoryId: 'cat-other-expense', transferDetected: false },
    { merchant: 'BrotHaus', type: 'expense', direction: null, categoryId: 'cat-groceries-bakery', transferDetected: false },
    { merchant: 'REWE', type: 'expense', direction: null, categoryId: 'cat-groceries-supermarket', transferDetected: false },
    { merchant: 'Max Mustermann', type: 'transfer', direction: 'in', categoryId: 'cat-transfer-savings', transferDetected: true },
    { merchant: 'Lidl', type: 'expense', direction: null, categoryId: 'cat-groceries-supermarket', transferDetected: false },
    { merchant: 'Vodafone GmbH', type: 'expense', direction: null, categoryId: 'cat-telecom', transferDetected: false },
    { merchant: 'Spotify', type: 'expense', direction: null, categoryId: 'cat-subscriptions', transferDetected: false },
  ];

  it('liefert 15 Zeilen und die erwartete Tabelle', () => {
    expect(items.map((i) => ({
      merchant: i.merchant,
      type: i.type,
      direction: i.direction,
      categoryId: i.categoryId,
      transferDetected: i.transferDetected,
    }))).toEqual(EXPECTED);
  });

  it('alle Zeilen sind ausgewählt und ohne Duplikat', () => {
    expect(items.every((i) => i.selected && i.dup.kind === 'none')).toBe(true);
  });

  it('Zeile 3 hat den Originaltext über row.merchant erhalten', () => {
    expect(items[2].row.merchant).toBe('Erika und Hans Muster');
  });
});

describe('classifyRow und Import-Regeln', () => {
  it('Nutzerregel gewinnt vor der Heuristik für eigene Namen', () => {
    const rule: MerchantRule = {
      id: 'u2',
      pattern: 'MAX MUSTERMANN',
      categoryId: 'cat-salary',
      displayName: null,
      source: 'manual',
      updatedAt: NOW,
    };
    const item = buildImportItems([rows[11]], ctx({ rules: [rule] }))[0];
    expect(item.type).toBe('income');
    expect(item.categoryId).toBe('cat-salary');
    expect(item.transferDetected).toBe(false);
  });

  it('Transfer-Regel ergibt Umbuchung je nach Vorzeichen', () => {
    const rule: MerchantRule = {
      id: 'u3',
      pattern: 'TRADE REPUBLIC',
      categoryId: 'cat-transfer-invest',
      displayName: null,
      source: 'manual',
      updatedAt: NOW,
    };
    const base = { date: '2026-10-05', city: '', bankType: 'Kartenzahlung', pending: false, dateGuessed: false, raw: '', amountCents: 2000, merchant: 'Trade Republic' };
    const out = classifyRow({ ...base, type: 'expense' }, ctx({ rules: [rule] }));
    expect(out).toMatchObject({ type: 'transfer', direction: 'out', categoryId: 'cat-transfer-invest' });
    const inn = classifyRow({ ...base, type: 'income' }, ctx({ rules: [rule] }));
    expect(inn).toMatchObject({ type: 'transfer', direction: 'in', categoryId: 'cat-transfer-invest' });
  });

  it('Kreditkarten-Konto: Eingang ist Einnahme über Heuristik, keine Umbuchung', () => {
    const item = buildImportItems([rows[11]], ctx({ account: accounts[1] }))[0];
    expect(item.type).toBe('income');
    expect(item.categoryId).toBe('cat-refund');
    expect(item.transferDetected).toBe(false);
  });

  it('exaktes Duplikat wird abgewählt', () => {
    const tx = existingTx({
      id: 'T1',
      type: 'transfer',
      direction: 'in',
      date: '2026-10-26',
      amountCents: 300000,
      merchant: 'Max Mustermann',
      originalText: 'Max Mustermann',
      categoryId: 'cat-transfer-savings',
    });
    const item = buildImportItems([rows[11]], ctx({ txs: [tx] }))[0];
    expect(item.dup.kind).toBe('exact');
    expect(item.selected).toBe(false);
  });

  it('Recurring-Duplikat wird abgewählt', () => {
    const tx = existingTx({
      id: 'R1',
      date: '2026-11-01',
      amountCents: 112000,
      merchant: 'Miete',
      recurringId: 'rec-1',
      categoryId: 'cat-housing-rent',
    });
    const item = buildImportItems([rows[2]], ctx({ txs: [tx] }))[0];
    expect(item.dup.kind).toBe('recurring');
    expect(item.selected).toBe(false);
  });
});

describe('itemsToTxInputs, suggestForEdit, newestDate', () => {
  const items = buildImportItems(rows, ctx());

  it('übernimmt Anzeige-Händler und Originaltext, Umbuchung mit Richtung', () => {
    const inputs = itemsToTxInputs(items, 'text', 'acc-checking');
    expect(inputs[2]).toMatchObject({ merchant: 'Miete Wohnung', originalText: 'Erika und Hans Muster', accountId: 'acc-checking' });
    expect(inputs[11]).toMatchObject({ type: 'transfer', direction: 'in' });
  });

  it('liefert nur ausgewählte Items', () => {
    const selectedOff = items.map((i, idx) => (idx === 0 ? { ...i, selected: false } : i));
    expect(itemsToTxInputs(selectedOff, 'text', 'acc-checking')).toHaveLength(14);
  });

  it('suggestForEdit: Bäckerei-Name ergibt Bäckerei-Kategorie', () => {
    const item = { ...items[5], merchant: 'BAECKEREI SONNE', type: 'expense' as const };
    expect(suggestForEdit(item, ctx())).toBe('cat-groceries-bakery');
  });

  it('suggestForEdit: Umbuchung ohne Regel ergibt Eigene Konten', () => {
    const item = { ...items[5], type: 'transfer' as const, direction: 'out' as const };
    expect(suggestForEdit(item, ctx())).toBe('cat-transfer-own');
  });

  it('newestDate liefert das neueste ausgewählte Datum', () => {
    expect(newestDate(items)).toBe('2026-11-02');
  });

  it('newestDate ist null, wenn alles abgewählt ist', () => {
    expect(newestDate(items.map((i) => ({ ...i, selected: false })))).toBeNull();
  });
});
