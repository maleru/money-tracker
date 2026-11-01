import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  isFallbackCategory,
  validateCategoryName,
} from './categoryRules';
import type { Category } from './types';

function cat(id: string, name: string, type: 'expense' | 'income' = 'expense'): Category {
  return {
    id,
    name,
    type,
    icon: '📦',
    color: '#6b7280',
    archived: false,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const cats = [cat('a', 'Lebensmittel'), cat('b', 'Gehalt', 'income'), cat('c', 'Kleidung')];

describe('validateCategoryName', () => {
  it('leer oder nur Leerzeichen', () => {
    expect(validateCategoryName('', 'expense', cats)).toBe('Bitte einen Namen eingeben');
    expect(validateCategoryName('   ', 'expense', cats)).toBe('Bitte einen Namen eingeben');
  });

  it('maximal 30 Zeichen (getrimmt)', () => {
    expect(validateCategoryName('x'.repeat(30), 'expense', cats)).toBeNull();
    expect(validateCategoryName('x'.repeat(31), 'expense', cats)).toBe('Maximal 30 Zeichen');
    expect(validateCategoryName('  ' + 'x'.repeat(30) + '  ', 'expense', cats)).toBeNull();
  });

  it('doppelter Name im gleichen Typ, case-insensitive und getrimmt', () => {
    expect(validateCategoryName('lebensmittel', 'expense', cats)).toBe('Name bereits vergeben');
    expect(validateCategoryName('  LEBENSMITTEL ', 'expense', cats)).toBe('Name bereits vergeben');
  });

  it('gleicher Name in anderem Typ ist erlaubt', () => {
    expect(validateCategoryName('Gehalt', 'expense', cats)).toBeNull();
    expect(validateCategoryName('Lebensmittel', 'income', cats)).toBeNull();
  });

  it('eigene Kategorie zählt nicht als Duplikat', () => {
    expect(validateCategoryName('Lebensmittel', 'expense', cats, 'a')).toBeNull();
    expect(validateCategoryName('Kleidung', 'expense', cats, 'a')).toBe('Name bereits vergeben');
  });

  it('freier Name ist gültig', () => {
    expect(validateCategoryName('Haustier', 'expense', cats)).toBeNull();
  });
});

describe('isFallbackCategory', () => {
  it('erkennt beide Fallback-Kategorien', () => {
    expect(isFallbackCategory('cat-other-expense')).toBe(true);
    expect(isFallbackCategory('cat-other-income')).toBe(true);
    expect(isFallbackCategory('cat-groceries')).toBe(false);
    expect(isFallbackCategory('')).toBe(false);
  });
});

describe('CATEGORY_ICONS / CATEGORY_COLORS', () => {
  it('Icons: 40 eindeutige Einträge, erste und letzte wie im Plan', () => {
    expect(CATEGORY_ICONS).toHaveLength(40);
    expect(new Set(CATEGORY_ICONS).size).toBe(40);
    expect(CATEGORY_ICONS[0]).toBe('🛒');
    expect(CATEGORY_ICONS[39]).toBe('❤️');
    expect(CATEGORY_ICONS).toContain('📦');
    expect(CATEGORY_ICONS.every((i) => i.length > 0)).toBe(true);
  });

  it('Farben: 12 gültige, eindeutige Hex-Farben', () => {
    expect(CATEGORY_COLORS).toHaveLength(12);
    expect(new Set(CATEGORY_COLORS).size).toBe(12);
    for (const c of CATEGORY_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(CATEGORY_COLORS[0]).toBe('#16a34a');
    expect(CATEGORY_COLORS[11]).toBe('#6b7280');
  });
});
