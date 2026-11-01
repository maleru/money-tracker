<script lang="ts">
  import { formatCents } from '../lib/money';
  import type { BudgetStatus } from '../lib/stats/budget';

  let { status, compact = false }: { status: BudgetStatus; compact?: boolean } = $props();

  const COLORS: Record<BudgetStatus['level'], string> = {
    ok: 'var(--income)',
    warn: '#f59e0b',
    over: 'var(--expense)',
  };

  const percent = $derived(Math.min(100, Math.max(0, status.ratio * 100)));
  const color = $derived(COLORS[status.level]);
  const restText = $derived(
    status.spentCents > status.budgetCents
      ? `${formatCents(status.spentCents - status.budgetCents)} überschritten`
      : `noch ${formatCents(status.budgetCents - status.spentCents)}`,
  );
  const label = $derived(`${formatCents(status.spentCents)} / ${formatCents(status.budgetCents)}, ${restText}`);
</script>

<!-- Nur <span>-Elemente, damit die Komponente auch innerhalb eines <button> gültig ist. -->
<span class="budget" class:compact>
  <span
    class="track"
    role="progressbar"
    aria-label={label}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(percent)}
  >
    <span class="fill" style:width="{percent}%" style:background={color}></span>
  </span>
  {#if !compact}
    <span class="texts">
      <span class="spent">{formatCents(status.spentCents)} / {formatCents(status.budgetCents)}</span>
      <span class="rest" class:over={status.level === 'over'}>{restText}</span>
    </span>
  {/if}
</span>

<style>
  .budget {
    display: block;
    width: 100%;
  }

  .track {
    display: block;
    height: 8px;
    border-radius: 4px;
    background: var(--border);
    overflow: hidden;
  }

  .compact .track {
    height: 4px;
    border-radius: 2px;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
  }

  .texts {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .rest {
    color: var(--muted);
    white-space: nowrap;
  }

  .rest.over {
    color: var(--expense);
    font-weight: 600;
  }
</style>
