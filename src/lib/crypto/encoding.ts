const CHUNK = 0x8000;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(s: string): Uint8Array {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, binary.length);
    for (let j = i; j < end; j++) {
      out[j] = binary.charCodeAt(j);
    }
  }
  return out;
}

/** RFC 4648 Base32 ohne Padding. */
export function toBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return out;
}

/** Gruppen zu 4 Zeichen, getrennt durch '-'. */
export function formatRecoveryKey(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

/** Alles groß, alles außer A-Z2-7 entfernen. */
export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, '');
}
