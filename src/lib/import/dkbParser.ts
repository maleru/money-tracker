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

/** Beschriftungen, die nie zum Händler gehören (exakter Vergleich, case-insensitive). */
const IGNORED_WORDS = new Set([
  'girokonto',
  'kreditkarte',
  'tagesgeld',
  'umsätze',
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
  return line === '' || MONTH_LINE.test(line) || IGNORED_WORDS.has(line.toLowerCase());
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

function buildRow(
  dateText: string,
  bankType: string,
  sign: string,
  amountText: string,
  pending: string[],
  raw: string,
): ParsedRow | null {
  const date = parseGermanDate(dateText);
  if (date === null) return null;
  const amountCents = parseAmountToCents(amountText);
  if (amountCents === null) return null;
  const { merchant, city } = splitMerchant(pending.join(' '));
  return {
    date,
    type: sign === '+' ? 'income' : 'expense',
    amountCents,
    merchant,
    city,
    bankType: bankType.trim(),
    raw,
  };
}

export function parseDkb(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/\t/g, ' '));
  const rows: ParsedRow[] = [];
  const unparsedLines: string[] = [];
  let pending: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isIgnoredLabel(line) || line === '€' || BALANCE_LINE.test(line)) continue;
    if (line.length > MAX_LINE_LENGTH) {
      unparsedLines.push(line);
      pending = [];
      continue;
    }

    const full = BOOKING.exec(line);
    if (full) {
      const row = buildRow(full[1], full[2], full[3], full[4], pending, [...pending, line].join('\n'));
      if (row) rows.push(row);
      else unparsedLines.push(line);
      pending = [];
      continue;
    }

    const noAmount = BOOKING_NO_AMOUNT.exec(line);
    if (noAmount) {
      // nächste nicht ignorierte Zeile suchen (Kontostände zählen hier nicht als ignoriert)
      let j = i + 1;
      while (j < lines.length && isIgnoredLabel(lines[j])) j++;
      const amountOnly = j < lines.length ? AMOUNT_ONLY.exec(lines[j]) : null;
      if (amountOnly) {
        const raw = [...pending, line, lines[j]].join('\n');
        const row = buildRow(noAmount[1], noAmount[2], amountOnly[1], amountOnly[2], pending, raw);
        if (row) rows.push(row);
        else unparsedLines.push(line);
        pending = [];
        i = j;
        continue;
      }
    }

    pending.push(line);
  }

  unparsedLines.push(...pending);
  return { rows, unparsedLines };
}
