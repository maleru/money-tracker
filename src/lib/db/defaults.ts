import type { Account, Category, MerchantRule, Settings, TxType } from '../types';

export const CURRENT_SCHEMA_VERSION = 2;
export const FALLBACK_EXPENSE_CATEGORY = 'cat-other-expense';
export const FALLBACK_INCOME_CATEGORY = 'cat-other-income';
export const FALLBACK_TRANSFER_CATEGORY = 'cat-transfer-own';
export const TRANSFER_SAVINGS_CATEGORY = 'cat-transfer-savings';
export const TRANSFER_INVEST_CATEGORY = 'cat-transfer-invest';
export const TRANSFER_CREDIT_CARD_CATEGORY = 'cat-transfer-credit-card';
export const REMOVED_GIFTS_CATEGORY = 'cat-gifts';
export const DEFAULT_ACCOUNT_ID = 'acc-checking';
export const CREDIT_CARD_ACCOUNT_ID = 'acc-credit-card';

/** expense -> FALLBACK_EXPENSE_CATEGORY, income -> FALLBACK_INCOME_CATEGORY, transfer -> FALLBACK_TRANSFER_CATEGORY */
export function fallbackCategoryFor(type: TxType): string {
  if (type === 'expense') return FALLBACK_EXPENSE_CATEGORY;
  if (type === 'income') return FALLBACK_INCOME_CATEGORY;
  return FALLBACK_TRANSFER_CATEGORY;
}

interface CategoryDef {
  id: string;
  name: string;
  type: TxType;
  parentId: string | null;
  icon: string;
  color: string;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'cat-groceries', name: 'Lebensmittel', type: 'expense', parentId: null, icon: '🛒', color: '#16a34a' },
  { id: 'cat-restaurant', name: 'Restaurant & Essen', type: 'expense', parentId: null, icon: '🍽️', color: '#ea580c' },
  { id: 'cat-cafe', name: 'Café & Snacks', type: 'expense', parentId: null, icon: '☕', color: '#a16207' },
  { id: 'cat-clothing', name: 'Kleidung', type: 'expense', parentId: null, icon: '👕', color: '#db2777' },
  { id: 'cat-drugstore', name: 'Drogerie & Haushalt', type: 'expense', parentId: null, icon: '🧴', color: '#0891b2' },
  { id: 'cat-housing', name: 'Wohnen & Nebenkosten', type: 'expense', parentId: null, icon: '🏠', color: '#4f46e5' },
  { id: 'cat-telecom', name: 'Handy & Internet', type: 'expense', parentId: null, icon: '📱', color: '#0284c7' },
  { id: 'cat-subscriptions', name: 'Abos & Digitales', type: 'expense', parentId: null, icon: '💳', color: '#7c3aed' },
  { id: 'cat-mobility', name: 'Mobilität & Parken', type: 'expense', parentId: null, icon: '🚗', color: '#475569' },
  { id: 'cat-travel', name: 'Urlaub & Reisen', type: 'expense', parentId: null, icon: '✈️', color: '#0d9488' },
  { id: 'cat-leisure', name: 'Freizeit & Hobby', type: 'expense', parentId: null, icon: '🎉', color: '#c026d3' },
  { id: 'cat-health', name: 'Gesundheit', type: 'expense', parentId: null, icon: '💊', color: '#dc2626' },
  { id: 'cat-memberships', name: 'Mitgliedschaften', type: 'expense', parentId: null, icon: '🏋️', color: '#9333ea' },
  { id: 'cat-insurance', name: 'Versicherungen', type: 'expense', parentId: null, icon: '🛡️', color: '#334155' },
  { id: 'cat-other-expense', name: 'Sonstiges', type: 'expense', parentId: null, icon: '📦', color: '#6b7280' },
  { id: 'cat-groceries-supermarket', name: 'Supermarkt / Wocheneinkauf', type: 'expense', parentId: 'cat-groceries', icon: '🛒', color: '#16a34a' },
  { id: 'cat-groceries-bakery', name: 'Bäckerei', type: 'expense', parentId: 'cat-groceries', icon: '🥐', color: '#16a34a' },
  { id: 'cat-telecom-mobile', name: 'Handyvertrag', type: 'expense', parentId: 'cat-telecom', icon: '📱', color: '#0284c7' },
  { id: 'cat-telecom-internet', name: 'Internet / Festnetz', type: 'expense', parentId: 'cat-telecom', icon: '🌐', color: '#0284c7' },
  { id: 'cat-housing-rent', name: 'Miete', type: 'expense', parentId: 'cat-housing', icon: '🔑', color: '#4f46e5' },
  { id: 'cat-housing-electricity', name: 'Strom', type: 'expense', parentId: 'cat-housing', icon: '💡', color: '#4f46e5' },
  { id: 'cat-housing-heating', name: 'Heizung & Wasser', type: 'expense', parentId: 'cat-housing', icon: '🔥', color: '#4f46e5' },
  { id: 'cat-housing-broadcast', name: 'Rundfunkbeitrag', type: 'expense', parentId: 'cat-housing', icon: '📺', color: '#4f46e5' },
  { id: 'cat-housing-other', name: 'Sonstige Nebenkosten', type: 'expense', parentId: 'cat-housing', icon: '🧾', color: '#4f46e5' },
  { id: 'cat-salary', name: 'Gehalt', type: 'income', parentId: null, icon: '💼', color: '#15803d' },
  { id: 'cat-refund', name: 'Erstattung & Gutschrift', type: 'income', parentId: null, icon: '↩️', color: '#0f766e' },
  { id: 'cat-sale', name: 'Verkauf', type: 'income', parentId: null, icon: '🏷️', color: '#65a30d' },
  { id: 'cat-gift-income', name: 'Geschenk erhalten', type: 'income', parentId: null, icon: '🎁', color: '#ca8a04' },
  { id: 'cat-other-income', name: 'Sonstige Einnahmen', type: 'income', parentId: null, icon: '💰', color: '#6b7280' },
  { id: 'cat-transfer-savings', name: 'Tagesgeld / Rücklagen', type: 'transfer', parentId: null, icon: '🏦', color: '#0369a1' },
  { id: 'cat-transfer-invest', name: 'Sparen & Anlegen', type: 'transfer', parentId: null, icon: '📈', color: '#047857' },
  { id: 'cat-transfer-credit-card', name: 'Kreditkarte', type: 'transfer', parentId: null, icon: '💳', color: '#be185d' },
  { id: 'cat-transfer-own', name: 'Eigene Konten', type: 'transfer', parentId: null, icon: '🔁', color: '#6b7280' },
];

