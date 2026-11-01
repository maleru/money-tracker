/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDkb, splitMerchant } from './dkbParser';

const fixture = readFileSync(new URL('./__fixtures__/dkb-oktober.txt', import.meta.url), 'utf8');

const EXPECTED = [
  { date: '2026-10-21', type: 'expense', amountCents: 4215, merchant: 'Lidl', city: '', bankType: 'Kartenzahlung' },
  { date: '2026-10-21', type: 'expense', amountCents: 2999, merchant: 'Vodafone GmbH', city: '', bankType: 'Lastschrift' },
  { date: '2026-10-20', type: 'expense', amountCents: 1099, merchant: 'Spotify', city: '', bankType: 'Kartenzahlung' },
  { date: '2026-10-19', type: 'expense', amountCents: 435, merchant: 'DM', city: '', bankType: 'Kartenzahlung' },
  { date: '2026-10-19', type: 'expense', amountCents: 299, merchant: 'Spotify', city: '', bankType: 'Kartenzahlung' },
  { date: '2026-10-16', type: 'expense', amountCents: 5540, merchant: 'Fashion Outlet Center', city: 'Musterstadt', bankType: 'Kartenzahlung' },
  { date: '2026-10-16', type: 'expense', amountCents: 650, merchant: 'Parken City Garage', city: 'Beispielstadt', bankType: 'Kartenzahlung' },
  { date: '2026-10-16', type: 'income', amountCents: 250, merchant: 'Kantine Nord Gastronomie Gmb', city: 'Beispielort', bankType: 'Gutschrift' },
  { date: '2026-10-16', type: 'expense', amountCents: 720, merchant: 'BAECKEREI SONNE', city: 'Musterhausen', bankType: 'Kartenzahluna' },
];

function withoutRaw(text: string) {
  return parseDkb(text).rows.map(({ raw: _raw, ...rest }) => rest);
}

describe('parseDkb', () => {
  it('Fixture enthält echte Tabs', () => {
    expect(fixture.includes('\t')).toBe(true);
    expect(fixture.split('\n')[1]).toBe('Oktober\t\t');
  });

  it('liefert exakt die erwartete Tabelle für die Fixture', () => {
    const result = parseDkb(fixture);
    expect(result.rows.map(({ raw: _raw, ...rest }) => rest)).toEqual(EXPECTED);
    expect(result.unparsedLines).toEqual([]);
  });

  it('verarbeitet CRLF identisch', () => {
    const crlf = fixture.replace(/\n/g, '\r\n');
    const result = parseDkb(crlf);
    expect(result.rows.map(({ raw: _raw, ...rest }) => rest)).toEqual(EXPECTED);
    expect(result.unparsedLines).toEqual([]);
  });

  it('Betrag in eigener Zeile nach der Datumszeile', () => {
    const result = parseDkb('Aldi\n21.10.26 • Kartenzahlung\n-42,15 €');
    expect(result.unparsedLines).toEqual([]);
    expect(withoutRaw('Aldi\n21.10.26 • Kartenzahlung\n-42,15 €')).toEqual([
      { date: '2026-10-21', type: 'expense', amountCents: 4215, merchant: 'Aldi', city: '', bankType: 'Kartenzahlung' },
    ]);
  });

  it('Betrag mit Tausenderpunkt', () => {
    const rows = parseDkb('Miete\n01.10.26 • Dauerauftrag\t-1.234,56 €').rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(123456);
    expect(rows[0].type).toBe('expense');
  });

  it('4-stelliges Jahr', () => {
    const rows = parseDkb('Aldi\n21.10.2026 • Kartenzahlung\t-1,00 €').rows;
    expect(rows[0].date).toBe('2026-10-21');
  });

  it('Minus-Zeichen U+2212 und U+2013 werden erkannt', () => {
    const rows = parseDkb('A\n01.10.26 • X\t\u22121,00 €\nB\n02.10.26 • X\t\u20132,00 €').rows;
    expect(rows.map((r) => [r.type, r.amountCents])).toEqual([
      ['expense', 100],
      ['expense', 200],
    ]);
  });

  it('Händlerzeile ohne Buchungszeile landet in unparsedLines', () => {
    const result = parseDkb('Aldi\n21.10.26 • Kartenzahlung\t-1,00 €\nUnbekannter Händler');
    expect(result.rows).toHaveLength(1);
    expect(result.unparsedLines).toEqual(['Unbekannter Händler']);
  });

  it('leerer Text ergibt 0 rows', () => {
    expect(parseDkb('')).toEqual({ rows: [], unparsedLines: [] });
  });

  it('Kontostand wird nicht zum Händler der nächsten Buchung', () => {
    const text = 'Kontostand\n1.234,56 €\nAldi\n21.10.26 • Kartenzahlung\t-1,00 €';
    const result = parseDkb(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].merchant).toBe('Aldi');
    expect(result.unparsedLines).toEqual([]);
  });

  it('ungültiges Datum landet in unparsedLines', () => {
    const result = parseDkb('Aldi\n31.02.26 • Kartenzahlung\t-1,00 €');
    expect(result.rows).toEqual([]);
    expect(result.unparsedLines).toEqual(['31.02.26 • Kartenzahlung\t-1,00 €'.replace('\t', ' ')]);
  });
});

describe('splitMerchant', () => {
  it('trennt am letzten Slash', () => {
    expect(splitMerchant('Fashion.Outlet.Center/ Musterstadt')).toEqual({ merchant: 'Fashion Outlet Center', city: 'Musterstadt' });
    expect(splitMerchant('A/B/ Ort')).toEqual({ merchant: 'A/B', city: 'Ort' });
  });

  it('Ort in Großbuchstaben wird Title-Case, gemischter bleibt', () => {
    expect(splitMerchant('BAECKEREI.SONNE/ MUSTERHAUSEN')).toEqual({ merchant: 'BAECKEREI SONNE', city: 'Musterhausen' });
    expect(splitMerchant('X/ Beispielstadt').city).toBe('Beispielstadt');
  });

  it('Punkte werden nur ersetzt, wenn kein Leerzeichen vorkommt', () => {
    expect(splitMerchant('Kantine...Nord.Gastronomie.Gmb/ Beispielort').merchant).toBe('Kantine Nord Gastronomie Gmb');
    expect(splitMerchant('Dr. Müller').merchant).toBe('Dr. Müller');
    expect(splitMerchant('Aldi')).toEqual({ merchant: 'Aldi', city: '' });
  });
});
