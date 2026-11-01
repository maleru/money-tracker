import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import { toCsv } from './csv';

const NOW = '2026-11-01T10:00:00.000Z';

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: 'expense',
    amountCents: 4215,
    date: '2026-10-21',
    categoryId: 'c1',
    merchant: 'ALDI',
    city: 'München',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function cat(id: string, name: string): Category {
  return {
    id,
    name,
    type: 'expense',
    icon: '🛒',
    color: '#16a34a',
    archived: false,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: NOW,
  };
}

const cats = new Map<string, Category>([
  ['c1', cat('c1', 'Lebensmittel')],
  ['c2', cat('c2', 'Gehalt')],
]);

describe('toCsv', () => {
  it('beginnt mit BOM und Kopfzeile, Zeilenende ist \\r\\n', () => {
    const csv = toCsv([tx('a')], cats);
    expect(csv.startsWith('\uFEFFDatum;Typ;Betrag;Kategorie;Händler;Ort;Notiz\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('formatiert Betrag mit Vorzeichen und Komma', () => {
    const csv = toCsv(
      [tx('a', { amountCents: 4215 }), tx('b', { type: 'income', amountCents: 300, categoryId: 'c2', date: '2026-10-22' })],
      cats,
    );
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('21.10.2026;Ausgabe;-42,15;Lebensmittel;ALDI;München;');
    expect(lines[2]).toBe('22.10.2026;Einnahme;3,00;Gehalt;ALDI;München;');
  });

  it('verwendet keinen Tausenderpunkt und kein €-Zeichen', () => {
    const csv = toCsv([tx('a', { amountCents: 123456789 })], cats);
    expect(csv).toContain(';-1234567,89;');
    expect(csv).not.toContain('€');
  });

  it('maskiert Semikolon, Anführungszeichen und Zeilenumbrüche', () => {
    const csv = toCsv(
      [tx('a', { merchant: 'A;B', note: 'sagt "hi"', city: 'Zeile1\nZeile2' }), tx('b', { note: 'cr\rx', date: '2026-10-22' })],
      cats,
    );
    expect(csv).toContain('"A;B"');
    expect(csv).toContain('"sagt ""hi"""');
    expect(csv).toContain('"Zeile1\nZeile2"');
    expect(csv).toContain('"cr\rx"');
  });

  it('lässt normale Felder unmaskiert', () => {
    const csv = toCsv([tx('a', { merchant: 'Café Nero', note: 'a,b' })], cats);
    expect(csv).toContain(';Café Nero;München;a,b\r\n');
  });

  it('sortiert nach Datum aufsteigend, ohne die Eingabe zu verändern', () => {
    const input = [
      tx('c', { date: '2026-10-30', merchant: 'C' }),
      tx('a', { date: '2026-09-01', merchant: 'A' }),
      tx('b', { date: '2026-10-05', merchant: 'B' }),
    ];
    const lines = toCsv(input, cats).split('\r\n');
    expect(lines[1]).toContain(';A;');
    expect(lines[2]).toContain(';B;');
    expect(lines[3]).toContain(';C;');
    expect(input.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('liefert bei leerer Liste nur BOM und Kopfzeile', () => {
    expect(toCsv([], cats)).toBe('\uFEFFDatum;Typ;Betrag;Kategorie;Händler;Ort;Notiz\r\n');
  });

  it('gibt für unbekannte Kategorien "Unbekannt" aus', () => {
    expect(toCsv([tx('a', { categoryId: 'weg' })], cats)).toContain(';Unbekannt;');
  });
});
