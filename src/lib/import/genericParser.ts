import { parseGermanDate } from '../dates';
import { parseAmountToCents } from '../money';
import type { ParsedRow, ParseResult } from './parse';

const DATE = /\d{1,2}\.\d{1,2}\.\d{2,4}/;
const AMOUNT = /(?<![\d.,])([+\-−–]?)\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;

/** Fallback: pro Zeile ein Datum und ein Betrag (letzter Treffer); Rest der Zeile ist der Händler. */
export function parseGeneric(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const unparsedLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\t/g, ' ');
    if (line === '') continue;

    const dateMatch = DATE.exec(line);
    const amountMatches = [...line.matchAll(AMOUNT)];
    const amountMatch = amountMatches.length > 0 ? amountMatches[amountMatches.length - 1] : null;
    if (!dateMatch || !amountMatch) {
      unparsedLines.push(line);
      continue;
    }

    const date = parseGermanDate(dateMatch[0]);
    const amountCents = parseAmountToCents(amountMatch[2]);
    if (date === null || amountCents === null) {
      unparsedLines.push(line);
      continue;
    }

    const amountStart = amountMatch.index ?? 0;
    const rest =
      line.slice(0, amountStart) + ' ' + line.slice(amountStart + amountMatch[0].length);
    const merchant = rest
      .replace(DATE, ' ')
      .replace(/€/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    rows.push({
      date,
      type: amountMatch[1] === '+' ? 'income' : 'expense',
      amountCents,
      merchant,
      city: '',
      bankType: '',
      pending: false,
      dateGuessed: false,
      raw: line,
    });
  }

  return { rows, unparsedLines };
}
