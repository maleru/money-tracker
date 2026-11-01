<script lang="ts">
  import type { Category } from '../lib/types';

  let { category, size = 40 }: { category: Category | undefined; size?: number } = $props();

  const UNKNOWN_COLOR = '#6b7280';

  // Kategoriefarbe ist #RRGGBB; Suffix "33" entspricht 20 % Deckkraft.
  const background = $derived((category?.color ?? UNKNOWN_COLOR) + '33');
  const emoji = $derived(category?.icon ?? '❓');
</script>

<span
  class="icon"
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.5)}px"
  style:background
  aria-hidden="true">{emoji}</span
>

<style>
  .icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    line-height: 1;
  }
</style>
