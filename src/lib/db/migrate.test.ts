import { describe, expect, it } from 'vitest';
import { ValidationError } from '../backup/validate';
import { defaultAccounts, defaultCategories, defaultRules, defaultSettings } from './defaults';
import { migrateToV2 } from './migrate';
import type { AppData, Category } from '../types';

const NOW = '2026-11-01T12:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

const V1_EXPENSE = [
  'cat-groceries', 'cat-restaurant', 'cat-cafe', 'cat-clothing', 'cat-drugstore', 'cat-housing',
  'cat-telecom', 'cat-subscriptions', 'cat-mobility', 'cat-travel', 'cat-leisure', 'cat-health',
  'cat-gifts', 'cat-other-expense',
];
const V1_INCOME = ['cat-salary', 'cat-refund', 'cat-sale', 'cat-gift-income', 'cat-other-income'];

type Obj = Record<string, unknown>;

function v1Categories(): Obj[] {
  const defs = new Map(defaultCategories(OLD).map((c) => [c.id, c]));
  const make = (id: string, type: string, sortOrder: number): Obj => {
    if (id === 'cat-gifts') {
      return {
        id: 'cat-gifts', name: 'Geschenke', type: 'expense', icon: '🎁', color: '#e11d48',
        archived: false, sortOrder, monthlyBudgetCents: null, updatedAt: OLD,
      };
    }
    const d = defs.get(id);
    if (!d) throw new Error('Default fehlt: ' + id);
    return {
      id, name: d.name, type, icon: d.icon, color: d.color,
      archived: false, sortOrder, monthlyBudgetCents: null, updatedAt: OLD,
    };
  };
  return [
    ...V1_EXPENSE.map((id, i) => make(id, 'expense', i)),
    ...V1_INCOME.map((id, i) => make(id, 'income', i)),
  ];
}

const NEW_RULE_CATEGORIES = new Set([
  'cat-groceries-bakery', 'cat-memberships', 'cat-insurance', 'cat-housing-broadcast', 'cat-housing-electricity',
]);

function v1Rules(): Obj[] {
  return defaultRules(OLD)
    .filter((r) => !NEW_RULE_CATEGORIES.has(r.categoryId))
    .map((r) => ({
      id: r.id,
      pattern: r.pattern,
      categoryId: r.categoryId === 'cat-groceries-supermarket' ? 'cat-groceries' : r.categoryId,
      source: 'default',
      updatedAt: OLD,
    }));
}

function v1Data(extra?: Obj): Obj {
  return {
    transactions: [],
    categories: v1Categories(),
    merchantRules: v1Rules(),
    recurring: [],
    settings: {
      id: 'settings', schemaVersion: 1, autoLockMinutes: 1, backupReminderDays: 14, lastBackupAt: null, updatedAt: OLD,
    },
    ...extra,
  };
}

function v1Tx(over?: Obj): Obj {
  return {
    id: 't1', type: 'expense', amountCents: 1000, date: '2026-10-01', categoryId: 'cat-groceries',
    merchant: 'Lidl', city: '', note: '', source: 'manual', recurringId: null, createdAt: OLD, updatedAt: OLD,
    ...over,
  };
}

function cat(data: AppData, id: string): Category {
  const c = data.categories.find((x) => x.id === id);
  if (!c) throw new Error('Kategorie fehlt: ' + id);
  return c;
}

function rule(data: AppData, id: string) {
  const r = data.merchantRules.find((x) => x.id === id);
  if (!r) throw new Error('Regel fehlt: ' + id);
  return r;
}

