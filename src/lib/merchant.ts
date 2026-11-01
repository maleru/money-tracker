import type { Category, MerchantRule, Transaction, TxType } from './types';

/** Großbuchstaben, Ä->AE Ö->OE Ü->UE ß->SS, alles außer A-Z0-9 -> Leerzeichen, Mehrfach-Leerzeichen zusammenfassen, trim. */
export function normalizeMerchant(s: string): string {
  return s
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const SOURCE_RANK: Record<MerchantRule['source'], number> = {
  manual: 3,
  learned: 2,
  default: 1,
};

/** Positiv, wenn a besser ist als b. */
function compareRules(a: MerchantRule, b: MerchantRule): number {
  if (a.pattern.length !== b.pattern.length) return a.pattern.length - b.pattern.length;
  if (SOURCE_RANK[a.source] !== SOURCE_RANK[b.source]) return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt > b.updatedAt ? 1 : -1;
}

/** Liefert categoryId oder null. */
export function suggestCategory(
  merchant: string,
  type: TxType,
  rules: MerchantRule[],
  categories: Category[],
): string | null {
  const n = normalizeMerchant(merchant);
  if (n === '') return null;

  const haystack = ' ' + n + ' ';
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  let best: MerchantRule | null = null;
  for (const rule of rules) {
    if (!haystack.includes(' ' + rule.pattern + ' ')) continue;
    const category = categoryById.get(rule.categoryId);
    if (!category || category.archived || category.type !== type) continue;
    if (best === null || compareRules(rule, best) > 0) best = rule;
  }
  return best ? best.categoryId : null;
}

/** Kategorie der neuesten Buchung (Store ist nach date desc sortiert -> erste Fundstelle) mit gleichem normalizeMerchant und gleichem type, deren Kategorie existiert und nicht archiviert ist; sonst null. */
export function lastCategoryForMerchant(
  merchant: string,
  type: TxType,
  txs: Transaction[],
  cats: Category[],
): string | null {
  const n = normalizeMerchant(merchant);
  if (n === '') return null;

  const categoryById = new Map(cats.map((c) => [c.id, c]));
  for (const tx of txs) {
    if (tx.type !== type || normalizeMerchant(tx.merchant) !== n) continue;
    const category = categoryById.get(tx.categoryId);
    if (!category || category.archived) continue;
    return category.id;
  }
  return null;
}

/** Autocomplete: eindeutige Händler aus txs, gruppiert nach normalizeMerchant; Anzeige = Schreibweise der neuesten Buchung; match wenn normalisierter Kandidat den normalisierten Input enthält; sortiert nach Häufigkeit desc, dann alphabetisch; max limit (Default 5); leerer Input -> []; exakt gleicher Kandidat wie Input (normalisiert) wird ausgeschlossen. */
export function merchantSuggestions(input: string, txs: Transaction[], limit = 5): string[] {
  const needle = normalizeMerchant(input);
  if (needle === '') return [];

  const groups = new Map<string, { display: string; count: number }>();
  for (const tx of txs) {
    const key = normalizeMerchant(tx.merchant);
    if (key === '') continue;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { display: tx.merchant.trim(), count: 1 }); // erste Fundstelle = neueste Buchung
  }

  const matches: { display: string; count: number }[] = [];
  for (const [key, group] of groups) {
    if (key === needle || !key.includes(needle)) continue;
    matches.push(group);
  }
  matches.sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, 'de'));
  return matches.slice(0, Math.max(0, limit)).map((g) => g.display);
}

/** Kombinierter Vorschlag fürs Formular: lastCategoryForMerchant ?? suggestCategory ?? null */
export function proposeCategory(
  merchant: string,
  type: TxType,
  txs: Transaction[],
  rules: MerchantRule[],
  cats: Category[],
): string | null {
  return lastCategoryForMerchant(merchant, type, txs, cats) ?? suggestCategory(merchant, type, rules, cats);
}

/** Liefert die anzulegende/zu ändernde Regel oder null, wenn nichts zu tun ist. */
export function learnRule(
  merchant: string,
  categoryId: string,
  rules: MerchantRule[],
): MerchantRule | null {
  const pattern = normalizeMerchant(merchant);
  if (pattern === '') return null;

  const now = new Date().toISOString();
  const existing = rules.find((r) => r.pattern === pattern);
  if (existing) {
    if (existing.categoryId === categoryId) return null;
    return {
      ...existing,
      categoryId,
      source: existing.source === 'manual' ? 'manual' : 'learned',
      updatedAt: now,
    };
  }
  return { id: crypto.randomUUID(), pattern, categoryId, source: 'learned', updatedAt: now };
}
