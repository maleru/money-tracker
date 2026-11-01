<script lang="ts">
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import { back, navigate } from '../lib/router';
  import { categories, moveCategory } from '../lib/state/data';
  import type { Category, TxType } from '../lib/types';

  const active = (type: TxType): Category[] =>
    $categories.filter((c) => c.type === type && !c.archived).sort((a, b) => a.sortOrder - b.sortOrder);

  const expenseCats = $derived(active('expense'));
  const incomeCats = $derived(active('income'));
  const archivedCats = $derived($categories.filter((c) => c.archived));

  function move(id: string, dir: -1 | 1): void {
    void moveCategory(id, dir);
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Kategorien</h1>
  </div>

  {#snippet section(title: string, list: Category[])}
    <h2 class="section-title">{title}</h2>
    <ul class="list">
      {#each list as c, i (c.id)}
        <li class="list-item row">
          <button type="button" class="main" onclick={() => navigate('/settings/categories/' + c.id)}>
            <CategoryIcon category={c} size={36} />
            <span class="name">{c.name}</span>
          </button>
          <button type="button" class="move" aria-label="Nach oben" disabled={i === 0} onclick={() => move(c.id, -1)}>▲</button>
          <button
            type="button"
            class="move"
            aria-label="Nach unten"
            disabled={i === list.length - 1}
            onclick={() => move(c.id, 1)}>▼</button
          >
        </li>
      {/each}
    </ul>
  {/snippet}

  {@render section('Ausgaben', expenseCats)}
  {@render section('Einnahmen', incomeCats)}

  <details class="archived">
    <summary>Archiviert ({archivedCats.length})</summary>
    {#if archivedCats.length > 0}
      <ul class="list">
        {#each archivedCats as c (c.id)}
          <li class="list-item row">
            <button type="button" class="main" onclick={() => navigate('/settings/categories/' + c.id)}>
              <CategoryIcon category={c} size={36} />
              <span class="name">{c.name}</span>
              <span class="muted type">{c.type === 'expense' ? 'Ausgabe' : 'Einnahme'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </details>

  <button type="button" class="btn btn-primary add" onclick={() => navigate('/settings/categories/new')}>
    ＋ Neue Kategorie
  </button>
</div>

<style>
  .section-title {
    margin: 16px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }

  .row {
    padding: 0 8px 0 0;
    gap: 0;
  }

  .main {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding: 4px 8px 4px 16px;
    text-align: left;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type {
    font-size: 13px;
  }

  .move {
    color: var(--primary);
    font-size: 16px;
  }

  .archived {
    margin-top: 16px;
  }

  .archived summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--muted);
  }

  .add {
    margin-top: 20px;
  }
</style>
