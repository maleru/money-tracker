const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
export const RECOVERY_ITERATIONS = 100_000;

export interface WrappedKey { iv: Uint8Array; data: Uint8Array }
export interface EncryptedBlob { iv: Uint8Array; ct: Uint8Array }

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Gemeinsame interne Ableitung eines AES-256-GCM-Schlüssels aus einem Geheimnis via PBKDF2-SHA256. */
async function deriveAesKey(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export function deriveKek(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  return deriveAesKey(secret, salt, iterations, ['wrapKey', 'unwrapKey']);
}

/** Wie deriveKek, aber mit Key-Usages ['encrypt','decrypt'] (z. B. für Backups). */
export function deriveDataKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  return deriveAesKey(secret, salt, iterations, ['encrypt', 'decrypt']);
}

export function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  const iv = randomBytes(12);
  const data = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: new Uint8Array(iv) }));
  return { iv, data };
}

/** Wirft bei falschem Schlüssel. */
export function unwrapDek(w: WrappedKey, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    new Uint8Array(w.data),
    kek,
    { name: 'AES-GCM', iv: new Uint8Array(w.iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(dek: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, dek, enc.encode(JSON.stringify(value))),
  );
  return { iv, ct };
}

export async function decryptJson<T>(dek: CryptoKey, blob: EncryptedBlob): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(blob.iv) }, dek, new Uint8Array(blob.ct));
  return JSON.parse(dec.decode(pt)) as T;
}
