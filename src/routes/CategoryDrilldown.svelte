<script lang="ts">
  import AmountText from '../components/AmountText.svelte';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import { monthLabel } from '../lib/dates';
  import { formatCents } from '../lib/money';
  import { back, navigate, route } from '../lib/router';
  import { subcategoryBreakdown } from '../lib/stats/month';
  import { categoryMap, transactions } from '../lib/state/data';
  import { selectedMonth } from '../lib/state/ui';

  let { id = '' }: { id?: string } = $props();

  // Query wird beim Mount gelesen; App.svelte erzeugt die Seite bei Query-Wechsel neu.
  const monthParam = $route.query.get('month');
  const yearParam = $route.query.get('year');
  const validMonth = monthParam !== null && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;
  const validYear = validMonth === null && yearParam !== null && /^\d{4}$/.test(yearParam) ? yearParam : null;

  // Ohne month/year gilt der ausgewählte Monat der Übersicht.
  const periodQuery = $derived(
    validYear !== null ? `year=${encodeURIComponent(validYear)}` : `month=${encodeURIComponent(validMonth ?? $selectedMonth)}`,
  );
  const period = $derived(validYear ?? validMonth ?? $selectedMonth);
  const subtitle = $derived(validYear !== null ? `Jahr ${validYear}` : monthLabel(period));

  const category = $derived($categoryMap.get(id));
  const periodTx = $derived($transactions.filter((tx) => tx.date.startsWith(period + '-')));
  const rows = $derived(subcategoryBreakdown(periodTx, id, $categoryMap));
  const total = $derived(rows.reduce((sum, r) => sum + r.totalCents, 0));

  function rowLabel(categoryId: string): string {
    if (categoryId === id) return 'Ohne Unterkategorie';
    return $categoryMap.get(categoryId)?.name ?? 'Unbekannt';
  }

  function rowIconCategory(categoryId: string) {
    return categoryId === id ? category : $categoryMap.get(categoryId);
  }

  function openRow(rowId: string): void {
    const exact = rowId === id ? '&exact=1' : '';
    navigate(`/transactions?${periodQuery}&category=${encodeURIComponent(rowId)}${exact}`);
  }

  function openAll(): void {
    navigate(`/transactions?${periodQuery}&category=${encodeURIComponent(id)}`);
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>{category ? `${category.icon} ${category.name}` : 'Unbekannte Kategorie'}</h1>
  </div>

  <p class="muted subtitle">{subtitle}</p>

  {#if !category}
    <p class="muted empty">Kategorie nicht gefunden</p>
  {:else if rows.length === 0}
    <p class="muted empty">Keine Buchungen in diesem Zeitraum</p>
  {:else}
    <div class="summary">
      <span class="muted">Summe</span>
      <AmountText cents={total} type={category.type} size="lg" />
    </div>

    <div class="list">
      {#each rows as row (row.categoryId)}
        <button type="button" class="list-item row" onclick={() => openRow(row.categoryId)}>
          <CategoryIcon category={rowIconCategory(row.categoryId)} />
          <span class="name">{rowLabel(row.categoryId)}</span>
          <span class="right">
            <span>{formatCents(row.totalCents)}</span>
            <span class="muted share">{Math.round(row.share * 100)} %</span>
          </span>
        </button>
      {/each}
    </div>

    <button type="button" class="btn btn-secondary all" onclick={openAll}>Alle Buchungen anzeigen</button>
  {/if}
</div>

<style>
  .subtitle {
    margin: -8px 0 12px;
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 12px;
  }

  .row {
    background: var(--surface);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .share {
    font-size: 13px;
  }

  .all {
    width: 100%;
    margin-top: 16px;
  }

  .empty {
    text-align: center;
    padding: 32px 0;
  }
</style>
