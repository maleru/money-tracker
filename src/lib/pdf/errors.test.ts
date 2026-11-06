import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES, PDF_ERROR_MESSAGES, PdfAnalyzeError, precheckPdf, type PdfErrorCode } from './errors';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('precheckPdf', () => {
  it.each([
    ['E1', 0, bytes(''), 'not-pdf'],
    ['E2', 10_485_761, bytes('%PDF-1.7'), 'too-large'],
    ['E3', 10_485_760, bytes('%PDF-1.7'), null],
    ['E4', 500, bytes('%PDF-1.4\n'), null],
    ['E5', 500, bytes('\n\n  %PDF-1.4'), null],
    ['E6', 500, bytes('PK\u0003\u0004'), 'not-pdf'],
    ['E7', 500, bytes('%PDF'), 'not-pdf'],
  ])('%s', (_name, size, head, expected) => {
    expect(precheckPdf(size, head)).toBe(expected);
  });

  it('MAX_PDF_BYTES ist 10 MiB', () => {
    expect(MAX_PDF_BYTES).toBe(10_485_760);
  });
});

describe('PdfAnalyzeError', () => {
  it('E8: trägt den Code und ist ein Error', () => {
    const err = new PdfAnalyzeError('password');
    expect(err.code).toBe('password');
    expect(err).toBeInstanceOf(Error);
  });

  it('E9: jeder Code hat einen nicht-leeren Text', () => {
    const codes: PdfErrorCode[] = [
      'not-pdf', 'too-large', 'password', 'too-many-pages', 'broken', 'no-text', 'load-failed',
    ];
    for (const code of codes) {
      expect(PDF_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
});
