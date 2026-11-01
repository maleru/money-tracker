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
  return { id: crypto.randomUUID(), pattern, categoryId, displayName: null, source: 'learned', updatedAt: now };
}

/** Wörter einer normalisierten Zeichenkette (leer ergibt []). */
function wordsOf(s: string): string[] {
  return normalizeMerchant(s).split(' ').filter((w) => w !== '');
}

/** Jedes Wort von normalizeMerchant(name) kommt als Wort in normalizeMerchant(merchant) vor (Reihenfolge egal). Namen, die normalisiert leer sind, werden ignoriert. */
export function matchesOwnName(merchant: string, ownNames: readonly string[]): boolean {
  const merchantWords = new Set(wordsOf(merchant));
  for (const name of ownNames) {
    const words = wordsOf(name);
    if (words.length === 0) continue;
    if (words.every((w) => merchantWords.has(w))) return true;
  }
  return false;
}

/** null = gültig, sonst Fehlermeldung. */
export function validateOwnName(name: string, existing: readonly string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Bitte einen Namen eingeben';
  if (trimmed.length > 60) return 'Name ist zu lang (max. 60 Zeichen)';
  const normalized = normalizeMerchant(trimmed);
  if (normalized === '') return 'Bitte einen Namen eingeben';
  if (existing.some((e) => normalizeMerchant(e) === normalized)) return 'Name bereits vorhanden';
  if (existing.length >= 10) return 'Höchstens 10 Namen';
  return null;
}

export interface RuleMatch {
  rule: MerchantRule;
  category: Category;
}

/**
 * Beste Regel für den Import: Muster wortweise enthalten (wie suggestCategory), Kategorie existiert,
 * nicht archiviert und (category.type === type || category.type === 'transfer'). Bewertung mit compareRules.
 */
export function matchRule(
  merchant: string,
  type: 'expense' | 'income',
  rules: MerchantRule[],
  categories: Category[],
): RuleMatch | null {
  const n = normalizeMerchant(merchant);
  if (n === '') return null;

  const haystack = ' ' + n + ' ';
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  let best: RuleMatch | null = null;
  for (const rule of rules) {
    if (!haystack.includes(' ' + rule.pattern + ' ')) continue;
    const category = categoryById.get(rule.categoryId);
    if (!category || category.archived) continue;
    if (category.type !== type && category.type !== 'transfer') continue;
    if (best === null || compareRules(rule, best.rule) > 0) best = { rule, category };
  }
  return best;
}

/**
 * Regel für „Für künftige Importe merken“: pattern = normalizeMerchant(originalMerchant) ('' -> null).
 * displayName = displayName.trim(); '' oder gleich originalMerchant.trim() -> null.
 * Existiert eine Regel mit gleichem pattern: { ...existing, categoryId, displayName, source: 'manual', updatedAt: now }.
 * Sonst neue Regel { id: crypto.randomUUID(), pattern, categoryId, displayName, source: 'manual', updatedAt: now }.
 */
export function upsertRenameRule(
  rules: MerchantRule[],
  originalMerchant: string,
  displayName: string,
  categoryId: string,
  now: string,
): MerchantRule | null {
  const pattern = normalizeMerchant(originalMerchant);
  if (pattern === '') return null;

  const trimmedName = displayName.trim();
  const name = trimmedName === '' || trimmedName === originalMerchant.trim() ? null : trimmedName;

  const existing = rules.find((r) => r.pattern === pattern);
  if (existing) {
    return { ...existing, categoryId, displayName: name, source: 'manual', updatedAt: now };
  }
  return { id: crypto.randomUUID(), pattern, categoryId, displayName: name, source: 'manual', updatedAt: now };
}
