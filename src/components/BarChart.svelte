<script lang="ts">
  import { MONTH_SHORT } from '../lib/dates';
  import { formatCents } from '../lib/money';

  let {
    bars,
    colorA,
    colorB,
    onselect,
  }: {
    bars: { label: string; a: number; b: number }[];
    colorA: string;
    colorB: string;
    onselect?: (index: number) => void;
  } = $props();

  const WIDTH = 360;
  const HEIGHT = 180;
  const BASE_Y = 156; // Grundlinie, darunter die Labels
  const CHART_H = 140; // maximale Balkenhöhe
  const GROUP_W = WIDTH / 12;
  const BAR_W = 10;
  const BAR_GAP = 2;

  const max = $derived(bars.reduce((m, b) => Math.max(m, b.a, b.b), 0));

  function barHeight(value: number): number {
    if (max === 0 || value <= 0) return 0;
    return Math.max(1, (value / max) * CHART_H);
  }

  const groups = $derived(
    bars.map((b, i) => {
      const cx = i * GROUP_W + GROUP_W / 2;
      const ha = barHeight(b.a);
      const hb = barHeight(b.b);
      return {
        index: i,
        label: b.label,
        x: i * GROUP_W,
        cx,
        xa: cx - BAR_GAP / 2 - BAR_W,
        xb: cx + BAR_GAP / 2,
        ha,
        hb,
        ya: BASE_Y - ha,
        yb: BASE_Y - hb,
        text: `${b.label}: Einnahmen ${formatCents(b.a)}, Ausgaben ${formatCents(b.b)}`,
      };
    }),
  );

  const halfY = $derived(BASE_Y - CHART_H / 2);

  function keydown(e: KeyboardEvent, i: number): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect?.(i);
    }
  }
</script>

<svg viewBox="0 0 {WIDTH} {HEIGHT}" role="group" aria-label="Einnahmen und Ausgaben pro Monat">
  <line x1="0" y1={BASE_Y} x2={WIDTH} y2={BASE_Y} stroke="var(--border)" stroke-width="1" />
  {#if max > 0}
    <line x1="0" y1={halfY} x2={WIDTH} y2={halfY} stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" />
    <text x="2" y={halfY - 3} font-size="8" fill="var(--muted)">{formatCents(Math.round(max / 2))}</text>
  {/if}

  {#each groups as g (g.index)}
    <g
      class="group"
      role="button"
      tabindex="0"
      aria-label={g.text}
      onclick={() => onselect?.(g.index)}
      onkeydown={(e) => keydown(e, g.index)}
    >
      <rect x={g.x} y="0" width={GROUP_W} height={HEIGHT} fill="transparent" />
      {#if g.ha > 0}
        <rect x={g.xa} y={g.ya} width={BAR_W} height={g.ha} rx="1.5" fill={colorA} />
      {/if}
      {#if g.hb > 0}
        <rect x={g.xb} y={g.yb} width={BAR_W} height={g.hb} rx="1.5" fill={colorB} />
      {/if}
      <text x={g.cx} y="172" text-anchor="middle" font-size="9" fill="var(--muted)">{g.label || MONTH_SHORT[g.index]}</text>
    </g>
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
  }

  .group {
    cursor: pointer;
    outline: none;
  }

  .group:focus-visible rect:first-child {
    stroke: var(--primary);
    stroke-width: 1.5;
  }
</style>
