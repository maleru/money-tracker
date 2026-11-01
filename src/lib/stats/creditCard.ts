import { rootCategoryId } from '../categoryTree';
import type { Account, Category, Transaction } from '../types';

export interface CreditCardReconciliation {
  settledCents: number; // Transfers out, Hauptkategorie cat-transfer-credit-card, auf Konten kind 'checking'
  cardSpentCents: number; // Konten kind 'credit_card': Summe expense minus Summe income (Transfers ignoriert)
  diffCents: number; // settledCents - cardSpentCents
  hasData: boolean; // settledCents > 0 || mindestens eine Buchung auf einem credit_card-Konto im Zeitraum
}

const CARD_TRANSFER_CATEGORY = 'cat-transfer-credit-card';

/** Näherung: Abbuchungen und Kartenbuchungen desselben Zeitraums (Monat 'YYYY-MM' oder Jahr 'YYYY'). */
export function creditCardReconciliation(
  txs: Transaction[],
  accounts: Account[],
  period: string,
  cats: ReadonlyMap<string, Category>,
): CreditCardReconciliation {
  const prefix = period + '-';
  const kindById = new Map(accounts.map((a) => [a.id, a.kind]));
  let settled = 0;
  let cardSpent = 0;
  let cardTxCount = 0;

  for (const tx of txs) {
    if (!tx.date.startsWith(prefix)) continue;
    const kind = kindById.get(tx.accountId);
    if (kind === 'checking') {
      if (
        tx.type === 'transfer' &&
        tx.direction === 'out' &&
        rootCategoryId(tx.categoryId, cats) === CARD_TRANSFER_CATEGORY
      ) {
        settled += tx.amountCents;
      }
    } else if (kind === 'credit_card') {
      cardTxCount += 1;
      if (tx.type === 'expense') cardSpent += tx.amountCents;
      else if (tx.type === 'income') cardSpent -= tx.amountCents;
    }
  }

  return {
    settledCents: settled,
    cardSpentCents: cardSpent,
    diffCents: settled - cardSpent,
    hasData: settled > 0 || cardTxCount > 0,
  };
}

