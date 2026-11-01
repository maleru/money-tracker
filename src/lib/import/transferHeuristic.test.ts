import { describe, expect, it } from 'vitest';
import type { AccountKind } from '../types';
import { detectTransfer, isCreditCardWindow } from './transferHeuristic';
import type { ParsedRow } from './parse';

const own = ['Max Mustermann'];

function row(over: Partial<ParsedRow>): ParsedRow {
  return {
    date: '2026-10-15',
    type: 'expense',
    amountCents: 1000,
    merchant: 'Unbekannt',
    city: '',
    bankType: '',
    pending: false,
    raw: '',
    ...over,
  };
}

const SAVINGS = { direction: 'in', categoryId: 'cat-transfer-savings' };
const CARD = { direction: 'out', categoryId: 'cat-transfer-credit-card' };
const OWN = { direction: 'out', categoryId: 'cat-transfer-own' };

describe('detectTransfer', () => {
  const cases: {
    name: string;
    r: Partial<ParsedRow>;
    kind: AccountKind;
    names: string[];
    expected: unknown;
  }[] = [
    {
      name: 'Eingang von eigenem Namen -> Tagesgeld',
      r: { merchant: 'Max Mustermann', type: 'income', bankType: 'Gutschrift (Echtzeit)', date: '2026-10-26' },
      kind: 'checking',
      names: own,
      expected: SAVINGS,
    },
    {
      name: 'Teilmenge des Namens (Wörter in beliebiger Reihenfolge) -> Tagesgeld',
      r: { merchant: 'Max Leon Mustermann', type: 'income', bankType: '', date: '2026-10-10' },
      kind: 'checking',
      names: own,
      expected: SAVINGS,
    },
    {
      name: 'Lastschrift am 28. -> Kreditkarte',
      r: { merchant: 'Max Mustermann', type: 'expense', bankType: 'Lastschrift', date: '2026-10-28' },
      kind: 'checking',
      names: own,
      expected: CARD,
    },
    {
      name: 'Lastschrift am 5. -> Kreditkarte',
      r: { merchant: 'Max Mustermann', type: 'expense', bankType: 'Lastschrift', date: '2026-11-05' },
      kind: 'checking',
      names: own,
      expected: CARD,
    },
    {
      name: 'Lastschrift am 6. -> Eigene Konten',
      r: { merchant: 'Max Mustermann', type: 'expense', bankType: 'Lastschrift', date: '2026-11-06' },
      kind: 'checking',
      names: own,
      expected: OWN,
    },
    {
      name: 'Überweisung am 28. -> Eigene Konten',
      r: { merchant: 'Max Mustermann', type: 'expense', bankType: 'Überweisung', date: '2026-10-28' },
      kind: 'checking',
      names: own,
      expected: OWN,
    },
    {
      name: 'Kreditkarten-Konto -> null',
      r: { merchant: 'Max Mustermann', type: 'income', bankType: '', date: '2026-10-26' },
      kind: 'credit_card',
      names: own,
      expected: null,
    },
    {
      name: 'Kreditkarten-Stichwort VISA in Ausgabe -> Kreditkarte, auch ohne eigenen Namen',
      r: { merchant: 'DKB VISA KARTENABRECHNUNG', type: 'expense', bankType: 'Lastschrift', date: '2026-10-15' },
      kind: 'checking',
      names: [],
      expected: CARD,
    },
    {
      name: 'VISA in Einnahme -> null (Stichwort nur bei Ausgaben)',
      r: { merchant: 'VISA Rueckzahlung', type: 'income', bankType: '', date: '2026-10-15' },
      kind: 'checking',
      names: [],
      expected: null,
    },
    {
      name: 'Maxi Mustermann -> null (Wort fehlt)',
      r: { merchant: 'Maxi Mustermann', type: 'income', bankType: '', date: '2026-10-15' },
      kind: 'checking',
      names: own,
      expected: null,
    },
    {
      name: 'Ohne eigene Namen -> null',
      r: { merchant: 'Max Mustermann', type: 'income', bankType: '', date: '2026-10-15' },
      kind: 'checking',
      names: [],
      expected: null,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(detectTransfer(row(c.r), c.kind, c.names)).toEqual(c.expected);
    });
  }
});

describe('isCreditCardWindow', () => {
  it('Tage 25–31 und 1–5 gelten als Fenster', () => {
    expect(isCreditCardWindow('2026-10-25')).toBe(true);
    expect(isCreditCardWindow('2026-10-24')).toBe(false);
    expect(isCreditCardWindow('2026-11-01')).toBe(true);
    expect(isCreditCardWindow('2026-11-05')).toBe(true);
    expect(isCreditCardWindow('2026-11-06')).toBe(false);
  });
});
