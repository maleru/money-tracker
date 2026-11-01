import {
  FALLBACK_EXPENSE_CATEGORY,
  FALLBACK_INCOME_CATEGORY,
  FALLBACK_TRANSFER_CATEGORY,
} from './db/defaults';
import type { Category, TxType } from './types';

export const MAX_CATEGORY_NAME_LENGTH = 30;

/**
 * Liefert Fehlermeldung oder null. Name getrimmt; gleicher Name (case-insensitive) bei anderer Kategorie
 * gleichen Typs und gleicher Hauptkategorie (Geschwister) ist ungültig.
 */
export function validateCategoryName(
  name: string,
  type: TxType,
  cats: Category[],
  ownId?: string,
  parentId: string | null = null,
): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Bitte einen Namen eingeben';
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) return 'Maximal 30 Zeichen';
  const key = trimmed.toLowerCase();
  const taken = cats.some(
    (c) =>
      c.type === type &&
      (c.parentId ?? null) === (parentId ?? null) &&
      c.id !== ownId &&
      c.name.trim().toLowerCase() === key,
  );
  return taken ? 'Name bereits vergeben' : null;
}

/** Die Standard-Fallback-Kategorien dürfen weder gelöscht noch archiviert werden. */
export function isFallbackCategory(id: string): boolean {
  return id === FALLBACK_EXPENSE_CATEGORY || id === FALLBACK_INCOME_CATEGORY || id === FALLBACK_TRANSFER_CATEGORY;
}

/** null = gültig, sonst Fehlermeldung. `cat.id` ist null bei einer neuen Kategorie. */
export function validateParent(
  cat: { id: string | null; type: TxType },
  parentId: string | null,
  cats: Category[],
): string | null {
  if (parentId === null) return null;
  if (cat.id !== null && isFallbackCategory(cat.id)) return 'Standardkategorie kann nicht verschoben werden';
  if (parentId === cat.id) return 'Kategorie kann nicht ihre eigene Hauptkategorie sein';
  const parent = cats.find((c) => c.id === parentId);
  if (!parent || parent.archived) return 'Hauptkategorie nicht gefunden';
  if (parent.parentId !== null) return 'Nur eine Ebene erlaubt';
  if (parent.type !== cat.type) return 'Typ passt nicht zur Hauptkategorie';
  if (cat.id !== null && cats.some((c) => c.parentId === cat.id)) {
    return 'Kategorie hat Unterkategorien und kann nicht verschoben werden';
  }
  return null;
}

// Liste aus Plan 1.11, ergänzt um die Symbole aus E2.1.
export const CATEGORY_ICONS: string[] =
  '🛒 🍽️ ☕ 🍺 🍕 👕 👟 🧴 🏠 💡 📱 💳 🚗 ⛽ 🚆 ✈️ 🏨 🎉 🎬 🎮 📚 🏋️ ⚽ 💊 🦷 🐶 👶 🎁 💇 🛠️ 💻 📦 💼 ↩️ 🏷️ 💰 🏦 📈 🧾 ❤️ 🛡️ 🥐 🌐 🔑 🔥 📺 🔁'.split(
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
