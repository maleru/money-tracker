import { todayIso } from '../dates';
import { normalizeMerchant } from '../merchant';
import type { Category, Transaction } from '../types';
import { summarizeTransactions, type CategoryTotal } from './month';

export interface MonthBar {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

export interface MerchantTotal {
  merchant: string;
  totalCents: number;
  count: number;
}

export interface YearSummary {
  year: number;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  savingsRate: number | null;
  months: MonthBar[]; // immer 12 Einträge Jan..Dez
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
  avgMonthlyExpenseCents: number; // expense / Anzahl Monate mit >=1 Buchung (0 wenn keine)
  topMerchants: MerchantTotal[];
}

export interface CategoryComparison {
  categoryId: string;
  curCents: number;
  prevCents: number;
  diffCents: number;
}

function yearPrefix(year: number): string {
  return String(year).padStart(4, '0') + '-';
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function topMerchants(txs: Transaction[], limit: number): MerchantTotal[] {
  const groups = new Map<string, { total: number; count: number; spellings: Map<string, number> }>();
  for (const tx of txs) {
    if (tx.type !== 'expense') continue;
    const key = normalizeMerchant(tx.merchant);
    if (key === '') continue;
    const display = tx.merchant.trim();
    let group = groups.get(key);
    if (!group) {
      group = { total: 0, count: 0, spellings: new Map() };
      groups.set(key, group);
    }
    group.total += tx.amountCents;
    group.count += 1;
    group.spellings.set(display, (group.spellings.get(display) ?? 0) + 1);
  }

  const list: MerchantTotal[] = [];
  for (const group of groups.values()) {
    // Häufigste Schreibweise; bei Gleichstand alphabetisch (deterministisch).
    let best = '';
    let bestCount = -1;
    for (const [spelling, n] of group.spellings) {
      if (n > bestCount || (n === bestCount && cmpStr(spelling, best) < 0)) {
        best = spelling;
        bestCount = n;
      }
    }
    list.push({ merchant: best, totalCents: group.total, count: group.count });
  }
  list.sort((a, b) => b.totalCents - a.totalCents || cmpStr(a.merchant, b.merchant));
  return list.slice(0, limit);
}

export function summarizeYear(
  txs: Transaction[],
  year: number,
  cats: ReadonlyMap<string, Category> = new Map<string, Category>(),
): YearSummary {
  const prefix = yearPrefix(year);
  const inYear = txs.filter((tx) => tx.date.startsWith(prefix));
  const total = summarizeTransactions(inYear, cats);

  const months: MonthBar[] = [];
  let monthsWithData = 0;
  for (let m = 1; m <= 12; m++) {
    const key = prefix + String(m).padStart(2, '0');
    const monthTxs = inYear.filter((tx) => tx.date.startsWith(key));
    if (monthTxs.length > 0) monthsWithData += 1;
    const s = summarizeTransactions(monthTxs, cats);
    months.push({
      month: key,
      incomeCents: s.incomeCents,
      expenseCents: s.expenseCents,
      balanceCents: s.balanceCents,
    });
  }

  return {
    year,
    incomeCents: total.incomeCents,
    expenseCents: total.expenseCents,
    balanceCents: total.balanceCents,
    savingsRate: total.savingsRate,
    months,
    expenseByCategory: total.expenseByCategory,
    incomeByCategory: total.incomeByCategory,
    avgMonthlyExpenseCents: monthsWithData === 0 ? 0 : Math.round(total.expenseCents / monthsWithData),
    topMerchants: topMerchants(inYear, 5),
  };
}

/** Absteigend, enthält immer das aktuelle Jahr. */
export function yearsWithData(txs: Transaction[]): number[] {
  const years = new Set<number>([Number(todayIso().slice(0, 4))]);
  for (const tx of txs) {
    const y = Number(tx.date.slice(0, 4));
    if (Number.isInteger(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** Vereinigung beider Listen, absteigend nach curCents (Gleichstand: prevCents absteigend, dann categoryId). */
export function compareCategories(cur: CategoryTotal[], prev: CategoryTotal[]): CategoryComparison[] {
  const curById = new Map(cur.map((c) => [c.categoryId, c.totalCents]));
  const prevById = new Map(prev.map((c) => [c.categoryId, c.totalCents]));
  const ids = new Set<string>([...curById.keys(), ...prevById.keys()]);
  const list: CategoryComparison[] = [...ids].map((categoryId) => {
    const curCents = curById.get(categoryId) ?? 0;
    const prevCents = prevById.get(categoryId) ?? 0;
    return { categoryId, curCents, prevCents, diffCents: curCents - prevCents };
  });
  list.sort((a, b) => b.curCents - a.curCents || b.prevCents - a.prevCents || cmpStr(a.categoryId, b.categoryId));
  return list;
}
