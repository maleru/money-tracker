import { describe, expect, it } from 'vitest';
import { looksLikeCreditCard, parseCreditCard, splitCardMerchant } from './creditCardParser';
import { parseBankText } from './parse';

// Frei erfundene Testdaten.
const SAMPLE = [
  '03.05.2027 01.05.2027 Kartenumsatz',
  'MUSTER BAECKEREI GMBH, BEISPIELSTADT',
  '9876 -4,80',
  '04.05.2027 02.05.2027 Kartenumsatz',
  'Testwerke AG, Musterhausen',
  '9876 -1.234,56',
  '06.05.2027 05.05.2027 Gutschrift',
  'ONLINESHOP XY, 0123456789',
  '9876 19,99',
].join('\n');

describe('looksLikeCreditCard', () => {
  it('erkennt Kopfzeilen mit zwei Daten', () => {
    expect(looksLikeCreditCard(SAMPLE)).toBe(true);
  });

  it('erkennt DKB-Girotext nicht als Kreditkarte', () => {
    expect(looksLikeCreditCard('Kiosk\n21.10.26 • Kartenzahlung\t-1,00 €')).toBe(false);
  });
});

describe('splitCardMerchant', () => {
  it('trennt am letzten Komma und normalisiert Großbuchstaben-Orte', () => {
    expect(splitCardMerchant('FIRMA A, ABT. B, NEUSTADT')).toEqual({ merchant: 'FIRMA A, ABT. B', city: 'Neustadt' });
  });

  it('verwirft Nummern und Web-Adressen als Ort', () => {
    expect(splitCardMerchant('SHOP, 555123')).toEqual({ merchant: 'SHOP', city: '' });
    expect(splitCardMerchant('REISE AG, WWW.REISEAG')).toEqual({ merchant: 'REISE AG', city: '' });
    expect(splitCardMerchant('HOTLINE, (000)111-2222')).toEqual({ merchant: 'HOTLINE', city: '' });
  });

  it('ohne Komma ist alles Händler', () => {
    expect(splitCardMerchant('Nur Haendler')).toEqual({ merchant: 'Nur Haendler', city: '' });
  });
});

describe('parseCreditCard', () => {
  it('liest dreizeilige Buchungen', () => {
    const { rows, unparsedLines } = parseCreditCard(SAMPLE);
    expect(unparsedLines).toEqual([]);
    expect(rows.map((r) => [r.date, r.type, r.amountCents, r.merchant, r.city, r.bankType])).toEqual([
      ['2027-05-01', 'expense', 480, 'MUSTER BAECKEREI GMBH', 'Beispielstadt', 'Kartenumsatz'],
      ['2027-05-02', 'expense', 123456, 'Testwerke AG', 'Musterhausen', 'Kartenumsatz'],
      ['2027-05-05', 'income', 1999, 'ONLINESHOP XY', '', 'Gutschrift'],
    ]);
  });

  it('nimmt das frühere Datum, auch bei umgekehrter Reihenfolge', () => {
    const { rows } = parseCreditCard('01.06.2027 03.06.2027 Kartenumsatz\nLaden, Ort\n1111 -2,00');
    expect(rows[0].date).toBe('2027-06-01');
  });

  it('akzeptiert Betrag ohne Kartenendziffern und mit €', () => {
    const { rows } = parseCreditCard('01.06.2027 01.06.2027 Kartenumsatz\nLaden, Ort\n-2,50 €');
    expect(rows[0].amountCents).toBe(250);
  });

  it('Händler über mehrere Zeilen und Tabs', () => {
    const { rows } = parseCreditCard('01.06.2027\t02.06.2027\tKartenumsatz\nTeil eins\nTeil zwei, Ort\n1111\t-3,00');
    expect(rows[0]).toMatchObject({ merchant: 'Teil eins Teil zwei', city: 'Ort', amountCents: 300 });
  });

  it('einzeilige Variante', () => {
    const { rows } = parseCreditCard('01.06.2027 02.06.2027 Kiosk, Dorf 1111 -1,50');
    expect(rows[0]).toMatchObject({ date: '2027-06-01', merchant: 'Kiosk', city: 'Dorf', amountCents: 150 });
  });

  it('unvollständige Buchungen und Fremdzeilen landen in unparsedLines', () => {
    const text = 'Überschrift\n01.06.2027 02.06.2027 Kartenumsatz\nOhne Betrag\n02.06.2027 03.06.2027 Kartenumsatz\nOk, Ort\n1111 -1,00';
    const { rows, unparsedLines } = parseCreditCard(text);
    expect(rows).toHaveLength(1);
    expect(unparsedLines).toEqual(['Überschrift', '01.06.2027 02.06.2027 Kartenumsatz', 'Ohne Betrag']);
  });

  it('ungültiges Datum wird nicht übernommen', () => {
    const { rows, unparsedLines } = parseCreditCard('31.02.2027 01.03.2027 Kartenumsatz\nX, Y\n1111 -1,00');
    expect(rows).toEqual([]);
    expect(unparsedLines).toHaveLength(3);
  });
});

describe('parseBankText mit Format', () => {
  it('auto erkennt das Kreditkarten-Format', () => {
    expect(parseBankText(SAMPLE).rows).toHaveLength(3);
  });

  it('credit erzwingt den Kreditkarten-Parser', () => {
    expect(parseBankText('21.10.2026 Kiosk 3,50', 'credit').rows).toEqual([]);
  });

  it('giro nutzt den bisherigen Weg (nicht den Kreditkarten-Parser)', () => {
    expect(parseBankText(SAMPLE, 'giro')).not.toEqual(parseCreditCard(SAMPLE));
  });
});
