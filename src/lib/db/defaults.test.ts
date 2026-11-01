import { describe, expect, it } from 'vitest';
import { normalizeMerchant, suggestCategory } from '../merchant';
import {
  CURRENT_SCHEMA_VERSION,
  FALLBACK_EXPENSE_CATEGORY,
  FALLBACK_INCOME_CATEGORY,
  defaultCategories,
  defaultRules,
  defaultSettings,
} from './defaults';

const now = '2026-11-01T12:00:00.000Z';

describe('defaultCategories', () => {
  const cats = defaultCategories(now);

  it('hat 14 Ausgaben- und 5 Einnahmen-Kategorien', () => {
    expect(cats.filter((c) => c.type === 'expense')).toHaveLength(14);
    expect(cats.filter((c) => c.type === 'income')).toHaveLength(5);
    expect(cats).toHaveLength(19);
  });

  it('hat eindeutige IDs', () => {
    expect(new Set(cats.map((c) => c.id)).size).toBe(cats.length);
  });

  it('enthält die beiden Fallback-Kategorien mit passendem Typ', () => {
    expect(cats.find((c) => c.id === FALLBACK_EXPENSE_CATEGORY)?.type).toBe('expense');
    expect(cats.find((c) => c.id === FALLBACK_INCOME_CATEGORY)?.type).toBe('income');
  });

  it('alle Farben sind #RRGGBB', () => {
    for (const c of cats) expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('sortOrder zählt je Typ ab 0', () => {
    for (const type of ['expense', 'income'] as const) {
      const orders = cats.filter((c) => c.type === type).map((c) => c.sortOrder);
      expect(orders).toEqual(orders.map((_, i) => i));
    }
  });

  it('setzt archived, monthlyBudgetCents und updatedAt', () => {
    for (const c of cats) {
      expect(c.archived).toBe(false);
      expect(c.monthlyBudgetCents).toBeNull();
      expect(c.updatedAt).toBe(now);
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
      expect(r.updatedAt).toBe(now);
    }
    expect(rules.find((r) => r.pattern === 'AMAZON PRIME')?.id).toBe('rule-amazon-prime');
  });

  it('enthält alle 42 Muster aus dem Plan', () => {
    expect(rules).toHaveLength(42);
  });

  it('schlägt Kategorien über suggestCategory vor', () => {
    const suggest = (m: string) => suggestCategory(m, 'expense', rules, cats);
    expect(suggest('Aldi')).toBe('cat-groceries');
    expect(suggest('ROSSMANN')).toBe('cat-drugstore');
    expect(suggest('Vodafone GmbH')).toBe('cat-telecom');
    expect(suggest('Parken.City.Garage')).toBe('cat-mobility');
    expect(suggest('Fashion.Outlet.Center')).toBe('cat-clothing');
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
      updatedAt: now,
    });
  });
});
