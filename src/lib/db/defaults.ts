import type { Category, MerchantRule, Settings, TxType } from '../types';

export const CURRENT_SCHEMA_VERSION = 1;
export const FALLBACK_EXPENSE_CATEGORY = 'cat-other-expense';
export const FALLBACK_INCOME_CATEGORY = 'cat-other-income';

interface CategoryDef { id: string; name: string; type: TxType; icon: string; color: string }

const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'cat-groceries', name: 'Lebensmittel', type: 'expense', icon: '🛒', color: '#16a34a' },
  { id: 'cat-restaurant', name: 'Restaurant & Essen', type: 'expense', icon: '🍽️', color: '#ea580c' },
  { id: 'cat-cafe', name: 'Café & Snacks', type: 'expense', icon: '☕', color: '#a16207' },
  { id: 'cat-clothing', name: 'Kleidung', type: 'expense', icon: '👕', color: '#db2777' },
  { id: 'cat-drugstore', name: 'Drogerie & Haushalt', type: 'expense', icon: '🧴', color: '#0891b2' },
  { id: 'cat-housing', name: 'Wohnen & Nebenkosten', type: 'expense', icon: '🏠', color: '#4f46e5' },
  { id: 'cat-telecom', name: 'Handy & Internet', type: 'expense', icon: '📱', color: '#0284c7' },
  { id: 'cat-subscriptions', name: 'Abos & Digitales', type: 'expense', icon: '💳', color: '#7c3aed' },
  { id: 'cat-mobility', name: 'Mobilität & Parken', type: 'expense', icon: '🚗', color: '#475569' },
  { id: 'cat-travel', name: 'Urlaub & Reisen', type: 'expense', icon: '✈️', color: '#0d9488' },
  { id: 'cat-leisure', name: 'Freizeit & Hobby', type: 'expense', icon: '🎉', color: '#c026d3' },
  { id: 'cat-health', name: 'Gesundheit', type: 'expense', icon: '💊', color: '#dc2626' },
  { id: 'cat-gifts', name: 'Geschenke', type: 'expense', icon: '🎁', color: '#e11d48' },
  { id: 'cat-other-expense', name: 'Sonstiges', type: 'expense', icon: '📦', color: '#6b7280' },
  { id: 'cat-salary', name: 'Gehalt', type: 'income', icon: '💼', color: '#15803d' },
  { id: 'cat-refund', name: 'Erstattung & Gutschrift', type: 'income', icon: '↩️', color: '#0f766e' },
  { id: 'cat-sale', name: 'Verkauf', type: 'income', icon: '🏷️', color: '#65a30d' },
  { id: 'cat-gift-income', name: 'Geschenk erhalten', type: 'income', icon: '🎁', color: '#ca8a04' },
  { id: 'cat-other-income', name: 'Sonstige Einnahmen', type: 'income', icon: '💰', color: '#6b7280' },
];

/** Muster -> Kategorie, gruppiert nach Kategorie (Reihenfolge wie im Plan). */
const RULE_DEFS: { categoryId: string; patterns: string[] }[] = [
  { categoryId: 'cat-groceries', patterns: ['ALDI', 'LIDL', 'REWE', 'EDEKA', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA', 'TEGUT'] },
  { categoryId: 'cat-drugstore', patterns: ['ROSSMANN', 'DM', 'MUELLER'] },
  { categoryId: 'cat-telecom', patterns: ['TELEKOM', 'VODAFONE', 'O2'] },
  { categoryId: 'cat-subscriptions', patterns: ['APPLE', 'NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'DISNEY'] },
  { categoryId: 'cat-mobility', patterns: ['PARKEN', 'SHELL', 'ARAL', 'ESSO', 'MVG', 'MVV'] },
  { categoryId: 'cat-travel', patterns: ['LUFTHANSA', 'RYANAIR', 'EUROWINGS', 'DB VERTRIEB', 'BOOKING', 'AIRBNB'] },
  { categoryId: 'cat-cafe', patterns: ['STARBUCKS'] },
  { categoryId: 'cat-restaurant', patterns: ['MCDONALDS', 'BURGER KING', 'LIEFERANDO', 'GASTRONOMIE'] },
  { categoryId: 'cat-clothing', patterns: ['ZALANDO', 'H M', 'ZARA', 'PRIMARK', 'OUTLET'] },
];

export function defaultCategories(now: string): Category[] {
  const counters: Record<TxType, number> = { expense: 0, income: 0 };
  return CATEGORY_DEFS.map((def) => {
    const sortOrder = counters[def.type]++;
    return {
      id: def.id,
      name: def.name,
      type: def.type,
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
      source: 'default',
      updatedAt: now,
    })),
  );
}

export function defaultSettings(now: string): Settings {
  return {
    id: 'settings',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    autoLockMinutes: 1,
    backupReminderDays: 14,
    lastBackupAt: null,
    updatedAt: now,
  };
}
