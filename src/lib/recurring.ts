import { addMonths, daysInMonth, monthKey } from './dates';
import type { RecurringTemplate, TxInput } from './types';

/** Schutz gegen Endlosschleifen bei absurden Startmonaten: maximal so viele Monate pro Vorlage und Aufruf. */
export const MAX_MONTHS_PER_RUN = 120;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Liefert neu zu erzeugende Buchungen + aktualisierte Templates (lastGeneratedMonth). Erzeugt nichts in der Zukunft. */
export function generateDue(
  templates: RecurringTemplate[],
  today: string,
  now: string,
): { newTx: TxInput[]; updated: RecurringTemplate[] } {
  const newTx: TxInput[] = [];
  const updated: RecurringTemplate[] = [];
  const currentMonth = monthKey(today);

  for (const t of templates) {
    if (!t.active) continue;

    let month = t.lastGeneratedMonth ? addMonths(t.lastGeneratedMonth, 1) : t.startMonth;
    if (month < t.startMonth) month = t.startMonth;

    let lastGenerated = t.lastGeneratedMonth;
    let steps = 0;
    while (month <= currentMonth && (t.endMonth === null || month <= t.endMonth) && steps < MAX_MONTHS_PER_RUN) {
      const [y, m] = month.split('-').map(Number);
      const day = Math.min(t.dayOfMonth, daysInMonth(y, m));
      const date = `${month}-${pad2(day)}`;
      if (date > today) break;

      newTx.push({
        type: t.type,
        amountCents: t.amountCents,
        date,
        categoryId: t.categoryId,
        accountId: t.accountId,
        direction: t.direction,
        merchant: t.merchant,
        originalText: '',
        city: '',
        note: t.note,
        source: 'recurring',
        recurringId: t.id,
      });
      lastGenerated = month;
      month = addMonths(month, 1);
      steps += 1;
    }

    if (lastGenerated !== t.lastGeneratedMonth) {
      updated.push({ ...t, lastGeneratedMonth: lastGenerated, updatedAt: now });
    }
  }

  return { newTx, updated };
}
