<script lang="ts">
  import { DEFAULT_ACCOUNT_ID } from '../lib/db/defaults';
  import type { Account, Category, Transaction } from '../lib/types';
  import AmountText from './AmountText.svelte';
  import CategoryIcon from './CategoryIcon.svelte';

  let {
    tx,
    category,
    account,
    onclick,
  }: { tx: Transaction; category: Category | undefined; account?: Account; onclick: () => void } = $props();

  const categoryName = $derived(category?.name ?? 'Unbekannt');
  const baseTitle = $derived(tx.merchant || categoryName);
  const title = $derived(tx.type === 'transfer' ? `🔁 ${baseTitle}` : baseTitle);
  const subtitle = $derived(tx.note ? `${categoryName} · ${tx.note}` : categoryName);
  const showAccount = $derived(account !== undefined && account.id !== DEFAULT_ACCOUNT_ID);
</script>

<button type="button" class="list-item row" {onclick}>
  <CategoryIcon {category} />
  <span class="texts">
    <span class="title">{title}</span>
    <span class="sub muted">{subtitle}</span>
    {#if showAccount && account}
      <span class="account-badge">{account.icon} {account.name}</span>
    {/if}
  </span>
  <AmountText cents={tx.amountCents} type={tx.type} direction={tx.direction} />
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

  .account-badge {
    align-self: flex-start;
    margin-top: 2px;
    font-size: 12px;
    padding: 1px 6px;
    border-radius: 8px;
    background: var(--border);
    color: var(--text);
  }
</style>