/** Muster -> Kategorie, gruppiert nach Kategorie (Reihenfolge wie im Plan). */
const RULE_DEFS: { categoryId: string; patterns: string[] }[] = [
  { categoryId: 'cat-groceries-supermarket', patterns: ['ALDI', 'LIDL', 'REWE', 'EDEKA', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA', 'TEGUT'] },
  { categoryId: 'cat-groceries-bakery', patterns: ['BAECKEREI', 'BAECKER', 'BROTHAUS', 'BACKHAUS', 'KAMPS'] },
  { categoryId: 'cat-drugstore', patterns: ['ROSSMANN', 'DM', 'MUELLER'] },
  { categoryId: 'cat-telecom', patterns: ['TELEKOM', 'VODAFONE', 'O2'] },
  { categoryId: 'cat-subscriptions', patterns: ['APPLE', 'NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'DISNEY'] },
  { categoryId: 'cat-mobility', patterns: ['PARKEN', 'SHELL', 'ARAL', 'ESSO', 'MVG', 'MVV'] },
  { categoryId: 'cat-travel', patterns: ['LUFTHANSA', 'RYANAIR', 'EUROWINGS', 'DB VERTRIEB', 'BOOKING', 'AIRBNB'] },
  { categoryId: 'cat-cafe', patterns: ['STARBUCKS'] },
  { categoryId: 'cat-restaurant', patterns: ['MCDONALDS', 'BURGER KING', 'LIEFERANDO', 'GASTRONOMIE'] },
  { categoryId: 'cat-clothing', patterns: ['ZALANDO', 'H M', 'ZARA', 'PRIMARK', 'OUTLET'] },
  { categoryId: 'cat-memberships', patterns: ['FITNESS', 'GYM', 'TENNIS', 'VEREIN', 'MCFIT', 'CLEVERFIT', 'URBAN SPORTS'] },
  { categoryId: 'cat-insurance', patterns: ['ARAG', 'ALLIANZ', 'HUK', 'ERGO', 'AXA', 'DEVK', 'VERSICHERUNG', 'HANSEMERKUR'] },
  { categoryId: 'cat-housing-broadcast', patterns: ['GEZ', 'RUNDFUNK'] },
  { categoryId: 'cat-housing-electricity', patterns: ['STADTWERKE'] },
];

export function defaultCategories(now: string): Category[] {
  const counters: Record<string, number> = {};
  return CATEGORY_DEFS.map((def) => {
    const key = def.type + '|' + (def.parentId ?? '');
    const sortOrder = counters[key] ?? 0;
    counters[key] = sortOrder + 1;
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      parentId: def.parentId,
      icon: def.icon,
      color: def.color,
      archived: false,
      sortOrder,
      monthlyBudgetCents: null,
      updatedAt: now,
    };
  });
}

export function defaultRules(now: string): MerchantRule[] {
  return RULE_DEFS.flatMap(({ categoryId, patterns }) =>
    patterns.map((pattern): MerchantRule => ({
      id: 'rule-' + pattern.toLowerCase().replace(/ /g, '-'),
      pattern,
      categoryId,
      displayName: null,
      source: 'default',
      updatedAt: now,
    })),
  );
}

export function defaultAccounts(now: string): Account[] {
  return [
    { id: DEFAULT_ACCOUNT_ID, name: 'Girokonto', kind: 'checking', icon: '🏦', archived: false, sortOrder: 0, updatedAt: now },
    { id: CREDIT_CARD_ACCOUNT_ID, name: 'Kreditkarte', kind: 'credit_card', icon: '💳', archived: false, sortOrder: 1, updatedAt: now },
  ];
}

export function defaultSettings(now: string): Settings {
  return {
    id: 'settings',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    autoLockMinutes: 1,
    backupReminderDays: 14,
    lastBackupAt: null,
    ownNames: [],
    updatedAt: now,
  };
}
