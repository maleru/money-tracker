<script lang="ts">
  import { onDestroy } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { setRegistration } from '../lib/swUpdate';

  const VISIBILITY_MIN_INTERVAL_MS = 60_000;
  const PERIODIC_INTERVAL_MS = 30 * 60_000;

  let lastCheck = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let listening = false;

  // Fehler (z. B. offline) werden abgefangen, damit keine unbehandelte Rejection entsteht.
  function safeUpdate(r: ServiceWorkerRegistration): void {
    r.update().catch(() => {
      // Offline oder Netzwerkfehler: nächster Versuch folgt automatisch.
    });
  }

  function onVisibilityChange(r: ServiceWorkerRegistration): void {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastCheck < VISIBILITY_MIN_INTERVAL_MS) return;
    lastCheck = now;
    safeUpdate(r);
  }

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setRegistration(registration);
      lastCheck = Date.now();
      if (!listening) {
        listening = true;
        document.addEventListener('visibilitychange', () => onVisibilityChange(registration));
      }
      intervalId ??= setInterval(() => safeUpdate(registration), PERIODIC_INTERVAL_MS);
    },
  });

  onDestroy(() => {
    if (intervalId !== undefined) clearInterval(intervalId);
  });
</script>

{#if $needRefresh}
  <div class="banner" role="alert">
    <span>Neue Version verfügbar</span>
    <div class="actions">
      <button type="button" class="update" onclick={() => updateServiceWorker(true)}>Aktualisieren</button>
      <button type="button" class="later" onclick={() => needRefresh.set(false)}>Später</button>
    </div>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    top: calc(8px + env(safe-area-inset-top));
    left: 8px;
    right: 8px;
    z-index: 40;
    max-width: 584px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--radius);
    background: var(--primary);
    color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .update {
    padding: 0 12px;
    border-radius: 8px;
    background: #fff;
    color: var(--primary);
    font-weight: 600;
  }

  .later {
    padding: 0 8px;
    color: #fff;
  }
</style>
