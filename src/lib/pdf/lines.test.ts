import { describe, expect, it } from 'vitest';
import {
  buildDocument,
  buildPageLines,
  NO_TEXT_HINT,
  repeatKey,
  toPlainText,
  type PdfDocumentText,
  type RawPage,
  type RawTextItem,
} from './lines';

const it_ = (str: string, x: number, y: number, width = str.length * 5, fontSize = 10): RawTextItem => ({
  str,
  x,
  y,
  width,
  fontSize,
});
const page = (items: RawTextItem[], pageNo = 1): RawPage => ({ pageNo, width: 600, height: 800, items });

describe('buildPageLines', () => {
  it('L1: Lücke 2 ergibt ein Leerzeichen', () => {
    const lines = buildPageLines(page([it_('Hallo', 50, 400, 25), it_('Welt', 77, 400, 20)]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe('Hallo Welt');
  });

  it('L2: Lücke 0 verbindet ohne Leerzeichen', () => {
    const lines = buildPageLines(page([it_('Kar', 50, 400, 15), it_('te', 65, 400, 10)]));
    expect(lines[0]?.text).toBe('Karte');
  });

  it('L3: Spaltentrenner \\t und Zellen-x', () => {
    const lines = buildPageLines(
      page([it_('12.10.', 50, 400, 30), it_('Kartenzahlung', 100, 400, 65), it_('-23,45', 400, 400, 30)]),
    );
    expect(lines[0]?.text).toBe('12.10.\tKartenzahlung\t-23,45');
    expect(lines[0]?.cells.map((c) => c.x)).toEqual([50, 100, 400]);
  });

  it('L4a: Lücke 14,9 ist noch Leerzeichen', () => {
    const lines = buildPageLines(page([it_('A', 50, 400, 5), it_('B', 69.9, 400, 5)]));
    expect(lines[0]?.text).toBe('A B');
  });

  it('L4b: Lücke genau 15 ist Spaltentrenner', () => {
    const lines = buildPageLines(page([it_('A', 50, 400, 5), it_('B', 70, 400, 5)]));
    expect(lines[0]?.text).toBe('A\tB');
  });

  it('L5a: Δy 4 ist dieselbe Zeile', () => {
    const lines = buildPageLines(page([it_('A', 50, 400), it_('B', 100, 404)]));
    expect(lines).toHaveLength(1);
  });

  it('L5b: Δy 6 sind zwei Zeilen', () => {
    const lines = buildPageLines(page([it_('A', 50, 400), it_('B', 100, 406)]));
    expect(lines.map((l) => l.y)).toEqual([400, 406]);
  });

  it('L6: Zellen werden nach x sortiert, auch bei umgekehrter Eingabe', () => {
    const lines = buildPageLines(page([it_('B', 400, 400, 10), it_('A', 50, 400, 10)]));
    expect(lines[0]?.cells.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('L7: Zeilen werden von oben nach unten sortiert', () => {
    const lines = buildPageLines(page([it_('c', 50, 500), it_('a', 50, 300), it_('b', 50, 400)]));
    expect(lines.map((l) => l.y)).toEqual([300, 400, 500]);
  });

  it('L8: nur Leerzeichen ergibt keine Zeilen', () => {
    const lines = buildPageLines(page([it_(' ', 50, 400), it_('', 60, 400)]));
    expect(lines).toEqual([]);
    expect(buildDocument([page([it_(' ', 50, 400), it_('', 60, 400)])]).pages[0]?.hasText).toBe(false);
  });

  it('L9: fontSize 0 nutzt den Default 10', () => {
    const lines = buildPageLines(page([it_('A', 50, 400, 5, 0), it_('B', 70, 400, 5, 0)]));
    expect(lines[0]?.text).toBe('A\tB');
  });

  it('L10: Kopf/Fuß nach Lage (Höhe 800)', () => {
    const lines = buildPageLines(
      page([it_('a', 50, 100), it_('b', 50, 144), it_('c', 50, 400), it_('d', 50, 736), it_('e', 50, 750)]),
    );
    expect(lines.map((l) => l.mark)).toEqual(['top', null, null, null, 'bottom']);
  });
});

describe('buildDocument / repeatKey', () => {
  it('L11: wiederkehrende Kopf-/Fußzeilen werden markiert, Buchungen nicht', () => {
    const doc = buildDocument([
      page([it_('Kontoauszug Girokonto', 50, 200), it_('Miete', 50, 400), it_('Seite 1 von 2', 50, 700)], 1),
      page([it_('Kontoauszug Girokonto', 50, 200), it_('Miete', 50, 400), it_('Seite 2 von 2', 50, 700)], 2),
    ]);
    const [p1, p2] = doc.pages;
    const marks = (p: typeof p1) => p?.lines.map((l) => l.mark);
    expect(marks(p1)).toEqual(['repeated', null, 'repeated']);
    expect(marks(p2)).toEqual(['repeated', null, 'repeated']);
  });

  it('L12: bei einer Seite gibt es keine Wiederholungsprüfung', () => {
    const doc = buildDocument([page([it_('Text', 50, 200)])]);
    expect(doc.pages[0]?.lines[0]?.mark).toBeNull();
  });

  it('L13: repeatKey normalisiert Seitenzahlen', () => {
    expect(repeatKey('Seite 3 / 12')).toBe('seite #/#');
  });

  it('L14: Whitespace wird normalisiert', () => {
    const lines = buildPageLines(page([it_('Foo ', 50, 400, 20), it_(' Bar', 72, 400, 15)]));
    expect(lines[0]?.text).toBe('Foo Bar');
  });
});

describe('toPlainText', () => {
  const emptyPage = (pageNo: number) => ({ pageNo, width: 600, height: 800, hasText: false, lines: [] });

  it('L15: Seitentrenner und Kopf/Fuß sichtbar (hide=false)', () => {
    const doc: PdfDocumentText = {
      pages: [
        {
          pageNo: 1,
          width: 600,
          height: 800,
          hasText: true,
          lines: [
            { y: 10, text: 'Kopf', cells: [], mark: 'top' },
            { y: 400, text: 'A', cells: [], mark: null },
            { y: 410, text: 'B', cells: [], mark: null },
            { y: 790, text: 'Fuß1', cells: [], mark: 'bottom' },
          ],
        },
        emptyPage(2),
      ],
    };
    expect(toPlainText(doc, false)).toBe(
      '--- Seite 1 ---\nKopf\nA\nB\nFuß1\n\n--- Seite 2 ---\n[' + NO_TEXT_HINT + ']',
    );
  });

  it('L16: aufeinanderfolgende Kopf/Fuß-Zeilen werden zu einem Platzhalter (hide=true)', () => {
    const doc: PdfDocumentText = {
      pages: [
        {
          pageNo: 1,
          width: 600,
          height: 800,
          hasText: true,
          lines: [
            { y: 10, text: 'Kopf', cells: [], mark: 'top' },
            { y: 400, text: 'A', cells: [], mark: null },
            { y: 410, text: 'B', cells: [], mark: null },
            { y: 780, text: 'Fuß1', cells: [], mark: 'bottom' },
            { y: 790, text: 'Fuß2', cells: [], mark: 'bottom' },
          ],
        },
        emptyPage(2),
      ],
    };
    expect(toPlainText(doc, true)).toBe(
      '--- Seite 1 ---\n[KOPF/FUSS ENTFERNT]\nA\nB\n[KOPF/FUSS ENTFERNT]\n\n--- Seite 2 ---\n[' + NO_TEXT_HINT + ']',
    );
  });
});
