import { PBKDF2_ITERATIONS, decryptJson, deriveDataKey, encryptJson, randomBytes } from '../crypto/crypto';
import { fromBase64, toBase64 } from '../crypto/encoding';
import { WrongSecretError } from '../crypto/vault';
import { CURRENT_SCHEMA_VERSION } from '../db/defaults';
import { migrateToV2 } from '../db/migrate';
import type { AppData } from '../types';
import { InvalidBackupError, type BackupFileV1, type BackupPayload } from './format';
import { validateAppData } from './validate';

const SALT_BYTES = 16;
const IV_BYTES = 12;
/** AES-GCM-Auth-Tag: ein gültiger Ciphertext ist mindestens so lang. */
const GCM_TAG_BYTES = 16;
/** Untergrenze gegen Downgrade-Angriffe (überschreibbar für Tests). */
const DEFAULT_MIN_ITERATIONS = 100_000;
/** Obergrenze gegen DoS durch absurd hohe Iterationszahlen. */
const MAX_ITERATIONS = 10_000_000;

const NEWER_VERSION_MESSAGE = 'Backup stammt aus einer neueren App-Version';

/** Migrationen: Schlüssel N überführt die Daten (`AppData`-Form) von Schema N nach N+1. */
const MIGRATIONS: Record<number, (d: unknown) => unknown> = {
  1: (d) => migrateToV2(d, new Date().toISOString()),
};

function appVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function invalid(): never {
  throw new InvalidBackupError('Keine gültige Backup-Datei');
}

/** Strikte Base64-Dekodierung; optional mit erwarteter Länge in Bytes. */
function decodeB64(v: unknown, length?: number): Uint8Array {
  if (typeof v !== 'string' || v.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) invalid();
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(v);
  } catch {
    invalid();
  }
  if (length !== undefined && bytes.length !== length) invalid();
  return bytes;
}

// ---------- Erstellen ----------

/** Erzeugt den JSON-Text einer verschlüsselten Backup-Datei. Das Passwort wird nicht gespeichert. */
export async function createBackup(
  data: AppData,
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const now = new Date().toISOString();
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveDataKey(password, salt, iterations);
  const payload: BackupPayload = { schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: now, data };
  const blob = await encryptJson(key, payload);
  const file: BackupFileV1 = {
    format: 'money-tracker-backup',
    version: 1,
    createdAt: now,
    appVersion: appVersion(),
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-256-GCM', iv: toBase64(blob.iv) },
    data: toBase64(blob.ct),
  };
  return JSON.stringify(file, null, 2);
}

// ---------- Lesen ----------

/**
 * Parst und prüft die Struktur einer Backup-Datei (synchron, ohne Entschlüsselung).
 * Wirft bei jedem Problem InvalidBackupError('Keine gültige Backup-Datei').
 */
export function readBackupFile(text: string, minIterations: number = DEFAULT_MIN_ITERATIONS): BackupFileV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (!isObj(parsed)) invalid();
  if (parsed.format !== 'money-tracker-backup' || parsed.version !== 1) invalid();
  if (typeof parsed.createdAt !== 'string' || typeof parsed.appVersion !== 'string') invalid();

  const kdf = parsed.kdf;
  if (!isObj(kdf) || kdf.name !== 'PBKDF2-SHA256') invalid();
  const iterations = kdf.iterations;
  if (
    typeof iterations !== 'number' ||
    !Number.isSafeInteger(iterations) ||
    iterations < minIterations ||
    iterations > MAX_ITERATIONS
  ) {
    invalid();
  }
  decodeB64(kdf.salt, SALT_BYTES);

  const cipher = parsed.cipher;
  if (!isObj(cipher) || cipher.name !== 'AES-256-GCM') invalid();
  decodeB64(cipher.iv, IV_BYTES);

  const ct = decodeB64(parsed.data);
  if (ct.length < GCM_TAG_BYTES) invalid();

  // Neu aufgebautes Objekt: nur bekannte Felder.
  return {
    format: 'money-tracker-backup',
    version: 1,
    createdAt: parsed.createdAt,
    appVersion: parsed.appVersion,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: kdf.salt as string },
    cipher: { name: 'AES-256-GCM', iv: cipher.iv as string },
    data: parsed.data as string,
  };
}

