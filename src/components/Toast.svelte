<script lang="ts">
  import { toasts } from '../lib/state/toast';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each $toasts as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(80px + env(safe-area-inset-bottom));
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    pointer-events: none;
  }

  .toast {
    max-width: 560px;
    padding: 10px 16px;
    border-radius: var(--radius);
    background: #1f2937;
    color: #fff;
    font-size: 15px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .toast.error {
    background: var(--expense);
    color: #fff;
    font-size: 15px;
  }
</style>
