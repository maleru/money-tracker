import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDek } from '../crypto/crypto';
import type { Transaction } from '../types';
import { MoneyDb } from './db';
import { EncryptedTable } from './encryptedTable';

function makeTx(id: string, merchant = 'GEHEIM-ALDI'): Transaction {
  return {
    id,
    type: 'expense',
    amountCents: 1234,
    date: '2026-10-21',
    categoryId: 'cat-groceries',
    accountId: 'acc-checking',
    direction: null,
    merchant,
    originalText: '',
    city: 'München',
    note: 'GEHEIM-NOTIZ',
    source: 'manual',
    recurringId: null,
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
  };
}

describe('EncryptedTable', () => {
  let db: MoneyDb;
  let key: CryptoKey;
  let table: EncryptedTable<Transaction>;

  beforeEach(async () => {
    db = new MoneyDb('test-' + crypto.randomUUID());
    key = await generateDek();
    table = new EncryptedTable<Transaction>(db.transactions, () => key);
  });

  it('Roundtrip: put und getAll', async () => {
    const tx = makeTx('a');
    await table.put(tx);
    expect(await table.getAll()).toEqual([tx]);
  });

  it('put überschreibt vorhandenen Datensatz mit gleicher id', async () => {
    await table.put(makeTx('a', 'ALT'));
    await table.put(makeTx('a', 'NEU'));
    const all = await table.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.merchant).toBe('NEU');
  });

  it('bulkPut und getAll', async () => {
    const items = [makeTx('a'), makeTx('b'), makeTx('c')];
    await table.bulkPut(items);
    const all = await table.getAll();
    expect(all).toHaveLength(3);
    expect([...all].sort((x, y) => x.id.localeCompare(y.id))).toEqual(items);
  });

  it('bulkPut verwendet für jeden Datensatz eine eigene IV', async () => {
    await table.bulkPut([makeTx('a'), makeTx('b')]);
    const a = await db.transactions.get('a');
    const b = await db.transactions.get('b');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Array.from(a!.iv)).not.toEqual(Array.from(b!.iv));
  });

  it('bulkPut ruft genau einmal table.bulkPut auf', async () => {
    let calls = 0;
    const original = db.transactions.bulkPut.bind(db.transactions);
    db.transactions.bulkPut = ((...args: Parameters<typeof original>) => {
      calls++;
      return original(...args);
    }) as typeof original;
    await table.bulkPut([makeTx('a'), makeTx('b'), makeTx('c')]);
    expect(calls).toBe(1);
  });

  it('delete entfernt einen Datensatz', async () => {
    await table.bulkPut([makeTx('a'), makeTx('b')]);
    await table.delete('a');
    const all = await table.getAll();
    expect(all.map((t) => t.id)).toEqual(['b']);
  });

  it('clear leert die Tabelle', async () => {
    await table.bulkPut([makeTx('a'), makeTx('b')]);
    await table.clear();
    expect(await table.getAll()).toEqual([]);
  });

  it('Rohdaten enthalten keinen Klartext', async () => {
    await table.put(makeTx('a'));
    const raw = await db.transactions.get('a');
    expect(raw).toBeDefined();
    expect(raw!.id).toBe('a');
    expect(JSON.stringify(raw)).not.toContain('GEHEIM-ALDI');
    const decoded = new TextDecoder().decode(raw!.ct);
    expect(decoded).not.toContain('GEHEIM-ALDI');
    expect(decoded).not.toContain('GEHEIM-NOTIZ');
    expect(Object.keys(raw!).sort()).toEqual(['ct', 'id', 'iv']);
  });

  it('getAll mit einem anderen Schlüssel wirft', async () => {
    await table.put(makeTx('a'));
    const otherKey = await generateDek();
    const wrong = new EncryptedTable<Transaction>(db.transactions, () => otherKey);
    await expect(wrong.getAll()).rejects.toThrow();
  });

  it('getKey wird bei jedem Aufruf neu gelesen (Sperren wirft)', async () => {
    let current: CryptoKey | null = key;
    const locked = new EncryptedTable<Transaction>(db.transactions, () => {
      if (!current) throw new Error('locked');
      return current;
    });
    await locked.put(makeTx('a'));
    current = null;
    await expect(locked.getAll()).rejects.toThrow('locked');
    await expect(locked.put(makeTx('b'))).rejects.toThrow('locked');
    await expect(locked.bulkPut([makeTx('c')])).rejects.toThrow('locked');
  });
});
