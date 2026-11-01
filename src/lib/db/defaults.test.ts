import { describe, expect, it } from 'vitest';
import { normalizeMerchant, suggestCategory } from '../merchant';
import {
  CURRENT_SCHEMA_VERSION,
  FALLBACK_EXPENSE_CATEGORY,
  FALLBACK_INCOME_CATEGORY,
  FALLBACK_TRANSFER_CATEGORY,
  defaultAccounts,
  defaultCategories,
  defaultRules,
  defaultSettings,
  fallbackCategoryFor,
} from './defaults';

const now = '2026-11-01T12:00:00.000Z';

describe('defaultCategories', () => {
  const cats = defaultCategories(now);

  it('hat 24 Ausgaben-, 5 Einnahmen- und 4 Transfer-Kategorien', () => {
    expect(cats.filter((c) => c.type === 'expense')).toHaveLength(24);
    expect(cats.filter((c) => c.type === 'income')).toHaveLength(5);
    expect(cats.filter((c) => c.type === 'transfer')).toHaveLength(4);
    expect(cats).toHaveLength(33);
  });

  it('hat eindeutige IDs', () => {
    expect(new Set(cats.map((c) => c.id)).size).toBe(cats.length);
  });

  it('enthält die Fallback-Kategorien mit passendem Typ', () => {
    expect(cats.find((c) => c.id === FALLBACK_EXPENSE_CATEGORY)?.type).toBe('expense');
    expect(cats.find((c) => c.id === FALLBACK_INCOME_CATEGORY)?.type).toBe('income');
    expect(cats.find((c) => c.id === FALLBACK_TRANSFER_CATEGORY)?.type).toBe('transfer');
  });

  it('fallbackCategoryFor liefert je Typ die Fallback-Kategorie', () => {
    expect(fallbackCategoryFor('expense')).toBe('cat-other-expense');
    expect(fallbackCategoryFor('income')).toBe('cat-other-income');
    expect(fallbackCategoryFor('transfer')).toBe('cat-transfer-own');
  });

  it('alle Farben sind #RRGGBB', () => {
    for (const c of cats) expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('sortOrder zählt je type|parentId ab 0', () => {
    const groups = new Map<string, number[]>();
    for (const c of cats) {
      const key = c.type + '|' + (c.parentId ?? '');
      groups.set(key, [...(groups.get(key) ?? []), c.sortOrder]);
    }
    for (const orders of groups.values()) expect(orders).toEqual(orders.map((_, i) => i));
    expect(groups.get('expense|')).toHaveLength(15);
    expect(groups.get('expense|cat-groceries')).toHaveLength(2);
    expect(groups.get('expense|cat-telecom')).toHaveLength(2);
    expect(groups.get('expense|cat-housing')).toHaveLength(5);
    expect(groups.get('income|')).toHaveLength(5);
    expect(groups.get('transfer|')).toHaveLength(4);
    expect(cats.find((c) => c.id === 'cat-other-expense')?.sortOrder).toBe(14);
  });

  it('setzt archived, monthlyBudgetCents und updatedAt', () => {
    for (const c of cats) {
      expect(c.archived).toBe(false);
      expect(c.monthlyBudgetCents).toBeNull();
      expect(c.updatedAt).toBe(now);
    }
  });

  it('cat-gifts fehlt, cat-gift-income existiert', () => {
    expect(cats.some((c) => c.id === 'cat-gifts')).toBe(false);
    expect(cats.some((c) => c.id === 'cat-gift-income')).toBe(true);
  });

  it('jedes parentId zeigt auf eine Hauptkategorie gleichen Typs', () => {
    const byId = new Map(cats.map((c) => [c.id, c]));
    for (const c of cats) {
      if (c.parentId === null) continue;
      const parent = byId.get(c.parentId);
      expect(parent, c.id).toBeDefined();
      expect(parent?.parentId, c.id).toBeNull();
      expect(parent?.type, c.id).toBe(c.type);
    }
  });
});

describe('defaultRules', () => {
  const cats = defaultCategories(now);
  const rules = defaultRules(now);

  it('jede Regel verweist auf eine existierende Kategorie', () => {
    const ids = new Set(cats.map((c) => c.id));
    for (const r of rules) expect(ids.has(r.categoryId)).toBe(true);
  });

  it('Patterns sind eindeutig und bereits normalisiert', () => {
    expect(new Set(rules.map((r) => r.pattern)).size).toBe(rules.length);
    for (const r of rules) expect(r.pattern).toBe(normalizeMerchant(r.pattern));
  });

  it('IDs sind eindeutig und folgen dem Schema', () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const r of rules) {
      expect(r.id).toBe('rule-' + r.pattern.toLowerCase().replace(/ /g, '-'));
      expect(r.source).toBe('default');
      expect(r.displayName).toBeNull();
      expect(r.updatedAt).toBe(now);
    }
    expect(rules.find((r) => r.pattern === 'AMAZON PRIME')?.id).toBe('rule-amazon-prime');
  });

  it('enthält alle 65 Muster aus dem Plan', () => {
    expect(rules).toHaveLength(65);
  });

  it('schlägt Kategorien über suggestCategory vor', () => {
    const suggest = (m: string) => suggestCategory(m, 'expense', rules, cats);
    expect(suggest('Aldi')).toBe('cat-groceries-supermarket');
    expect(suggest('ROSSMANN')).toBe('cat-drugstore');
    expect(suggest('Vodafone GmbH')).toBe('cat-telecom');
    expect(suggest('Parken.City.Garage')).toBe('cat-mobility');
    expect(suggest('Fashion.Outlet.Center')).toBe('cat-clothing');
    expect(suggest('BAECKEREI SONNE')).toBe('cat-groceries-bakery');
    expect(suggest('BrotHaus')).toBe('cat-groceries-bakery');
    expect(suggest('CITYfit Fitness- und Gesund-heitsclub Musterstadt GmbH')).toBe('cat-memberships');
    expect(suggest('ARAG SE')).toBe('cat-insurance');
    expect(suggest('STADTWERKE Musterstadt')).toBe('cat-housing-electricity');
  });
});

describe('defaultAccounts', () => {
  it('liefert Girokonto und Kreditkarte', () => {
    expect(defaultAccounts(now)).toEqual([
      { id: 'acc-checking', name: 'Girokonto', kind: 'checking', icon: '🏦', archived: false, sortOrder: 0, updatedAt: now },
      { id: 'acc-credit-card', name: 'Kreditkarte', kind: 'credit_card', icon: '💳', archived: false, sortOrder: 1, updatedAt: now },
    ]);
  });
});

describe('defaultSettings', () => {
  it('liefert die Standardeinstellungen', () => {
    expect(defaultSettings(now)).toEqual({
      id: 'settings',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      autoLockMinutes: 1,
      backupReminderDays: 14,
      lastBackupAt: null,
      ownNames: [],
      updatedAt: now,
    });
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});
