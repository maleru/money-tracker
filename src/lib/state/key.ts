// Der DEK liegt nur im RAM, in einer Modulvariablen (bewusst NICHT in einem Store).
// Eigenes Modul, damit session.ts und data.ts sich nicht gegenseitig importieren.
let dek: CryptoKey | null = null;

export function setDek(k: CryptoKey): void { dek = k; }
export function clearDek(): void { dek = null; }
export function hasDek(): boolean { return dek !== null; }
export function getDek(): CryptoKey {
  if (!dek) throw new Error('Gesperrt');
  return dek;
}
