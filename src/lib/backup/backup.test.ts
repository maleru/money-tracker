import { describe, expect, it } from 'vitest';
import { deriveDataKey, encryptJson, randomBytes } from '../crypto/crypto';
import { toBase64 } from '../crypto/encoding';
import { WrongSecretError } from '../crypto/vault';
import { CURRENT_SCHEMA_VERSION, defaultAccounts, defaultCategories, defaultSettings } from '../db/defaults';
import type { Account, AppData, Category, Transaction } from '../types';
import { backupStats, createBackup, decryptBackup, mergeData, migratePayload, readBackupFile } from './backup';
import { InvalidBackupError, type BackupFileV1 } from './format';
import { ValidationError, validateAppData } from './validate';

const ITER = 1000;
const PASSWORD = 'ein-sehr-gutes-passwort';
const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';
const T2 = '2026-10-03T10:00:00.000Z';

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: 'expense',
    amountCents: 4215,
    date: '2026-10-21',
    categoryId: 'cat-groceries',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'GEHEIM-ALDI',
    originalText: '',
    city: 'München',
    note: 'Notiz mit Ümläut',
    source: 'manual',
    recurringId: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function makeData(): AppData {
  return {
    transactions: [tx('t1'), tx('t2', { date: '2026-09-01', type: 'income', categoryId: 'cat-salary', amountCents: 300 })],
    categories: defaultCategories(T0),
    merchantRules: [
      { id: 'r1', pattern: 'ALDI', categoryId: 'cat-groceries', displayName: null, source: 'default', updatedAt: T0 },
    ],
    recurring: [],
    accounts: defaultAccounts(T0),
    settings: defaultSettings(T0),
  };
}

/** Baut eine Backup-Datei mit beliebigem Payload nach (eigene Verschlüsselung). */
async function craftFile(payload: unknown, password = PASSWORD): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveDataKey(password, salt, ITER);
  const blob = await encryptJson(key, payload);
  const file: BackupFileV1 = {
    format: 'money-tracker-backup',
    version: 1,
    createdAt: T0,
    appVersion: 'test',
    kdf: { name: 'PBKDF2-SHA256', iterations: ITER, salt: toBase64(salt) },
    cipher: { name: 'AES-256-GCM', iv: toBase64(blob.iv) },
    data: toBase64(blob.ct),
  };
  return JSON.stringify(file);
}

