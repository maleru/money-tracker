<script lang="ts">
  import AmountText from '../components/AmountText.svelte';
  import BarChart from '../components/BarChart.svelte';
  import BudgetBar from '../components/BudgetBar.svelte';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import DonutChart from '../components/DonutChart.svelte';
  import MonthSwitcher from '../components/MonthSwitcher.svelte';
  import YearSwitcher from '../components/YearSwitcher.svelte';
  import { MONTH_SHORT, todayIso } from '../lib/dates';
  import { formatCents } from '../lib/money';
  import { navigate, route } from '../lib/router';
  import { childrenOf } from '../lib/categoryTree';
  import { accounts, categories, categoryMap, transactions } from '../lib/state/data';
  import { selectedMonth } from '../lib/state/ui';
  import { budgetStatus } from '../lib/stats/budget';
  import { creditCardReconciliation } from '../lib/stats/creditCard';
  import { transferFlows } from '../lib/stats/transfers';
  import { compareCategories, summarizeYear } from '../lib/stats/year';

  const FALLBACK_COLOR = '#9ca3af';

  // Das Jahr wird nur einmalig beim Mount aus der Query gelesen, danach ist es lokaler Zustand.
  const initialYear = $route.query.get('year');
  let year = $state(
    initialYear !== null && /^\d{4}$/.test(initialYear) ? Number(initialYear) : Number(todayIso().slice(0, 4)),
  );

  const summary = $derived(summarizeYear($transactions, year, $categoryMap));
  const prevSummary = $derived(summarizeYear($transactions, year - 1, $categoryMap));
  const flows = $derived(transferFlows($transactions, String(year), $categoryMap));
  const cc = $derived(creditCardReconciliation($transactions, $accounts, String(year), $categoryMap));
  const hasReserves = $derived(
    flows.toReservesCents !== 0 ||
      flows.fromReservesCents !== 0 ||
      flows.investedOutCents !== 0 ||
      flows.investedInCents !== 0,
  );

  const bars = $derived(
    summary.months.map((m, i) => ({ label: MONTH_SHORT[i], a: m.incomeCents, b: m.expenseCents })),
  );

  const shareById = $derived(new Map(summary.expenseByCategory.map((c) => [c.categoryId, c.share])));
  const segments = $derived(
    summary.expenseByCategory.map((c) => ({
      value: c.totalCents,
      color: $categoryMap.get(c.categoryId)?.color ?? FALLBACK_COLOR,
    })),
  );
  // Nur Kategorien mit Ausgaben im gewählten Jahr (compareCategories enthält auch reine Vorjahres-Kategorien).
  const categoryRows = $derived(
    compareCategories(summary.expenseByCategory, prevSummary.expenseByCategory).filter((c) => c.curCents > 0),
  );

  const budgets = $derived(budgetStatus($transactions, $categories, $selectedMonth));

  const savingsText = $derived(
    summary.savingsRate === null
      ? '–'
      : (summary.savingsRate * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %',
  );

  interface Trend {
    text: string;
    cls: 'up' | 'down' | 'flat' | 'new';
  }

  function trend(curCents: number, prevCents: number): Trend {
    if (prevCents === 0) return { text: 'neu', cls: 'new' };
    const pct = Math.round(((curCents - prevCents) / prevCents) * 100);
    if (pct === 0) return { text: '±0 %', cls: 'flat' };
    // Mehr ausgegeben = rot, weniger = grün.
    if (pct > 0) return { text: `▲ ${pct} %`, cls: 'up' };
    return { text: `▼ ${Math.abs(pct)} %`, cls: 'down' };
  }

  function selectMonth(index: number): void {
    selectedMonth.set(summary.months[index].month);
    navigate('/');
  }

  function openCategory(id: string): void {
    if (childrenOf(id, $categories, true).length > 0) {
      navigate('/category/' + encodeURIComponent(id) + '?year=' + year);
      return;
    }
    navigate('/transactions?year=' + year + '&category=' + encodeURIComponent(id));
  }
</script>

<div class="page">
  <h1>Statistik</h1>

  <YearSwitcher {year} onchange={(y) => (year = y)} />

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
      <span class="muted label">Ersparnis</span>
      <AmountText cents={summary.balanceCents} type="balance" />
    </div>
    <div class="card tile">
      <span class="muted label">Sparquote</span>
      <span class="value" class:expense={summary.savingsRate !== null && summary.savingsRate < 0}>{savingsText}</span>
    </div>
    <div class="card tile wide">
      <span class="muted label">Ø Ausgaben/Monat</span>
      <span class="value">{formatCents(summary.avgMonthlyExpenseCents)}</span>
    </div>
  </div>
  {#if flows.investedNetCents !== 0}
    <p class="muted small davon">davon angelegt {formatCents(flows.investedNetCents)}</p>
  {/if}

  {#if hasReserves}
    <section class="section">
      <h2>Rücklagen {year}</h2>
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
    </section>
  {/if}

  {#if cc.hasData}
    <section class="section">
      <h2>Kreditkarten-Abgleich {year}</h2>
      <div class="card rows">
        <div class="row-line"><span>Abgebucht vom Girokonto</span><span>{formatCents(cc.settledCents)}</span></div>
        <div class="row-line"><span>Kartenumsätze</span><span>{formatCents(cc.cardSpentCents)}</span></div>
        <div class="row-line strong">
          <span>Differenz</span>
          <span>{formatCents(cc.diffCents, { sign: 'always' })}</span>
        </div>
      </div>
      <p class="muted hint">
        Näherung: Abbuchungen und Kartenumsätze desselben Jahres. Format der Kreditkarten-App ggf. später anpassen.
      </p>
    </section>
  {/if}

  <section class="section">
    <div class="card">
      <BarChart {bars} colorA="var(--income)" colorB="var(--expense)" onselect={selectMonth} />
      <p class="legend-line muted">
        <span class="swatch income-bg" aria-hidden="true"></span><span>Einnahmen</span>
        <span class="swatch expense-bg second" aria-hidden="true"></span><span>Ausgaben</span>
      </p>
    </div>
  </section>

  {#if categoryRows.length > 0}
    <section class="section">
      <h2>Ausgaben nach Kategorie</h2>
      <div class="card">
        <DonutChart {segments} centerTop={formatCents(summary.expenseCents)} centerBottom="Ausgaben" />
      </div>
      <div class="list legend">
        {#each categoryRows as c (c.categoryId)}
          {@const cat = $categoryMap.get(c.categoryId)}
          {@const t = trend(c.curCents, c.prevCents)}
          <button type="button" class="list-item" onclick={() => openCategory(c.categoryId)}>
            <span class="dot" style:background={cat?.color ?? FALLBACK_COLOR} aria-hidden="true"></span>
            <CategoryIcon category={cat} size={32} />
            <span class="name">{cat?.name ?? 'Unbekannt'}</span>
            <span class="amounts">
              <span class="amount">{formatCents(c.curCents)}</span>
              <span class="muted small">{Math.round((shareById.get(c.categoryId) ?? 0) * 100) + ' %'}</span>
            </span>
            <span class="trend {t.cls}">{t.text}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="section">
    <h2>Monate</h2>
    <div class="card table-card">
      <table>
        <thead>
          <tr>
            <th scope="col">Monat</th>
            <th scope="col" class="num">Einnahmen</th>
            <th scope="col" class="num">Ausgaben</th>
            <th scope="col" class="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {#each summary.months as m, i (m.month)}
            <tr>
              <th scope="row">{MONTH_SHORT[i]}</th>
              <td class="num">{formatCents(m.incomeCents)}</td>
              <td class="num">{formatCents(m.expenseCents)}</td>
              <td class="num"><AmountText cents={m.balanceCents} type="balance" size="sm" /></td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Summe</th>
            <td class="num">{formatCents(summary.incomeCents)}</td>
            <td class="num">{formatCents(summary.expenseCents)}</td>
            <td class="num"><AmountText cents={summary.balanceCents} type="balance" size="sm" /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>

  {#if summary.topMerchants.length > 0}
    <section class="section">
      <h2>Top-Händler</h2>
      <div class="list">
        {#each summary.topMerchants as m (m.merchant)}
          <div class="list-item">
            <span class="name">{m.merchant}</span>
            <span class="muted small">{m.count}×</span>
            <span class="amount">{formatCents(m.totalCents)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if budgets.length > 0}
    <section class="section">
      <h2>Budgets</h2>
      <MonthSwitcher month={$selectedMonth} onchange={(m) => selectedMonth.set(m)} />
      <div class="list">
        {#each budgets as b (b.categoryId)}
          {@const cat = $categoryMap.get(b.categoryId)}
          <div class="list-item budget-item">
            <span class="budget-head">
              <CategoryIcon category={cat} size={28} />
              <span class="name">{cat?.name ?? 'Unbekannt'}</span>
            </span>
            <BudgetBar status={b} />
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 20px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    min-width: 0;
  }

  .tile.wide {
    grid-column: 1 / -1;
  }

  .label {
    font-size: 13px;
  }

  .value {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .section {
    margin-bottom: 20px;
  }

  .legend-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 8px 0 0;
    font-size: 13px;
  }

  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .swatch.second {
    margin-left: 10px;
  }

  .income-bg {
    background: var(--income);
  }

  .expense-bg {
    background: var(--expense);
  }

  .legend {
    margin-top: 8px;
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

  .amounts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .amount {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }

  .small {
    font-size: 13px;
  }

  .trend {
    min-width: 56px;
    text-align: right;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .trend.up {
    color: var(--expense);
  }

  .trend.down {
    color: var(--income);
  }

  .trend.flat,
  .trend.new {
    color: var(--muted);
    font-weight: 500;
  }

  .table-card {
    padding: 8px;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    padding: 6px 4px;
    text-align: left;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  thead th {
    color: var(--muted);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  tbody th,
  tfoot th {
    font-weight: 500;
  }

  tfoot th,
  tfoot td {
    font-weight: 700;
    border-top: 2px solid var(--border);
  }

  .num {
    text-align: right;
  }

  .budget-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .budget-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .davon {
    margin: 4px 0 0;
    text-align: center;
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
</style>
