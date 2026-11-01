<script lang="ts">
  let {
    segments,
    centerTop,
    centerBottom,
  }: {
    segments: { value: number; color: string }[];
    centerTop: string;
    centerBottom: string;
  } = $props();

  const R = 45;
  const C = 2 * Math.PI * R;

  const total = $derived(segments.reduce((sum, s) => sum + s.value, 0));

  const arcs = $derived.by(() => {
    let offset = 0;
    return segments.map((s) => {
      const len = total === 0 ? 0 : (s.value / total) * C;
      const arc = { color: s.color, len, offset };
      offset += len;
      return arc;
    });
  });
</script>

<svg viewBox="0 0 120 120" role="img" aria-label="{centerBottom}: {centerTop}">
  <g transform="rotate(-90 60 60)">
    {#if total === 0}
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--border)" stroke-width="18" />
    {:else}
      {#each arcs as arc, i (i)}
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={arc.color}
          stroke-width="18"
          stroke-dasharray="{arc.len} {C - arc.len}"
          stroke-dashoffset={-arc.offset}
        />
      {/each}
    {/if}
  </g>
  <text x="60" y="58" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">{centerTop}</text>
  <text x="60" y="72" text-anchor="middle" font-size="8" fill="var(--muted)">{centerBottom}</text>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    max-width: 240px;
    margin: 0 auto;
  }
</style>
