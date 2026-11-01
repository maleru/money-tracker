/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDkb, prepareLine, splitMerchant, splitMerchantLines } from './dkbParser';

const fixture = readFileSync(new URL('./__fixtures__/dkb-oktober.txt', import.meta.url), 'utf8');
const fixtureNov = readFileSync(new URL('./__fixtures__/dkb-november.txt', import.meta.url), 'utf8');

const EXPECTED = [
  { date: '2026-10-21', type: 'expense', amountCents: 4215, merchant: 'Lidl', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-21', type: 'expense', amountCents: 2999, merchant: 'Vodafone GmbH', city: '', bankType: 'Lastschrift', pending: false },
  { date: '2026-10-20', type: 'expense', amountCents: 1099, merchant: 'Spotify', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-19', type: 'expense', amountCents: 435, merchant: 'DM', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-19', type: 'expense', amountCents: 299, merchant: 'Spotify', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-16', type: 'expense', amountCents: 5540, merchant: 'Fashion Outlet Center', city: 'Musterstadt', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-16', type: 'expense', amountCents: 650, merchant: 'Parken City Garage', city: 'Beispielstadt', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-16', type: 'income', amountCents: 250, merchant: 'Kantine Nord Gastronomie Gmb', city: 'Beispielort', bankType: 'Gutschrift', pending: false },
  { date: '2026-10-16', type: 'expense', amountCents: 720, merchant: 'BAECKEREI SONNE', city: 'Musterhausen', bankType: 'Kartenzahluna', pending: false },
];

/** Verbindliche Ergebnistabelle der November-Fixture (E4.4). */
const EXPECTED_NOVEMBER = [
  { date: '2026-11-02', type: 'expense', amountCents: 5980, merchant: 'CITYfit Fitness- und Gesund-heitsclub Musterstadt GmbH', city: '', bankType: '', pending: false },
  { date: '2026-11-02', type: 'expense', amountCents: 36921, merchant: 'ARAG SE', city: '', bankType: '', pending: false },
  { date: '2026-11-02', type: 'expense', amountCents: 112000, merchant: 'Erika und Hans Muster', city: '', bankType: 'Dauerauftrag', pending: false },
  { date: '2026-10-30', type: 'expense', amountCents: 364, merchant: 'REWE', city: '', bankType: 'Vorgemerkt', pending: true },
  { date: '2026-10-30', type: 'expense', amountCents: 968, merchant: 'REWE', city: '', bankType: 'Vorgemerkt', pending: true },
  { date: '2026-10-30', type: 'expense', amountCents: 340, merchant: 'KANTINE MUSTERSTADT M211', city: 'Musterstadt', bankType: 'Vorgemerkt', pending: true },
  { date: '2026-10-30', type: 'expense', amountCents: 670, merchant: 'BrotHaus', city: '', bankType: 'Vorgemerkt', pending: true },
  { date: '2026-10-30', type: 'expense', amountCents: 5955, merchant: 'Muster Aktiengesellschaft', city: '', bankType: 'Lastschrift', pending: false },
  { date: '2026-10-26', type: 'expense', amountCents: 2600, merchant: "L'Osteria", city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-26', type: 'expense', amountCents: 558, merchant: 'BrotHaus', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-26', type: 'expense', amountCents: 4837, merchant: 'REWE', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-26', type: 'income', amountCents: 300000, merchant: 'Max Mustermann', city: '', bankType: 'Gutschrift (Echtzeit)', pending: false },
  { date: '2026-10-21', type: 'expense', amountCents: 4215, merchant: 'Lidl', city: '', bankType: 'Kartenzahlung', pending: false },
  { date: '2026-10-21', type: 'expense', amountCents: 2999, merchant: 'Vodafone GmbH', city: '', bankType: 'Lastschrift', pending: false },
  { date: '2026-10-20', type: 'expense', amountCents: 1099, merchant: 'Spotify', city: '', bankType: 'Kartenzahlung', pending: false },
];

function withoutRaw(text: string) {
  return parseDkb(text).rows.map(({ raw: _raw, ...rest }) => rest);
}

describe('parseDkb', () => {
  it('Oktober-Fixture enthält echte Tabs', () => {
    expect(fixture.includes('\t')).toBe(true);
    expect(fixture.split('\n')[1]).toBe('Oktober\t\t');
  });

  it('November-Fixture enthält echte Tabs und kein ⇥-Zeichen', () => {
    expect(fixtureNov.includes('\t')).toBe(true);
    expect(fixtureNov.includes('\u21e5')).toBe(false);
  });

  it('liefert exakt die erwartete Tabelle für die Oktober-Fixture', () => {
    const result = parseDkb(fixture);
    expect(result.rows.map(({ raw: _raw, ...rest }) => rest)).toEqual(EXPECTED);
    expect(result.unparsedLines).toEqual([]);
  });

  it('verarbeitet CRLF identisch (Oktober)', () => {
    const crlf = fixture.replace(/\n/g, '\r\n');
    const result = parseDkb(crlf);
    expect(result.rows.map(({ raw: _raw, ...rest }) => rest)).toEqual(EXPECTED);
    expect(result.unparsedLines).toEqual([]);
  });

  it('liefert exakt die erwartete November-Tabelle', () => {
    const result = parseDkb(fixtureNov);
    expect(result.rows.map(({ raw: _raw, ...rest }) => rest)).toEqual(EXPECTED_NOVEMBER);
    expect(result.unparsedLines).toEqual([]);
  });

  it('verarbeitet CRLF identisch (November)', () => {
    const crlf = fixtureNov.replace(/\n/g, '\r\n');
    const result = parseDkb(crlf);
    expect(result.rows.map(({ raw: _raw, ...rest }) => rest)).toEqual(EXPECTED_NOVEMBER);
    expect(result.unparsedLines).toEqual([]);
  });

  it('Betrag in eigener Zeile nach der Datumszeile', () => {
    const result = parseDkb('Aldi\n21.10.26 • Kartenzahlung\n-42,15 €');
    expect(result.unparsedLines).toEqual([]);
    expect(withoutRaw('Aldi\n21.10.26 • Kartenzahlung\n-42,15 €')).toEqual([
      { date: '2026-10-21', type: 'expense', amountCents: 4215, merchant: 'Aldi', city: '', bankType: 'Kartenzahlung', pending: false },
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

  it('Den Matt⇥REWE: Störtext vor dem Tab wird entfernt', () => {
    const rows = parseDkb('Den Matt\tREWE\n26.10.26 • Kartenzahlung\t-48,37 €').rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe('REWE');
  });

  it('Eine Länderzeile ohne vorherige Händlerzeile bleibt erhalten', () => {
    const rows = parseDkb('\tDM\n19.10.26 • Kartenzahlung\t-4,35 €').rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toBe('DM');
  });

  it('Länderzeile nach Händlerzeile wird verworfen', () => {
    const result = parseDkb('Aldi\nDE\n21.10.26 • Kartenzahlung\t-1,00 €');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].merchant).toBe('Aldi');
    expect(result.rows[0].city).toBe('');
    expect(result.unparsedLines).toEqual([]);
  });

  it('Ortszeile in Großbuchstaben wird zum Ort', () => {
    const result = parseDkb('PAYPAL EUROPE\nLUXEMBOURG\n01.10.26 • Lastschrift\t-5,00 €');
    expect(result.rows[0].merchant).toBe('PAYPAL EUROPE');
    expect(result.rows[0].city).toBe('Luxembourg');
  });

  it('zwei Zeilen ohne Ortszeile werden zum Händlernamen verbunden', () => {
    const result = parseDkb('Muster Shop\nZweite Zeile\n01.10.26 • X\t-1,00 €');
    expect(result.rows[0].merchant).toBe('Muster Shop Zweite Zeile');
    expect(result.rows[0].city).toBe('');
  });

  it('Überschriften „Anstehende Umsätze“ und „Letzte 30 Tage“ werden ignoriert', () => {
    const result = parseDkb('Anstehende Umsätze\nLetzte 30 Tage\nNovember 2026\nAldi\n01.11.26\t-1,00 €');
    expect(result.rows).toHaveLength(1);
    expect(result.unparsedLines).toEqual([]);
    expect(result.rows[0].bankType).toBe('');
    expect(result.rows[0].merchant).toBe('Aldi');
  });

  it('Vorgemerkt mit + Präfix und Minus-Betrag bleibt Ausgabe', () => {
    const rows = parseDkb('REWE\n+ Vorgemerkt • 30.10.26\t-9,68 €').rows;
    expect(rows[0].type).toBe('expense');
    expect(rows[0].pending).toBe(true);
  });

  it('Vorgemerkt mit + Präfix und Plus-Betrag ist Einnahme', () => {
    const rows = parseDkb('REWE\n+ Vorgemerkt • 30.10.26\t+9,68 €').rows;
    expect(rows[0].type).toBe('income');
    expect(rows[0].pending).toBe(true);
    expect(rows[0].bankType).toBe('Vorgemerkt');
  });

  it('Gutschrift (Echtzeit) wird als bankType erkannt', () => {
    const rows = parseDkb('X\n26.10.26 • Gutschrift (Echtzeit)\t+3.000,00 €').rows;
    expect(rows[0].amountCents).toBe(300000);
    expect(rows[0].bankType).toBe('Gutschrift (Echtzeit)');
    expect(rows[0].pending).toBe(false);
  });
});

describe('prepareLine', () => {
  it('entfernt Störtext vor dem Tab', () => {
    expect(prepareLine('Den Matt\tREWE')).toBe('REWE');
  });

  it('führender Tab wird getrimmt', () => {
    expect(prepareLine('\tREWE')).toBe('REWE');
  });

  it('Datumszeile behält Tabs als Leerzeichen', () => {
    expect(prepareLine('02.11.26\t-59,80 €')).toBe('02.11.26 -59,80 €');
  });
});

describe('splitMerchantLines', () => {
  it('Slash-Zeile plus Ortszeile wird über splitMerchant gelesen', () => {
    expect(splitMerchantLines(['Fashion.Outlet.Center/', 'Musterstadt'])).toEqual({
      merchant: 'Fashion Outlet Center',
      city: 'Musterstadt',
    });
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
