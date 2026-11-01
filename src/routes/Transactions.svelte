<script lang="ts">
  import AmountText from '../components/AmountText.svelte';
  import MonthSwitcher from '../components/MonthSwitcher.svelte';
  import TransactionRow from '../components/TransactionRow.svelte';
  import { selectableAccounts } from '../lib/accounts';
  import { categoryLabel } from '../lib/categoryTree';
  import { dayHeader } from '../lib/dates';
  import { filterTransactions, groupByDay, sumBalance } from '../lib/filter';
  import { navigate, route } from '../lib/router';
  import { accountMap, accounts, categoryMap, transactions } from '../lib/state/data';
  import { selectedMonth } from '../lib/state/ui';
  import type { TxType } from '../lib/types';

  // Die Query wird nur einmalig beim Mount gelesen, danach sind die Filter lokaler Zustand.
  const initialMonth = $route.query.get('month');
  if (initialMonth !== null && /^\d{4}-\d{2}$/.test(initialMonth)) {
    selectedMonth.set(initialMonth);
  }
  const initialYear = $route.query.get('year');
  const initialType = $route.query.get('type');
  const initialCategory = $route.query.get('category');
  const initialAccount = $route.query.get('account');
  const initialExact = $route.query.get('exact');

  // Ist year gesetzt, wird das ganze Jahr gefiltert (statt des Monats). ✕ entfernt den Jahresfilter.
  let year = $state<number | null>(initialYear !== null && /^\d{4}$/.test(initialYear) ? Number(initialYear) : null);
  let type = $state<'all' | TxType>(
    initialType === 'expense' || initialType === 'income' || initialType === 'transfer' ? initialType : 'all',
  );
  let categoryId = $state<string | null>(initialCategory !== null && initialCategory !== '' ? initialCategory : null);
  let categoryExact = $state(initialExact === '1');
  let accountId = $state<string | null>(initialAccount !== null && initialAccount !== '' ? initialAccount : null);
  let search = $state('');
  let allMonths = $state(false);

  const hasSearch = $derived(search.trim() !== '');
  const activeCategoryLabel = $derived(
    categoryId === null
      ? ''
      : categoryLabel(categoryId, $categoryMap) + (categoryExact ? ' (ohne Unterkategorie)' : ''),
  );

  const filtered = $derived(
    filterTransactions($transactions, $categoryMap, {
      year: hasSearch && allMonths ? null : year,
      month: hasSearch && allMonths ? null : $selectedMonth,
      type,
      categoryId,
      categoryExact,
      accountId,
      search,
    }),
  );
  const groups = $derived(groupByDay(filtered));
  const balance = $derived(sumBalance(filtered));
  const accountOptions = $derived(selectableAccounts($accounts, accountId));

  const TYPE_OPTIONS: { value: 'all' | TxType; label: string }[] = [
    { value: 'all', label: 'Alle' },
    { value: 'expense', label: 'Ausgaben' },
    { value: 'income', label: 'Einnahmen' },
    { value: 'transfer', label: 'Umbuchungen' },
  ];
</script>

<div class="page">
  <div class="header">
    <h1>Buchungen</h1>
    <button type="button" class="import-link" onclick={() => navigate('/import')}>📥 Importieren</button>
  </div>

  {#if year !== null}
    <div class="year-filter">
      <span class="year-label">Jahr {year}</span>
      <button type="button" class="year-clear" aria-label="Jahresfilter entfernen" onclick={() => (year = null)}>✕</button>
    </div>
  {:else}
    <MonthSwitcher month={$selectedMonth} onchange={(m) => selectedMonth.set(m)} />
  {/if}

  <div class="filters">
    <input type="search" placeholder="Suchen…" aria-label="Suchen" bind:value={search} />

    {#if hasSearch}
      <label class="all-months">
        <input type="checkbox" bind:checked={allMonths} />
        <span>Alle Monate durchsuchen</span>
      </label>
    {/if}

    <div class="segmented" role="group" aria-label="Typ">
      {#each TYPE_OPTIONS as option (option.value)}
        <button
          type="button"
          class:active={type === option.value}
          aria-pressed={type === option.value}
          onclick={() => (type = option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>

    <select aria-label="Konto" bind:value={accountId}>
      <option value="">Alle Konten</option>
      {#each accountOptions as a (a.id)}
        <option value={a.id}>{a.icon} {a.name}{a.archived ? ' (archiviert)' : ''}</option>
      {/each}
    </select>

    {#if categoryId !== null}
      <div>
        <button type="button" class="chip" aria-label="Kategoriefilter entfernen" onclick={() => (categoryId = null)}>
          <span>{activeCategoryLabel}</span>
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    {/if}
  </div>

  {#if groups.length === 0}
    <p class="muted empty">Keine Buchungen gefunden</p>
  {:else}
    {#each groups as group (group.date)}
      <section class="day">
        <div class="day-header">
          <span class="muted">{dayHeader(group.date)}</span>
          <AmountText cents={group.balanceCents} type="balance" size="sm" />
        </div>
        <div class="list">
          {#each group.items as tx (tx.id)}
            <TransactionRow
              {tx}
              category={$categoryMap.get(tx.categoryId)}
              account={$accountMap.get(tx.accountId)}
              onclick={() => navigate('/edit/' + tx.id)}
            />
          {/each}
        </div>
      </section>
    {/each}

    <p class="footer muted">
      <span>{filtered.length} Buchungen · </span>
      <AmountText cents={balance} type="balance" size="sm" />
    </p>
  {/if}
</div>

<style>
  .import-link {
    margin-left: auto;
    padding: 0 8px;
    font-size: 14px;
    color: var(--primary);
  }

  .year-filter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .year-label {
    font-size: 18px;
    font-weight: 600;
  }

  .year-clear {
    color: var(--muted);
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .all-months {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
  }

  .empty {
    text-align: center;
    padding: 32px 0;
  }

  .day {
    margin-bottom: 16px;
  }

  .day-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 6px;
    font-size: 14px;
  }

  .footer {
    text-align: center;
    margin: 8px 0 0;
  }
</style>
