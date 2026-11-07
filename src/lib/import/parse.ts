import type { Category, MerchantRule, Transaction, TxType } from '../types';
import { FALLBACK_EXPENSE_CATEGORY, FALLBACK_INCOME_CATEGORY } from '../db/defaults';
import { lastCategoryForMerchant, suggestCategory } from '../merchant';
import { looksLikeCreditCard, parseCreditCard } from './creditCardParser';
import { parseDkb } from './dkbParser';
import { parseGeneric } from './genericParser';

/** Typ einer geparsten Zeile: Ausgabe oder Einnahme (Umbuchungen entstehen erst im Import). */
export type ParsedType = 'expense' | 'income';

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  type: ParsedType;
  amountCents: number;
  merchant: string;
  city: string;
  bankType: string; // z.B. 'Kartenzahlung', '' wenn unbekannt
  pending: boolean; // true bei 'Vorgemerkt'
  dateGuessed: boolean; // true, wenn das Datum nicht aus der Zeile stammt (geschätzt, bitte prüfen)
  raw: string; // Originalzeilen, für Anzeige bei Problemen
}

export interface ParseResult {
  rows: ParsedRow[];
  unparsedLines: string[];
}

/** Textformat für den Import: automatisch erkennen, Girokonto (DKB-App) oder Kreditkarten-Umsatzliste. */
export type ImportFormat = 'auto' | 'giro' | 'credit';

/**
 * 'credit': Kreditkarten-Parser. 'auto': Kreditkarten-Parser, wenn das Format erkannt wird und Zeilen liefert.
 * Sonst DKB-Parser; liefert er 0 Zeilen, greift der generische Parser.
 */
export function parseBankText(text: string, format: ImportFormat = 'auto'): ParseResult {
  if (format === 'credit' || (format === 'auto' && looksLikeCreditCard(text))) {
    const cc = parseCreditCard(text);
    if (format === 'credit' || cc.rows.length > 0) return cc;
  }
  const dkb = parseDkb(text);
  if (dkb.rows.length > 0) return dkb;
  return parseGeneric(text);
}

const REFUND_RE = /gutschrift|erstattung|rückzahlung/i;
const SALARY_RE = /gehalt|lohn|bezüge|rente|besoldung/i;

function usableCategory(id: string, type: TxType, cats: Category[]): boolean {
  const c = cats.find((x) => x.id === id);
  return c !== undefined && !c.archived && c.type === type;
}

/** Kategorie-Vorschlag für eine Import-Zeile: Historie, Regeln, Einnahme-Heuristik, Fallback. */
export function suggestForRow(
  row: ParsedRow,
  txs: Transaction[],
  rules: MerchantRule[],
  cats: Category[],
): string {
  const fromHistory = lastCategoryForMerchant(row.merchant, row.type, txs, cats);
  if (fromHistory) return fromHistory;

  const fromRules = suggestCategory(row.merchant, row.type, rules, cats);
  if (fromRules) return fromRules;

  if (row.type === 'income') {
    if (REFUND_RE.test(row.bankType) && usableCategory('cat-refund', 'income', cats)) return 'cat-refund';
    if (SALARY_RE.test(row.bankType) && usableCategory('cat-salary', 'income', cats)) return 'cat-salary';
  }

  return row.type === 'income' ? FALLBACK_INCOME_CATEGORY : FALLBACK_EXPENSE_CATEGORY;
}
