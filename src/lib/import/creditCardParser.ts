import { parseGermanDate } from '../dates';
import { parseAmountToCents } from '../money';
import type { ParsedRow, ParseResult } from './parse';

/** Komplett großgeschriebene Orte -> Title-Case; gemischte Schreibweise bleibt unverändert. */
function normalizeCity(city: string): string {
  const c = city.trim();
  if (c !== c.toUpperCase() || c === c.toLowerCase()) return c;
  return c.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Parser für kopierte Kreditkarten-Umsatzlisten (Kontoauszug-Ansicht). Aufbau je Buchung:
 *
 *   <Datum> <Datum> <Umsatzart>
 *   <Händler>, <Ort>
 *   <Kartenendziffern> <Betrag>
 *
 * Gebucht wird auf das frühere der beiden Daten (Belegdatum = Kaufdatum).
 */

/** Längere Zeilen sind keine Buchungen (schützt die Regexe). */
const MAX_LINE_LENGTH = 500;
const DATE = String.raw`\d{1,2}\.\d{1,2}\.\d{2,4}`;
const AMOUNT = String.raw`([+\-−–]?)\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})`;
/** Kopfzeile: zwei Daten am Zeilenanfang, danach Umsatzart (optional). */
const HEADER = new RegExp(`^(${DATE})\\s+(${DATE})(?:\\s+(.*))?$`);
/** Optionale Kartenendziffern (ggf. maskiert), dann Betrag am Zeilenende. */
const CARD_PREFIX = String.raw`(?:[*xX•.\s]*\d{4}\s+)?`;
const AMOUNT_LINE = new RegExp(`^${CARD_PREFIX}${AMOUNT}\\s*(?:€|EUR)?$`, 'i');
/** Einzeilige Variante: Kopf, Text, Kartenendziffern und Betrag in einer Zeile. */
const INLINE_AMOUNT = new RegExp(`^(.*?)\\s+(?:\\d{4}\\s+)?${AMOUNT}\\s*(?:€|EUR)?$`, 'i');

/** Mindestens eine Kopfzeile mit zwei Daten am Zeilenanfang -> Kreditkarten-Format. */
export function looksLikeCreditCard(text: string): boolean {
  return text.split(/\r?\n/).some((l) => {
    const t = prepare(l);
    return t.length <= MAX_LINE_LENGTH && HEADER.test(t);
  });
}

function prepare(raw: string): string {
  return raw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Ort ist nur sinnvoll, wenn er Buchstaben enthält und keine Web-Adresse ist (sonst z. B. Referenz-/Telefonnummer). */
function usableCity(city: string): boolean {
  if (!/\p{L}/u.test(city)) return false;
  if (/^www\./i.test(city) || /\.(com|de|net|org)\b/i.test(city)) return false;
  return true;
}

/** „Händler, Ort“ am letzten Komma trennen. */
export function splitCardMerchant(text: string): { merchant: string; city: string } {
  const s = text.replace(/\s+/g, ' ').trim();
  const idx = s.lastIndexOf(',');
  if (idx <= 0) return { merchant: s, city: '' };
  const merchant = s.slice(0, idx).trim();
  const city = s.slice(idx + 1).trim();
  if (merchant === '') return { merchant: s, city: '' };
  return { merchant, city: usableCity(city) ? normalizeCity(city) : '' };
}

interface Pending {
  dateA: string;
  dateB: string;
  bankType: string;
  merchantLines: string[];
  raw: string[];
}

function buildRow(p: Pending, sign: string, amountText: string, raw: string[]): ParsedRow | null {
  const a = parseGermanDate(p.dateA);
  const b = parseGermanDate(p.dateB);
  if (a === null || b === null) return null;
  const amountCents = parseAmountToCents(amountText);
  if (amountCents === null) return null;
  const { merchant, city } = splitCardMerchant(p.merchantLines.join(' '));
  return {
    date: a < b ? a : b,
    // Ohne Vorzeichen ist es eine Gutschrift auf die Karte.
    type: sign === '' || sign === '+' ? 'income' : 'expense',
    amountCents,
    merchant,
    city,
    bankType: p.bankType,
    pending: false,
    dateGuessed: false,
    raw: raw.join('\n'),
  };
}

export function parseCreditCard(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const unparsedLines: string[] = [];
  let pending: Pending | null = null;

  const flushIncomplete = (): void => {
    if (pending) unparsedLines.push(...pending.raw);
    pending = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = prepare(rawLine);
    if (line === '') continue;
    if (line.length > MAX_LINE_LENGTH) {
      flushIncomplete();
      unparsedLines.push(line);
      continue;
    }

    const header = HEADER.exec(line);
    if (header) {
      flushIncomplete();
      const rest = header[3] ?? '';
      const inline = INLINE_AMOUNT.exec(rest);
      if (inline) {
        // Einzeilig: Umsatzart lässt sich nicht sicher vom Händler trennen.
        const p: Pending = { dateA: header[1], dateB: header[2], bankType: '', merchantLines: [inline[1]], raw: [line] };
        const row = buildRow(p, inline[2], inline[3], p.raw);
        if (row) rows.push(row);
        else unparsedLines.push(line);
        continue;
      }
      pending = { dateA: header[1], dateB: header[2], bankType: rest.trim(), merchantLines: [], raw: [line] };
      continue;
    }

    if (pending === null) {
      unparsedLines.push(line);
      continue;
    }

    const amount = AMOUNT_LINE.exec(line);
    if (amount) {
      const p: Pending = pending;
      const raw = [...p.raw, line];
      const row = buildRow(p, amount[1], amount[2], raw);
      if (row) rows.push(row);
      else unparsedLines.push(...raw);
      pending = null;
      continue;
    }

    pending.merchantLines.push(line);
    pending.raw.push(line);
  }

  flushIncomplete();
  return { rows, unparsedLines };
}
