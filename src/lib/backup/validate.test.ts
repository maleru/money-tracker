import { describe, expect, it } from 'vitest';
import { defaultCategories, defaultSettings } from '../db/defaults';
import type { AppData, Transaction } from '../types';
import { ValidationError, validateAppData } from './validate';

const NOW = '2026-11-01T10:00:00.000Z';

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: 'expense',
    amountCents: 4215,
    date: '2026-10-21',
    categoryId: 'cat-groceries',
    merchant: 'ALDI',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function makeData(): AppData {
  return {
    transactions: [tx('t1'), tx('t2', { type: 'income', categoryId: 'cat-salary', amountCents: 300 })],
    categories: defaultCategories(NOW),
    merchantRules: [{ id: 'r1', pattern: 'ALDI', categoryId: 'cat-groceries', source: 'default', updatedAt: NOW }],
    recurring: [
      {
        id: 'rec1',
        type: 'expense',
        amountCents: 5000,
        categoryId: 'cat-housing',
        merchant: 'Vermieter',
        note: '',
        dayOfMonth: 31,
        startMonth: '2026-01',
        endMonth: null,
        lastGeneratedMonth: '2026-10',
        active: true,
        updatedAt: NOW,
      },
    ],
    settings: defaultSettings(NOW),
  };
}

/** Tiefe Kopie als `unknown`, damit Tests beliebig manipulieren können. */
function raw(d: AppData = makeData()): Record<string, unknown> {
  return JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
}

function list(r: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return r[key] as Record<string, unknown>[];
}

