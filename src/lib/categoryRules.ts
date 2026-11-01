import { FALLBACK_EXPENSE_CATEGORY, FALLBACK_INCOME_CATEGORY } from './db/defaults';
import type { Category, TxType } from './types';

export const MAX_CATEGORY_NAME_LENGTH = 30;

/** Liefert Fehlermeldung oder null. Name getrimmt; gleicher Name (case-insensitive) bei anderer Kategorie gleichen Typs ist ungültig. */
export function validateCategoryName(name: string, type: TxType, cats: Category[], ownId?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Bitte einen Namen eingeben';
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) return 'Maximal 30 Zeichen';
  const key = trimmed.toLowerCase();
  const taken = cats.some((c) => c.type === type && c.id !== ownId && c.name.trim().toLowerCase() === key);
  return taken ? 'Name bereits vergeben' : null;
}

/** Die Standard-Fallback-Kategorien dürfen weder gelöscht noch archiviert werden. */
export function isFallbackCategory(id: string): boolean {
  return id === FALLBACK_EXPENSE_CATEGORY || id === FALLBACK_INCOME_CATEGORY;
}

// Exakt die Liste aus Plan 1.11.
export const CATEGORY_ICONS: string[] =
  '🛒 🍽️ ☕ 🍺 🍕 👕 👟 🧴 🏠 💡 📱 💳 🚗 ⛽ 🚆 ✈️ 🏨 🎉 🎬 🎮 📚 🏋️ ⚽ 💊 🦷 🐶 👶 🎁 💇 🛠️ 💻 📦 💼 ↩️ 🏷️ 💰 🏦 📈 🧾 ❤️'.split(
    ' ',
  );

// Exakt die 12 Farben aus Plan 1.11.
export const CATEGORY_COLORS: string[] = [
  '#16a34a',
  '#ea580c',
  '#a16207',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#0284c7',
  '#7c3aed',
  '#475569',
  '#0d9488',
  '#dc2626',
  '#6b7280',
];
