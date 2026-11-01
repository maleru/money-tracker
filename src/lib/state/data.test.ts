import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { generateDek } from '../crypto/crypto';
import { db } from '../db/db';
import {
  FALLBACK_EXPENSE_CATEGORY,
  FALLBACK_INCOME_CATEGORY,
  defaultCategories,
  defaultRules,
  defaultSettings,
} from '../db/defaults';
import { addMonths, currentMonthKey } from '../dates';
import type { AppData, Category, RecurringTemplate, Transaction } from '../types';
import {
  addTransaction,
  addTransactions,
  categories,
  categoryMap,
  categoryUsage,
  clearAll,
  deleteCategory,
  deleteRecurring,
  deleteTransaction,
  loadAll,
  merchantRules,
  moveCategory,
  recurring,
  rememberMerchant,
  replaceAllData,
  runRecurring,
  saveCategory,
  saveRecurring,
  seedDefaults,
  settings,
  sortCategories,
  sortTx,
  transactions,
  updateSettings,
  updateTransaction,
  type TxInput,
} from './data';
import { setDek } from './key';

function input(over: Partial<TxInput> = {}): TxInput {
  return {
    type: 'expense',
    amountCents: 1234,
    date: '2026-10-21',
    categoryId: 'cat-groceries',
    merchant: 'Aldi',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    ...over,
  };
}

beforeEach(async () => {
  setDek(await generateDek());
  await db.delete();
  await db.open();
  clearAll();
  await seedDefaults();
});

describe('seedDefaults / loadAll', () => {
  it('füllt die Stores und lädt nach clearAll wieder', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    expect(get(categories)).toHaveLength(defaultCategories(now).length);
    expect(get(merchantRules)).toHaveLength(defaultRules(now).length);
    expect(get(settings)?.id).toBe('settings');

    clearAll();
    expect(get(categories)).toHaveLength(0);
    expect(get(settings)).toBeNull();

    await loadAll();
    expect(get(categories)).toHaveLength(defaultCategories(now).length);
    expect(get(merchantRules)).toHaveLength(defaultRules(now).length);
    expect(get(settings)?.autoLockMinutes).toBe(1);
    expect(get(categoryMap).get('cat-groceries')?.name).toBe('Lebensmittel');
  });

  it('sortiert Kategorien: expense vor income, dann sortOrder', () => {
    const list = get(categories);
    const firstIncome = list.findIndex((c) => c.type === 'income');
    expect(list.slice(0, firstIncome).every((c) => c.type === 'expense')).toBe(true);
    expect(list.slice(firstIncome).every((c) => c.type === 'income')).toBe(true);
  });
});

