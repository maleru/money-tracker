<script lang="ts">
  import { formatCents } from '../lib/money';
  import type { TxType } from '../lib/types';

  let { cents, type, size = 'md' }: { cents: number; type: TxType | 'balance'; size?: 'sm' | 'md' | 'lg' } = $props();

  const text = $derived.by(() => {
    if (type === 'expense') return formatCents(-Math.abs(cents));
    if (type === 'income') return formatCents(Math.abs(cents), { sign: 'always' });
    return formatCents(cents, { sign: 'always' });
  });

  const colorClass = $derived.by(() => {
    if (type === 'expense') return 'expense';
    if (type === 'income') return 'income';
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
