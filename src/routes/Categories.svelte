<script lang="ts">
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import { childrenOf, rootsOf, categoryLabel } from '../lib/categoryTree';
  import { back, navigate } from '../lib/router';
  import { categories, categoryMap, moveCategory } from '../lib/state/data';
  import type { Category, TxType } from '../lib/types';

  const TYPE_LABELS: Record<TxType, string> = {
    expense: 'Ausgabe',
    income: 'Einnahme',
    transfer: 'Umbuchung',
  };

  const expenseRoots = $derived(rootsOf('expense', $categories));
  const incomeRoots = $derived(rootsOf('income', $categories));
  const transferRoots = $derived(rootsOf('transfer', $categories));
  const archivedCats = $derived($categories.filter((c) => c.archived));

  function move(id: string, dir: -1 | 1): void {
    void moveCategory(id, dir);
  }

  function edit(id: string): void {
    navigate('/settings/categories/' + id);
  }

  function addChild(parentId: string): void {
    navigate('/settings/categories/new?parent=' + encodeURIComponent(parentId));
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Kategorien</h1>
  </div>

  {#snippet childRow(child: Category, index: number, count: number)}
    <li class="list-item row child">
      <button type="button" class="main" onclick={() => edit(child.id)}>
        <CategoryIcon category={child} size={28} />
        <span class="name">{child.name}</span>
      </button>
      <button type="button" class="move" aria-label="Nach oben" disabled={index === 0} onclick={() => move(child.id, -1)}>▲</button>
      <button
        type="button"
        class="move"
        aria-label="Nach unten"
        disabled={index === count - 1}
        onclick={() => move(child.id, 1)}>▼</button
      >
    </li>
  {/snippet}

  {#snippet section(title: string, roots: Category[])}
    <h2 class="section-title">{title}</h2>
    <ul class="list">
      {#each roots as c, i (c.id)}
        {@const kids = childrenOf(c.id, $categories)}
        <li class="list-item row">
          <button type="button" class="main" onclick={() => edit(c.id)}>
            <CategoryIcon category={c} size={36} />
            <span class="name">{c.name}</span>
          </button>
          <button
            type="button"
            class="move"
            aria-label="Unterkategorie hinzufügen"
            onclick={() => addChild(c.id)}>＋</button
          >
          <button type="button" class="move" aria-label="Nach oben" disabled={i === 0} onclick={() => move(c.id, -1)}>▲</button>
          <button
            type="button"
            class="move"
            aria-label="Nach unten"
            disabled={i === roots.length - 1}
            onclick={() => move(c.id, 1)}>▼</button
          >
        </li>
        {#each kids as child, j (child.id)}
          {@render childRow(child, j, kids.length)}
        {/each}
      {/each}
    </ul>
  {/snippet}

  {@render section('Ausgaben', expenseRoots)}
  {@render section('Einnahmen', incomeRoots)}
  {@render section('Umbuchungen', transferRoots)}

  <details class="archived">
    <summary>Archiviert ({archivedCats.length})</summary>
    {#if archivedCats.length > 0}
      <ul class="list">
        {#each archivedCats as c (c.id)}
          <li class="list-item row">
            <button type="button" class="main" onclick={() => edit(c.id)}>
              <CategoryIcon category={c} size={36} />
              <span class="name">{categoryLabel(c.id, $categoryMap)}</span>
              <span class="muted type">{TYPE_LABELS[c.type]}</span>
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

  .child {
    padding-left: 32px;
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

  .child .main {
    padding-left: 0;
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
