import { describe, expect, it } from 'vitest';
import { parseGeneric } from './genericParser';

describe('parseGeneric', () => {
  it('erkennt Datum, Betrag und Händler in einer Zeile', () => {
    const { rows, unparsedLines } = parseGeneric('21.10.2026 Aldi Süd -42,15 €');
    expect(unparsedLines).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-10-21',
      type: 'expense',
      amountCents: 4215,
      merchant: 'Aldi Süd',
      city: '',
      bankType: '',
    });
  });

  it('ohne explizites Plus ist es eine Ausgabe, mit Plus eine Einnahme', () => {
    const { rows } = parseGeneric('01.10.26 Gehalt +2.500,00 €\n02.10.26 Kiosk 3,50');
    expect(rows.map((r) => [r.type, r.amountCents, r.merchant])).toEqual([
      ['income', 250000, 'Gehalt'],
      ['expense', 350, 'Kiosk'],
    ]);
  });

  it('nimmt den letzten Betrag der Zeile', () => {
    const { rows } = parseGeneric('05.10.26 Shop 12,00 Rabatt -3,00 €');
    expect(rows[0].amountCents).toBe(300);
  });

  it('Zeilen ohne Datum oder Betrag landen in unparsedLines', () => {
    const { rows, unparsedLines } = parseGeneric('nur Text\n05.10.26 ohne Betrag\nShop 3,00 ohne Datum');
    expect(rows).toEqual([]);
    expect(unparsedLines).toEqual(['nur Text', '05.10.26 ohne Betrag', 'Shop 3,00 ohne Datum']);
  });

  it('ungültiges Datum landet in unparsedLines', () => {
    const { rows, unparsedLines } = parseGeneric('31.02.26 Shop -1,00 €');
    expect(rows).toEqual([]);
    expect(unparsedLines).toHaveLength(1);
  });

  it('leerer Text ergibt 0 rows', () => {
    expect(parseGeneric('')).toEqual({ rows: [], unparsedLines: [] });
  });
});
