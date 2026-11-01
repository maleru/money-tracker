import type { Category, TxType } from './types';

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function bySortOrder(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || cmp(a.id, b.id);
}

/** parentId der Kategorie, wenn gesetzt; sonst id. Unbekannte id -> id selbst. */
export function rootCategoryId(id: string, cats: ReadonlyMap<string, Category>): string {
  const c = cats.get(id);
  if (!c) return id;
  return c.parentId ? c.parentId : c.id;
}

/** Kinder von parentId, sortiert nach sortOrder, dann id. Archivierte nur bei includeArchived. */
export function childrenOf(parentId: string, cats: readonly Category[], includeArchived = false): Category[] {
  return cats
    .filter((c) => c.parentId === parentId && (includeArchived || !c.archived))
    .sort(bySortOrder);
}

/** Hauptkategorien (parentId null) des Typs, sortiert nach sortOrder, dann id. Archivierte nur bei includeArchived. */
export function rootsOf(type: TxType, cats: readonly Category[], includeArchived = false): Category[] {
  return cats
    .filter((c) => c.type === type && !c.parentId && (includeArchived || !c.archived))
    .sort(bySortOrder);
}

export interface CategoryOption { id: string; label: string; isChild: boolean }

/**
 * Flache Optionsliste für <select>: Jede aktive Hauptkategorie des Typs (Label `${icon} ${name}`),
 * direkt gefolgt von ihren aktiven Kindern (Label `${icon} ${root.name} › ${child.name}`, isChild true).
 * Kinder archivierter Hauptkategorien erscheinen nicht.
 * keepId: Existiert die Kategorie, steht aber nicht in der Liste (archiviert), wird sie am Ende angehängt,
 * mit Label wie oben plus ' (archiviert)'.
 */
export function categoryOptions(cats: readonly Category[], type: TxType, keepId?: string | null): CategoryOption[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const out: CategoryOption[] = [];
  for (const root of rootsOf(type, cats)) {
    out.push({ id: root.id, label: `${root.icon} ${root.name}`, isChild: false });
    for (const child of childrenOf(root.id, cats)) {
      out.push({ id: child.id, label: `${child.icon} ${root.name} › ${child.name}`, isChild: true });
    }
  }
  if (keepId && !out.some((o) => o.id === keepId)) {
    const kept = byId.get(keepId);
    // Nur anhängen, wenn der Typ passt: Die keepId-Option erscheint nur in der Gruppe ihres Typs (Rules.svelte).
    if (kept && kept.type === type) {
      const parent = kept.parentId ? byId.get(kept.parentId) : undefined;
      const label = parent
        ? `${kept.icon} ${parent.name} › ${kept.name} (archiviert)`
        : `${kept.icon} ${kept.name} (archiviert)`;
      out.push({ id: kept.id, label, isChild: parent !== undefined });
    }
  }
  return out;
}

/** 'Lebensmittel › Bäckerei' für Kinder, sonst der Name; unbekannt -> 'Unbekannt'. */
export function categoryLabel(id: string, cats: ReadonlyMap<string, Category>): string {
  const c = cats.get(id);
  if (!c) return 'Unbekannt';
  const parent = c.parentId ? cats.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}
