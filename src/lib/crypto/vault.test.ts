import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './crypto';
import { normalizeRecoveryKey } from './encoding';
import {
  MIN_PASSWORD_LENGTH,
  WrongSecretError,
  changePassword,
  createVault,
  regenerateRecoveryKey,
  resetPasswordWithRecovery,
  unlockWithPassword,
  unlockWithRecovery,
} from './vault';

const FAST = { password: 1000, recovery: 1000 };
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'another long passphrase';

async function makeVault() {
  return createVault(PASSWORD, FAST);
}

describe('createVault', () => {
  it('erzeugt Meta mit 16-Byte-Salts, 12-Byte-IVs und den übergebenen Iterationen', async () => {
    const { meta } = await makeVault();
    expect(meta.id).toBe('vault');
    expect(meta.version).toBe(1);
    expect(meta.kdf.salt).toHaveLength(16);
    expect(meta.recovery.salt).toHaveLength(16);
    expect(meta.wrappedDek.iv).toHaveLength(12);
    expect(meta.recovery.wrappedDek.iv).toHaveLength(12);
    expect(meta.kdf.iterations).toBe(1000);
    expect(meta.recovery.iterations).toBe(1000);
    expect(Number.isNaN(Date.parse(meta.createdAt))).toBe(false);
  });

  it('erzeugt einen Wiederherstellungsschlüssel aus 8 Gruppen zu 4 Zeichen (32 Zeichen A-Z2-7)', async () => {
    const { recoveryKey } = await makeVault();
    expect(recoveryKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(normalizeRecoveryKey(recoveryKey)).toHaveLength(32);
  });

  it('erzeugt bei jedem Aufruf andere Salts und Schlüssel', async () => {
    const a = await makeVault();
    const b = await makeVault();
    expect(a.recoveryKey).not.toBe(b.recoveryKey);
    expect(a.meta.kdf.salt).not.toEqual(b.meta.kdf.salt);
    expect(a.meta.recovery.salt).not.toEqual(b.meta.recovery.salt);
  });

  it('verwendet ohne iterations-Parameter die Standardwerte aus dem Plan', async () => {
    const { meta } = await createVault(PASSWORD);
    expect(meta.kdf.iterations).toBe(600_000);
    expect(meta.recovery.iterations).toBe(100_000);
  });

  it('liefert einen non-extractable DEK, der zum Wrap passt', async () => {
    const { meta, dek } = await makeVault();
    expect(dek.extractable).toBe(false);
    const blob = await encryptJson(dek, { z: 1 });
    const unlocked = await unlockWithPassword(meta, PASSWORD);
    expect(await decryptJson<{ z: number }>(unlocked, blob)).toEqual({ z: 1 });
  });

  it('exportiert MIN_PASSWORD_LENGTH = 10', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
  });
});

