<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import {
    CATEGORY_COLORS,
    CATEGORY_ICONS,
    isFallbackCategory,
    validateCategoryName,
  } from '../lib/categoryRules';
  import { centsToInput, parseAmountToCents } from '../lib/money';
  import { back, navigate, route } from '../lib/router';
  import { categories, categoryUsage, deleteCategory, saveCategory } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { Category, TxType } from '../lib/types';

  let { id }: { id?: string } = $props();

  // Bearbeiten-Modus: Die Kategorie wird einmalig gesucht (kein reaktiver Zugriff nötig).
  const editId = untrack(() => id);
  const existing: Category | undefined = editId ? get(categories).find((c) => c.id === editId) : undefined;
  const isEdit = editId !== undefined;
  const notFound = isEdit && !existing;

  const initialType: TxType = existing
    ? existing.type
    : untrack(() => $route.query.get('type')) === 'income'
      ? 'income'
      : 'expense';

  const usage = existing ? categoryUsage(existing.id) : null;
  const inUse = usage !== null && (usage.transactions > 0 || usage.recurring > 0);
  const fallback = existing ? isFallbackCategory(existing.id) : false;

  let type = $state<TxType>(initialType);
  let name = $state(existing?.name ?? '');
  let icon = $state(existing?.icon ?? '📦');
  let color = $state(existing?.color ?? CATEGORY_COLORS[0]);
  let budget = $state(existing?.monthlyBudgetCents != null ? centsToInput(existing.monthlyBudgetCents) : '');

  let nameError = $state('');
  let budgetError = $state('');
  let busy = $state(false);

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
    parentId: existing?.parentId ?? null,
    icon,
    color,
    archived: false,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: '',
  });

  async function save(): Promise<void> {
    if (busy || notFound) return;

    nameError = validateCategoryName(name, type, get(categories), existing?.id) ?? '';

    let budgetCents: number | null = null;
    budgetError = '';
    if (type === 'expense' && budget.trim() !== '') {
      budgetCents = parseAmountToCents(budget);
      if (budgetCents === null) budgetError = 'Ungültiger Betrag';
    }
    if (nameError !== '' || budgetError !== '') return;

    busy = true;
    try {
      const fields = { name: name.trim(), icon, color, monthlyBudgetCents: type === 'expense' ? budgetCents : null };
      if (existing) {
        await saveCategory({ ...existing, ...fields });
      } else {
        const sameType = get(categories).filter((c) => c.type === type);
        const sortOrder = sameType.length > 0 ? Math.max(...sameType.map((c) => c.sortOrder)) + 1 : 0;
        await saveCategory({
          id: crypto.randomUUID(),
          type,
          parentId: null,
          ...fields,
          archived: false,
          sortOrder,
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

      <div class="field">
        <span class="label">Typ</span>
        {#if isEdit}
          <span>{type === 'expense' ? 'Ausgabe' : 'Einnahme'}</span>
        {:else}
          <div class="segmented" role="group" aria-label="Typ">
            <button type="button" class:active={type === 'expense'} onclick={() => (type = 'expense')}>Ausgabe</button>
            <button type="button" class:active={type === 'income'} onclick={() => (type = 'income')}>Einnahme</button>
          </div>
        {/if}
      </div>

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

      {#if type === 'expense'}
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
              <!-- Archivierte Kategorie: Wiederherstellen ist immer möglich, unabhängig von der Verwendung. -->
              <button type="button" class="btn btn-secondary" disabled={busy} onclick={() => void setArchived(false)}>
                Wiederherstellen
              </button>
            {/if}
            {#if !inUse}
              <button type="button" class="btn btn-danger" disabled={busy} onclick={() => void remove()}>Löschen</button>
            {:else}
              <!-- PLAN-FRAGE: Bei Verwendung nur durch Wiederkehrendes (0 Buchungen) lautet der Hinweis „Wird von 0 Buchungen verwendet“; der Plan nennt nur Buchungen. -->
              <p class="muted note">
                Wird von {usage?.transactions ?? 0} Buchungen verwendet und kann daher nur archiviert werden. Archivierte Kategorien erscheinen nicht mehr bei der Erfassung, bleiben aber in Auswertungen erhalten.
              </p>
              {#if !existing.archived}
                <button type="button" class="btn btn-secondary" disabled={busy} onclick={() => void setArchived(true)}>
                  Archivieren
                </button>
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
