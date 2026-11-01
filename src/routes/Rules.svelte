<script lang="ts">
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import { normalizeMerchant } from '../lib/merchant';
  import { back } from '../lib/router';
  import { categories, categoryMap, deleteRule, merchantRules, putRule } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { MerchantRule } from '../lib/types';

  const SOURCE_LABEL: Record<MerchantRule['source'], string> = {
    default: 'Standard',
    learned: 'Gelernt',
    manual: 'Manuell',
  };

  let search = $state('');
  let editingId = $state<string | null>(null);
  let editCategoryId = $state('');
  let adding = $state(false);
  let newPattern = $state('');
  let newCategoryId = $state('');
  let patternError = $state('');
  let categoryError = $state('');
  let busy = $state(false);

  const expenseCats = $derived($categories.filter((c) => c.type === 'expense' && !c.archived));
  const incomeCats = $derived($categories.filter((c) => c.type === 'income' && !c.archived));

  const visibleRules = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const list =
      q === ''
        ? $merchantRules
        : $merchantRules.filter(
            (r) =>
              r.pattern.toLowerCase().includes(q) ||
              ($categoryMap.get(r.categoryId)?.name ?? '').toLowerCase().includes(q),
          );
    return [...list].sort((a, b) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0));
  });

  function toggleEdit(r: MerchantRule): void {
    if (editingId === r.id) {
      editingId = null;
      return;
    }
    editingId = r.id;
    editCategoryId = r.categoryId;
  }

  function openAdd(): void {
    adding = true;
    newPattern = '';
    newCategoryId = '';
    patternError = '';
    categoryError = '';
  }

  async function saveEdit(r: MerchantRule): Promise<void> {
    if (busy || editCategoryId === '') return;
    busy = true;
    try {
      await putRule({ ...r, categoryId: editCategoryId, source: 'manual', updatedAt: new Date().toISOString() });
      editingId = null;
      showToast('Gespeichert');
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function remove(r: MerchantRule): Promise<void> {
    if (busy) return;
    if (!confirm(`Regel „${r.pattern}“ löschen?`)) return;
    busy = true;
    try {
      await deleteRule(r.id);
      editingId = null;
      showToast('Gelöscht');
    } catch {
      // PLAN-FRAGE: Für Löschfehler ist kein Text im Plan vorgegeben.
      showToast('Löschen fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function addRule(): Promise<void> {
    if (busy) return;
    const pattern = normalizeMerchant(newPattern);
    patternError = pattern === '' ? 'Bitte einen Händlernamen eingeben' : '';
    // PLAN-FRAGE: Für eine fehlende Kategorie beim Anlegen einer Regel ist kein Text im Plan vorgegeben.
    categoryError = newCategoryId === '' ? 'Bitte eine Kategorie wählen' : '';
    if (pattern === '' || newCategoryId === '') return;

    busy = true;
    try {
      const existing = $merchantRules.find((r) => r.pattern === pattern);
      const now = new Date().toISOString();
      const rule: MerchantRule = existing
        ? { ...existing, categoryId: newCategoryId, source: 'manual', updatedAt: now }
        : { id: crypto.randomUUID(), pattern, categoryId: newCategoryId, displayName: null, source: 'manual', updatedAt: now };
      await putRule(rule);
      adding = false;
      showToast('Gespeichert');
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

{#snippet categoryOptions()}
  <optgroup label="Ausgaben">
    {#each expenseCats as c (c.id)}<option value={c.id}>{c.icon} {c.name}</option>{/each}
  </optgroup>
  <optgroup label="Einnahmen">
    {#each incomeCats as c (c.id)}<option value={c.id}>{c.icon} {c.name}</option>{/each}
  </optgroup>
{/snippet}

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Händler-Regeln</h1>
  </div>

  <p class="muted info">
    Regeln schlagen beim Erfassen und Importieren automatisch eine Kategorie vor. Neue Regeln werden aus deinen Buchungen gelernt.
  </p>

  <div class="field">
    <input type="search" placeholder="Suchen…" aria-label="Regeln durchsuchen" autocomplete="off" bind:value={search} />
  </div>

  {#if visibleRules.length === 0}
    <p class="muted empty">{$merchantRules.length === 0 ? 'Keine Regeln vorhanden' : 'Keine Treffer'}</p>
  {:else}
    <ul class="list">
      {#each visibleRules as r (r.id)}
        {@const cat = $categoryMap.get(r.categoryId)}
        <li class="list-item item">
          <button type="button" class="main" onclick={() => toggleEdit(r)}>
            <span class="pattern">{r.pattern}</span>
            <span class="cat">
              <CategoryIcon category={cat} size={24} />
              <span class="cat-name">{cat?.name ?? 'Unbekannt'}</span>
            </span>
            <span class="badge badge-{r.source}">{SOURCE_LABEL[r.source]}</span>
          </button>
          {#if editingId === r.id}
            <div class="edit">
              <div class="field">
                <label for="rule-cat-{r.id}">Kategorie</label>
                <select id="rule-cat-{r.id}" bind:value={editCategoryId}>
                  {@render categoryOptions()}
                </select>
              </div>
              <div class="actions">
                <button type="button" class="btn btn-primary" disabled={busy || editCategoryId === ''} onclick={() => void saveEdit(r)}>
                  Speichern
                </button>
                <button type="button" class="btn btn-danger" disabled={busy} onclick={() => void remove(r)}>Löschen</button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if adding}
    <form
      class="card add-form"
      onsubmit={(e) => {
        e.preventDefault();
        void addRule();
      }}
    >
      <h2>Neue Regel</h2>
      <div class="field">
        <label for="rule-pattern">Händler enthält</label>
        <input
          id="rule-pattern"
          type="text"
          autocomplete="off"
          bind:value={newPattern}
          oninput={() => (patternError = '')}
        />
        {#if patternError}<span class="error">{patternError}</span>{/if}
      </div>
      <div class="field">
        <label for="rule-new-cat">Kategorie</label>
        <select id="rule-new-cat" bind:value={newCategoryId} onchange={() => (categoryError = '')}>
          <option value="">Kategorie wählen…</option>
          {@render categoryOptions()}
        </select>
        {#if categoryError}<span class="error">{categoryError}</span>{/if}
      </div>
      <div class="actions">
        <button type="submit" class="btn btn-primary" disabled={busy}>Speichern</button>
        <button type="button" class="btn btn-secondary" disabled={busy} onclick={() => (adding = false)}>Abbrechen</button>
      </div>
    </form>
  {:else}
    <button type="button" class="btn btn-primary add" onclick={openAdd}>＋ Regel</button>
  {/if}
</div>

<style>
  .info {
    font-size: 14px;
    margin: 0 0 12px;
  }

  .empty {
    text-align: center;
    padding: 24px 0;
  }

  .item {
    display: block;
    padding: 0;
  }

  .main {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 16px;
    text-align: left;
  }

  .pattern {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 14px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 40%;
  }

  .cat-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  .badge {
    flex: none;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--border);
    color: var(--muted);
  }

  .badge-manual {
    color: var(--primary);
    border-color: var(--primary);
  }

  .edit {
    padding: 4px 16px 16px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .add-form {
    margin-top: 16px;
  }

  .add {
    margin-top: 20px;
  }
</style>
