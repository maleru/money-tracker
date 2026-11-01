import type { Table } from 'dexie';
import { decryptJson, encryptJson } from '../crypto/crypto';
import type { EncryptedRow } from './db';

export class EncryptedTable<T extends { id: string }> {
  /** `getKey` wird bei JEDEM Aufruf neu gelesen, damit es nach dem Sperren wirft. */
  constructor(private table: Table<EncryptedRow, string>, private getKey: () => CryptoKey) {}

  /** Alle Rows entschlüsseln. */
  async getAll(): Promise<T[]> {
    const key = this.getKey();
    const rows = await this.table.toArray();
    return Promise.all(
      rows.map((row) => decryptJson<T>(key, { iv: new Uint8Array(row.iv), ct: new Uint8Array(row.ct) })),
    );
  }

  /** encryptJson -> { id: item.id, iv, ct } */
  async put(item: T): Promise<void> {
    const { iv, ct } = await encryptJson(this.getKey(), item);
    await this.table.put({ id: item.id, iv, ct });
  }

  /** Verschlüsselt Items zu Rohzeilen, ohne die DB zu berühren (z. B. für Dexie-Transaktionen). */
  async encryptRows(items: T[]): Promise<EncryptedRow[]> {
    const key = this.getKey();
    return Promise.all(
      items.map(async (item) => {
        const { iv, ct } = await encryptJson(key, item);
        return { id: item.id, iv, ct };
      }),
    );
  }

  /** Verschlüsselt alle Items und schreibt sie mit EINEM bulkPut. */
  async bulkPut(items: T[]): Promise<void> {
    const rows = await this.encryptRows(items);
    await this.table.bulkPut(rows);
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async clear(): Promise<void> {
    await this.table.clear();
  }
}
