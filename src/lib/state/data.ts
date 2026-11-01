import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { db } from '../db/db';
import { EncryptedTable } from '../db/encryptedTable';
import {
  FALLBACK_EXPENSE_CATEGORY,
  FALLBACK_INCOME_CATEGORY,
  defaultCategories,
  defaultRules,
  defaultSettings,
} from '../db/defaults';
import { learnRule } from '../merchant';
import { generateDue } from '../recurring';
import { todayIso } from '../dates';
import type {
  AppData,
  Category,
  MerchantRule,
  RecurringTemplate,
  Settings,
  Transaction,
  TxInput,
} from '../types';
import { getDek } from './key';

export type { TxInput } from '../types';

const txTable = new EncryptedTable<Transaction>(db.transactions, getDek);
const categoryTable = new EncryptedTable<Category>(db.categories, getDek);
const ruleTable = new EncryptedTable<MerchantRule>(db.merchantRules, getDek);
const recurringTable = new EncryptedTable<RecurringTemplate>(db.recurring, getDek);
// In der Tabelle `settings` liegt genau ein Datensatz mit der id 'settings'.
const settingsTable = new EncryptedTable<Settings>(db.settings, getDek);

export const transactions: Writable<Transaction[]> = writable([]);
export const categories: Writable<Category[]> = writable([]);
export const merchantRules: Writable<MerchantRule[]> = writable([]);
export const recurring: Writable<RecurringTemplate[]> = writable([]);
export const settings: Writable<Settings | null> = writable(null);
export const categoryMap: Readable<Map<string, Category>> = derived(
  categories,
  ($c) => new Map($c.map((c) => [c.id, c])),
);

// Epochenzähler: clearAll() (also auch lock()) erhöht ihn. Async-Funktionen merken sich den
// Wert vor dem ersten await und schreiben nach dem await nur in die Stores, wenn sich
// der Wert nicht geändert hat. So kann ein laufendes Laden/Schreiben nach dem Sperren
// keine Daten mehr in die (leeren) Stores zurückschreiben.
let epoch = 0;

// ---------- Sortierung ----------

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** date absteigend, bei Gleichstand createdAt absteigend. Liefert eine neue Liste. */
export function sortTx(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => cmpStr(b.date, a.date) || cmpStr(b.createdAt, a.createdAt));
}

/** expense vor income, dann sortOrder. Liefert eine neue Liste. */
export function sortCategories(list: Category[]): Category[] {
  const typeRank = (c: Category): number => (c.type === 'expense' ? 0 : 1);
  return [...list].sort((a, b) => typeRank(a) - typeRank(b) || a.sortOrder - b.sortOrder);
}

