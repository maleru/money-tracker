<script lang="ts">
  import { showToast } from '../lib/state/toast';

  let { recoveryKey }: { recoveryKey: string } = $props();

  // Wiederherstellungsschlüssel: 4 Gruppen pro Zeile.
  const keyLines = $derived.by(() => {
    const groups = recoveryKey.split('-');
    const lines: string[] = [];
    for (let i = 0; i < groups.length; i += 4) lines.push(groups.slice(i, i + 4).join('-'));
    return lines;
  });

  async function copyKey(): Promise<void> {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      showToast('Kopiert');
    } catch {
      // PLAN-FRAGE: Text für fehlgeschlagenes Kopieren ist im Plan nicht vorgegeben.
      showToast('Kopieren nicht möglich', 'error');
    }
  }
</script>

<div class="key" data-testid="recovery-key">
  {#each keyLines as line}<span class="line">{line}</span>{/each}
</div>
<button type="button" class="btn btn-secondary copy" onclick={() => void copyKey()}>Kopieren</button>

<style>
  .key {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 19px;
    font-weight: 600;
    line-height: 1.6;
    letter-spacing: 0.02em;
    text-align: center;
    padding: 14px 8px;
    margin: 0 0 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    user-select: all;
    -webkit-user-select: all;
  }

  .line {
    display: block;
  }

  .copy {
    margin-bottom: 4px;
  }
</style>
