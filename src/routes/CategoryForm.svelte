<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import {
    CATEGORY_COLORS,
    CATEGORY_ICONS,
    isFallbackCategory,
    validateCategoryName,
    validateParent,
  } from '../lib/categoryRules';
  import { childrenOf, rootsOf } from '../lib/categoryTree';
  import { centsToInput, parseAmountToCents } from '../lib/money';
  import { back, navigate, route } from '../lib/router';
  import { categories, categoryUsage, deleteCategory, saveCategory } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { Category, TxType } from '../lib/types';

  let { id }: { id?: string } = $props();

  const TYPE_LABELS: Record<TxType, string> = {
    expense: 'Ausgabe',
    income: 'Einnahme',
    transfer: 'Umbuchung',
  };

  /** Nächste sortOrder unter Geschwistern (gleicher Typ, gleicher parentId): 1 + max, sonst 0. */
  function nextSortOrder(cats: Category[], type: TxType, parentId: string | null, ownId: string | null): number {
    const siblings = cats.filter(
      (c) => c.type === type && (c.parentId ?? null) === parentId && c.id !== ownId,
    );
    return siblings.length > 0 ? Math.max(...siblings.map((c) => c.sortOrder)) + 1 : 0;
  }

  // Bearbeiten-Modus: Die Kategorie wird einmalig gesucht (kein reaktiver Zugriff nötig).
  const editId = untrack(() => id);
  const existing: Category | undefined = editId ? get(categories).find((c) => c.id === editId) : undefined;
  const isEdit = editId !== undefined;
  const notFound = isEdit && !existing;

  // Neue Unterkategorie: parent aus der Route-Query, nur wenn es eine aktive Hauptkategorie ist.
  const parentParam = untrack(() => $route.query.get('parent'));
  const presetParent: Category | undefined =
    !isEdit && parentParam
      ? get(categories).find((c) => c.id === parentParam && c.parentId === null && !c.archived)
      : undefined;

  const initialType: TxType = existing
    ? existing.type
    : presetParent
      ? presetParent.type
      : untrack(() => $route.query.get('type')) === 'income'
        ? 'income'
        : 'expense';

  const usage = existing ? categoryUsage(existing.id) : null;
  const inUse = usage !== null && (usage.transactions > 0 || usage.recurring > 0);
  const hasChildren = usage !== null && usage.children > 0;
  const fallback = existing ? isFallbackCategory(existing.id) : false;
  const ownParentId: string | null = existing?.parentId ?? null;

  const activeChildCount = $derived(existing ? childrenOf(existing.id, $categories).length : 0);
  const parentArchived = $derived(
    ownParentId !== null ? ($categories.find((c) => c.id === ownParentId)?.archived ?? false) : false,
  );

  let type = $state<TxType>(initialType);
  let parentSel = $state<string>(existing?.parentId ?? presetParent?.id ?? '');
  const parentId = $derived<string | null>(parentSel === '' ? null : parentSel);
  let name = $state(existing?.name ?? '');
  let icon = $state(existing?.icon ?? '📦');
  let color = $state(existing?.color ?? CATEGORY_COLORS[0]);
  let budget = $state(existing?.monthlyBudgetCents != null ? centsToInput(existing.monthlyBudgetCents) : '');

  let nameError = $state('');
  let parentError = $state('');
  let budgetError = $state('');
  let busy = $state(false);

  // Hauptkategorien des Typs ohne die eigene Kategorie. Eine aktuell gewählte, archivierte Hauptkategorie bleibt sichtbar.
  const parentOptions = $derived.by(() => {
    const list = rootsOf(type, $categories).filter((c) => c.id !== existing?.id);
    if (parentId !== null && !list.some((c) => c.id === parentId)) {
      const kept = $categories.find((c) => c.id === parentId);
      if (kept) list.push(kept);
    }
    return list;
  });

  onMount(() => {
    if (notFound) {
      showToast('Kategorie nicht gefunden');
      navigate('/settings/categories');
    }
  });

  const preview = $derived<Category>({
    id: existing?.id ?? 'preview',
    name: name.trim() === '' ? 'Name' : name.trim(),
    type,
    parentId,
    icon,
    color,
    archived: false,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: '',
  });

  function setType(t: TxType): void {
    if (t === type) return;
    type = t;
    // Ein Typwechsel löst die Hauptkategorie immer auf.
    parentSel = '';
    parentError = '';
  }

  async function save(): Promise<void> {
    if (busy || notFound) return;

    const cats = get(categories);
    nameError = validateCategoryName(name, type, cats, existing?.id, parentId) ?? '';
    parentError = validateParent({ id: existing?.id ?? null, type }, parentId, cats) ?? '';

    const showBudget = type === 'expense' && parentId === null;
    let budgetCents: number | null = null;
    budgetError = '';
    if (showBudget && budget.trim() !== '') {
      budgetCents = parseAmountToCents(budget);
      if (budgetCents === null) budgetError = 'Ungültiger Betrag';
    }
    if (nameError !== '' || parentError !== '' || budgetError !== '') return;

    busy = true;
    try {
      const fields = {
        name: name.trim(),
        icon,
        color,
        parentId,
        monthlyBudgetCents: showBudget ? budgetCents : null,
      };
      if (existing) {
        const parentChanged = ownParentId !== parentId;
        const sortOrder = parentChanged ? nextSortOrder(cats, type, parentId, existing.id) : existing.sortOrder;
        await saveCategory({ ...existing, ...fields, sortOrder });
      } else {
        await saveCategory({
          id: crypto.randomUUID(),
          type,
          ...fields,
          archived: false,
          sortOrder: nextSortOrder(cats, type, parentId, null),
          updatedAt: new Date().toISOString(),
        });
      }
      showToast('Gespeichert');
      back();
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (busy || !existing) return;
    if (!confirm('Kategorie wirklich löschen?')) return;
    busy = true;
    try {
      await deleteCategory(existing.id);
      showToast('Gelöscht');
      back();
    } catch {
      // PLAN-FRAGE: Für Löschfehler ist kein Text im Plan vorgegeben.
      showToast('Löschen fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function setArchived(archived: boolean): Promise<void> {
    if (busy || !existing) return;
    // Sperren aus E2.5: Hauptkategorie mit aktiven Kindern nicht archivieren, Kind unter archivierter Hauptkategorie nicht wiederherstellen.
    if (archived && activeChildCount > 0) return;
    if (!archived && parentArchived) return;
    busy = true;
    try {
      await saveCategory({ ...existing, archived });
      // PLAN-FRAGE: Toast-Texte für Archivieren/Wiederherstellen sind im Plan nicht vorgegeben.
      showToast(archived ? 'Archiviert' : 'Wiederhergestellt');
      back();
    } catch {
      // PLAN-FRAGE: Für diesen Fehlerfall ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>{isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</h1>
  </div>

  {#if !notFound}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div class="preview card">
        <CategoryIcon category={preview} size={48} />
        <span class="preview-name">{preview.name}</span>
      </div>

      <div class="field">
        <label for="cat-name">Name</label>
        <input
          id="cat-name"
          type="text"
          autocomplete="off"
          bind:value={name}
          oninput={() => (nameError = '')}
        />
        {#if nameError}<span class="error">{nameError}</span>{/if}
      </div>

      {#if presetParent}
        <p class="muted note">Unterkategorie von {presetParent.icon} {presetParent.name}</p>
      {:else}
        <div class="field">
          <span class="label">Typ</span>
          {#if isEdit}
            <!-- PLAN-FRAGE: E2.5 nennt einen Typ-Schalter mit drei Buttons, aber nicht, ob der Typ einer bestehenden Kategorie geändert werden darf. Ein Wechsel würde die Typ-Prüfung bestehender Buchungen verletzen. Daher hier nur die Anzeige. -->
            <span>{TYPE_LABELS[type]}</span>
          {:else}
            <div class="segmented" role="group" aria-label="Typ">
              <button type="button" class:active={type === 'expense'} onclick={() => setType('expense')}>Ausgabe</button>
              <button type="button" class:active={type === 'income'} onclick={() => setType('income')}>Einnahme</button>
              <button type="button" class:active={type === 'transfer'} onclick={() => setType('transfer')}>Umbuchung</button>
            </div>
          {/if}
        </div>
      {/if}

      {#if !fallback}
        <div class="field">
          <label for="cat-parent">Hauptkategorie</label>
          <select
            id="cat-parent"
            class="select"
            bind:value={parentSel}
            disabled={busy || hasChildren}
            onchange={() => (parentError = '')}
          >
            <option value="">— keine (ist Hauptkategorie) —</option>
            {#each parentOptions as p (p.id)}
              <option value={p.id}>{p.icon} {p.name}{p.archived ? ' (archiviert)' : ''}</option>
            {/each}
          </select>
          {#if hasChildren}<span class="muted note">Hat Unterkategorien – kann nicht verschoben werden</span>{/if}
          {#if parentError}<span class="error">{parentError}</span>{/if}
        </div>
      {/if}

      <div class="field">
        <span class="label">Icon</span>
        <div class="icon-grid">
          {#each CATEGORY_ICONS as emoji (emoji)}
            <button
              type="button"
              class="icon-btn"
              class:active={emoji === icon}
              aria-label={'Icon ' + emoji}
              aria-pressed={emoji === icon}
              onclick={() => (icon = emoji)}>{emoji}</button
            >
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="label">Farbe</span>
        <div class="color-grid">
          {#each CATEGORY_COLORS as c (c)}
            <button
              type="button"
              class="color-btn"
              class:active={c === color}
              style:background={c}
              aria-label={'Farbe ' + c}
              aria-pressed={c === color}
              onclick={() => (color = c)}
            ></button>
          {/each}
        </div>
      </div>

      {#if type === 'expense' && parentId === null}
        <div class="field">
          <label for="cat-budget">Monatsbudget (optional)</label>
          <div class="budget-row">
            <input
              id="cat-budget"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0,00"
              bind:value={budget}
              oninput={() => (budgetError = '')}
            />
            <span class="suffix">€</span>
          </div>
          {#if budgetError}<span class="error">{budgetError}</span>{/if}
          <span class="muted note">Wird in der Statistik angezeigt</span>
        </div>
      {/if}

      <div class="actions">
        <button type="submit" class="btn btn-primary" disabled={busy}>Speichern</button>

        {#if existing}
          {#if fallback}
            <p class="muted note">Standardkategorie – kann nicht gelöscht oder archiviert werden.</p>
          {:else}
            {#if existing.archived}
              <!-- Archivierte Kategorie: Wiederherstellen ist immer möglich, unabhängig von der Verwendung. Ausnahme: Kind unter archivierter Hauptkategorie. -->
              <button
                type="button"
                class="btn btn-secondary"
                disabled={busy || parentArchived}
                onclick={() => void setArchived(false)}
              >
                Wiederherstellen
              </button>
              {#if parentArchived}
                <p class="muted note">Zuerst die Hauptkategorie wiederherstellen</p>
              {/if}
            {/if}
            {#if hasChildren}
              <p class="muted note">Unterkategorien vorhanden (auch archivierte) – zuerst löschen oder verschieben</p>
            {:else if !inUse}
              <button type="button" class="btn btn-danger" disabled={busy} onclick={() => void remove()}>Löschen</button>
            {:else}
              <!-- PLAN-FRAGE: Bei Verwendung nur durch Wiederkehrendes (0 Buchungen) lautet der Hinweis „Wird von 0 Buchungen verwendet“; der Plan nennt nur Buchungen. -->
              <p class="muted note">
                Wird von {usage?.transactions ?? 0} Buchungen verwendet und kann daher nur archiviert werden. Archivierte Kategorien erscheinen nicht mehr bei der Erfassung, bleiben aber in Auswertungen erhalten.
              </p>
              {#if !existing.archived}
                {#if activeChildCount > 0}
                  <p class="muted note">Zuerst die Unterkategorien archivieren oder verschieben</p>
                {:else}
                  <button type="button" class="btn btn-secondary" disabled={busy} onclick={() => void setArchived(true)}>
                    Archivieren
                  </button>
                {/if}
              {/if}
            {/if}
          {/if}
        {/if}
      </div>
    </form>
  {/if}
</div>

<style>
  .preview {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .preview-name {
    font-size: 18px;
    font-weight: 600;
  }

  .select {
    font-size: 16px;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }

  .icon-btn {
    min-width: 0;
    font-size: 22px;
    background: var(--surface);
    border: 2px solid transparent;
    border-radius: 10px;
  }

  .icon-btn.active {
    border-color: var(--primary);
    background: var(--border);
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
    justify-items: center;
  }

  .color-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 3px solid var(--surface);
    box-shadow: 0 0 0 1px var(--border);
  }

  .color-btn.active {
    box-shadow: 0 0 0 3px var(--text);
  }

  .budget-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .suffix {
    font-size: 20px;
    color: var(--muted);
  }

  .note {
    font-size: 14px;
    margin: 0;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
</style>
