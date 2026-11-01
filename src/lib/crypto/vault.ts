import {
  PBKDF2_ITERATIONS,
  RECOVERY_ITERATIONS,
  deriveKek,
  generateDek,
  randomBytes,
  unwrapDek,
  wrapDek,
  type WrappedKey,
} from './crypto';
import { formatRecoveryKey, normalizeRecoveryKey, toBase32 } from './encoding';

export interface VaultMeta {
  id: 'vault';
  version: 1;
  kdf: { iterations: number; salt: Uint8Array };          // salt 16 Byte
  wrappedDek: WrappedKey;
  recovery: { iterations: number; salt: Uint8Array; wrappedDek: WrappedKey };
  createdAt: string;
}

export interface VaultIterations { password: number; recovery: number }

export const MIN_PASSWORD_LENGTH = 10;

const SALT_BYTES = 16;
const RECOVERY_KEY_BYTES = 20;

const DEFAULT_ITERATIONS: VaultIterations = {
  password: PBKDF2_ITERATIONS,
  recovery: RECOVERY_ITERATIONS,
};

export class WrongSecretError extends Error {
  constructor(message = 'Falsches Passwort oder falscher Wiederherstellungsschlüssel') {
    super(message);
    this.name = 'WrongSecretError';
  }
}

/** Wandelt JEDEN Fehler aus unwrapDek in WrongSecretError um. */
async function unwrapOrThrow(w: WrappedKey, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  try {
    return await unwrapDek(w, kek, extractable);
  } catch {
    throw new WrongSecretError();
  }
}

/** 20 Zufallsbytes -> base32 (32 Zeichen) -> formatiert. */
function generateRecoveryKey(): string {
  return formatRecoveryKey(toBase32(randomBytes(RECOVERY_KEY_BYTES)));
}

/**
 * Erzeugt DEK, Salts und Wiederherstellungsschlüssel (20 Zufallsbytes -> base32 -> 32 Zeichen -> formatiert).
 * Der zurückgegebene DEK ist non-extractable (frisch aus dem Wrap entpackt).
 */
export async function createVault(
  password: string,
  iterations?: VaultIterations,
): Promise<{ meta: VaultMeta; dek: CryptoKey; recoveryKey: string }> {
  const iter = iterations ?? DEFAULT_ITERATIONS;
  // Der frisch erzeugte DEK ist extractable (nötig zum Wrappen) und wird danach verworfen.
  const extractableDek = await generateDek();

  const kdfSalt = randomBytes(SALT_BYTES);
  const kek = await deriveKek(password, kdfSalt, iter.password);
  const wrappedDek = await wrapDek(extractableDek, kek);

  const recoveryKey = generateRecoveryKey();
  const recoverySalt = randomBytes(SALT_BYTES);
  const recoveryKek = await deriveKek(normalizeRecoveryKey(recoveryKey), recoverySalt, iter.recovery);
  const recoveryWrappedDek = await wrapDek(extractableDek, recoveryKek);

  // Rückgabe: non-extractable DEK, frisch aus dem Wrap entpackt.
  const dek = await unwrapDek(wrappedDek, kek, false);

  const meta: VaultMeta = {
    id: 'vault',
    version: 1,
    kdf: { iterations: iter.password, salt: kdfSalt },
    wrappedDek,
    recovery: { iterations: iter.recovery, salt: recoverySalt, wrappedDek: recoveryWrappedDek },
    createdAt: new Date().toISOString(),
  };
  return { meta, dek, recoveryKey };
}

/** DEK non-extractable. Wirft WrongSecretError bei falschem Passwort. */
export async function unlockWithPassword(meta: VaultMeta, password: string): Promise<CryptoKey> {
  const kek = await deriveKek(password, meta.kdf.salt, meta.kdf.iterations);
  return unwrapOrThrow(meta.wrappedDek, kek, false);
}

/** Liefert extractable DEK (für Re-Wrap). Wirft WrongSecretError bei falschem Schlüssel. */
export async function unlockWithRecovery(meta: VaultMeta, recoveryKey: string): Promise<CryptoKey> {
  const kek = await deriveKek(normalizeRecoveryKey(recoveryKey), meta.recovery.salt, meta.recovery.iterations);
  return unwrapOrThrow(meta.recovery.wrappedDek, kek, true);
}

/** Prüft oldPassword (unwrap extractable), wrapt mit neuem Salt + neuem Passwort. recovery bleibt unverändert. */
export async function changePassword(
  meta: VaultMeta,
  oldPassword: string,
  newPassword: string,
  iterations?: VaultIterations,
): Promise<VaultMeta> {
  const iter = iterations ?? DEFAULT_ITERATIONS;
  const oldKek = await deriveKek(oldPassword, meta.kdf.salt, meta.kdf.iterations);
  const dek = await unwrapOrThrow(meta.wrappedDek, oldKek, true);

  const salt = randomBytes(SALT_BYTES);
  const newKek = await deriveKek(newPassword, salt, iter.password);
  const wrappedDek = await wrapDek(dek, newKek);
  return {
    ...meta,
    kdf: { iterations: iter.password, salt },
    wrappedDek,
  };
}

/** Recovery-Flow: unwrap via Recovery, neues Passwort setzen. Liefert neue Meta + non-extractable DEK. */
export async function resetPasswordWithRecovery(
  meta: VaultMeta,
  recoveryKey: string,
  newPassword: string,
  iterations?: VaultIterations,
): Promise<{ meta: VaultMeta; dek: CryptoKey }> {
  const iter = iterations ?? DEFAULT_ITERATIONS;
  const extractableDek = await unlockWithRecovery(meta, recoveryKey);

  const salt = randomBytes(SALT_BYTES);
  const newKek = await deriveKek(newPassword, salt, iter.password);
  const wrappedDek = await wrapDek(extractableDek, newKek);
  const newMeta: VaultMeta = {
    ...meta,
    kdf: { iterations: iter.password, salt },
    wrappedDek,
  };

  // Der zurückgegebene DEK ist non-extractable (frisch mit dem neuen Passwort entpackt).
  const dek = await unwrapOrThrow(wrappedDek, newKek, false);
  return { meta: newMeta, dek };
}

/** Neuer Wiederherstellungsschlüssel (alter wird ungültig). Erfordert Passwort. Passwort-Teil bleibt unverändert. */
export async function regenerateRecoveryKey(
  meta: VaultMeta,
  password: string,
  iterations?: VaultIterations,
): Promise<{ meta: VaultMeta; recoveryKey: string }> {
  const iter = iterations ?? DEFAULT_ITERATIONS;
  const kek = await deriveKek(password, meta.kdf.salt, meta.kdf.iterations);
  const dek = await unwrapOrThrow(meta.wrappedDek, kek, true);

  const recoveryKey = generateRecoveryKey();
  const salt = randomBytes(SALT_BYTES);
  const recoveryKek = await deriveKek(normalizeRecoveryKey(recoveryKey), salt, iter.recovery);
  const wrappedDek = await wrapDek(dek, recoveryKek);
  return {
    meta: {
      ...meta,
      recovery: { iterations: iter.recovery, salt, wrappedDek },
    },
    recoveryKey,
  };
}
