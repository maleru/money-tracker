import { normalizeMerchant, matchesOwnName } from '../merchant';
import type { AccountKind, TxDirection } from '../types';
import type { ParsedRow } from './parse';

export const CREDIT_CARD_KEYWORDS: readonly string[] = ['VISA', 'MASTERCARD', 'KREDITKARTE', 'KARTENABRECHNUNG'];

export interface TransferGuess {
  direction: TxDirection;
  categoryId: string;
}

/** Tag (aus YYYY-MM-DD) >= 25 oder <= 5. */
export function isCreditCardWindow(date: string): boolean {
  const day = Number(date.slice(8, 10));
  return day >= 25 || day <= 5;
}

/**
 * Nur bei accountKind === 'checking' (sonst null). words = Wörter von normalizeMerchant(row.merchant).
 * 1. row.type === 'expense' && CREDIT_CARD_KEYWORDS.some(k => words.includes(k)) -> { out, cat-transfer-credit-card }
 * 2. !matchesOwnName(row.merchant, ownNames) -> null
 * 3. row.type === 'income' -> { in, cat-transfer-savings }
 * 4. /lastschrift/i.test(row.bankType) && isCreditCardWindow(row.date) -> { out, cat-transfer-credit-card }
 * 5. sonst -> { out, cat-transfer-own }
 */
export function detectTransfer(
  row: ParsedRow,
  accountKind: AccountKind,
  ownNames: readonly string[],
): TransferGuess | null {
  if (accountKind !== 'checking') return null;

  const words = normalizeMerchant(row.merchant).split(' ');
  if (row.type === 'expense' && CREDIT_CARD_KEYWORDS.some((k) => words.includes(k))) {
    return { direction: 'out', categoryId: 'cat-transfer-credit-card' };
  }

  if (!matchesOwnName(row.merchant, ownNames)) return null;

  if (row.type === 'income') return { direction: 'in', categoryId: 'cat-transfer-savings' };

  if (/lastschrift/i.test(row.bankType) && isCreditCardWindow(row.date)) {
    return { direction: 'out', categoryId: 'cat-transfer-credit-card' };
  }

  return { direction: 'out', categoryId: 'cat-transfer-own' };
}
