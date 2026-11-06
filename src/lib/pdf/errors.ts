export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;

export type PdfErrorCode =
  | 'not-pdf' | 'too-large' | 'password' | 'too-many-pages' | 'broken' | 'no-text' | 'load-failed';

export const PDF_ERROR_MESSAGES: Record<PdfErrorCode, string> = {
  'not-pdf': 'Die Datei ist keine PDF-Datei.',
  'too-large': 'Die Datei ist zu groß (maximal 10 MB).',
  password: 'Die PDF ist passwortgeschützt. Bitte eine ungeschützte PDF verwenden.',
  'too-many-pages': 'Die PDF hat zu viele Seiten (maximal 20).',
  broken: 'Die PDF konnte nicht gelesen werden (beschädigt oder nicht unterstützt).',
  'no-text': 'Die PDF enthält keinen Text. Eingescannte Kontoauszüge werden nicht unterstützt.',
  'load-failed': 'Der PDF-Leser konnte nicht geladen werden. Bitte die App einmal mit Internetverbindung öffnen.',
};

export class PdfAnalyzeError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode) {
    super(code);
    this.name = 'PdfAnalyzeError';
    this.code = code;
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Prüft vor dem Laden von pdf.js. head = die ersten (bis zu) 1024 Bytes der Datei. */
export function precheckPdf(size: number, head: Uint8Array): PdfErrorCode | null {
  if (size === 0) return 'not-pdf';
  if (size > MAX_PDF_BYTES) return 'too-large';
  for (let offset = 0; offset <= head.length - PDF_MAGIC.length; offset++) {
    let matches = true;
    for (let i = 0; i < PDF_MAGIC.length; i++) {
      if (head[offset + i] !== PDF_MAGIC[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return null;
  }
  return 'not-pdf';
}
