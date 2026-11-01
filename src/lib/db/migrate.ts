import { ValidationError, validateAppData } from '../backup/validate';
import type { AppData } from '../types';
import { defaultAccounts, defaultCategories, defaultRules, REMOVED_GIFTS_CATEGORY, DEFAULT_ACCOUNT_ID } from './defaults';

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function field(x: unknown, key: string): unknown {
  return isObj(x) ? x[key] : undefined;
}

/** Flache Kopie einer Liste; Objekt-Elemente werden ebenfalls flach kopiert. Nicht-Listen bleiben unverändert. */
function copyList(x: unknown): unknown {
  if (!Array.isArray(x)) return x;
  const list: unknown[] = x;
  return list.map((e) => (isObj(e) ? { ...e } : e));
}

/** Setzt ein Feld in allen Objekt-Elementen, in denen es `=== undefined` ist. */
function setDefault(list: unknown, key: string, value: unknown): void {
  if (!Array.isArray(list)) return;
  const items: unknown[] = list;
  for (const item of items) {
    if (isObj(item) && item[key] === undefined) item[key] = value;
  }
}

function normName(x: unknown): string {
  return typeof x === 'string' ? x.trim().toLowerCase() : '';
}

/** Schritt 2: Die entfernte Default-Kategorie `cat-gifts` löschen (unbenutzt) oder archivieren (benutzt). */
function handleRemovedGifts(
  cats: unknown[],
  rules: unknown[],
  txs: unknown[],
  recurring: unknown[],
  now: string,
): { cats: unknown[]; rules: unknown[] } {
  const gifts = cats.find((c) => field(c, 'id') === REMOVED_GIFTS_CATEGORY);
  if (gifts === undefined) return { cats, rules };
  const used =
    txs.some((t) => field(t, 'categoryId') === REMOVED_GIFTS_CATEGORY) ||
    recurring.some((t) => field(t, 'categoryId') === REMOVED_GIFTS_CATEGORY) ||
    cats.some((c) => field(c, 'parentId') === REMOVED_GIFTS_CATEGORY);
  if (!used) {
    return {
      cats: cats.filter((c) => field(c, 'id') !== REMOVED_GIFTS_CATEGORY),
      rules: rules.filter((r) => field(r, 'categoryId') !== REMOVED_GIFTS_CATEGORY),
    };
  }
  if (isObj(gifts) && gifts.archived === false) {
    gifts.archived = true;
    gifts.updatedAt = now;
  }
  return { cats, rules };
}

/** Schritt 3: Fehlende Default-Kategorien ergänzen; bestehende werden nie verändert. */
function addMissingDefaultCategories(cats: unknown[], now: string): void {
  for (const def of defaultCategories(now)) {
    if (cats.some((c) => field(c, 'id') === def.id)) continue;
    const defName = normName(def.name);
    const sameUserCategory = cats.some(
      (c) =>
        field(c, 'type') === def.type &&
        (field(c, 'parentId') ?? null) === def.parentId &&
        normName(field(c, 'name')) === defName,
    );
    if (sameUserCategory) continue;
    if (def.parentId !== null && !cats.some((c) => field(c, 'id') === def.parentId)) continue;
    let max = -1;
    for (const c of cats) {
      if (field(c, 'type') !== def.type || (field(c, 'parentId') ?? null) !== def.parentId) continue;
      const so = field(c, 'sortOrder');
      if (typeof so === 'number' && so > max) max = so;
    }
    cats.push({ ...def, sortOrder: max + 1 });
  }
}

/** Schritt 4: Default-Regeln ergänzen bzw. Default-Regeln auf neue Zielkategorien umstellen. Nutzerregeln haben Vorrang. */
function applyDefaultRules(rules: unknown[], cats: unknown[], now: string): void {
  for (const def of defaultRules(now)) {
    const target = cats.find((c) => field(c, 'id') === def.categoryId);
    if (target === undefined || field(target, 'archived') === true) continue;
    const sameId = rules.find((r) => field(r, 'id') === def.id);
    if (sameId !== undefined) {
      if (isObj(sameId) && sameId.source === 'default' && sameId.categoryId !== def.categoryId) {
        sameId.categoryId = def.categoryId;
        sameId.updatedAt = now;
      }
      continue;
    }
    if (rules.some((r) => field(r, 'pattern') === def.pattern)) continue;
    rules.push({ ...def });
  }
}

/**
 * Überführt Daten im Schema v1 (oder bereits v2) in Schema v2. Pure, idempotent, verändert input nicht.
 * Wirft ValidationError, wenn das Ergebnis ungültig ist (Validierung über validateAppData am Ende).
 *
 * Hinweis: Die Funktion wird nur bei `schemaVersion < 2` aufgerufen (Session und Backup). Bei v2-Daten
 * würde sie gelöschte Default-Kategorien wieder ergänzen. Deshalb wird sie nicht auf v2-Daten angewendet.
 */
export function migrateToV2(input: unknown, now: string): AppData {
  // Schritt 0: Kopien anlegen
  if (!isObj(input)) throw new ValidationError('data ungültig');
  const d: Obj = { ...input };
  d.transactions = copyList(d.transactions);
  d.categories = copyList(d.categories);
  d.merchantRules = copyList(d.merchantRules);
  d.recurring = copyList(d.recurring);

  // Schritt 1: Feld-Defaults
  setDefault(d.transactions, 'accountId', DEFAULT_ACCOUNT_ID);
  setDefault(d.transactions, 'direction', null);
  setDefault(d.transactions, 'originalText', '');
  setDefault(d.recurring, 'accountId', DEFAULT_ACCOUNT_ID);
  setDefault(d.recurring, 'direction', null);
  setDefault(d.categories, 'parentId', null);
  setDefault(d.merchantRules, 'displayName', null);
  d.accounts =
    Array.isArray(d.accounts) && d.accounts.length > 0 ? copyList(d.accounts) : defaultAccounts(now);
  if (isObj(d.settings)) {
    const settings: Obj = { ...d.settings };
    if (settings.ownNames === undefined) settings.ownNames = [];
    d.settings = settings;
  }

  // Schritte 2 bis 4 arbeiten nur auf wohlgeformten Listen; sonst wirft die Validierung am Ende.
  if (
    Array.isArray(d.categories) &&
    Array.isArray(d.merchantRules) &&
    Array.isArray(d.transactions) &&
    Array.isArray(d.recurring)
  ) {
    const txs: unknown[] = d.transactions;
    const recurring: unknown[] = d.recurring;
    const handled = handleRemovedGifts(d.categories, d.merchantRules, txs, recurring, now);
    const cats = handled.cats;
    const rules = handled.rules;
    addMissingDefaultCategories(cats, now);
    applyDefaultRules(rules, cats, now);
    d.categories = cats;
    d.merchantRules = rules;
  }

  // Schritt 5: Schema-Version anheben
  if (isObj(d.settings) && typeof d.settings.schemaVersion === 'number' && d.settings.schemaVersion < 2) {
    d.settings.schemaVersion = 2;
    d.settings.updatedAt = now;
  }

  // Schritt 6
  return validateAppData(d);
}
