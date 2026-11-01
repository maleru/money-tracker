<script lang="ts">
  import { addMonths, currentMonthKey, monthLabel } from '../lib/dates';

  let { month, onchange }: { month: string; onchange: (m: string) => void } = $props();
</script>

<div class="switcher">
  <button type="button" class="nav" aria-label="Vorheriger Monat" onclick={() => onchange(addMonths(month, -1))}>‹</button>
  <button type="button" class="label" aria-label="Zum aktuellen Monat springen" onclick={() => onchange(currentMonthKey())}>
    {monthLabel(month)}
  </button>
  <button type="button" class="nav" aria-label="Nächster Monat" onclick={() => onchange(addMonths(month, 1))}>›</button>
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }

  .nav {
    width: 44px;
    height: 44px;
    font-size: 28px;
    color: var(--primary);
  }

  .label {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
  }
</style>
