import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  deriveDataKey,
  deriveKek,
  encryptJson,
  generateDek,
  randomBytes,
  unwrapDek,
  wrapDek,
} from './crypto';

const ITERATIONS = 1000;

describe('randomBytes', () => {
  it('liefert die gewünschte Länge und unterschiedliche Werte', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(a).toHaveLength(16);
    expect(a).not.toEqual(b);
  });
});

describe('encryptJson / decryptJson', () => {
  it('Roundtrip liefert den ursprünglichen Wert', async () => {
    const dek = await generateDek();
    const value = { a: 1, b: 'Café ☕', c: [true, null], d: { e: 'x' } };
    const blob = await encryptJson(dek, value);
    expect(blob.iv).toHaveLength(12);
    expect(await decryptJson<typeof value>(dek, blob)).toEqual(value);
  });

  it('zwei Verschlüsselungen desselben Werts haben unterschiedliche IVs und Ciphertexte', async () => {
    const dek = await generateDek();
    const value = { x: 'gleich' };
    const a = await encryptJson(dek, value);
    const b = await encryptJson(dek, value);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ct).not.toEqual(b.ct);
  });

  it('wirft bei falschem Schlüssel', async () => {
    const dek1 = await generateDek();
    const dek2 = await generateDek();
    const blob = await encryptJson(dek1, { secret: 1 });
    await expect(decryptJson(dek2, blob)).rejects.toThrow();
  });

  it('wirft bei manipuliertem Ciphertext', async () => {
    const dek = await generateDek();
    const blob = await encryptJson(dek, { secret: 1 });
    const ct = new Uint8Array(blob.ct);
    ct[0] ^= 0xff;
    await expect(decryptJson(dek, { iv: blob.iv, ct })).rejects.toThrow();
  });
});

describe('wrapDek / unwrapDek', () => {
  it('Roundtrip liefert einen funktionierenden DEK', async () => {
    const dek = await generateDek();
    const salt = randomBytes(16);
    const kek = await deriveKek('passwort', salt, ITERATIONS);
    const wrapped = await wrapDek(dek, kek);
    expect(wrapped.iv).toHaveLength(12);

    const kek2 = await deriveKek('passwort', salt, ITERATIONS);
    const unwrapped = await unwrapDek(wrapped, kek2, false);
    const blob = await encryptJson(dek, { ok: true });
    expect(await decryptJson<{ ok: boolean }>(unwrapped, blob)).toEqual({ ok: true });
    expect(unwrapped.extractable).toBe(false);
  });

  it('liefert bei extractable=true einen exportierbaren DEK', async () => {
    const dek = await generateDek();
    const kek = await deriveKek('passwort', randomBytes(16), ITERATIONS);
    const wrapped = await wrapDek(dek, kek);
    const unwrapped = await unwrapDek(wrapped, kek, true);
    expect(unwrapped.extractable).toBe(true);
  });

  it('verwendet bei jedem Wrap eine neue IV', async () => {
    const dek = await generateDek();
    const kek = await deriveKek('passwort', randomBytes(16), ITERATIONS);
    const a = await wrapDek(dek, kek);
    const b = await wrapDek(dek, kek);
    expect(a.iv).not.toEqual(b.iv);
  });

  it('wirft bei falschem KEK', async () => {
    const dek = await generateDek();
    const salt = randomBytes(16);
    const kek = await deriveKek('richtig', salt, ITERATIONS);
    const wrongKek = await deriveKek('falsch', salt, ITERATIONS);
    const wrapped = await wrapDek(dek, kek);
    await expect(unwrapDek(wrapped, wrongKek, false)).rejects.toThrow();
  });
});

describe('deriveKek / deriveDataKey', () => {
  it('deriveDataKey liefert einen Schlüssel zum Ver- und Entschlüsseln', async () => {
    const salt = randomBytes(16);
    const key = await deriveDataKey('geheim', salt, ITERATIONS);
    expect(key.extractable).toBe(false);
    expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
    const blob = await encryptJson(key, { v: 42 });
    const key2 = await deriveDataKey('geheim', salt, ITERATIONS);
    expect(await decryptJson<{ v: number }>(key2, blob)).toEqual({ v: 42 });
  });

  it('deriveDataKey mit anderem Geheimnis kann nicht entschlüsseln', async () => {
    const salt = randomBytes(16);
    const key = await deriveDataKey('geheim', salt, ITERATIONS);
    const other = await deriveDataKey('anders', salt, ITERATIONS);
    const blob = await encryptJson(key, { v: 1 });
    await expect(decryptJson(other, blob)).rejects.toThrow();
  });

  it('deriveKek liefert einen Schlüssel mit wrapKey/unwrapKey', async () => {
    const kek = await deriveKek('geheim', randomBytes(16), ITERATIONS);
    expect(kek.usages.sort()).toEqual(['unwrapKey', 'wrapKey']);
  });

  it('normalisiert das Geheimnis nach NFC', async () => {
    const salt = randomBytes(16);
    const a = await deriveDataKey('\u00e9', salt, ITERATIONS);
    const b = await deriveDataKey('e\u0301', salt, ITERATIONS);
    const blob = await encryptJson(a, { v: 1 });
    expect(await decryptJson<{ v: number }>(b, blob)).toEqual({ v: 1 });
  });
});
