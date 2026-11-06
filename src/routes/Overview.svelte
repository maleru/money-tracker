<script lang="ts">
  import AmountText from '../components/AmountText.svelte';
  import BudgetBar from '../components/BudgetBar.svelte';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import DonutChart from '../components/DonutChart.svelte';
  import MonthSwitcher from '../components/MonthSwitcher.svelte';
  import TransactionRow from '../components/TransactionRow.svelte';
  import { backupReminder } from '../lib/backup/reminder';
  import { childrenOf, categoryLabel } from '../lib/categoryTree';
  import { currentMonthKey, daysBetween, formatDate, monthKey, monthLabel, todayIso } from '../lib/dates';
  import { formatCents } from '../lib/money';
  import { plannedThisMonth } from '../lib/recurring';
  import { navigate } from '../lib/router';
  import {
    accounts,
    categories,
    categoryMap,
    recurring,
    settings,
    transactions,
  } from '../lib/state/data';
  import { backupBannerDismissed, overviewMode, selectedMonth } from '../lib/state/ui';
  import { creditCardReconciliation } from '../lib/stats/creditCard';
  import { budgetStatus } from '../lib/stats/budget';
  import { formatSavingsRate, inMonth, summarizeMonth, surplusLabel } from '../lib/stats/month';
  import { transferFlows } from '../lib/stats/transfers';
  import { SALARY_MAX_AGE_DAYS, salaryPeriods, summarizeRange } from '../lib/stats/salaryPeriod';

  const FALLBACK_COLOR = '#9ca3af';

  const reminderText = $derived(backupReminder($settings, $transactions.length, todayIso()));
  const periods = $derived(salaryPeriods($transactions, $categories, todayIso()));
  // null = automatisch letzter Zeitraum. Ändert sich die Anzahl der Zeiträume, gilt wieder der letzte.
  let pick = $state<{ count: number; index: number } | null>(null);
  const periodIndex = $derived(
    periods.length === 0
      ? 0
      : pick && pick.count === periods.length
        ? Math.min(Math.max(pick.index, 0), periods.length - 1)
        : periods.length - 1,
  );
  const period = $derived(periods[periodIndex] ?? null);
  const lastStale = $derived(periods.length > 0 && !periods[periods.length - 1].isCurrent);
  const salaryActive = $derived(
    $overviewMode === 'salary' && period !== null && !(lastStale && periodIndex === periods.length - 1),
  );
  const summary = $derived(
    salaryActive && period
      ? summarizeRange($transactions, period.start, period.end, $categories)
      : summarizeMonth($transactions, $selectedMonth, $categoryMap),
  );
  const balanceLabel = $derived(
    salaryActive ? (summary.balanceCents >= 0 ? 'Verfügbar' : 'Überzogen') : surplusLabel(summary.balanceCents),
  );
  const periodLabel = $derived(
    period === null
      ? ''
      : period.isCurrent
        ? `Seit Gehalt am ${shortDate(period.start)}`
        : `${shortDate(period.start)} – ${shortDate(period.end)}`,
  );
  const nextHint = $derived(
    salaryActive && period && period.isCurrent && period.nextExpected
      ? { days: Math.max(0, daysBetween(todayIso(), period.nextExpected)), date: shortDate(period.nextExpected) }
      : null,
  );
  const fallbackNote = $derived(
    $overviewMode !== 'salary'
      ? null
      : periods.length === 0
        ? 'Noch kein Gehalt gefunden. Weise deiner Gehaltsbuchung die Kategorie „Gehalt“ zu, dann rechnet die Übersicht vom Gehaltseingang bis zum nächsten.'
        : salaryActive
          ? null
          : `Das letzte Gehalt liegt über ${SALARY_MAX_AGE_DAYS} Tage zurück. Angezeigt wird der Kalendermonat.`,
  );

  function setPeriod(i: number): void {
    pick = { count: periods.length, index: i };
  }

  /** '2026-10-29' -> '29.10.' */
  function shortDate(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  }
  const flows = $derived(transferFlows($transactions, $selectedMonth, $categoryMap));
  const cc = $derived(creditCardReconciliation($transactions, $accounts, $selectedMonth, $categoryMap));
  const isCurrentMonth = $derived($selectedMonth === currentMonthKey());
  const planned = $derived(isCurrentMonth ? plannedThisMonth($recurring, todayIso()) : []);
  const recent = $derived(
    salaryActive && period
      ? $transactions.filter((tx) => tx.date >= period.start && tx.date <= period.end).slice(0, 5)
      : $transactions.filter((tx) => inMonth(tx, $selectedMonth)).slice(0, 5),
  );
  const segments = $derived(
    summary.expenseByCategory.map((c) => ({
      value: c.totalCents,
      color: $categoryMap.get(c.categoryId)?.color ?? FALLBACK_COLOR,
    })),
  );
  const budgetById = $derived(
    new Map(budgetStatus($transactions, $categories, $selectedMonth).map((b) => [b.categoryId, b])),
  );
  const savingsText = $derived(formatSavingsRate(summary.savingsRate));
  const hasReserves = $derived(
    flows.toReservesCents !== 0 ||
      flows.fromReservesCents !== 0 ||
      flows.investedOutCents !== 0 ||
      flows.investedInCents !== 0,
  );

  function openCategory(id: string): void {
    const month = salaryActive && period ? monthKey(period.start) : $selectedMonth;
    if (childrenOf(id, $categories, true).length > 0) {
      navigate('/category/' + encodeURIComponent(id) + '?month=' + month);
      return;
    }
    navigate('/transactions?month=' + month + '&category=' + encodeURIComponent(id));
  }
