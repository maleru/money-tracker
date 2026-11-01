import { describe, expect, it } from 'vitest';
import {
  formatRecoveryKey,
  fromBase64,
  normalizeRecoveryKey,
  toBase32,
  toBase64,
} from './encoding';

function patternBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + 7) % 256;
  return out;
}

describe('base64', () => {
  it.each([0, 1, 2, 3, 100_000])('Roundtrip mit %i Bytes', (n) => {
    const bytes = patternBytes(n);
    const decoded = fromBase64(toBase64(bytes));
    expect(decoded.length).toBe(n);
    expect(decoded).toEqual(bytes);
  });

  it('kodiert bekannte Werte', () => {
    expect(toBase64(new Uint8Array([]))).toBe('');
    expect(toBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
    expect(toBase64(new TextEncoder().encode('Ma'))).toBe('TWE=');
    expect(toBase64(new TextEncoder().encode('M'))).toBe('TQ==');
  });
});

describe('base32', () => {
  it('ergibt für fünf 0xff-Bytes "77777777"', () => {
    expect(toBase32(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))).toBe('77777777');
  });

  it('ergibt für fünf 0x00-Bytes "AAAAAAAA"', () => {
    expect(toBase32(new Uint8Array(5))).toBe('AAAAAAAA');
  });

  it('entspricht den RFC-4648-Testvektoren (ohne Padding)', () => {
    const e = (s: string) => toBase32(new TextEncoder().encode(s));
    expect(e('')).toBe('');
    expect(e('f')).toBe('MY');
    expect(e('fo')).toBe('MZXQ');
    expect(e('foo')).toBe('MZXW6');
    expect(e('foob')).toBe('MZXW6YQ');
    expect(e('fooba')).toBe('MZXW6YTB');
    expect(e('foobar')).toBe('MZXW6YTBOI');
  });

  it('ergibt für 20 Bytes 32 Zeichen', () => {
    expect(toBase32(patternBytes(20))).toHaveLength(32);
  });
});

describe('formatRecoveryKey', () => {
  it('bildet Gruppen zu 4 Zeichen', () => {
    expect(formatRecoveryKey('ABCDEFGHIJKLMNOP')).toBe('ABCD-EFGH-IJKL-MNOP');
  });

  it('lässt eine unvollständige letzte Gruppe zu', () => {
    expect(formatRecoveryKey('ABCDEF')).toBe('ABCD-EF');
  });

  it('liefert für leeren String einen leeren String', () => {
    expect(formatRecoveryKey('')).toBe('');
  });

  it('formatiert 32 Zeichen zu 8 Gruppen', () => {
    const formatted = formatRecoveryKey('A'.repeat(32));
    expect(formatted.split('-')).toHaveLength(8);
  });
});

describe('normalizeRecoveryKey', () => {
  it('macht groß und entfernt Trenner und Leerzeichen', () => {
    expect(normalizeRecoveryKey('abcd-efgh ijkl')).toBe('ABCDEFGHIJKL');
  });

  it('entfernt Zeichen außerhalb von A-Z2-7', () => {
    expect(normalizeRecoveryKey('A0B1C8D9-2!7')).toBe('ABCD27');
  });

  it('ist die Umkehrung von formatRecoveryKey', () => {
    const raw = toBase32(patternBytes(20));
    expect(normalizeRecoveryKey(formatRecoveryKey(raw).toLowerCase())).toBe(raw);
  });
});
