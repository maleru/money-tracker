<script lang="ts">
  import { todayIso } from '../lib/dates';

  let { year, onchange }: { year: number; onchange: (y: number) => void } = $props();

  const currentYear = $derived(Number(todayIso().slice(0, 4)));
</script>

<div class="switcher">
  <button type="button" class="nav" aria-label="Vorheriges Jahr" onclick={() => onchange(year - 1)}>‹</button>
  <button type="button" class="label" aria-label="Zum aktuellen Jahr springen" onclick={() => onchange(currentYear)}>
    {year}
  </button>
  <button type="button" class="nav" aria-label="Nächstes Jahr" onclick={() => onchange(year + 1)}>›</button>
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