describe('migrateToV2', () => {
  it('M1: migriert v1-Basisdaten', () => {
    const out = migrateToV2(v1Data(), NOW);
    expect(out.categories).toHaveLength(33);
    expect(out.categories.some((c) => c.id === 'cat-gifts')).toBe(false);
    expect(cat(out, 'cat-memberships').sortOrder).toBe(14);
    expect(cat(out, 'cat-insurance').sortOrder).toBe(15);
    expect(cat(out, 'cat-other-expense').sortOrder).toBe(13);
    expect(out.categories.filter((c) => c.type === 'transfer').map((c) => c.sortOrder).sort()).toEqual([0, 1, 2, 3]);
    expect(out.merchantRules).toHaveLength(65);
    expect(rule(out, 'rule-aldi').categoryId).toBe('cat-groceries-supermarket');
    expect(rule(out, 'rule-aldi').updatedAt).toBe(NOW);
    expect(rule(out, 'rule-vodafone').categoryId).toBe('cat-telecom');
    expect(rule(out, 'rule-vodafone').updatedAt).toBe(OLD);
    expect(out.accounts).toEqual(defaultAccounts(NOW));
    expect(out.settings.schemaVersion).toBe(2);
    expect(out.settings.ownNames).toEqual([]);
  });

  it('M2: archiviert cat-gifts, wenn eine Buchung sie nutzt', () => {
    const out = migrateToV2(v1Data({ transactions: [v1Tx({ categoryId: 'cat-gifts' })] }), NOW);
    expect(cat(out, 'cat-gifts').archived).toBe(true);
    expect(cat(out, 'cat-gifts').updatedAt).toBe(NOW);
    expect(out.categories).toHaveLength(34);
  });

  it('M3: archiviert cat-gifts bei Nutzung durch eine Vorlage und ergänzt Felder', () => {
    const template = {
      id: 'r1', type: 'expense', amountCents: 2000, categoryId: 'cat-gifts', merchant: 'Muster', note: '',
      dayOfMonth: 5, startMonth: '2026-01', endMonth: null, lastGeneratedMonth: null, active: true, updatedAt: OLD,
    };
    const out = migrateToV2(v1Data({ recurring: [template] }), NOW);
    expect(cat(out, 'cat-gifts').archived).toBe(true);
    expect(out.recurring[0].accountId).toBe('acc-checking');
    expect(out.recurring[0].direction).toBeNull();
  });

  it('M4: lässt umbenannte Default-Kategorien unverändert und ergänzt Unterkategorien', () => {
    const base = v1Categories();
    const original = {
      ...base[0], name: 'Essen', color: '#000000', monthlyBudgetCents: 30000,
    };
    const categories = [original, ...base.slice(1)];
    const out = migrateToV2(v1Data({ categories }), NOW);
    expect(cat(out, 'cat-groceries')).toEqual({ ...original, parentId: null });
    expect(cat(out, 'cat-groceries-supermarket').parentId).toBe('cat-groceries');
    expect(cat(out, 'cat-groceries-bakery').parentId).toBe('cat-groceries');
  });

  it('M5: Nutzerregeln haben Vorrang vor Default-Regeln', () => {
    const rules = v1Rules().map((r) => (r.id === 'rule-aldi' ? { ...r, source: 'manual', categoryId: 'cat-restaurant' } : r));
    rules.push({ id: 'u-fit', pattern: 'FITNESS', categoryId: 'cat-leisure', source: 'learned', updatedAt: OLD });
    const out = migrateToV2(v1Data({ merchantRules: rules }), NOW);
    expect(rule(out, 'rule-aldi')).toEqual({
      id: 'rule-aldi', pattern: 'ALDI', categoryId: 'cat-restaurant', displayName: null, source: 'manual', updatedAt: OLD,
    });
    expect(out.merchantRules.some((r) => r.id === 'rule-fitness')).toBe(false);
    expect(out.merchantRules).toHaveLength(65);
  });

  it('M6: eigene Kategorie gleichen Namens verhindert die Default-Kategorie', () => {
    const categories = [
      ...v1Categories(),
      {
        id: 'u-ins', name: 'versicherungen ', type: 'expense', icon: '🛡️', color: '#334155',
        archived: false, sortOrder: 14, monthlyBudgetCents: null, updatedAt: OLD,
      },
    ];
    const out = migrateToV2(v1Data({ categories }), NOW);
    expect(out.categories.some((c) => c.id === 'cat-insurance')).toBe(false);
    expect(out.categories).toHaveLength(33);
    expect(out.merchantRules).toHaveLength(57);
  });

  it('M7: ergänzt Buchungsfelder', () => {
    const out = migrateToV2(v1Data({ transactions: [v1Tx()] }), NOW);
    expect(out.transactions[0].accountId).toBe('acc-checking');
    expect(out.transactions[0].direction).toBeNull();
    expect(out.transactions[0].originalText).toBe('');
  });

  it('M8: ist idempotent', () => {
    const once = migrateToV2(v1Data({ transactions: [v1Tx()] }), NOW);
    expect(migrateToV2(once, NOW)).toEqual(once);
  });

  it('M9: frische v2-Daten bleiben unverändert', () => {
    const fresh: AppData = {
      transactions: [],
      categories: defaultCategories(OLD),
      merchantRules: defaultRules(OLD),
      recurring: [],
      accounts: defaultAccounts(OLD),
      settings: defaultSettings(OLD),
    };
    expect(migrateToV2(fresh, NOW)).toEqual(fresh);
  });

  it('M10: verändert die Eingabe nicht', () => {
    const input = v1Data({ transactions: [v1Tx({ categoryId: 'cat-gifts' })] });
    const before = JSON.stringify(input);
    migrateToV2(input, NOW);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('M11: wirft bei Nicht-Objekten', () => {
    expect(() => migrateToV2(null, NOW)).toThrow(ValidationError);
    expect(() => migrateToV2([], NOW)).toThrow(ValidationError);
    expect(() => migrateToV2('x', NOW)).toThrow(ValidationError);
  });

  it('M12: ohne cat-groceries wird der Default ergänzt (inkl. Kinder und Regeln)', () => {
    // Fachlich gewollt: Fehlende Default-Kategorien werden bei der Migration ergänzt, bestehende Nutzerdaten
    // bleiben unverändert. Daher 33 Kategorien und 65 Regeln (siehe plans/04-erweiterungen.md, M12).
    const categories = v1Categories().filter((c) => c.id !== 'cat-groceries');
    const rules = v1Rules().filter((r) => r.categoryId !== 'cat-groceries');
    expect(rules).toHaveLength(33);
    const out = migrateToV2(v1Data({ categories, merchantRules: rules }), NOW);
    expect(out.categories).toHaveLength(33);
    expect(out.merchantRules).toHaveLength(65);
  });

  it('wirft ValidationError, wenn das Ergebnis ungültig ist', () => {
    const input = v1Data({ transactions: [v1Tx({ categoryId: 'unbekannt' })] });
    expect(() => migrateToV2(input, NOW)).toThrow(ValidationError);
  });
});
