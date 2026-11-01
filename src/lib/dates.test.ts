import { describe, it, expect } from 'vitest';
import {
  MONTH_NAMES,
  MONTH_SHORT,
  WEEKDAY_NAMES,
  toIsoDate,
  todayIso,
  yesterdayIso,
  parseIsoDate,
  isValidIsoDate,
  monthKey,
  currentMonthKey,
  addMonths,
  monthLabel,
  daysInMonth,
  formatDate,
  dayHeader,
  parseGermanDate,
  daysBetween,
} from './dates';

describe('Namen', () => {
  it('haben die richtige Länge', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_SHORT).toHaveLength(12);
    expect(WEEKDAY_NAMES).toHaveLength(7);
  });
});

describe('toIsoDate / todayIso / yesterdayIso', () => {
  it('nutzt lokale Zeit und nicht UTC', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('todayIso hat das Format YYYY-MM-DD und ist gültig', () => {
    expect(isValidIsoDate(todayIso())).toBe(true);
  });

  it('yesterdayIso liegt genau einen Tag vor todayIso', () => {
    expect(daysBetween(yesterdayIso(), todayIso())).toBe(1);
  });

  it('currentMonthKey passt zu todayIso', () => {
    expect(currentMonthKey()).toBe(todayIso().slice(0, 7));
  });
});

describe('parseIsoDate', () => {
  it('liefert ein lokales Datum', () => {
    const d = parseIsoDate('2026-10-21');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(21);
  });
});

describe('isValidIsoDate', () => {
  it('akzeptiert gültige Daten', () => {
    expect(isValidIsoDate('2026-10-21')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('lehnt ungültige Daten ab', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('2026-10-00')).toBe(false);
    expect(isValidIsoDate('2026-1-1')).toBe(false);
    expect(isValidIsoDate('21.10.2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('monthKey', () => {
  it('schneidet den Monat heraus', () => {
    expect(monthKey('2026-10-21')).toBe('2026-10');
  });
});

describe('addMonths', () => {
  it('geht über die Jahresgrenze vorwärts', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
  });

  it('geht über die Jahresgrenze rückwärts', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-02', -3)).toBe('2025-11');
  });

  it('funktioniert über mehrere Jahre', () => {
    expect(addMonths('2026-05', 24)).toBe('2028-05');
    expect(addMonths('2026-05', -17)).toBe('2024-12');
  });

  it('ändert bei 0 nichts', () => {
    expect(addMonths('2026-05', 0)).toBe('2026-05');
  });
});

describe('monthLabel', () => {
  it('liefert den deutschen Monatsnamen', () => {
    expect(monthLabel('2026-10')).toBe('Oktober 2026');
    expect(monthLabel('2026-03')).toBe('März 2026');
  });
});

describe('daysInMonth', () => {
  it('kennt Schaltjahre', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('kennt 30- und 31-Tage-Monate', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 10)).toBe(31);
  });
});

describe('formatDate', () => {
  it('formatiert als TT.MM.JJJJ', () => {
    expect(formatDate('2026-10-21')).toBe('21.10.2026');
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
  });
});

describe('dayHeader', () => {
  it('liefert Wochentag, Tag und Monatsnamen für ein festes Datum', () => {
    expect(dayHeader('2026-10-21')).toBe('Mittwoch, 21. Oktober 2026');
    expect(dayHeader('2026-01-05')).toBe('Montag, 5. Januar 2026');
  });

  it('liefert Heute und Gestern', () => {
    expect(dayHeader(todayIso())).toBe('Heute');
    expect(dayHeader(yesterdayIso())).toBe('Gestern');
  });
});

describe('parseGermanDate', () => {
  it('parst zweistellige und vierstellige Jahre', () => {
    expect(parseGermanDate('1.5.2026')).toBe('2026-05-01');
    expect(parseGermanDate('21.10.26')).toBe('2026-10-21');
    expect(parseGermanDate('21.10.2026')).toBe('2026-10-21');
  });

  it('gibt für ungültige Daten null zurück', () => {
    expect(parseGermanDate('31.02.26')).toBeNull();
    expect(parseGermanDate('32.01.2026')).toBeNull();
    expect(parseGermanDate('21.13.2026')).toBeNull();
    expect(parseGermanDate('abc')).toBeNull();
    expect(parseGermanDate('')).toBeNull();
    expect(parseGermanDate('21.10.202')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('zählt Tage', () => {
    expect(daysBetween('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysBetween('2026-10-21', '2026-10-22')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('liefert negative Werte rückwärts', () => {
    expect(daysBetween('2026-10-22', '2026-10-21')).toBe(-1);
  });

  it('ist robust gegenüber Sommerzeit', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});