// ---------- Migration ----------

/** Überführt die Daten eines Payloads auf `CURRENT_SCHEMA_VERSION`. */
export function migratePayload(p: { schemaVersion: number; data: unknown }): unknown {
  if (!Number.isSafeInteger(p.schemaVersion) || p.schemaVersion < 1) invalid();
  if (p.schemaVersion > CURRENT_SCHEMA_VERSION) throw new InvalidBackupError(NEWER_VERSION_MESSAGE);
  let data = p.data;
  for (let v = p.schemaVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) invalid();
    data = step(data);
  }
  return data;
}

// ---------- Entschlüsseln ----------

/**
 * Entschlüsselt und validiert eine (zuvor mit readBackupFile geprüfte) Backup-Datei.
 * Wirft WrongSecretError bei falschem Passwort oder manipuliertem Ciphertext.
 */
export async function decryptBackup(file: BackupFileV1, password: string): Promise<AppData> {
  const iterations = file.kdf.iterations;
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) invalid();
  const salt = decodeB64(file.kdf.salt, SALT_BYTES);
  const iv = decodeB64(file.cipher.iv, IV_BYTES);
  const ct = decodeB64(file.data);

  const key = await deriveDataKey(password, salt, iterations);
  let decrypted: unknown;
  try {
    decrypted = await decryptJson<unknown>(key, { iv, ct });
  } catch {
    throw new WrongSecretError();
  }

  if (
    !isObj(decrypted) ||
    typeof decrypted.schemaVersion !== 'number' ||
    typeof decrypted.exportedAt !== 'string'
  ) {
    invalid();
  }
  const migrated = migratePayload({ schemaVersion: decrypted.schemaVersion, data: decrypted.data });
  return validateAppData(migrated);
}

// ---------- Zusammenführen ----------

function mergeList<T extends { id: string; updatedAt: string }>(current: T[], incoming: T[]): T[] {
  const result = [...current];
  const index = new Map<string, number>();
  result.forEach((item, i) => index.set(item.id, i));
  for (const item of incoming) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, result.length);
      result.push(item);
    } else if (item.updatedAt > result[i].updatedAt) {
      result[i] = item;
    }
  }
  return result;
}

/**
 * Vereinigung pro Sammlung über die id; bei gleicher id gewinnt der höhere updatedAt
 * (bei Gleichstand bleibt der aktuelle Datensatz). `settings` kommt aus `current`.
 * Das Ergebnis wird validiert (u. a. gültige Kategorie-Referenzen).
 */
export function mergeData(current: AppData, incoming: AppData): AppData {
  return validateAppData({
    transactions: mergeList(current.transactions, incoming.transactions),
    categories: mergeList(current.categories, incoming.categories),
    merchantRules: mergeList(current.merchantRules, incoming.merchantRules),
    recurring: mergeList(current.recurring, incoming.recurring),
    accounts: mergeList(current.accounts, incoming.accounts),
    settings: current.settings,
  });
}

// ---------- Statistik ----------

export function backupStats(d: AppData): { transactions: number; firstDate: string | null; lastDate: string | null } {
  let firstDate: string | null = null;
  let lastDate: string | null = null;
  for (const tx of d.transactions) {
    if (firstDate === null || tx.date < firstDate) firstDate = tx.date;
    if (lastDate === null || tx.date > lastDate) lastDate = tx.date;
  }
  return { transactions: d.transactions.length, firstDate, lastDate };
}

// ---------- Teilen / Speichern (nicht pure) ----------

/**
 * Teilt die Datei über das iOS-Share-Sheet oder lädt sie herunter.
 * Muss direkt aus einem Klick-Handler aufgerufen werden (ohne vorheriges await).
 */
export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
