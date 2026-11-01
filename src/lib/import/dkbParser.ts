import { MONTH_NAMES, parseGermanDate } from '../dates';
import { parseAmountToCents } from '../money';
import type { ParsedRow, ParseResult } from './parse';

/** Maximale Zeilenlänge; längere Zeilen sind keine Buchungen (schützt die Regexe vor Laufzeitexplosion). */
const MAX_LINE_LENGTH = 500;
// Greedy `(.*)` statt lazy `(.*?)`: Der Anker am Zeilenanfang lässt nur einen Startpunkt zu, Betrag steht am Ende.
const BOOKING = /^(\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:[•·*]\s*)?(.*)([+\-−–])\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/;
const BOOKING_NO_AMOUNT = /^(\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:[•·*]\s*)?(.*)$/;
const AMOUNT_ONLY = /^([+\-−–])\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/;
const BALANCE_LINE = /^[+\-−–]?\s*[\d.]+,\d{2}\s*€$/;
const MONTH_LINE = new RegExp(`^(${MONTH_NAMES.join('|')})(\\s+\\d{4})?$`, 'i');
/** Datum irgendwo in der Zeile (nur für prepareLine). */
const DATE_ANYWHERE = /\d{1,2}\.\d{1,2}\.\d{2,4}/;
/** Datums-Token mit Leerzeichen davor; danach optional Leerzeichen und `•`/`·`/`*`, Zeilenende oder Betrag. */
const DATE_TOKEN = / (\d{1,2}\.\d{1,2}\.\d{2,4})(?=\s*(?:[•·*]|$|[+\-−–]\s*\d))/g;
/** Zeile beginnt mit einem Datum. */
const DATE_START = /^\d{1,2}\.\d{1,2}\.\d{2,4}/;
/** „Vorgemerkt“-Präfix, optional mit führendem Symbol (z. B. „• Vorgemerkt •“ oder „+ Vorgemerkt •“). */
const PENDING_PREFIX = /^(?:[•·*+]\s*)?vorgemerkt\s*[•·*]\s*/i;
/** Länderkürzel wie „DE“ oder „D DE“. */
const COUNTRY_LINE = /^[A-Z]{1,2}( [A-Z]{2})?$/;
/** Ortszeile in Großbuchstaben, z. B. „MUSTERSTADT“. */
const CITY_LINE = /^[A-ZÄÖÜ][A-ZÄÖÜ\- ]{1,29}$/;
/** Überschrift „Letzte 7 Tage“ bzw. „Letzte 30 Tage“. */
const LAST_DAYS_LINE = /^letzte \d{1,3} tage$/i;

/** Beschriftungen, die nie zum Händler gehören (exakter Vergleich, case-insensitive). */
const IGNORED_WORDS = new Set([
  'girokonto',
  'kreditkarte',
  'tagesgeld',
  'umsätze',
  'anstehende umsätze',
  'anstehend',
  'heute',
  'gestern',
  'vorgemerkt',
  'gebucht',
  // Erweiterung gegenüber dem Plan: Kontostand-Beschriftungen (stehen vor einer Betragszeile).
  'kontostand',
  'aktueller kontostand',
  'saldo',
]);

/** Leerzeilen, Monats-/Kontoüberschriften: werden nie Teil des Händlers. */
function isIgnoredLabel(line: string): boolean {
  return (
    line === '' ||
    MONTH_LINE.test(line) ||
    IGNORED_WORDS.has(line.toLowerCase()) ||
    LAST_DAYS_LINE.test(line)
  );
}

