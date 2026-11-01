<script lang="ts">
  import { get } from 'svelte/store';
  import { validateOwnName } from '../lib/merchant';
  import { back } from '../lib/router';
  import { settings, updateSettings } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';

  const ownNames = $derived($settings?.ownNames ?? []);

  let newName = $state('');
  let nameError = $state('');
  let busy = $state(false);

  async function remove(name: string): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await updateSettings({ ownNames: (get(settings)?.ownNames ?? []).filter((n) => n !== name) });
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function add(): Promise<void> {
    if (busy) return;
    const current = get(settings)?.ownNames ?? [];
    nameError = validateOwnName(newName, current) ?? '';
    if (nameError !== '') return;

    busy = true;
    try {
      await updateSettings({ ownNames: [...current, newName.trim()] });
      newName = '';
      showToast('Gespeichert');
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Import</h1>
  </div>

  <h2 class="section-title">Eigene Namen</h2>
  <p class="muted hint">
    Unter diesen Namen erscheinen Überweisungen zwischen deinen eigenen Konten (z. B. „Max Mustermann“). Beim Import aus dem Girokonto werden solche Buchungen als Umbuchung vorgeschlagen: Eingänge als „Tagesgeld / Rücklagen“, Lastschriften zwischen dem 25. und dem 5. als „Kreditkarte“, sonstige Abgänge als „Eigene Konten“. Die Namen werden verschlüsselt gespeichert.
  </p>

  <ul class="list">
    {#each ownNames as n (n)}
      <li class="list-item row">
        <span class="name">{n}</span>
        <button type="button" class="remove" aria-label="Entfernen" disabled={busy} onclick={() => void remove(n)}>✕</button>
      </li>
    {/each}
  </ul>

  <form
    class="add-form"
    onsubmit={(e) => {
      e.preventDefault();
      void add();
    }}
  >
    <div class="field">
      <label for="own-name">Eigener Name</label>
      <input
        id="own-name"
        type="text"
        autocomplete="off"
        placeholder="Vor- und Nachname"
        bind:value={newName}
        oninput={() => (nameError = '')}
      />
      {#if nameError}<span class="error">{nameError}</span>{/if}
    </div>
    <button type="submit" class="btn btn-primary" disabled={busy}>Hinzufügen</button>
  </form>
</div>

<style>
  .section-title {
    margin: 16px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }

  .hint {
    font-size: 14px;
    margin: 0 0 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove {
    min-width: 44px;
    min-height: 44px;
    color: var(--primary);
    font-size: 16px;
  }

  .add-form {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