describe('Buchungen', () => {
  it('addTransaction erscheint sortiert und bleibt nach clearAll + loadAll erhalten', async () => {
    const a = await addTransaction(input({ date: '2026-10-01' }));
    const b = await addTransaction(input({ date: '2026-10-20' }));
    const c = await addTransaction(input({ date: '2026-10-10' }));
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(get(transactions).map((t) => t.id)).toEqual([b.id, c.id, a.id]);

    clearAll();
    await loadAll();
    expect(get(transactions).map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  it('sortTx: bei gleichem Datum gewinnt der neuere createdAt', () => {
    const base: Transaction = {
      id: 'x', type: 'expense', amountCents: 1, date: '2026-10-01', categoryId: 'c', merchant: '', city: '',
      note: '', source: 'manual', recurringId: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '',
    };
    const older = { ...base, id: 'older' };
    const newer = { ...base, id: 'newer', createdAt: '2026-10-01T11:00:00.000Z' };
    expect(sortTx([older, newer]).map((t) => t.id)).toEqual(['newer', 'older']);
  });

  it('sortCategories exportiert und sortiert', () => {
    const cats = defaultCategories('x');
    const reversed = [...cats].reverse();
    expect(sortCategories(reversed).map((c) => c.id)).toEqual(cats.map((c) => c.id));
  });

  it('updateTransaction speichert und setzt updatedAt', async () => {
    const tx = await addTransaction(input());
    await new Promise((r) => setTimeout(r, 5));
    await updateTransaction({ ...tx, amountCents: 999, date: '2026-10-25' });
    expect(get(transactions)[0].amountCents).toBe(999);
    expect(get(transactions)[0].updatedAt > tx.updatedAt).toBe(true);

    clearAll();
    await loadAll();
    expect(get(transactions)[0].amountCents).toBe(999);
  });

  it('deleteTransaction entfernt aus Store und DB', async () => {
    const tx = await addTransaction(input());
    await deleteTransaction(tx.id);
    expect(get(transactions)).toHaveLength(0);
    clearAll();
    await loadAll();
    expect(get(transactions)).toHaveLength(0);
  });

  it('addTransactions legt mehrere an', async () => {
    await addTransactions([input({ date: '2026-09-01' }), input({ date: '2026-09-02' })]);
    expect(get(transactions).map((t) => t.date)).toEqual(['2026-09-02', '2026-09-01']);
  });
});

describe('Kategorien', () => {
  it('deleteCategory wirft bei verwendeter Kategorie', async () => {
    await addTransaction(input({ categoryId: 'cat-cafe' }));
    expect(categoryUsage('cat-cafe').transactions).toBe(1);
    await expect(deleteCategory('cat-cafe')).rejects.toThrow('Kategorie wird noch verwendet');
  });

  it('deleteCategory wirft bei Fallback-Kategorien', async () => {
    await expect(deleteCategory(FALLBACK_EXPENSE_CATEGORY)).rejects.toThrow(
      'Standardkategorie kann nicht gelöscht werden',
    );
    await expect(deleteCategory(FALLBACK_INCOME_CATEGORY)).rejects.toThrow(
      'Standardkategorie kann nicht gelöscht werden',
    );
  });

  it('deleteCategory löscht unbenutzte Kategorie samt Regeln', async () => {
    expect(categoryUsage('cat-cafe').rules).toBe(1);
    await deleteCategory('cat-cafe');
    expect(get(categories).some((c) => c.id === 'cat-cafe')).toBe(false);
    expect(get(merchantRules).some((r) => r.categoryId === 'cat-cafe')).toBe(false);

    clearAll();
    await loadAll();
    expect(get(categories).some((c) => c.id === 'cat-cafe')).toBe(false);
    expect(get(merchantRules).some((r) => r.categoryId === 'cat-cafe')).toBe(false);
  });

  it('saveCategory legt an und aktualisiert', async () => {
    const before = get(categories).length;
    const c: Category = {
      id: 'cat-new', name: 'Neu', type: 'expense', icon: '⭐', color: '#000000', archived: false,
      sortOrder: 99, monthlyBudgetCents: null, updatedAt: '',
    };
    await saveCategory(c);
    expect(get(categories)).toHaveLength(before + 1);
    await saveCategory({ ...c, name: 'Neu2' });
    expect(get(categories)).toHaveLength(before + 1);
    expect(get(categoryMap).get('cat-new')?.name).toBe('Neu2');
  });

  it('moveCategory tauscht die Reihenfolge', async () => {
    const expenseIds = (): string[] => get(categories).filter((c) => c.type === 'expense').map((c) => c.id);
    expect(expenseIds().slice(0, 2)).toEqual(['cat-groceries', 'cat-restaurant']);

    await moveCategory('cat-groceries', 1);
    expect(expenseIds().slice(0, 2)).toEqual(['cat-restaurant', 'cat-groceries']);

    await moveCategory('cat-groceries', -1);
    expect(expenseIds().slice(0, 2)).toEqual(['cat-groceries', 'cat-restaurant']);

    // Am Rand passiert nichts
    await moveCategory('cat-groceries', -1);
    expect(expenseIds()[0]).toBe('cat-groceries');

    // Persistiert
    await moveCategory('cat-groceries', 1);
    clearAll();
    await loadAll();
    expect(expenseIds().slice(0, 2)).toEqual(['cat-restaurant', 'cat-groceries']);
  });

  it('moveCategory überspringt archivierte Kategorien', async () => {
    const restaurant = get(categoryMap).get('cat-restaurant');
    if (!restaurant) throw new Error('fehlt');
    await saveCategory({ ...restaurant, archived: true });
    await moveCategory('cat-groceries', 1);
    const ids = get(categories).filter((c) => c.type === 'expense').map((c) => c.id);
    expect(ids.indexOf('cat-groceries')).toBeGreaterThan(ids.indexOf('cat-restaurant'));
    expect(ids[ids.indexOf('cat-groceries') - 1]).not.toBe('cat-cafe');
  });
});

describe('Regeln', () => {
  it('rememberMerchant legt eine Regel an, ein zweiter Aufruf legt keine weitere an', async () => {
    const before = get(merchantRules).length;
    await rememberMerchant('Bäckerei Schmidt', 'cat-cafe');
    expect(get(merchantRules)).toHaveLength(before + 1);
    const rule = get(merchantRules).find((r) => r.pattern === 'BAECKEREI SCHMIDT');
    expect(rule?.source).toBe('learned');

    await rememberMerchant('Bäckerei Schmidt', 'cat-cafe');
    expect(get(merchantRules)).toHaveLength(before + 1);
  });
});

describe('Einstellungen', () => {
  it('updateSettings merged und speichert', async () => {
    await updateSettings({ autoLockMinutes: 5 });
    expect(get(settings)?.autoLockMinutes).toBe(5);
    expect(get(settings)?.backupReminderDays).toBe(14);
    clearAll();
    await loadAll();
    expect(get(settings)?.autoLockMinutes).toBe(5);
  });

  it('updateSettings wirft ohne geladene Settings', async () => {
    clearAll();
    await expect(updateSettings({ autoLockMinutes: 0 })).rejects.toThrow();
  });
});

describe('replaceAllData', () => {
  it('ersetzt alles', async () => {
    await addTransaction(input());
    const now = '2026-02-02T00:00:00.000Z';
    const tx: Transaction = {
      id: 'tx-import', type: 'income', amountCents: 500000, date: '2026-02-01', categoryId: 'cat-salary',
      merchant: 'Firma', city: '', note: '', source: 'manual', recurringId: null, createdAt: now, updatedAt: now,
    };
    const cats = defaultCategories(now).slice(0, 3);
    const data: AppData = {
      transactions: [tx],
      categories: cats,
      merchantRules: defaultRules(now).slice(0, 2),
      recurring: [],
      settings: { ...defaultSettings(now), autoLockMinutes: 15 },
    };
    await replaceAllData(data);

    expect(get(transactions).map((t) => t.id)).toEqual(['tx-import']);
    expect(get(categories)).toHaveLength(3);
    expect(get(merchantRules)).toHaveLength(2);
    expect(get(recurring)).toHaveLength(0);
    expect(get(settings)?.autoLockMinutes).toBe(15);

    clearAll();
    await loadAll();
    expect(get(transactions)).toHaveLength(1);
    expect(get(categories)).toHaveLength(3);
    expect(await db.transactions.count()).toBe(1);
  });
});

describe('Race-Schutz beim Sperren (Epochenzähler)', () => {
  it('lock während loadAll lässt die Stores leer', async () => {
    await addTransaction(input());
    clearAll();
    const pending = loadAll();
    clearAll(); // simuliert lock() während des Ladens
    await pending;
    expect(get(transactions)).toHaveLength(0);
    expect(get(categories)).toHaveLength(0);
    expect(get(settings)).toBeNull();
  });

  it('lock während addTransaction schreibt nicht in den gesperrten Store', async () => {
    const pending = addTransaction(input());
    clearAll();
    await pending;
    expect(get(transactions)).toHaveLength(0);
    // Die Buchung liegt aber verschlüsselt in der DB und ist nach dem Entsperren wieder da.
    await loadAll();
    expect(get(transactions)).toHaveLength(1);
  });
});

function template(over: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 'rec-1',
    type: 'expense',
    amountCents: 5000,
    categoryId: 'cat-cafe',
    merchant: 'Verein',
    note: '',
    dayOfMonth: 1,
    startMonth: addMonths(currentMonthKey(), -2),
    endMonth: null,
    lastGeneratedMonth: null,
    active: true,
    updatedAt: '',
    ...over,
  };
}

describe('Wiederkehrende Buchungen', () => {
  it('saveRecurring und deleteRecurring schreiben DB und Store', async () => {
    await saveRecurring(template());
    expect(get(recurring)).toHaveLength(1);
    clearAll();
    await loadAll();
    expect(get(recurring)).toHaveLength(1);

    await deleteRecurring('rec-1');
    expect(get(recurring)).toHaveLength(0);
    clearAll();
    await loadAll();
    expect(get(recurring)).toHaveLength(0);
  });

  it('runRecurring erzeugt Buchungen, speichert die Vorlage und ist idempotent', async () => {
    await saveRecurring(template());
    expect(await runRecurring()).toBe(3);
    expect(get(transactions).filter((t) => t.recurringId === 'rec-1')).toHaveLength(3);
    expect(get(recurring)[0].lastGeneratedMonth).toBe(currentMonthKey());
    expect(await runRecurring()).toBe(0);
    expect(get(transactions)).toHaveLength(3);
  });

  it('zwei parallele runRecurring-Aufrufe erzeugen jede Buchung nur einmal', async () => {
    await saveRecurring(template());
    const [a, b] = await Promise.all([runRecurring(), runRecurring()]);
    expect(a).toBe(3);
    expect(b).toBe(3);
    expect(get(transactions).filter((t) => t.recurringId === 'rec-1')).toHaveLength(3);
    expect(await runRecurring()).toBe(0);
    expect(get(transactions)).toHaveLength(3);
  });

  it('deleteCategory wirft, wenn eine Vorlage die Kategorie verwendet', async () => {
    await saveRecurring(template({ active: false }));
    expect(categoryUsage('cat-cafe').recurring).toBe(1);
    await expect(deleteCategory('cat-cafe')).rejects.toThrow('Kategorie wird noch verwendet');
  });
});

describe('Guard Kategorien', () => {
  it('moveCategory bei einer archivierten Kategorie verändert nichts', async () => {
    const before = get(categories).filter((c) => c.type === 'expense').map((c) => [c.id, c.sortOrder]);
    const restaurant = get(categoryMap).get('cat-restaurant');
    if (!restaurant) throw new Error('fehlt');
    await saveCategory({ ...restaurant, archived: true });
    await moveCategory('cat-restaurant', -1);
    const after = get(categories)
      .filter((c) => c.type === 'expense' && c.id !== 'cat-restaurant')
      .map((c) => [c.id, c.sortOrder]);
    const beforeOthers = before.filter(([id]) => id !== 'cat-restaurant');
    expect(after).toEqual(beforeOthers);
  });
});