describe('unlockWithPassword', () => {
  it('entsperrt mit dem richtigen Passwort und liefert einen non-extractable DEK', async () => {
    const { meta, dek } = await makeVault();
    const blob = await encryptJson(dek, { hello: 'welt' });
    const unlocked = await unlockWithPassword(meta, PASSWORD);
    expect(unlocked.extractable).toBe(false);
    expect(await decryptJson<{ hello: string }>(unlocked, blob)).toEqual({ hello: 'welt' });
  });

  it('wirft WrongSecretError bei falschem Passwort', async () => {
    const { meta } = await makeVault();
    await expect(unlockWithPassword(meta, 'falsches passwort')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('wirft WrongSecretError auch bei beschädigten Meta-Daten', async () => {
    const { meta } = await makeVault();
    const broken = { ...meta, wrappedDek: { ...meta.wrappedDek, iv: new Uint8Array(3) } };
    await expect(unlockWithPassword(broken, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
  });
});

describe('unlockWithRecovery', () => {
  it('entsperrt mit dem Wiederherstellungsschlüssel und liefert einen extractable DEK', async () => {
    const { meta, dek, recoveryKey } = await makeVault();
    const blob = await encryptJson(dek, { a: 1 });
    const unlocked = await unlockWithRecovery(meta, recoveryKey);
    expect(unlocked.extractable).toBe(true);
    expect(await decryptJson<{ a: number }>(unlocked, blob)).toEqual({ a: 1 });
  });

  it('funktioniert mit klein geschriebenem Schlüssel ohne Bindestriche', async () => {
    const { meta, dek, recoveryKey } = await makeVault();
    const blob = await encryptJson(dek, { a: 2 });
    const typed = recoveryKey.toLowerCase().replace(/-/g, '');
    const unlocked = await unlockWithRecovery(meta, typed);
    expect(await decryptJson<{ a: number }>(unlocked, blob)).toEqual({ a: 2 });
  });

  it('wirft WrongSecretError bei falschem Schlüssel', async () => {
    const { meta } = await makeVault();
    await expect(unlockWithRecovery(meta, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  });
});

describe('changePassword', () => {
  it('altes Passwort geht nicht mehr, neues schon, und Daten bleiben entschlüsselbar', async () => {
    const { meta, dek } = await makeVault();
    const blob = await encryptJson(dek, { keep: 'me' });

    const newMeta = await changePassword(meta, PASSWORD, NEW_PASSWORD, FAST);

    await expect(unlockWithPassword(newMeta, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    const unlocked = await unlockWithPassword(newMeta, NEW_PASSWORD);
    expect(unlocked.extractable).toBe(false);
    expect(await decryptJson<{ keep: string }>(unlocked, blob)).toEqual({ keep: 'me' });
  });

  it('verwendet ein neues Salt und einen neuen Wrap, der Recovery-Teil bleibt unverändert', async () => {
    const { meta, recoveryKey } = await makeVault();
    const newMeta = await changePassword(meta, PASSWORD, NEW_PASSWORD, FAST);

    expect(newMeta.kdf.salt).toHaveLength(16);
    expect(newMeta.kdf.salt).not.toEqual(meta.kdf.salt);
    expect(newMeta.wrappedDek.iv).not.toEqual(meta.wrappedDek.iv);
    expect(newMeta.wrappedDek.data).not.toEqual(meta.wrappedDek.data);
    expect(newMeta.recovery).toEqual(meta.recovery);
    expect(newMeta.createdAt).toBe(meta.createdAt);

    // Wiederherstellungsschlüssel funktioniert weiterhin.
    await expect(unlockWithRecovery(newMeta, recoveryKey)).resolves.toBeDefined();
  });

  it('wirft WrongSecretError bei falschem altem Passwort', async () => {
    const { meta } = await makeVault();
    await expect(changePassword(meta, 'falsch falsch falsch', NEW_PASSWORD, FAST)).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  });
});

describe('resetPasswordWithRecovery', () => {
  it('setzt ein neues Passwort, liefert non-extractable DEK und Daten bleiben entschlüsselbar', async () => {
    const { meta, dek, recoveryKey } = await makeVault();
    const blob = await encryptJson(dek, { x: 1 });

    const result = await resetPasswordWithRecovery(meta, recoveryKey, NEW_PASSWORD, FAST);

    expect(result.dek.extractable).toBe(false);
    expect(await decryptJson<{ x: number }>(result.dek, blob)).toEqual({ x: 1 });
    await expect(unlockWithPassword(result.meta, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    const unlocked = await unlockWithPassword(result.meta, NEW_PASSWORD);
    expect(await decryptJson<{ x: number }>(unlocked, blob)).toEqual({ x: 1 });
  });

  it('funktioniert, wenn der Schlüssel klein geschrieben und ohne Bindestriche eingegeben wird', async () => {
    const { meta, dek, recoveryKey } = await makeVault();
    const blob = await encryptJson(dek, { x: 2 });
    const typed = recoveryKey.toLowerCase().replace(/-/g, '');

    const result = await resetPasswordWithRecovery(meta, typed, NEW_PASSWORD, FAST);
    expect(await decryptJson<{ x: number }>(result.dek, blob)).toEqual({ x: 2 });
  });

  it('verwendet ein neues Salt, der Recovery-Teil bleibt unverändert', async () => {
    const { meta, recoveryKey } = await makeVault();
    const result = await resetPasswordWithRecovery(meta, recoveryKey, NEW_PASSWORD, FAST);
    expect(result.meta.kdf.salt).toHaveLength(16);
    expect(result.meta.kdf.salt).not.toEqual(meta.kdf.salt);
    expect(result.meta.recovery).toEqual(meta.recovery);
    await expect(unlockWithRecovery(result.meta, recoveryKey)).resolves.toBeDefined();
  });

  it('wirft WrongSecretError bei falschem Schlüssel', async () => {
    const { meta } = await makeVault();
    await expect(
      resetPasswordWithRecovery(meta, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', NEW_PASSWORD, FAST),
    ).rejects.toBeInstanceOf(WrongSecretError);
  });
});

describe('regenerateRecoveryKey', () => {
  it('erzeugt einen neuen Schlüssel; der alte wird ungültig, der neue funktioniert', async () => {
    const { meta, dek, recoveryKey: oldKey } = await makeVault();
    const blob = await encryptJson(dek, { r: 1 });

    const result = await regenerateRecoveryKey(meta, PASSWORD, FAST);

    expect(result.recoveryKey).not.toBe(oldKey);
    expect(result.recoveryKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    await expect(unlockWithRecovery(result.meta, oldKey)).rejects.toBeInstanceOf(WrongSecretError);
    const unlocked = await unlockWithRecovery(result.meta, result.recoveryKey);
    expect(await decryptJson<{ r: number }>(unlocked, blob)).toEqual({ r: 1 });
  });

  it('verwendet neues Recovery-Salt und neuen Wrap, der Passwort-Teil bleibt unverändert', async () => {
    const { meta } = await makeVault();
    const result = await regenerateRecoveryKey(meta, PASSWORD, FAST);

    expect(result.meta.recovery.salt).toHaveLength(16);
    expect(result.meta.recovery.salt).not.toEqual(meta.recovery.salt);
    expect(result.meta.recovery.wrappedDek.iv).not.toEqual(meta.recovery.wrappedDek.iv);
    expect(result.meta.kdf).toEqual(meta.kdf);
    expect(result.meta.wrappedDek).toEqual(meta.wrappedDek);
    await expect(unlockWithPassword(result.meta, PASSWORD)).resolves.toBeDefined();
  });

  it('wirft WrongSecretError bei falschem Passwort', async () => {
    const { meta } = await makeVault();
    await expect(regenerateRecoveryKey(meta, 'falsch falsch falsch', FAST)).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  });
});
