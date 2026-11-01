import { describe, expect, it } from 'vitest';
import { defaultCategories } from './db/defaults';
import { categoryLabel, categoryOptions, childrenOf, rootCategoryId, rootsOf } from './categoryTree';
import type { Category } from './types';

const NOW = '2026-01-01T00:00:00.000Z';

function cats(): Category[] {
  return defaultCategories(NOW);
}

function toMap(list: Category[]): Map<string, Category> {
  return new Map(list.map((c) => [c.id, c]));
}

function archive(list: Category[], id: string): Category[] {
  return list.map((c) => (c.id === id ? { ...c, archived: true } : c));
}

describe('rootCategoryId', () => {
  const map = toMap(cats());
  it('liefert die Hauptkategorie eines Kindes', () => {
    expect(rootCategoryId('cat-groceries-bakery', map)).toBe('cat-groceries');
  });
  it('liefert bei Hauptkategorien die id selbst', () => {
    expect(rootCategoryId('cat-groceries', map)).toBe('cat-groceries');
  });
  it('liefert bei unbekannter id die id selbst', () => {
    expect(rootCategoryId('unbekannt', map)).toBe('unbekannt');
  });
});

describe('childrenOf', () => {
  it('sortiert nach sortOrder', () => {
    expect(childrenOf('cat-housing', cats()).map((c) => c.id)).toEqual([
      'cat-housing-rent',
      'cat-housing-electricity',
      'cat-housing-heating',
      'cat-housing-broadcast',
      'cat-housing-other',
    ]);
  });
  it('blendet archivierte aus, außer bei includeArchived', () => {
    const list = archive(cats(), 'cat-housing-heating');
    expect(childrenOf('cat-housing', list).map((c) => c.id)).not.toContain('cat-housing-heating');
    expect(childrenOf('cat-housing', list)).toHaveLength(4);
    expect(childrenOf('cat-housing', list, true)).toHaveLength(5);
  });
});

describe('rootsOf', () => {
  it('liefert die Transfer-Kategorien in Reihenfolge', () => {
    expect(rootsOf('transfer', cats()).map((c) => c.id)).toEqual([
      'cat-transfer-savings',
      'cat-transfer-invest',
      'cat-transfer-credit-card',
      'cat-transfer-own',
    ]);
  });
  it('liefert 15 Ausgaben-Hauptkategorien', () => {
    expect(rootsOf('expense', cats())).toHaveLength(15);
  });
  it('blendet archivierte aus, außer bei includeArchived', () => {
    const list = archive(cats(), 'cat-cafe');
    expect(rootsOf('expense', list)).toHaveLength(14);
    expect(rootsOf('expense', list, true)).toHaveLength(15);
  });
});

describe('categoryOptions', () => {
  it('listet Hauptkategorien gefolgt von ihren Kindern', () => {
    expect(categoryOptions(cats(), 'expense').slice(0, 4)).toEqual([
      { id: 'cat-groceries', label: '🛒 Lebensmittel', isChild: false },
      { id: 'cat-groceries-supermarket', label: '🛒 Lebensmittel › Supermarkt / Wocheneinkauf', isChild: true },
      { id: 'cat-groceries-bakery', label: '🥐 Lebensmittel › Bäckerei', isChild: true },
      { id: 'cat-restaurant', label: '🍽️ Restaurant & Essen', isChild: false },
    ]);
  });
  it('hat 24 Ausgaben-Optionen', () => {
    expect(categoryOptions(cats(), 'expense')).toHaveLength(24);
  });
  it('hängt eine archivierte keepId am Ende an', () => {
    const list = archive(cats(), 'cat-cafe');
    const opts = categoryOptions(list, 'expense', 'cat-cafe');
    expect(opts).toHaveLength(24);
    expect(opts[opts.length - 1]).toEqual({ id: 'cat-cafe', label: '☕ Café & Snacks (archiviert)', isChild: false });
  });
  it('hängt eine bereits enthaltene keepId nicht doppelt an', () => {
    expect(categoryOptions(cats(), 'expense', 'cat-cafe')).toHaveLength(24);
  });
  it('blendet Kinder archivierter Hauptkategorien aus', () => {
    const list = archive(cats(), 'cat-housing');
    const ids = categoryOptions(list, 'expense').map((o) => o.id);
    expect(ids).not.toContain('cat-housing');
    expect(ids).not.toContain('cat-housing-rent');
  });
});

describe('categoryLabel', () => {
  const map = toMap(cats());
  it('zeigt Kinder mit Hauptkategorie', () => {
    expect(categoryLabel('cat-groceries-bakery', map)).toBe('Lebensmittel › Bäckerei');
  });
  it('zeigt Hauptkategorien mit Namen', () => {
    expect(categoryLabel('cat-cafe', map)).toBe('Café & Snacks');
  });
  it('liefert Unbekannt bei unbekannter id', () => {
    expect(categoryLabel('x', map)).toBe('Unbekannt');
  });
});
