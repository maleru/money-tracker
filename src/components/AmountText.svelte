<script lang="ts">
  import { formatCents } from '../lib/money';
  import type { TxDirection, TxType } from '../lib/types';

  let {
    cents,
    type,
    direction = null,
    size = 'md',
  }: { cents: number; type: TxType | 'balance'; direction?: TxDirection | null; size?: 'sm' | 'md' | 'lg' } = $props();

  const text = $derived.by(() => {
    if (type === 'expense') return formatCents(-Math.abs(cents));
    if (type === 'income') return formatCents(Math.abs(cents), { sign: 'always' });
    if (type === 'transfer') {
      return formatCents(direction === 'in' ? Math.abs(cents) : -Math.abs(cents), { sign: 'always' });
    }
    return formatCents(cents, { sign: 'always' });
  });

  const colorClass = $derived.by(() => {
    if (type === 'expense') return 'expense';
    if (type === 'income') return 'income';
    if (type === 'transfer') return 'transfer';
    if (cents > 0) return 'income';
    if (cents < 0) return 'expense';
    return 'muted';
  });
</script>

<span class="amount {colorClass} {size}">{text}</span>

<style>
  .amount {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }

  .transfer {
    color: var(--muted);
  }

  .sm {
    font-size: 14px;
  }

  .md {
    font-size: 17px;
  }

  .lg {
    font-size: 24px;
  }
</style>
