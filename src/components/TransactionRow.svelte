<script lang="ts">
  import type { Category, Transaction } from '../lib/types';
  import AmountText from './AmountText.svelte';
  import CategoryIcon from './CategoryIcon.svelte';

  let {
    tx,
    category,
    onclick,
  }: { tx: Transaction; category: Category | undefined; onclick: () => void } = $props();

  const categoryName = $derived(category?.name ?? 'Unbekannt');
  const title = $derived(tx.merchant || categoryName);
  const subtitle = $derived(tx.note ? `${categoryName} · ${tx.note}` : categoryName);
</script>

<button type="button" class="list-item row" {onclick}>
  <CategoryIcon {category} />
  <span class="texts">
    <span class="title">{title}</span>
    <span class="sub muted">{subtitle}</span>
  </span>
  <AmountText cents={tx.amountCents} type={tx.type} />
</button>

<style>
  .row {
    background: var(--surface);
  }

  .texts {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