function sortRules(list: MerchantRule[]): MerchantRule[] {
  return [...list].sort((a, b) => cmpStr(a.pattern, b.pattern));
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

// ---------- Laden / Leeren / Seed ----------

export async function loadAll(): Promise<void> {
  const e = epoch;
  const [tx, cats, rules, rec, sets] = await Promise.all([
    txTable.getAll(),
    categoryTable.getAll(),
    ruleTable.getAll(),
    recurringTable.getAll(),
    settingsTable.getAll(),
  ]);
  // Während des Ladens wurde gesperrt: Die Stores bleiben leer.
  if (e !== epoch) return;
  transactions.set(sortTx(tx));
  categories.set(sortCategories(cats));
  merchantRules.set(sortRules(rules));
  recurring.set(rec);
  settings.set(sets.find((s) => s.id === 'settings') ?? null);
}

export function clearAll(): void {
  epoch += 1;
  transactions.set([]);
  categories.set([]);
  merchantRules.set([]);
  recurring.set([]);
  settings.set(null);
}

export async function seedDefaults(): Promise<void> {
  const e = epoch;
  const now = new Date().toISOString();
  const cats = defaultCategories(now);
  const rules = defaultRules(now);
  const sets = defaultSettings(now);
  await categoryTable.bulkPut(cats);
  await ruleTable.bulkPut(rules);
  await settingsTable.bulkPut([sets]);
  if (e !== epoch) return;
  categories.set(sortCategories(cats));
  merchantRules.set(sortRules(rules));
  settings.set(sets);
}

// ---------- Buchungen ----------

function makeTx(input: TxInput, now: string): Transaction {
  return { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

export async function addTransaction(input: TxInput): Promise<Transaction> {
  const e = epoch;
  const tx = makeTx(input, new Date().toISOString());
  await txTable.put(tx);
  if (e === epoch) transactions.update((list) => sortTx([...list, tx]));
  return tx;
}

export async function updateTransaction(tx: Transaction): Promise<void> {
  const e = epoch;
  const updated: Transaction = { ...tx, updatedAt: new Date().toISOString() };
  await txTable.put(updated);
  if (e === epoch) transactions.update((list) => sortTx(upsert(list, updated)));
}

export async function deleteTransaction(id: string): Promise<void> {
  await txTable.delete(id);
  transactions.update((list) => list.filter((t) => t.id !== id));
}

/** Bulk (Import). */
export async function addTransactions(inputs: TxInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const e = epoch;
  const now = new Date().toISOString();
  const created = inputs.map((i) => makeTx(i, now));
  await txTable.bulkPut(created);
  if (e === epoch) transactions.update((list) => sortTx([...list, ...created]));
}

// ---------- Kategorien ----------

/** Insert oder Update, setzt updatedAt. */
export async function saveCategory(c: Category): Promise<void> {
  const e = epoch;
  const updated: Category = { ...c, updatedAt: new Date().toISOString() };
  await categoryTable.put(updated);
  if (e === epoch) categories.update((list) => sortCategories(upsert(list, updated)));
}

export function categoryUsage(id: string): { transactions: number; rules: number; recurring: number } {
  return {
    transactions: get(transactions).filter((t) => t.categoryId === id).length,
    rules: get(merchantRules).filter((r) => r.categoryId === id).length,
    recurring: get(recurring).filter((r) => r.categoryId === id).length,
  };
}

export async function deleteCategory(id: string): Promise<void> {
  if (id === FALLBACK_EXPENSE_CATEGORY || id === FALLBACK_INCOME_CATEGORY) {
    throw new Error('Standardkategorie kann nicht gelöscht werden');
  }
  const usage = categoryUsage(id);
  if (usage.transactions > 0 || usage.recurring > 0) {
    throw new Error('Kategorie wird noch verwendet');
  }
  const ruleIds = get(merchantRules).filter((r) => r.categoryId === id).map((r) => r.id);
  for (const ruleId of ruleIds) {
    await ruleTable.delete(ruleId);
  }
  await categoryTable.delete(id);
  merchantRules.update((list) => list.filter((r) => r.categoryId !== id));
  categories.update((list) => list.filter((c) => c.id !== id));
}

/** Tauscht sortOrder mit dem Nachbarn gleichen Typs (nur nicht archivierte). Am Rand oder bei archivierten Kategorien passiert nichts. */
export async function moveCategory(id: string, dir: -1 | 1): Promise<void> {
  const all = get(categories);
  const current = all.find((c) => c.id === id);
  if (!current || current.archived) return;
  const peers = sortCategories(all.filter((c) => c.type === current.type && !c.archived));
  const index = peers.findIndex((c) => c.id === id);
  if (index < 0) return;
  const neighbor = peers[index + dir];
  if (!neighbor) return;

  const e = epoch;
  const now = new Date().toISOString();
  const a: Category = { ...current, sortOrder: neighbor.sortOrder, updatedAt: now };
  const b: Category = { ...neighbor, sortOrder: current.sortOrder, updatedAt: now };
  await categoryTable.bulkPut([a, b]);
  if (e === epoch) categories.update((list) => sortCategories(upsert(upsert(list, a), b)));
}

// ---------- Wiederkehrende Buchungen ----------

/** Insert oder Update, setzt updatedAt. */
export async function saveRecurring(t: RecurringTemplate): Promise<void> {
  const e = epoch;
  const updated: RecurringTemplate = { ...t, updatedAt: new Date().toISOString() };
  await recurringTable.put(updated);
  if (e === epoch) recurring.update((list) => upsert(list, updated));
}

export async function deleteRecurring(id: string): Promise<void> {
  const e = epoch;
  await recurringTable.delete(id);
  if (e === epoch) recurring.update((list) => list.filter((t) => t.id !== id));
}

// Laufender runRecurring-Aufruf. Parallele Aufrufe (z. B. finishSetup und unlock) teilen sich ihn,
// damit keine Buchung doppelt erzeugt wird.
let inflight: Promise<number> | null = null;

/** Erzeugt fällige Buchungen aus den Vorlagen und gibt deren Anzahl zurück. */
export function runRecurring(): Promise<number> {
  if (inflight) return inflight;
  inflight = (async (): Promise<number> => {
    const e = epoch;
    const now = new Date().toISOString();
    const { newTx, updated } = generateDue(get(recurring), todayIso(), now);
    if (newTx.length === 0 && updated.length === 0) return 0;
    await addTransactions(newTx);
    for (const t of updated) {
      // Nach lock() dürfen keine Vorlagen mehr geschrieben werden.
      if (e !== epoch) return 0;
      await saveRecurring(t);
    }
    return e === epoch ? newTx.length : 0;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// ---------- Regeln ----------

export async function putRule(r: MerchantRule): Promise<void> {
  const e = epoch;
  await ruleTable.put(r);
  if (e === epoch) merchantRules.update((list) => sortRules(upsert(list, r)));
}

export async function deleteRule(id: string): Promise<void> {
  await ruleTable.delete(id);
  merchantRules.update((list) => list.filter((r) => r.id !== id));
}

export async function rememberMerchant(merchant: string, categoryId: string): Promise<void> {
  const rule = learnRule(merchant, categoryId, get(merchantRules));
  if (rule) await putRule(rule);
}

// ---------- Einstellungen ----------

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = get(settings);
  if (!current) throw new Error('Einstellungen nicht geladen');
  const e = epoch;
  const merged: Settings = { ...current, ...patch, id: 'settings', updatedAt: new Date().toISOString() };
  await settingsTable.put(merged);
  if (e === epoch) settings.set(merged);
}

// ---------- Gesamtdaten (Backup) ----------

/** Liest alle Stores zu einem AppData-Objekt zusammen. Wirft, wenn die Einstellungen nicht geladen sind. */
export function buildAppData(): AppData {
  const s = get(settings);
  if (!s) throw new Error('Einstellungen nicht geladen');
  return {
    transactions: get(transactions),
    categories: get(categories),
    merchantRules: get(merchantRules),
    recurring: get(recurring),
    settings: s,
  };
}

// ---------- Alles ersetzen ----------

export async function replaceAllData(data: AppData): Promise<void> {
  // Verschlüsselung (WebCrypto) läuft VOR der Dexie-Transaktion, weil ein await auf
  // Nicht-IndexedDB-Promises die Transaktion sonst schließen würde.
  const [txRows, categoryRows, ruleRows, recurringRows, settingsRows] = await Promise.all([
    txTable.encryptRows(data.transactions),
    categoryTable.encryptRows(data.categories),
    ruleTable.encryptRows(data.merchantRules),
    recurringTable.encryptRows(data.recurring),
    settingsTable.encryptRows([data.settings]),
  ]);

  await db.transaction(
    'rw',
    [db.transactions, db.categories, db.merchantRules, db.recurring, db.settings],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.merchantRules.clear(),
        db.recurring.clear(),
        db.settings.clear(),
      ]);
      await db.transactions.bulkPut(txRows);
      await db.categories.bulkPut(categoryRows);
      await db.merchantRules.bulkPut(ruleRows);
      await db.recurring.bulkPut(recurringRows);
      await db.settings.bulkPut(settingsRows);
    },
  );

  await loadAll();
}
