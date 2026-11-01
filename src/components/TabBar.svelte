<script lang="ts">
  import ActionSheet, { type ActionSheetItem } from './ActionSheet.svelte';
  import { navigate, route } from '../lib/router';

  const SHOW_STATS = true;

  function isActive(path: string, current: string): boolean {
    if (current === path) return true;
    return path !== '/' && current.startsWith(path);
  }

  const current = $derived($route.path);

  let sheetOpen = $state(false);
  let addButton = $state<HTMLButtonElement | null>(null);

  const addItems: ActionSheetItem[] = [
    { label: '✍️ Buchung erfassen', onselect: () => navigate('/add') },
    { label: '📥 Importieren (Text/Screenshot)', onselect: () => navigate('/import') },
  ];

  function closeSheet(): void {
    sheetOpen = false;
    addButton?.focus();
  }

  // Bei jedem Routenwechsel (z. B. Zurück-Geste) Sheet schließen.
  $effect(() => {
    if (current) sheetOpen = false;
  });
</script>

<nav class="tabbar" aria-label="Hauptnavigation">
  <a class="tab" class:active={isActive('/', current)} href="#/" aria-current={isActive('/', current) ? 'page' : undefined}>
    <span class="icon" aria-hidden="true">🏠</span>
    <span class="label">Übersicht</span>
  </a>
  <a
    class="tab"
    class:active={isActive('/transactions', current)}
    href="#/transactions"
    aria-current={isActive('/transactions', current) ? 'page' : undefined}
  >
    <span class="icon" aria-hidden="true">📋</span>
    <span class="label">Buchungen</span>
  </a>
  <button
    type="button"
    class="add"
    aria-label="Neu: Buchung erfassen oder importieren"
    aria-haspopup="dialog"
    aria-expanded={sheetOpen}
    bind:this={addButton}
    onclick={() => (sheetOpen = true)}
  >＋</button>
  {#if SHOW_STATS}
    <a
      class="tab"
      class:active={isActive('/stats', current)}
      href="#/stats"
      aria-current={isActive('/stats', current) ? 'page' : undefined}
    >
      <span class="icon" aria-hidden="true">📊</span>
      <span class="label">Statistik</span>
    </a>
  {/if}
  <a
    class="tab"
    class:active={isActive('/settings', current)}
    href="#/settings"
    aria-current={isActive('/settings', current) ? 'page' : undefined}
  >
    <span class="icon" aria-hidden="true">⚙️</span>
    <span class="label">Einstellungen</span>
  </a>
</nav>

<ActionSheet open={sheetOpen} title="Neue Buchung" items={addItems} onclose={closeSheet} />

<style>
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    max-width: 600px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr 72px 1fr 1fr;
    align-items: center;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 56px;
    min-width: 44px;
    color: var(--muted);
    text-decoration: none;
    font-size: 11px;
  }

  .tab.active {
    color: var(--primary);
    font-weight: 600;
  }

  .icon {
    font-size: 20px;
    line-height: 1;
  }

  .add {
    justify-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    margin-top: -20px;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    background: var(--primary);
    color: #fff;
    font: inherit;
    font-size: 30px;
    line-height: 1;
    text-decoration: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
</style>