function parsed(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('createBackup / readBackupFile / decryptBackup', () => {
  it('Roundtrip liefert deep-equal Daten', async () => {
    const data = makeData();
    const text = await createBackup(data, PASSWORD, ITER);
    const file = readBackupFile(text, ITER);
    expect(file.format).toBe('money-tracker-backup');
    expect(file.version).toBe(1);
    expect(file.kdf.iterations).toBe(ITER);
    const back = await decryptBackup(file, PASSWORD);
    expect(back).toEqual(data);
  });

  it('Roundtrip mit v2-Daten (Konto, Umbuchung, Unterkategorie) liefert deep-equal Daten', async () => {
    const data = makeData();
    data.accounts.push({
      id: 'acc-extra', name: 'Tagesgeld', kind: 'savings', icon: '🐷', archived: false, sortOrder: 2, updatedAt: T0,
    });
    data.transactions.push(
      tx('t3', { type: 'transfer', direction: 'out', categoryId: 'cat-transfer-savings', accountId: 'acc-extra' }),
      tx('t4', { categoryId: 'cat-groceries-bakery', originalText: 'BROTHAUS' }),
    );
    data.settings = { ...data.settings, ownNames: ['Max Mustermann'] };
    const text = await createBackup(data, PASSWORD, ITER);
    const back = await decryptBackup(readBackupFile(text, ITER), PASSWORD);
    expect(back).toEqual(data);
    expect(back.settings.schemaVersion).toBe(2);
  });

  it('erzeugt JSON mit 2 Leerzeichen Einrückung und passenden Feldlängen', async () => {
    const text = await createBackup(makeData(), PASSWORD, ITER);
    expect(text).toContain('\n  "format": "money-tracker-backup"');
    const file = readBackupFile(text, ITER);
    expect(atob(file.kdf.salt).length).toBe(16);
    expect(atob(file.cipher.iv).length).toBe(12);
  });

  it('verwendet pro Backup neues Salt und neue IV', async () => {
    const a = readBackupFile(await createBackup(makeData(), PASSWORD, ITER), ITER);
    const b = readBackupFile(await createBackup(makeData(), PASSWORD, ITER), ITER);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
  });

  it('falsches Passwort wirft WrongSecretError', async () => {
    const file = readBackupFile(await createBackup(makeData(), PASSWORD, ITER), ITER);
    await expect(decryptBackup(file, 'falsches-passwort')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('manipulierter Ciphertext wirft WrongSecretError', async () => {
    const file = readBackupFile(await createBackup(makeData(), PASSWORD, ITER), ITER);
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered: BackupFileV1 = { ...file, data: toBase64(bytes) };
    await expect(decryptBackup(tampered, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('Klartext-Händler steht nicht im Backup-Text', async () => {
    const text = await createBackup(makeData(), PASSWORD, ITER);
    expect(text).not.toContain('GEHEIM-ALDI');
    expect(text).not.toContain('München');
    expect(text).not.toContain(PASSWORD);
  });

  it('kaputtes JSON wirft InvalidBackupError', () => {
    expect(() => readBackupFile('{kaputt', ITER)).toThrow(InvalidBackupError);
    expect(() => readBackupFile('{kaputt', ITER)).toThrow('Keine gültige Backup-Datei');
    expect(() => readBackupFile('null', ITER)).toThrow(InvalidBackupError);
    expect(() => readBackupFile('[]', ITER)).toThrow(InvalidBackupError);
    expect(() => readBackupFile('', ITER)).toThrow(InvalidBackupError);
  });

  it('falsches format oder falsche version wirft InvalidBackupError', async () => {
    const o = parsed(await createBackup(makeData(), PASSWORD, ITER));
    expect(() => readBackupFile(JSON.stringify({ ...o, format: 'other' }), ITER)).toThrow(InvalidBackupError);
    expect(() => readBackupFile(JSON.stringify({ ...o, version: 2 }), ITER)).toThrow(InvalidBackupError);
  });

  it('iterations unter Minimum (Standard 100.000) wirft InvalidBackupError', async () => {
    const text = await createBackup(makeData(), PASSWORD, ITER);
    expect(() => readBackupFile(text)).toThrow(InvalidBackupError);
    expect(() => readBackupFile(text, ITER + 1)).toThrow(InvalidBackupError);
    expect(() => readBackupFile(text, ITER)).not.toThrow();
  });

  it('ungültige iterations (zu hoch, Float, String) werfen InvalidBackupError', async () => {
    const o = parsed(await createBackup(makeData(), PASSWORD, ITER));
    const kdf = o.kdf as Record<string, unknown>;
    for (const bad of [10_000_001, 1e12, 1500.5, '1000', null, Number.NaN]) {
      const text = JSON.stringify({ ...o, kdf: { ...kdf, iterations: bad } });
      expect(() => readBackupFile(text, ITER), String(bad)).toThrow(InvalidBackupError);
    }
  });

  it('falsche Salt-/IV-Länge oder kein Base64 wirft InvalidBackupError', async () => {
    const o = parsed(await createBackup(makeData(), PASSWORD, ITER));
    const kdf = o.kdf as Record<string, unknown>;
    const cipher = o.cipher as Record<string, unknown>;
    const bad = [
      { ...o, kdf: { ...kdf, salt: toBase64(new Uint8Array(15)) } },
      { ...o, kdf: { ...kdf, salt: toBase64(new Uint8Array(17)) } },
      { ...o, cipher: { ...cipher, iv: toBase64(new Uint8Array(16)) } },
      { ...o, kdf: { ...kdf, salt: '%%%' } },
      { ...o, data: '%%%' },
      { ...o, data: toBase64(new Uint8Array(3)) },
      { ...o, data: 5 },
      { ...o, kdf: { ...kdf, name: 'PBKDF2-SHA1' } },
      { ...o, cipher: { ...cipher, name: 'AES-128-CBC' } },
      { ...o, kdf: undefined },
      { ...o, cipher: undefined },
    ];
    for (const b of bad) {
      expect(() => readBackupFile(JSON.stringify(b), ITER)).toThrow(InvalidBackupError);
    }
  });

  it('migratePayload überführt v1-Daten nach v2', () => {
    const v1Data = {
      transactions: [
        {
          id: 't1', type: 'expense', amountCents: 500, date: '2026-10-01', categoryId: 'cat-other-expense',
          merchant: 'X', city: '', note: '', source: 'manual', recurringId: null, createdAt: T0, updatedAt: T0,
        },
      ],
      categories: [
        {
          id: 'cat-other-expense', name: 'Sonstiges', type: 'expense', icon: '📦', color: '#6b7280',
          archived: false, sortOrder: 0, monthlyBudgetCents: null, updatedAt: T0,
        },
      ],
      merchantRules: [],
      recurring: [],
      settings: {
        id: 'settings', schemaVersion: 1, autoLockMinutes: 1, backupReminderDays: 14, lastBackupAt: null, updatedAt: T0,
      },
    };
    const out = validateAppData(migratePayload({ schemaVersion: 1, data: v1Data }));
    expect(out.settings.schemaVersion).toBe(2);
    expect(out.accounts).toHaveLength(2);
    expect(out.transactions[0].accountId).toBe('acc-checking');
  });

  it('migratePayload wirft bei neuerer Schema-Version (v1-App mit v2-Backup)', () => {
    expect(() => migratePayload({ schemaVersion: 3, data: {} })).toThrow(InvalidBackupError);
    expect(() => migratePayload({ schemaVersion: 3, data: {} })).toThrow('Backup stammt aus einer neueren App-Version');
  });

  it('manipulierte schemaVersion 99 wirft InvalidBackupError (neuere App-Version)', async () => {
    const text = await craftFile({ schemaVersion: 99, exportedAt: T0, data: makeData() });
    const file = readBackupFile(text, ITER);
    await expect(decryptBackup(file, PASSWORD)).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(decryptBackup(file, PASSWORD)).rejects.toThrow('Backup stammt aus einer neueren App-Version');
  });

  it('aktuelle schemaVersion wird akzeptiert (selbst gebauter Payload)', async () => {
    const data = makeData();
    const text = await craftFile({ schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: T0, data });
    expect(await decryptBackup(readBackupFile(text, ITER), PASSWORD)).toEqual(data);
  });

  it('ungültige Struktur des Payloads wirft InvalidBackupError', async () => {
    for (const payload of [null, 'x', [], { exportedAt: T0, data: makeData() }, { schemaVersion: 0, exportedAt: T0, data: makeData() }]) {
      const file = readBackupFile(await craftFile(payload), ITER);
      await expect(decryptBackup(file, PASSWORD)).rejects.toBeInstanceOf(InvalidBackupError);
    }
  });

  it('gültig verschlüsselte, aber ungültige Daten werfen ValidationError', async () => {
    const data = makeData();
    data.transactions[0].amountCents = -1;
    const file = readBackupFile(await craftFile({ schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: T0, data }), ITER);
    await expect(decryptBackup(file, PASSWORD)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('mergeData', () => {
  it('Vereinigung über id, neuer updatedAt gewinnt', () => {
    const current = makeData();
    const incoming = makeData();
    // t1: incoming neuer -> gewinnt
    incoming.transactions[0] = tx('t1', { note: 'neu', updatedAt: T2 });
    // t2: current neuer -> bleibt
    current.transactions[1] = { ...current.transactions[1], note: 'aktuell', updatedAt: T2 };
    incoming.transactions[1] = { ...incoming.transactions[1], note: 'alt', updatedAt: T1 };
    // t3 nur in incoming, t4 nur in current
    incoming.transactions.push(tx('t3'));
    current.transactions.push(tx('t4'));

    const merged = mergeData(current, incoming);
    const byId = new Map(merged.transactions.map((t) => [t.id, t]));
    expect(merged.transactions).toHaveLength(4);
    expect(byId.get('t1')?.note).toBe('neu');
    expect(byId.get('t2')?.note).toBe('aktuell');
    expect(byId.has('t3')).toBe(true);
    expect(byId.has('t4')).toBe(true);
  });

  it('bei gleichem updatedAt bleibt der aktuelle Datensatz', () => {
    const current = makeData();
    const incoming = makeData();
    current.transactions[0] = tx('t1', { note: 'aktuell' });
    incoming.transactions[0] = tx('t1', { note: 'eingehend' });
    const merged = mergeData(current, incoming);
    expect(merged.transactions.find((t) => t.id === 't1')?.note).toBe('aktuell');
  });

  it('vereinigt auch Kategorien, Regeln und Vorlagen', () => {
    const current = makeData();
    const incoming = makeData();
    const extraCat: Category = {
      ...current.categories[0],
      id: 'cat-extra',
      name: 'Extra',
      updatedAt: T1,
    };
    incoming.categories.push(extraCat);
    incoming.merchantRules.push({
      id: 'r2', pattern: 'LIDL', categoryId: 'cat-extra', displayName: null, source: 'manual', updatedAt: T1,
    });
    incoming.recurring.push({
      id: 'rec1',
      type: 'expense',
      amountCents: 100,
      categoryId: 'cat-extra',
      accountId: 'acc-checking',
      direction: null,
      merchant: 'X',
      note: '',
      dayOfMonth: 5,
      startMonth: '2026-01',
      endMonth: null,
      lastGeneratedMonth: null,
      active: true,
      updatedAt: T1,
    });
    const merged = mergeData(current, incoming);
    expect(merged.categories.some((c) => c.id === 'cat-extra')).toBe(true);
    expect(merged.merchantRules.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(merged.recurring.map((r) => r.id)).toEqual(['rec1']);
  });

  it('vereinigt Konten nach id und updatedAt', () => {
    const current = makeData();
    const incoming = makeData();
    const renamed: Account = { ...incoming.accounts[1], name: 'Visa', updatedAt: T2 };
    const extra: Account = {
      id: 'acc-extra', name: 'Tagesgeld', kind: 'savings', icon: '🐷', archived: false, sortOrder: 2, updatedAt: T1,
    };
    incoming.accounts = [incoming.accounts[0], renamed, extra];
    const merged = mergeData(current, incoming);
    expect(merged.accounts.map((a) => a.id)).toEqual(['acc-checking', 'acc-credit-card', 'acc-extra']);
    expect(merged.accounts[1].name).toBe('Visa');
  });

  it('settings kommt aus current', () => {
    const current = makeData();
    const incoming = makeData();
    current.settings = { ...current.settings, autoLockMinutes: 15, lastBackupAt: T1, updatedAt: T1 };
    incoming.settings = { ...incoming.settings, autoLockMinutes: 0, lastBackupAt: null, updatedAt: T2 };
    expect(mergeData(current, incoming).settings).toEqual(current.settings);
  });

  it('verändert die Eingaben nicht', () => {
    const current = makeData();
    const incoming = makeData();
    incoming.transactions.push(tx('t3'));
    const before = JSON.stringify(current);
    mergeData(current, incoming);
    expect(JSON.stringify(current)).toBe(before);
  });

  it('wirft ValidationError bei ungültiger Kategorie-Referenz im Ergebnis', () => {
    const current = makeData();
    const incoming = makeData();
    incoming.transactions.push(tx('t3', { categoryId: 'gibt-es-nicht' }));
    expect(() => mergeData(current, incoming)).toThrow(ValidationError);
  });
});

describe('backupStats', () => {
  it('liefert Anzahl sowie erstes und letztes Datum', () => {
    const d = makeData();
    d.transactions.push(tx('t3', { date: '2027-01-05' }));
    expect(backupStats(d)).toEqual({ transactions: 3, firstDate: '2026-09-01', lastDate: '2027-01-05' });
  });

  it('liefert null-Daten bei leerer Liste', () => {
    const d = makeData();
    d.transactions = [];
    expect(backupStats(d)).toEqual({ transactions: 0, firstDate: null, lastDate: null });
  });
});
