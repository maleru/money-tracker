import { describe, expect, it } from 'vitest';
import { parseDkb } from './dkbParser';

describe('parseDkb Performance', () => {
  it('verarbeitet 5000 Buchungszeilen in unter 1 s', () => {
    const block = [
      '10.10.2026',
      'Kaufland Musterhausen',
      '-12,34 €',
      '09.10.2026 • REWE/ Berlin',
      '-5,00 €',
      'Gehalt',
      '+2.500,00 €',
      'Heute',
    ];
    const lines: string[] = [];
    while (lines.length < 5000) lines.push(...block);
    const text = lines.join('\n');

    const start = performance.now();
    const result = parseDkb(text);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('verarbeitet 5000 Zeilen mit vielen Zahlen und Punkten in unter 1 s', () => {
    const lines: string[] = [];
    while (lines.length < 5000) lines.push('1.2.3.4.5 '.repeat(40), '01.10.26 • Kartenzahlung', '-1,00 €');
    const text = lines.join('\n');

    const start = performance.now();
    parseDkb(text);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  it('bleibt bei einer 5000 Zeichen langen Pathologie-Zeile unter 1 s', () => {
    const long = '01.10.2026 ' + ' '.repeat(2500) + 'x'.repeat(2500);
    const text = [long, '-1,00 €'].join('\n');

    const start = performance.now();
    parseDkb(text);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });
});
