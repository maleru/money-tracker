import { isValidIsoDate } from '../dates';
import type {
  AppData,
  Category,
  MerchantRule,
  RecurringTemplate,
  Settings,
  Transaction,
  TxSource,
  TxType,
} from '../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const MAX_CENTS = 9_999_999_999;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const TX_TYPES: readonly TxType[] = ['expense', 'income'];
const TX_SOURCES: readonly TxSource[] = ['manual', 'text', 'ocr', 'recurring'];
const RULE_SOURCES: readonly MerchantRule['source'][] = ['default', 'learned', 'manual'];
const AUTO_LOCK_VALUES: readonly Settings['autoLockMinutes'][] = [0, 1, 5, 15];
const REMINDER_VALUES: readonly Settings['backupReminderDays'][] = [0, 7, 14, 30];

type Obj = Record<string, unknown>;

// ---------- kleine Helfer ----------

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function fail(path: string): never {
  throw new ValidationError(`${path} ungültig`);
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string') fail(`${path}.${key}`);
  return v;
}

function int(o: Obj, key: string, path: string, min: number, max: number): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(`${path}.${key}`);
  return v;
}

function bool(o: Obj, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') fail(`${path}.${key}`);
  return v;
}

function oneOf<T extends string | number>(o: Obj, key: string, path: string, allowed: readonly T[]): T {
  const v = o[key];
  const found = allowed.find((a) => a === v);
  if (found === undefined) fail(`${path}.${key}`);
  return found;
}

/** Wendet `read` an, außer der Wert ist null. */
function nullable<T>(o: Obj, key: string, path: string, read: (o: Obj, key: string, path: string) => T): T | null {
  if (o[key] === null) return null;
  return read(o, key, path);
}

function amountCents(o: Obj, key: string, path: string): number {
  return int(o, key, path, 1, MAX_CENTS);
}

function isoDate(o: Obj, key: string, path: string): string {
  const v = str(o, key, path);
  if (!isValidIsoDate(v)) fail(`${path}.${key}`);
  return v;
}

function month(o: Obj, key: string, path: string): string {
  const v = str(o, key, path);
  if (!MONTH_RE.test(v)) fail(`${path}.${key}`);
  const m = Number(v.slice(5, 7));
  if (m < 1 || m > 12) fail(`${path}.${key}`);
  return v;
}

function color(o: Obj, key: string, path: string): string {
  const v = str(o, key, path);
  if (!COLOR_RE.test(v)) fail(`${path}.${key}`);
  return v;
}

function budgetCents(o: Obj, key: string, path: string): number {
  return int(o, key, path, 0, MAX_CENTS);
}

// ---------- Sammlungen ----------

function readList<T extends { id: string }>(
  x: unknown,
  name: string,
  readItem: (o: Obj, path: string) => T,
): T[] {
  if (!Array.isArray(x)) fail(name);
  const seen = new Set<string>();
  const out: T[] = [];
  x.forEach((item: unknown, i) => {
    const path = `${name}[${i}]`;
    if (!isObj(item)) fail(path);
    const parsed = readItem(item, path);
    if (seen.has(parsed.id)) throw new ValidationError(`${path}.id doppelt`);
    seen.add(parsed.id);
    out.push(parsed);
  });
  return out;
}

function readTransaction(o: Obj, p: string): Transaction {
  return {
    id: str(o, 'id', p),
    type: oneOf(o, 'type', p, TX_TYPES),
    amountCents: amountCents(o, 'amountCents', p),
    date: isoDate(o, 'date', p),
    categoryId: str(o, 'categoryId', p),
    merchant: str(o, 'merchant', p),
    city: str(o, 'city', p),
    note: str(o, 'note', p),
    source: oneOf(o, 'source', p, TX_SOURCES),
    recurringId: nullable(o, 'recurringId', p, str),
    createdAt: str(o, 'createdAt', p),
    updatedAt: str(o, 'updatedAt', p),
  };
}

function readCategory(o: Obj, p: string): Category {
  return {
    id: str(o, 'id', p),
    name: str(o, 'name', p),
    type: oneOf(o, 'type', p, TX_TYPES),
    icon: str(o, 'icon', p),
    color: color(o, 'color', p),
    archived: bool(o, 'archived', p),
    sortOrder: int(o, 'sortOrder', p, -1_000_000, 1_000_000),
    monthlyBudgetCents: nullable(o, 'monthlyBudgetCents', p, budgetCents),
    updatedAt: str(o, 'updatedAt', p),
  };
}

function readRule(o: Obj, p: string): MerchantRule {
  return {
    id: str(o, 'id', p),
    pattern: str(o, 'pattern', p),
    categoryId: str(o, 'categoryId', p),
    source: oneOf(o, 'source', p, RULE_SOURCES),
    updatedAt: str(o, 'updatedAt', p),
  };
}

function readRecurring(o: Obj, p: string): RecurringTemplate {
  return {
    id: str(o, 'id', p),
    type: oneOf(o, 'type', p, TX_TYPES),
    amountCents: amountCents(o, 'amountCents', p),
    categoryId: str(o, 'categoryId', p),
    merchant: str(o, 'merchant', p),
    note: str(o, 'note', p),
    dayOfMonth: int(o, 'dayOfMonth', p, 1, 31),
    startMonth: month(o, 'startMonth', p),
    endMonth: nullable(o, 'endMonth', p, month),
    lastGeneratedMonth: nullable(o, 'lastGeneratedMonth', p, month),
    active: bool(o, 'active', p),
    updatedAt: str(o, 'updatedAt', p),
  };
}

function readSettings(x: unknown): Settings {
  const p = 'settings';
  if (!isObj(x)) fail(p);
  if (x.id !== 'settings') fail(`${p}.id`);
  return {
    id: 'settings',
    schemaVersion: int(x, 'schemaVersion', p, 1, 1_000_000),
    autoLockMinutes: oneOf(x, 'autoLockMinutes', p, AUTO_LOCK_VALUES),
    backupReminderDays: oneOf(x, 'backupReminderDays', p, REMINDER_VALUES),
    lastBackupAt: nullable(x, 'lastBackupAt', p, str),
    updatedAt: str(x, 'updatedAt', p),
  };
}

function checkCategoryRefs(
  name: string,
  list: readonly { categoryId: string }[],
  categoryIds: ReadonlySet<string>,
): void {
  list.forEach((item, i) => {
    if (!categoryIds.has(item.categoryId)) {
      throw new ValidationError(`${name}[${i}].categoryId verweist auf unbekannte Kategorie`);
    }
  });
}

/**
 * Prüft unbekannte Daten vollständig und liefert ein NEU aufgebautes Objekt, das nur die
 * bekannten Felder enthält (Zusatzfelder werden verworfen).
 */
export function validateAppData(x: unknown): AppData {
  if (!isObj(x)) fail('data');

  const categories = readList(x.categories, 'categories', readCategory);
  const transactions = readList(x.transactions, 'transactions', readTransaction);
  const merchantRules = readList(x.merchantRules, 'merchantRules', readRule);
  const recurring = readList(x.recurring, 'recurring', readRecurring);
  const settings = readSettings(x.settings);

  const categoryIds = new Set(categories.map((c) => c.id));
  checkCategoryRefs('transactions', transactions, categoryIds);
  checkCategoryRefs('merchantRules', merchantRules, categoryIds);
  checkCategoryRefs('recurring', recurring, categoryIds);

  return { transactions, categories, merchantRules, recurring, settings };
}
