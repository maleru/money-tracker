import { DEFAULT_ACCOUNT_ID } from '../db/defaults';
import type { Category, MerchantRule, Transaction, TxInput } from '../types';
import { markDuplicates } from './duplicates';
import { suggestForRow } from './parse';
import type { ParsedRow } from './parse';

export interface ImportItem {
  key: string;
  row: ParsedRow;
  categoryId: string;
  categoryTouched: boolean;
  selected: boolean;
  duplicate: boolean;
}

/** Baut Items: categoryId via suggestForRow, duplicate via markDuplicates, selected = !duplicate, key = index-basiert. */
export function buildImportItems(
  rows: ParsedRow[],
  txs: Transaction[],
  rules: MerchantRule[],
  cats: Category[],
): ImportItem[] {
  const duplicates = markDuplicates(rows, txs);
  return rows.map((row, i) => ({
    key: `row-${i}`,
    row,
    categoryId: suggestForRow(row, txs, rules, cats),
    categoryTouched: false,
    selected: !duplicates[i],
    duplicate: duplicates[i],
  }));
}

/** Wandelt ausgewählte Items in TxInput um (note '', city aus row, recurringId null, source übergeben). */
export function itemsToTxInputs(items: ImportItem[], source: 'text' | 'ocr'): TxInput[] {
  return items
    .filter((item) => item.selected)
    .map((item) => ({
      type: item.row.type,
      amountCents: item.row.amountCents,
      date: item.row.date,
      categoryId: item.categoryId,
      accountId: DEFAULT_ACCOUNT_ID,
      direction: null,
      merchant: item.row.merchant,
      originalText: item.row.merchant,
      city: item.row.city,
      note: '',
      source,
      recurringId: null,
    }));
}

/** Neuestes Datum der ausgewählten Items oder null. */
export function newestDate(items: ImportItem[]): string | null {
  let newest: string | null = null;
  for (const item of items) {
    if (!item.selected) continue;
    if (newest === null || item.row.date > newest) newest = item.row.date;
  }
  return newest;
}
