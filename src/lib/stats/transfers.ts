import { rootCategoryId } from '../categoryTree';
import type { Category, Transaction } from '../types';

export interface TransferFlows {
  toReservesCents: number; // out, Hauptkategorie cat-transfer-savings
  fromReservesCents: number; // in, Hauptkategorie cat-transfer-savings
  netReservesCents: number; // to - from
  investedOutCents: number; // out, Hauptkategorie cat-transfer-invest
  investedInCents: number; // in, Hauptkategorie cat-transfer-invest
  investedNetCents: number; // out - in
}

const SAVINGS = 'cat-transfer-savings';
const INVEST = 'cat-transfer-invest';

/** period: 'YYYY-MM' oder 'YYYY'; Buchung gehört dazu, wenn tx.date.startsWith(period + '-'). Nur type 'transfer'. */
export function transferFlows(
  txs: Transaction[],
  period: string,
  cats: ReadonlyMap<string, Category>,
): TransferFlows {
  const prefix = period + '-';
  let toReserves = 0;
  let fromReserves = 0;
  let investedOut = 0;
  let investedIn = 0;

  for (const tx of txs) {
    if (tx.type !== 'transfer' || !tx.date.startsWith(prefix)) continue;
    const root = rootCategoryId(tx.categoryId, cats);
    if (root === SAVINGS) {
      if (tx.direction === 'out') toReserves += tx.amountCents;
      else if (tx.direction === 'in') fromReserves += tx.amountCents;
    } else if (root === INVEST) {
      if (tx.direction === 'out') investedOut += tx.amountCents;
      else if (tx.direction === 'in') investedIn += tx.amountCents;
    }
  }

  return {
    toReservesCents: toReserves,
    fromReservesCents: fromReserves,
    netReservesCents: toReserves - fromReserves,
    investedOutCents: investedOut,
    investedInCents: investedIn,
    investedNetCents: investedOut - investedIn,
  };
}