</script>

<div class="page">
  <h1>Übersicht</h1>

  {#if reminderText && !$backupBannerDismissed}
    <div class="banner" role="status">
      <span class="banner-text">{reminderText}</span>
      <button type="button" class="banner-action" onclick={() => navigate('/backup')}>Jetzt sichern</button>
      <button type="button" class="banner-close" aria-label="Ausblenden" onclick={() => backupBannerDismissed.set(true)}>✕</button>
    </div>
  {/if}

  <div class="segmented" role="group" aria-label="Zeitraum der Übersicht">
    <button
      type="button"
      class:on={$overviewMode === 'salary'}
      aria-pressed={$overviewMode === 'salary'}
      onclick={() => overviewMode.set('salary')}>Seit Gehalt</button
    >
    <button
      type="button"
      class:on={$overviewMode === 'month'}
      aria-pressed={$overviewMode === 'month'}
      onclick={() => overviewMode.set('month')}>Kalendermonat</button
    >
  </div>

  {#if fallbackNote}
    <div class="card note" role="status">{fallbackNote}</div>
  {/if}

  {#if salaryActive}
    <div class="period-switcher">
      <button
        type="button"
        aria-label="Vorheriger Zeitraum"
        disabled={periodIndex <= 0}
        onclick={() => setPeriod(periodIndex - 1)}>‹</button
      >
      <span class="period-label">{periodLabel}</span>
      <button
        type="button"
        aria-label="Nächster Zeitraum"
        disabled={periodIndex >= periods.length - 1}
        onclick={() => setPeriod(periodIndex + 1)}>›</button
      >
    </div>
  {:else}
    <MonthSwitcher month={$selectedMonth} onchange={(m) => selectedMonth.set(m)} />
  {/if}

  {#if summary.count === 0}
    <div class="card empty">
      {#if salaryActive}
        <p>Noch keine Buchungen in diesem Zeitraum</p>
      {:else}
        <p>Noch keine Buchungen im {monthLabel($selectedMonth)}</p>
      {/if}
      <div class="empty-actions">
        <button type="button" class="btn btn-primary" onclick={() => navigate('/add')}>Ausgabe erfassen</button>
        <button type="button" class="btn btn-secondary" onclick={() => navigate('/add?type=income')}>Einnahme erfassen</button>
        <button type="button" class="btn btn-secondary" onclick={() => navigate('/import')}>📥 Aus Banking-App importieren</button>
      </div>
    </div>
  {:else}
    <div class="tiles">
      <div class="card tile">
        <span class="muted label">Einnahmen</span>
        <AmountText cents={summary.incomeCents} type="income" />
      </div>
      <div class="card tile">
        <span class="muted label">Ausgaben</span>
        <AmountText cents={summary.expenseCents} type="expense" />
      </div>
      <div class="card tile">
        <span class="muted label">{balanceLabel}</span>
        <AmountText cents={summary.balanceCents} type="balance" />
        {#if summary.savingsRate !== null}
          <span class="rate" class:expense={summary.savingsRate < 0}>Sparquote {savingsText}</span>
        {/if}
      </div>
    </div>
    {#if salaryActive}
      <p class="muted tiles-hint">Verfügbar = Einnahmen minus Ausgaben seit dem Gehaltseingang, ohne Umbuchungen.</p>
      {#if nextHint}
        <p class="muted tiles-hint">
          Noch {nextHint.days} Tage bis zum nächsten Gehalt (voraussichtlich {nextHint.date})
        </p>
      {/if}
    {:else}
      <p class="muted tiles-hint">
        Überschuss = Einnahmen minus Ausgaben, ohne Umbuchungen.{#if isCurrentMonth} Laufender Monat: Einnahmen wie das Gehalt können noch fehlen.{/if}
      </p>
    {/if}

    {#if summary.expenseByCategory.length > 0}
      <section class="section">
        <h2>Ausgaben nach Kategorie</h2>
        <div class="card">
          <DonutChart {segments} centerTop={formatCents(summary.expenseCents)} centerBottom="Ausgaben" />
        </div>
        <div class="list legend">
          {#each summary.expenseByCategory as c (c.categoryId)}
            {@const cat = $categoryMap.get(c.categoryId)}
            {@const budget = salaryActive ? undefined : budgetById.get(c.categoryId)}
            <button type="button" class="list-item" class:with-budget={budget !== undefined} onclick={() => openCategory(c.categoryId)}>
              <span class="dot" style:background={cat?.color ?? FALLBACK_COLOR} aria-hidden="true"></span>
              <CategoryIcon category={cat} size={32} />
              <span class="name">{cat?.name ?? 'Unbekannt'}</span>
              <span class="amount">{formatCents(c.totalCents)}</span>
              <span class="muted share">{Math.round(c.share * 100) + ' %'}</span>
              {#if budget}
                <BudgetBar status={budget} compact />
              {/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if summary.incomeByCategory.length > 0}
      <section class="section">
        <h2>Einnahmen nach Kategorie</h2>
        <div class="list legend">
          {#each summary.incomeByCategory as c (c.categoryId)}
            {@const cat = $categoryMap.get(c.categoryId)}
            <button type="button" class="list-item" onclick={() => openCategory(c.categoryId)}>
              <span class="dot" style:background={cat?.color ?? FALLBACK_COLOR} aria-hidden="true"></span>
              <CategoryIcon category={cat} size={32} />
              <span class="name">{cat?.name ?? 'Unbekannt'}</span>
              <span class="amount">{formatCents(c.totalCents)}</span>
              <span class="muted share">{Math.round(c.share * 100) + ' %'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if salaryActive}
      <p class="muted hint note-line">Rücklagen und Kreditkarten-Abgleich findest du in der Ansicht „Kalendermonat“.</p>
    {/if}

    {#if !salaryActive && hasReserves}
      <section class="section">
        <h2>Rücklagen</h2>
        <div class="card rows">
          <div class="row-line"><span>An Rücklagen</span><span>{formatCents(flows.toReservesCents)}</span></div>
          <div class="row-line"><span>Aus Rücklagen</span><span>{formatCents(flows.fromReservesCents)}</span></div>
          <div class="row-line"><span>Netto</span><span>{formatCents(flows.netReservesCents, { sign: 'always' })}</span></div>
          <hr />
          <div class="row-line strong">
            <span>Gespart &amp; angelegt</span>
            <span>{formatCents(flows.investedNetCents, { sign: 'always' })}</span>
          </div>
        </div>
        <p class="muted hint">Umbuchungen zählen nicht als Einnahmen oder Ausgaben und sind im Überschuss nicht enthalten.</p>
      </section>
    {/if}

    {#if !salaryActive && cc.hasData}
      <section class="section">
        <h2>Kreditkarten-Abgleich</h2>
        <div class="card rows">
          <div class="row-line"><span>Abgebucht vom Girokonto</span><span>{formatCents(cc.settledCents)}</span></div>
          <div class="row-line"><span>Kartenumsätze</span><span>{formatCents(cc.cardSpentCents)}</span></div>
          <div class="row-line strong">
            <span>Differenz</span>
            <span>{formatCents(cc.diffCents, { sign: 'always' })}</span>
          </div>
        </div>
        <p class="muted hint">
          Näherung: Abbuchungen und Kartenumsätze desselben Monats. Format der Kreditkarten-App ggf. später anpassen.
        </p>
      </section>
    {/if}

    <section class="section">
      <h2>Letzte Buchungen</h2>
      <div class="list">
        {#each recent as tx (tx.id)}
          <TransactionRow
            {tx}
            category={$categoryMap.get(tx.categoryId)}
            account={$accounts.find((a) => a.id === tx.accountId)}
            onclick={() => navigate('/edit/' + tx.id)}
          />
        {/each}
      </div>
      <p class="all-link"><a href="#/transactions">Alle anzeigen →</a></p>
    </section>
  {/if}

  {#if planned.length > 0}
    <section class="section">
      <h2>Geplant diesen Monat</h2>
      <div class="list">
        {#each planned as p (p.templateId + p.date)}
          <div class="list-item planned">
            <span class="muted pdate">{formatDate(p.date)}</span>
            <span class="pname">{p.merchant || p.note || categoryLabel(p.categoryId, $categoryMap)}</span>
            <AmountText cents={p.amountCents} type={p.type} direction={p.direction} size="sm" />
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 4px 4px 4px 12px;
    border-radius: var(--radius);
    background: #fef3c7;
    color: #78350f;
    border: 1px solid #f59e0b;
  }

  .banner-text {
    flex: 1;
    min-width: 0;
  }

  .banner-action {
    font-weight: 600;
    color: #78350f;
    text-decoration: underline;
    padding: 0 8px;
  }

  .banner-close {
    color: #78350f;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .tiles-hint {
    font-size: 13px;
    margin: 0 4px 20px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    min-width: 0;
  }

  .label {
    font-size: 13px;
  }

  .rate {
    font-size: 13px;
  }

  .section {
    margin-bottom: 20px;
  }

  .legend {
    margin-top: 8px;
  }

  .with-budget {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .amount {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }

  .share {
    min-width: 44px;
    text-align: right;
    font-size: 14px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .row-line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-variant-numeric: tabular-nums;
  }

  .strong {
    font-weight: 600;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }

  .hint {
    font-size: 13px;
    margin: 8px 4px 0;
  }

  .planned {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pdate {
    flex: none;
    font-size: 13px;
    min-width: 88px;
  }

  .pname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .all-link {
    margin: 8px 4px 0;
    text-align: right;
  }

  .empty {
    text-align: center;
  }

  .empty-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 12px;
    padding: 4px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .segmented button {
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .segmented button.on {
    background: var(--primary);
    color: #fff;
  }

  .note {
    margin-bottom: 12px;
    padding: 12px;
    font-size: 14px;
  }

  .note-line {
    margin: 0 4px 16px;
  }

  .period-switcher {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }

  .period-switcher button {
    min-width: 44px;
    min-height: 44px;
    border: none;
    background: transparent;
    color: var(--primary);
    font: inherit;
    font-size: 24px;
    cursor: pointer;
  }

  .period-switcher button:disabled {
    color: var(--muted);
    opacity: 0.4;
    cursor: default;
  }

  .period-label {
    font-weight: 600;
    text-align: center;
  }
</style>
