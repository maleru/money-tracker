<script lang="ts" module>
  export interface ActionSheetItem {
    label: string;
    onselect: () => void;
  }
</script>

<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    items: ActionSheetItem[];
    onclose: () => void;
  }

  let { open, title, items, onclose }: Props = $props();

  let sheetEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (open && sheetEl) {
      sheetEl.querySelector<HTMLButtonElement>('button')?.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent): void {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  function choose(item: ActionSheetItem): void {
    onclose();
    item.onselect();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <button type="button" class="backdrop" aria-label="Schließen" tabindex="-1" onclick={onclose}></button>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="action-sheet-title" bind:this={sheetEl}>
    <h2 id="action-sheet-title" class="title">{title}</h2>
    <div class="items">
      {#each items as item (item.label)}
        <button type="button" class="item" onclick={() => choose(item)}>{item.label}</button>
      {/each}
    </div>
    <button type="button" class="cancel" onclick={onclose}>Abbrechen</button>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    border: none;
    padding: 0;
    background: rgba(0, 0, 0, 0.4);
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 21;
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
    background: var(--surface);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.25);
  }

  .title {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    color: var(--muted);
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .item,
  .cancel {
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    border-radius: var(--radius);
    font: inherit;
    font-size: 17px;
    cursor: pointer;
  }

  .item {
    border: 1px solid var(--border);
    background: var(--surface);
    color: inherit;
    text-align: left;
  }

  .cancel {
    margin-top: 4px;
    border: none;
    background: var(--border);
    color: inherit;
    font-weight: 600;
  }
</style>
