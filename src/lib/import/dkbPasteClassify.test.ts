import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultAccounts, defaultCategories, defaultRules, FALLBACK_EXPENSE_CATEGORY } from '../db/defaults';
import { parseDkb } from './dkbParser';
import { buildImportItems, type ImportContext } from './importItems';

const NOW = '2026-11-01T12:00:00.000Z';
const paste = readFileSync(new URL('./__fixtures__/dkb-paste-ohne-tabs.txt', import.meta.url), 'utf8');

const cats = defaultCategories(NOW);
const accounts = defaultAccounts(NOW);

function ctx(): ImportContext {
  const account = accounts.find((a) => a.id === 'acc-checking') ?? accounts[0];
  return {
    txs: [],
    rules: defaultRules(NOW),
    cats,
    account,
    ownNames: ['Max Mustermann'],
  };
}

describe('Klassifizierung der Paste-Fixture (ohne Tabs)', () => {
  const items = buildImportItems(parseDkb(paste).rows, ctx());

  it('Gehalt wird cat-salary', () => {
    expect(items[0].type).toBe('income');
    expect(items[0].categoryId).toBe('cat-salary');
  });

  it('Rundfunkbeitrag wird der Kategorie „Rundfunkbeitrag“ zugeordnet', () => {
    expect(items[4].categoryId).toBe('cat-housing-broadcast');
  });

  it('Überweisung an eigenen Namen wird Umbuchung „Eigene Konten“ (Abgang)', () => {
    expect(items[5].type).toBe('transfer');
    expect(items[5].direction).toBe('out');
    expect(items[5].categoryId).toBe('cat-transfer-own');
  });

  it('Spotify wird cat-subscriptions', () => {
    expect(items[7].categoryId).toBe('cat-subscriptions');
  });

  it('Gutschrift wird cat-refund', () => {
    expect(items[8].categoryId).toBe('cat-refund');
  });

  it('Zeile ohne Art bekommt die Fallback-Ausgabenkategorie', () => {
    expect(items[10].categoryId).toBe(FALLBACK_EXPENSE_CATEGORY);
  });
});
