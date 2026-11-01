import { formatDate } from '../dates';
import { centsToInput } from '../money';
import type { Category, Transaction } from '../types';

const BOM = '\uFEFF';
const SEP = ';';
const EOL = '\r\n';
const HEADER = ['Datum', 'Typ', 'Betrag', 'Kategorie', 'Händler', 'Ort', 'Notiz'];

function escapeField(value: string): string {
  if (/[;"\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/** Vorzeichenbehafteter Betrag mit Komma, ohne Tausenderpunkt und Währung: -42,15 / 3,00 */
function amountField(tx: Transaction): string {
  const text = centsToInput(tx.amountCents);
  return tx.type === 'expense' ? '-' + text : text;
}

/** Excel-kompatibler CSV-Export (BOM, `;`, `\r\n`), nach Datum aufsteigend sortiert. */
export function toCsv(txs: Transaction[], cats: Map<string, Category>): string {
  const sorted = [...txs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  const lines = [HEADER.join(SEP)];
  for (const tx of sorted) {
    lines.push(
      [
        formatDate(tx.date),
        tx.type === 'expense' ? 'Ausgabe' : 'Einnahme',
        amountField(tx),
        // PLAN-FRAGE: Für unbekannte Kategorie-IDs ist kein Text vorgegeben; es wird 'Unbekannt' ausgegeben.
        cats.get(tx.categoryId)?.name ?? 'Unbekannt',
        tx.merchant,
        tx.city,
        tx.note,
      ]
        .map(escapeField)
        .join(SEP),
    );
  }
  return BOM + lines.join(EOL) + EOL;
}
