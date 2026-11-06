/** Ein Textstück, bereits in Seitenkoordinaten mit Ursprung OBEN links. y = Grundlinie, Abstand vom oberen Rand. */
export interface RawTextItem { str: string; x: number; y: number; width: number; fontSize: number }
export interface RawPage { pageNo: number; width: number; height: number; items: RawTextItem[] }

export type LineMark = 'top' | 'bottom' | 'repeated' | null;
export interface PdfCell { x: number; text: string }
export interface PdfLine { y: number; text: string; cells: PdfCell[]; mark: LineMark }
export interface PdfPage { pageNo: number; width: number; height: number; hasText: boolean; lines: PdfLine[] }
export interface PdfDocumentText { pages: PdfPage[] }

export const LINE_CONFIG = {
  defaultFontSize: 10,     // falls fontSize <= 0 oder nicht endlich
  yToleranceFactor: 0.5,   // gleiche Zeile, wenn |Δy| <= 0.5 * min(Schriftgrößen)
  spaceGapFactor: 0.15,    // Lücke >= 0.15 * Schriftgröße ergibt ein Leerzeichen
  columnGapFactor: 1.5,    // Lücke >= 1.5 * Schriftgröße ergibt einen Spaltentrenner \t
  headerRatio: 0.18,       // y < 18 % der Seitenhöhe ergibt 'top'
  footerRatio: 0.08,       // y > 92 % der Seitenhöhe ergibt 'bottom'
  repeatTopRatio: 0.3,     // Wiederholungs-Erkennung nur in den obersten 30 % …
  repeatBottomRatio: 0.2,  // … und in den untersten 20 %
} as const;

export const NO_TEXT_HINT = 'Seite enthält keinen Text (eingescannt?)';
export const HEADER_FOOTER_PLACEHOLDER = '[KOPF/FUSS ENTFERNT]';

export function pageSeparator(pageNo: number): string {
  return `--- Seite ${pageNo} ---`;
}

interface SizedItem { item: RawTextItem; fs: number }
interface OpenCell { x: number; text: string; end: number; lastFs: number }

function effectiveFontSize(fontSize: number): number {
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : LINE_CONFIG.defaultFontSize;
}

function lineMark(y: number, height: number): LineMark {
  if (y < LINE_CONFIG.headerRatio * height) return 'top';
  if (y > (1 - LINE_CONFIG.footerRatio) * height) return 'bottom';
  return null;
}

function startCell(item: RawTextItem, fs: number): OpenCell {
  return { x: item.x, text: item.str, end: item.x + item.width, lastFs: fs };
}

function pushCell(cells: PdfCell[], cell: OpenCell): void {
  const text = cell.text.replace(/\s+/g, ' ').trim();
  if (text !== '') cells.push({ x: Math.round(cell.x * 10) / 10, text });
}

/** Baut die Zellen einer Zeile (Spalten anhand horizontaler Lücken). */
function buildCells(items: SizedItem[]): PdfCell[] {
  const sorted = [...items].sort((a, b) => a.item.x - b.item.x);
  const cells: PdfCell[] = [];
  let cur: OpenCell | null = null;
  for (const { item, fs } of sorted) {
    if (cur === null) {
      cur = startCell(item, fs);
      continue;
    }
    const gap = item.x - cur.end;
    const ref = Math.max(cur.lastFs, fs);
    if (gap >= LINE_CONFIG.columnGapFactor * ref) {
      pushCell(cells, cur);
      cur = startCell(item, fs);
      continue;
    }
    cur.text += gap >= LINE_CONFIG.spaceGapFactor * ref ? ' ' + item.str : item.str;
    cur.end = Math.max(cur.end, item.x + item.width);
    cur.lastFs = fs;
  }
  if (cur !== null) pushCell(cells, cur);
  return cells;
}

/** Rekonstruiert die Zeilen einer Seite (von oben nach unten). */
export function buildPageLines(page: RawPage): PdfLine[] {
  const sized: SizedItem[] = page.items
    .filter((it) => it.str.trim() !== '')
    .map((item) => ({ item, fs: effectiveFontSize(item.fontSize) }))
    .sort((a, b) => a.item.y - b.item.y || a.item.x - b.item.x);

  const groups: { y: number; fs: number; items: SizedItem[] }[] = [];
  for (const s of sized) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(s.item.y - last.y) <= LINE_CONFIG.yToleranceFactor * Math.min(s.fs, last.fs)) {
      last.items.push(s);
    } else {
      groups.push({ y: s.item.y, fs: s.fs, items: [s] });
    }
  }

  return groups.map((g) => {
    const cells = buildCells(g.items);
    const y = Math.round(g.y * 10) / 10;
    return {
      y,
      text: cells.map((c) => c.text).join('\t'),
      cells,
      mark: lineMark(y, page.height),
    };
  });
}

/** Schlüssel für Wiederholungs-Erkennung: Seitenzahlen werden normalisiert, andere Ziffern nicht. */
export function repeatKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\d+ ?(?:von|\/|of) ?\d+/g, '#/#');
}

function inRepeatZone(y: number, height: number): boolean {
  return y <= LINE_CONFIG.repeatTopRatio * height || y >= (1 - LINE_CONFIG.repeatBottomRatio) * height;
}

/** Baut das Dokument und markiert Kopf/Fuß-Zeilen sowie wiederkehrende Zeilen. */
export function buildDocument(pages: RawPage[]): PdfDocumentText {
  const built: PdfPage[] = pages.map((p) => {
    const lines = buildPageLines(p);
    return { pageNo: p.pageNo, width: p.width, height: p.height, lines, hasText: lines.length > 0 };
  });
  if (pages.length < 2) return { pages: built };

  const seen = new Map<string, Set<number>>();
  for (const p of built) {
    for (const line of p.lines) {
      if (!inRepeatZone(line.y, p.height)) continue;
      const key = repeatKey(line.text);
      if (key.length < 2) continue;
      let set = seen.get(key);
      if (!set) {
        set = new Set<number>();
        seen.set(key, set);
      }
      set.add(p.pageNo);
    }
  }

  return {
    pages: built.map((p) => ({
      ...p,
      lines: p.lines.map((line): PdfLine => {
        if (line.mark !== null || !inRepeatZone(line.y, p.height)) return line;
        const key = repeatKey(line.text);
        if (key.length < 2) return line;
        return (seen.get(key)?.size ?? 0) >= 2 ? { ...line, mark: 'repeated' } : line;
      }),
    })),
  };
}

/** Gesamttext mit Seitentrennern. Spaltentrenner bleiben als echtes Tab erhalten. */
export function toPlainText(doc: PdfDocumentText, hideHeaderFooter: boolean): string {
  return doc.pages
    .map((p) => {
      const out: string[] = [pageSeparator(p.pageNo)];
      if (!p.hasText) out.push('[' + NO_TEXT_HINT + ']');
      for (const line of p.lines) {
        if (hideHeaderFooter && line.mark !== null) {
          if (out[out.length - 1] !== HEADER_FOOTER_PLACEHOLDER) out.push(HEADER_FOOTER_PLACEHOLDER);
        } else {
          out.push(line.text);
        }
      }
      return out.join('\n');
    })
    .join('\n\n');
}
