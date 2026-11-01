import { describe, it, expect } from 'vitest';
import { parseAmountToCents, formatCents, signedCents, centsToInput } from './money';

const norm = (s: string): string => s.replace(/\s/g, ' ');

describe('parseAmountToCents', () => {
  const cases: [string, number | null][] = [
    ['42,15', 4215],
    ['-42,15 €', 4215],
    ['- 29,99 €', 2999],
    ['+3,00 €', 300],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['12.5', 1250],
    ['12,345', null],
    ['0', null],
    ['', null],
    ['abc', null],
    ['1,2,3', null],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" => ${expected}`, () => {
      expect(parseAmountToCents(input)).toBe(expected);
    });
  }

  it('ignoriert das Unicode-Minuszeichen', () => {
    expect(parseAmountToCents('−3,00 €')).toBe(300);
  });

  it('gibt für 0,00 null zurück', () => {
    expect(parseAmountToCents('0,00')).toBeNull();
  });

  it('akzeptiert eine Nachkommastelle und ganze Zahlen', () => {
    expect(parseAmountToCents('5,5')).toBe(550);
    expect(parseAmountToCents('5')).toBe(500);
  });

  it('akzeptiert mehrere Tausenderpunkte', () => {
    expect(parseAmountToCents('1.234.567')).toBe(123456700);
  });

  it('lehnt mehrere Dezimalpunkte ab', () => {
    expect(parseAmountToCents('1.2.3')).toBeNull();
  });

  it('beachtet die Obergrenze', () => {
    expect(parseAmountToCents('99999999,99')).toBe(9_999_999_999);
    expect(parseAmountToCents('100000000,00')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formatiert 4215 als "42,15 €"', () => {
    expect(norm(formatCents(4215))).toBe('42,15 €');
  });

  it('nutzt bei sign:always ein Unicode-Minus', () => {
    expect(norm(formatCents(-300, { sign: 'always' }))).toBe('\u22123,00 €');
  });

  it('setzt bei sign:always ein Plus für positive Beträge', () => {
    expect(norm(formatCents(4215, { sign: 'always' }))).toBe('+42,15 €');
  });

  it('zeigt bei auto nur bei negativen Beträgen ein Minus', () => {
    expect(norm(formatCents(-300))).toBe('\u22123,00 €');
    expect(norm(formatCents(300))).toBe('3,00 €');
  });

  it('nutzt Tausenderpunkte', () => {
    expect(norm(formatCents(123456))).toBe('1.234,56 €');
  });
});

describe('parseAmountToCents Grenzfälle', () => {
  const cases: [string, number | null][] = [
    ['1.234.567,89', 123456789],
    ['1,234,567', null],
    ['1.234,567', null],
    ['0,01', 1],
    ['-0,00', null],
    ['0,00 €', null],
    ['12,', null],
    [',50', null],
    ['1 234,56', 123456],
    ['1.234,5', 123450],
    ['12,3,4', null],
    ['1.2345', null],
    ['00', null],
    ['0,5', 50],
    ['99999999,99', 9_999_999_999],
    ['99999999,999', null],
    ['1.2.3,4', 12340],
  ];
  for (const [input, expected] of cases) {
    it(`Grenzfall "${input}" => ${expected}`, () => {
      expect(parseAmountToCents(input)).toBe(expected);
    });
  }
});

describe('centsToInput', () => {
  it('formatiert ohne Währung, Vorzeichen und Tausenderpunkt', () => {
    expect(centsToInput(4215)).toBe('42,15');
    expect(centsToInput(123456)).toBe('1234,56');
    expect(centsToInput(5)).toBe('0,05');
    expect(centsToInput(1000)).toBe('10,00');
  });

  it('ist die Umkehrung von parseAmountToCents', () => {
    for (const cents of [1, 99, 100, 4215, 123456, 9_999_999_999]) {
      expect(parseAmountToCents(centsToInput(cents))).toBe(cents);
    }
  });
});

describe('signedCents', () => {
  it('macht Ausgaben negativ und Einnahmen positiv', () => {
    expect(signedCents({ type: 'expense', amountCents: 500 })).toBe(-500);
    expect(signedCents({ type: 'income', amountCents: 500 })).toBe(500);
  });
  it('berücksichtigt die Richtung bei Umbuchungen', () => {
    expect(signedCents({ type: 'transfer', amountCents: 500, direction: 'in' })).toBe(500);
    expect(signedCents({ type: 'transfer', amountCents: 500, direction: 'out' })).toBe(-500);
  });
});