describe('validateAppData', () => {
  it('lässt gültige Daten durch (deep-equal)', () => {
    const d = makeData();
    expect(validateAppData(raw(d))).toEqual(d);
  });

  it('wirft ValidationError bei Nicht-Objekt', () => {
    expect(() => validateAppData(null)).toThrow(ValidationError);
    expect(() => validateAppData([])).toThrow(ValidationError);
    expect(() => validateAppData('x')).toThrow(ValidationError);
  });

  it('wirft bei String als Betrag und nennt Sammlung und Index', () => {
    const r = raw();
    list(r, 'transactions')[1].amountCents = '300';
    expect(() => validateAppData(r)).toThrow(ValidationError);
    expect(() => validateAppData(r)).toThrow('transactions[1].amountCents ungültig');
  });

  it('wirft bei ungültigen Beträgen', () => {
    for (const bad of [0, -5, 1.5, 10_000_000_000, Number.NaN, null]) {
      const r = raw();
      list(r, 'transactions')[0].amountCents = bad;
      expect(() => validateAppData(r), String(bad)).toThrow('transactions[0].amountCents ungültig');
    }
  });

  it('wirft bei unbekanntem Typ', () => {
    const r = raw();
    list(r, 'transactions')[0].type = 'transfer';
    expect(() => validateAppData(r)).toThrow('transactions[0].type ungültig');
  });

  it('wirft bei unbekannter Quelle', () => {
    const r = raw();
    list(r, 'transactions')[0].source = 'magic';
    expect(() => validateAppData(r)).toThrow('transactions[0].source ungültig');
  });

  it('wirft bei ungültigem Datum', () => {
    const r = raw();
    list(r, 'transactions')[0].date = '2026-02-31';
    expect(() => validateAppData(r)).toThrow('transactions[0].date ungültig');
  });

  it('wirft bei fehlender Kategorie einer Buchung', () => {
    const r = raw();
    list(r, 'transactions')[0].categoryId = 'gibt-es-nicht';
    expect(() => validateAppData(r)).toThrow(ValidationError);
    expect(() => validateAppData(r)).toThrow('transactions[0].categoryId');
  });

  it('wirft bei fehlender Kategorie einer Regel', () => {
    const r = raw();
    list(r, 'merchantRules')[0].categoryId = 'gibt-es-nicht';
    expect(() => validateAppData(r)).toThrow('merchantRules[0].categoryId');
  });

  it('wirft bei fehlender Kategorie einer Vorlage', () => {
    const r = raw();
    list(r, 'recurring')[0].categoryId = 'gibt-es-nicht';
    expect(() => validateAppData(r)).toThrow('recurring[0].categoryId');
  });

  it('wirft bei doppelter id', () => {
    const r = raw();
    list(r, 'transactions')[1].id = 't1';
    expect(() => validateAppData(r)).toThrow('transactions[1].id doppelt');

    const r2 = raw();
    list(r2, 'categories')[3].id = list(r2, 'categories')[0].id;
    expect(() => validateAppData(r2)).toThrow('categories[3].id doppelt');
  });

  it('entfernt unbekannte Zusatzfelder (neu aufgebautes Objekt)', () => {
    const r = raw();
    r.extra = 'x';
    list(r, 'transactions')[0].secret = 'y';
    list(r, 'categories')[0].foo = 1;
    (r.settings as Record<string, unknown>).bar = true;
    const out = validateAppData(r);
    expect(out).toEqual(makeData());
    expect('extra' in out).toBe(false);
    expect('secret' in out.transactions[0]).toBe(false);
    expect('foo' in out.categories[0]).toBe(false);
    expect('bar' in out.settings).toBe(false);
    expect(out.transactions[0]).not.toBe(list(r, 'transactions')[0]);
  });

  it('prüft Kategorie-Farbe und Budget', () => {
    const r = raw();
    list(r, 'categories')[0].color = 'red';
    expect(() => validateAppData(r)).toThrow('categories[0].color ungültig');

    const r2 = raw();
    list(r2, 'categories')[0].monthlyBudgetCents = '5';
    expect(() => validateAppData(r2)).toThrow('categories[0].monthlyBudgetCents ungültig');

    const r3 = raw();
    list(r3, 'categories')[0].monthlyBudgetCents = 12345;
    expect(validateAppData(r3).categories[0].monthlyBudgetCents).toBe(12345);
  });

  it('prüft Regel-Quelle', () => {
    const r = raw();
    list(r, 'merchantRules')[0].source = 'other';
    expect(() => validateAppData(r)).toThrow('merchantRules[0].source ungültig');
  });

  it('prüft dayOfMonth 1..31', () => {
    for (const bad of [0, 32, 1.5, '5']) {
      const r = raw();
      list(r, 'recurring')[0].dayOfMonth = bad;
      expect(() => validateAppData(r), String(bad)).toThrow('recurring[0].dayOfMonth ungültig');
    }
    const r = raw();
    list(r, 'recurring')[0].dayOfMonth = 1;
    expect(validateAppData(r).recurring[0].dayOfMonth).toBe(1);
  });

  it('prüft Monatsfelder', () => {
    for (const key of ['startMonth', 'endMonth', 'lastGeneratedMonth']) {
      for (const bad of ['2026-1', '2026-13', '26-01', '2026-01-01', 5]) {
        const r = raw();
        list(r, 'recurring')[0][key] = bad;
        expect(() => validateAppData(r), `${key} ${String(bad)}`).toThrow(`recurring[0].${key} ungültig`);
      }
    }
    const r = raw();
    list(r, 'recurring')[0].endMonth = '2027-12';
    expect(validateAppData(r).recurring[0].endMonth).toBe('2027-12');
  });

  it('prüft Zeitstempel als Strings', () => {
    const r = raw();
    list(r, 'transactions')[0].createdAt = 12345;
    expect(() => validateAppData(r)).toThrow('transactions[0].createdAt ungültig');

    const r2 = raw();
    list(r2, 'categories')[0].updatedAt = null;
    expect(() => validateAppData(r2)).toThrow('categories[0].updatedAt ungültig');
  });

  it('prüft recurringId als String oder null', () => {
    const r = raw();
    list(r, 'transactions')[0].recurringId = 5;
    expect(() => validateAppData(r)).toThrow('transactions[0].recurringId ungültig');

    const r2 = raw();
    list(r2, 'transactions')[0].recurringId = 'rec1';
    expect(validateAppData(r2).transactions[0].recurringId).toBe('rec1');
  });

  it('prüft settings', () => {
    const r = raw();
    (r.settings as Record<string, unknown>).id = 'other';
    expect(() => validateAppData(r)).toThrow('settings.id ungültig');

    for (const bad of [2, -1, '1', null]) {
      const r2 = raw();
      (r2.settings as Record<string, unknown>).autoLockMinutes = bad;
      expect(() => validateAppData(r2), String(bad)).toThrow('settings.autoLockMinutes ungültig');
    }
    for (const bad of [1, 15, '7', null]) {
      const r3 = raw();
      (r3.settings as Record<string, unknown>).backupReminderDays = bad;
      expect(() => validateAppData(r3), String(bad)).toThrow('settings.backupReminderDays ungültig');
    }
    const r4 = raw();
    (r4.settings as Record<string, unknown>).lastBackupAt = 5;
    expect(() => validateAppData(r4)).toThrow('settings.lastBackupAt ungültig');

    const r5 = raw();
    delete r5.settings;
    expect(() => validateAppData(r5)).toThrow('settings ungültig');
  });

  it('wirft bei fehlender oder falscher Sammlung', () => {
    const r = raw();
    delete r.transactions;
    expect(() => validateAppData(r)).toThrow('transactions ungültig');

    const r2 = raw();
    r2.categories = {};
    expect(() => validateAppData(r2)).toThrow('categories ungültig');

    const r3 = raw();
    r3.merchantRules = [null];
    expect(() => validateAppData(r3)).toThrow('merchantRules[0] ungültig');
  });

  it('akzeptiert leere Sammlungen', () => {
    const d = makeData();
    d.transactions = [];
    d.merchantRules = [];
    d.recurring = [];
    expect(validateAppData(raw(d))).toEqual(d);
  });
});
