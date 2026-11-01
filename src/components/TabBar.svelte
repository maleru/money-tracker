<script lang="ts">
  import { route } from '../lib/router';

  const SHOW_STATS = true;

  function isActive(path: string, current: string): boolean {
    if (current === path) return true;
    return path !== '/' && current.startsWith(path);
  }

  const current = $derived($route.path);
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
  <a class="add" href="#/add" aria-label="Neue Buchung">＋</a>
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
    border-radius: 50%;
    background: var(--primary);
    color: #fff;
    font-size: 30px;
    line-height: 1;
    text-decoration: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
</style>
