import { FALLBACK_TRANSFER_CATEGORY } from '../db/defaults';
import { matchRule, suggestCategory, type RuleMatch } from '../merchant';
import { signedCents } from '../money';
import type {
  Account,
  Category,
  MerchantRule,
  Transaction,
  TxDirection,
  TxInput,
  TxType,
} from '../types';
import { markDuplicates, type DuplicateMatch } from './duplicates';
import { suggestForRow } from './parse';
import type { ParsedRow, ParsedType } from './parse';
import { detectTransfer } from './transferHeuristic';

export interface ImportContext {
  txs: Transaction[];
  rules: MerchantRule[];
  cats: Category[];
  account: Account;
  ownNames: string[];
}

export interface ImportItem {
  key: string;
  row: ParsedRow; // Parser-Ergebnis, row.merchant = Originaltext (wird nie verändert)
  date: string;
  amountCents: number;
  type: TxType;
  direction: TxDirection | null;
  merchant: string; // Anzeige-Händler (nach Umbenennung)
  city: string;
  categoryId: string;
  categoryTouched: boolean;
  selected: boolean;
  dup: DuplicateMatch;
  transferDetected: boolean; // Heuristik hat eine Umbuchung gesetzt
  remember: boolean; // „Für künftige Importe merken“
}

export interface Classification {
  merchant: string;
  type: TxType;
  direction: TxDirection | null;
  categoryId: string;
  transferDetected: boolean;
}

function activeCategory(id: string, cats: Category[]): boolean {
  return cats.some((c) => c.id === id && !c.archived);
}

/** Ergebnis einer Nutzer- oder Default-Regel mit Kategorie. */
function fromMatch(match: RuleMatch, row: ParsedRow, merchant: string): Classification {
  const isTransfer = match.category.type === 'transfer';
  return {
    merchant,
    type: isTransfer ? 'transfer' : row.type,
    direction: isTransfer ? (row.type === 'income' ? 'in' : 'out') : null,
    categoryId: match.category.id,
    transferDetected: false,
  };
}

/**
 * Bestimmt Anzeige-Händler, Typ, Richtung und Kategorie einer Import-Zeile.
 * 1. match = matchRule(row.merchant, row.type, ...); merchant = match?.rule.displayName ?? row.merchant.
 * 2. match && match.rule.source !== 'default' -> fromMatch(match).
 * 3. guess = detectTransfer(...); falls guess -> Umbuchung (Kategorie aktiv oder Fallback Transfer).
 * 4. match (default) mit Transfer-Kategorie -> fromMatch(match).
 * 5. Historie, Regeln, Einnahme-Heuristik, Fallback über suggestForRow.
 */
export function classifyRow(row: ParsedRow, ctx: ImportContext): Classification {
  const match = matchRule(row.merchant, row.type, ctx.rules, ctx.cats);
  const merchant = match?.rule.displayName ?? row.merchant;

  if (match && match.rule.source !== 'default') return fromMatch(match, row, merchant);

  const guess = detectTransfer(row, ctx.account.kind, ctx.ownNames);
  if (guess) {
    const categoryId = activeCategory(guess.categoryId, ctx.cats) ? guess.categoryId : FALLBACK_TRANSFER_CATEGORY;
    return { merchant, type: 'transfer', direction: guess.direction, categoryId, transferDetected: true };
  }

  if (match && match.category.type === 'transfer') return fromMatch(match, row, merchant);

  return {
    merchant,
    type: row.type,
    direction: null,
    categoryId: suggestForRow({ ...row, merchant }, ctx.txs, ctx.rules, ctx.cats),
    transferDetected: false,
  };
}

/** Klassifiziert alle Zeilen, danach Duplikaterkennung. */
export function buildImportItems(rows: ParsedRow[], ctx: ImportContext): ImportItem[] {
  const classified = rows.map((row) => ({ row, c: classifyRow(row, ctx) }));
  const dups = markDuplicates(
    classified.map(({ row, c }) => ({
      date: row.date,
      signedCents: signedCents({ type: c.type, amountCents: row.amountCents, direction: c.direction }),
      merchants: [row.merchant, c.merchant],
    })),
    ctx.txs,
  );
  return classified.map(({ row, c }, i) => ({
    key: `row-${i}`,
    row,
    date: row.date,
    amountCents: row.amountCents,
    type: c.type,
    direction: c.direction,
    merchant: c.merchant,
    city: row.city,
    categoryId: c.categoryId,
    categoryTouched: false,
    selected: dups[i].kind === 'none',
    dup: dups[i],
    transferDetected: c.transferDetected,
    remember: false,
  }));
}

/** Kategorie-Vorschlag nach Bearbeiten (Typ oder Händler geändert). */
export function suggestForEdit(item: ImportItem, ctx: ImportContext): string {
  if (item.type === 'transfer') {
    return (
      suggestCategory(item.merchant, 'transfer', ctx.rules, ctx.cats) ??
      suggestCategory(item.row.merchant, 'transfer', ctx.rules, ctx.cats) ??
      FALLBACK_TRANSFER_CATEGORY
    );
  }
  const parsedType: ParsedType = item.type === 'income' ? 'income' : 'expense';
  return suggestForRow(
    {
      ...item.row,
      merchant: item.merchant,
      type: parsedType,
      date: item.date,
      amountCents: item.amountCents,
    },
    ctx.txs,
    ctx.rules,
    ctx.cats,
  );
}

/** Ausgewählte Items -> TxInput. */
export function itemsToTxInputs(items: ImportItem[], source: 'text' | 'ocr', accountId: string): TxInput[] {
  return items
    .filter((item) => item.selected)
    .map((item) => ({
      type: item.type,
      amountCents: item.amountCents,
      date: item.date,
      categoryId: item.categoryId,
      accountId,
      direction: item.type === 'transfer' ? (item.direction ?? 'out') : null,
      merchant: item.merchant.trim(),
      originalText: item.row.merchant,
      city: item.city,
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
    if (newest === null || item.date > newest) newest = item.date;
  }
  return newest;
}
