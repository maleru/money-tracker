import Dexie, { type Table } from 'dexie';
import type { VaultMeta } from '../crypto/vault';

export interface EncryptedRow { id: string; iv: Uint8Array; ct: Uint8Array }

export class MoneyDb extends Dexie {
  meta!: Table<VaultMeta, string>;
  transactions!: Table<EncryptedRow, string>;
  categories!: Table<EncryptedRow, string>;
  merchantRules!: Table<EncryptedRow, string>;
  recurring!: Table<EncryptedRow, string>;
  settings!: Table<EncryptedRow, string>;
  accounts!: Table<EncryptedRow, string>;
  constructor(name = 'money-tracker') {
    super(name);
    this.version(1).stores({
      meta: 'id', transactions: 'id', categories: 'id',
      merchantRules: 'id', recurring: 'id', settings: 'id',
    });
    this.version(2).stores({
      meta: 'id', transactions: 'id', categories: 'id',
      merchantRules: 'id', recurring: 'id', settings: 'id', accounts: 'id',
    });
  }
}
export const db = new MoneyDb();