/** Teil ohne Leerzeichen, aber mit Punkten: Punkte werden zu Leerzeichen ("Fashion.Outlet.Center" -> "Fashion Outlet Center"). */
function cleanMerchant(x: string): string {
  let s = x.trim();
  if (!s.includes(' ') && s.includes('.')) s = s.replace(/\.+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Komplett großgeschriebene Orte -> Title-Case ("MUSTERHAUSEN" -> "Musterhausen"). */
function normalizeCity(city: string): string {
  const c = city.trim();
  if (c !== c.toUpperCase() || c === c.toLowerCase()) return c;
  return c.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Trennt "Händler/ Ort" am letzten "/". */
export function splitMerchant(s: string): { merchant: string; city: string } {
  const idx = s.lastIndexOf('/');
  if (idx === -1) return { merchant: cleanMerchant(s), city: '' };
  return { merchant: cleanMerchant(s.slice(0, idx)), city: normalizeCity(s.slice(idx + 1)) };
}

/**
 * Zeilen-Vorbereitung (ersetzt das frühere `trim()` plus Tab-zu-Leerzeichen).
 * Trim; entfernt Störtext vor dem letzten Tab in Händlerzeilen („Den Matt⇥REWE“ -> „REWE“). Tabs sonst -> Leerzeichen.
 * Wichtig: Die Tab-Regel arbeitet auf dem getrimmten Original, bevor Tabs ersetzt werden.
 */
export function prepareLine(raw: string): string {
  const t = raw.trim();
  const spaced = t.replace(/\t/g, ' ');
  if (!t.includes('\t') || t.length > MAX_LINE_LENGTH) return spaced;
  if (DATE_ANYWHERE.test(spaced) || AMOUNT_ONLY.test(spaced) || BALANCE_LINE.test(spaced)) return spaced;
  const idx = t.lastIndexOf('\t');
  const prefix = t.slice(0, idx).trim();
  const rest = t.slice(idx + 1).trim();
  if (prefix === '' || rest === '') return spaced;
  return rest;
}

/**
 * Händler und Ort aus den gesammelten Händlerzeilen.
 * Genau 2 Zeilen, erste ohne '/', zweite passt auf CITY_LINE -> Händler = erste, Ort = zweite (Title-Case).
 * Sonst splitMerchant(lines.join(' ')).
 */
export function splitMerchantLines(lines: string[]): { merchant: string; city: string } {
  if (lines.length === 2 && !lines[0].includes('/') && CITY_LINE.test(lines[1].trim())) {
    return { merchant: cleanMerchant(lines[0]), city: normalizeCity(lines[1]) };
  }
  return splitMerchant(lines.join(' '));
}

/**
 * Zerlegt eine Zeile „Händler Datum • Art“ am letzten gültigen Datums-Token.
 * Liefert null, wenn die Zeile mit einem Datum beginnt, kein Token passt, das Datum ungültig ist oder der Händler leer wäre.
 */
function splitAtDate(line: string): { prefix: string; rest: string } | null {
  if (DATE_START.test(line)) return null;
  const matches = [...line.matchAll(DATE_TOKEN)];
  const last = matches.length > 0 ? matches[matches.length - 1] : undefined;
  if (last === undefined || last.index === undefined) return null;
  if (parseGermanDate(last[1]) === null) return null;
  const prefix = line.slice(0, last.index).trim();
  if (prefix === '') return null;
  return { prefix, rest: line.slice(last.index + 1) };
}

function buildRow(
  dateText: string,
  bankType: string,
  sign: string,
  amountText: string,
  merchantLines: string[],
  raw: string,
  pending: boolean,
  dateGuessed: boolean,
): ParsedRow | null {
  // Leeres Datum: Zeile ohne Datumszeile (Nachbearbeitung in parseDkb setzt es).
  const date = dateText === '' ? '' : parseGermanDate(dateText);
  if (date === null) return null;
  const amountCents = parseAmountToCents(amountText);
  if (amountCents === null) return null;
  const { merchant, city } = splitMerchantLines(merchantLines);
  return {
    date,
    type: sign === '+' ? 'income' : 'expense',
    amountCents,
    merchant,
    city,
    bankType: bankType.trim(),
    raw,
    pending,
    dateGuessed,
  };
}

export function parseDkb(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map(prepareLine);
  const rows: ParsedRow[] = [];
  const unparsedLines: string[] = [];
  let merchantLines: string[] = [];
  // true, wenn die vorherige verarbeitete Zeile eine Buchungszeile ohne Betrag war.
  let prevNoAmount = false;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (isIgnoredLabel(current) || current === '€') continue;
    // Betrag ohne Datumszeile: nur mit vorangehenden Händlerzeilen eine Buchung, sonst Kontostand (ignoriert).
    const afterNoAmount = prevNoAmount;
    prevNoAmount = false;
    const amountLine = AMOUNT_ONLY.exec(current);
    if (amountLine) {
      if (merchantLines.length > 0 && !afterNoAmount) {
        const raw = [...merchantLines, current].join('\n');
        const row = buildRow('', '', amountLine[1], amountLine[2], merchantLines, raw, false, true);
        if (row) rows.push(row);
        else unparsedLines.push(current);
        merchantLines = [];
      }
      continue;
    }
    if (BALANCE_LINE.test(current)) continue;
    if (current.length > MAX_LINE_LENGTH) {
      unparsedLines.push(current);
      merchantLines = [];
      continue;
    }

    // Vorzeichen kommt ausschließlich aus dem Betrag; das Präfix trägt nur den Status „Vorgemerkt“.
    let line = current;
    let isPending = false;
    const pm = PENDING_PREFIX.exec(line);
    if (pm) {
      isPending = true;
      line = line.slice(pm[0].length);
    }

    // Händler und Datum in einer Zeile: Händler wird Händlerzeile, der Rest wird als Datumszeile neu verarbeitet.
    const split = splitAtDate(line);
    if (split) {
      merchantLines.push(split.prefix);
      // Vorgemerkt-Status geht beim Neuverarbeiten verloren, daher als Präfix wieder voranstellen.
      lines[i] = (isPending ? 'Vorgemerkt • ' : '') + split.rest;
      i--;
      continue;
    }

    const full = BOOKING.exec(line);
    if (full) {
      const raw = [...merchantLines, current].join('\n');
      const bankType = isPending ? 'Vorgemerkt' : full[2];
      const row = buildRow(full[1], bankType, full[3], full[4], merchantLines, raw, isPending, false);
      if (row) rows.push(row);
      else unparsedLines.push(current);
      merchantLines = [];
      continue;
    }

    const noAmount = BOOKING_NO_AMOUNT.exec(line);
    if (noAmount) {
      // nächste nicht ignorierte Zeile suchen (Kontostände zählen hier nicht als ignoriert)
      let j = i + 1;
      while (j < lines.length && isIgnoredLabel(lines[j])) j++;
      const amountOnly = j < lines.length ? AMOUNT_ONLY.exec(lines[j]) : null;
      if (amountOnly) {
        const raw = [...merchantLines, current, lines[j]].join('\n');
        const bankType = isPending ? 'Vorgemerkt' : noAmount[2];
        const row = buildRow(noAmount[1], bankType, amountOnly[1], amountOnly[2], merchantLines, raw, isPending, false);
        if (row) rows.push(row);
        else unparsedLines.push(current);
        merchantLines = [];
        i = j;
        continue;
      }
    }

    // Datumszeile ohne Betrag: ein folgender Betrag gehört zu dieser Zeile, nicht zu einer Ersatzbuchung.
    if (noAmount) prevNoAmount = true;

    // Länderzeile direkt nach einer Händlerzeile wird verworfen.
    if (merchantLines.length > 0 && COUNTRY_LINE.test(current)) continue;

    // Gepusht wird die unveränderte vorbereitete Zeile.
    merchantLines.push(current);
  }

  unparsedLines.push(...merchantLines);

  // Zeilen ohne Datum: Datum der vorherigen Zeile mit Datum, sonst der folgenden.
  let lastDate = '';
  for (const row of rows) {
    if (row.date !== '') lastDate = row.date;
    else if (lastDate !== '') row.date = lastDate;
  }
  let nextDate = '';
  for (let k = rows.length - 1; k >= 0; k--) {
    const row = rows[k];
    if (row.date !== '') nextDate = row.date;
    else if (nextDate !== '') row.date = nextDate;
  }
  const dated: ParsedRow[] = [];
  for (const row of rows) {
    if (row.date === '') unparsedLines.push(row.raw);
    else dated.push(row);
  }
  return { rows: dated, unparsedLines };
}
