<script lang="ts">
  import {
    ACCOUNT_ICONS,
    ACCOUNT_KIND_LABELS,
    selectableAccounts,
    validateAccountName,
  } from '../lib/accounts';
  import { DEFAULT_ACCOUNT_ID } from '../lib/db/defaults';
  import { back } from '../lib/router';
  import { accounts, saveAccount } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { Account, AccountKind } from '../lib/types';

  const KINDS: AccountKind[] = ['checking', 'credit_card', 'savings', 'other'];

  // Inline-Formular: editId === null bedeutet „neues Konto“, undefined bedeutet „geschlossen“.
  let editId = $state<string | null | undefined>(undefined);
  let name = $state('');
  let kind = $state<AccountKind>('checking');
  let icon = $state(ACCOUNT_ICONS[0]);
  let archived = $state(false);
  let nameError = $state('');
  let busy = $state(false);

  const active = $derived(selectableAccounts($accounts).filter((a) => !a.archived));
  const archivedList = $derived($accounts.filter((a) => a.archived).sort((a, b) => a.sortOrder - b.sortOrder));
  const isDefault = $derived(editId === DEFAULT_ACCOUNT_ID);

  function openNew(): void {
    editId = null;
    name = '';
    kind = 'checking';
    icon = ACCOUNT_ICONS[0];
    archived = false;
    nameError = '';
  }

  function openEdit(a: Account): void {
    editId = a.id;
    name = a.name;
    kind = a.kind;
    icon = a.icon;
    archived = a.archived;
    nameError = '';
  }

  function close(): void {
    editId = undefined;
    nameError = '';
  }

  async function save(): Promise<void> {
    if (busy) return;
    const existing = editId ? $accounts.find((a) => a.id === editId) : undefined;
    nameError = validateAccountName(name, $accounts, existing?.id) ?? '';
    if (nameError !== '') return;

    busy = true;
    try {
      const nextSort = $accounts.length > 0 ? Math.max(...$accounts.map((a) => a.sortOrder)) + 1 : 0;
      const account: Account = existing
        ? { ...existing, name: name.trim(), kind, icon, archived: existing.id === DEFAULT_ACCOUNT_ID ? false : archived }
        : {
            id: crypto.randomUUID(),
            name: name.trim(),
            kind,
            icon,
            archived,
            sortOrder: nextSort,
            updatedAt: new Date().toISOString(),
          };
      await saveAccount(account);
      showToast('Gespeichert');
      close();
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

{#snippet accountRow(a: Account)}
  <li class="list-item stack">
    <button type="button" class="row-button" onclick={() => openEdit(a)}>
      <span>{a.icon} {a.name}</span>
      <span class="muted kind">{ACCOUNT_KIND_LABELS[a.kind]}</span>
    </button>
    {#if editId === a.id}
      {@render form()}
    {/if}
  </li>
{/snippet}

{#snippet form()}
  <form
    class="panel"
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <div class="field">
      <label for="acc-name">Name</label>
      <input
        id="acc-name"
        type="text"
        autocomplete="off"
        bind:value={name}
        oninput={() => (nameError = '')}
      />
      {#if nameError}<span class="error">{nameError}</span>{/if}
    </div>

    <div class="field">
      <label for="acc-kind">Art</label>
      <select id="acc-kind" class="select" bind:value={kind}>
        {#each KINDS as k (k)}
          <option value={k}>{ACCOUNT_KIND_LABELS[k]}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <span class="label">Symbol</span>
      <div class="icon-row">
        {#each ACCOUNT_ICONS as emoji (emoji)}
          <button
            type="button"
            class="icon-btn"
            class:active={emoji === icon}
            aria-label={'Symbol ' + emoji}
            aria-pressed={emoji === icon}
            onclick={() => (icon = emoji)}>{emoji}</button
          >
        {/each}
      </div>
    </div>

    <label class="check">
      <input type="checkbox" bind:checked={archived} disabled={isDefault} />
      <span>Archiviert</span>
    </label>
    {#if isDefault}
      <p class="muted note">Das Standardkonto kann nicht archiviert werden</p>
    {/if}

    <div class="actions">
      <button type="submit" class="btn btn-primary" disabled={busy}>Speichern</button>
      <button type="button" class="btn btn-secondary" onclick={close}>Abbrechen</button>
    </div>
  </form>
{/snippet}

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Konten</h1>
  </div>

  <ul class="list">
    {#each active as a (a.id)}
      {@render accountRow(a)}
    {/each}
  </ul>

  {#if editId === null}
    {@render form()}
  {:else}
    <button type="button" class="btn btn-primary add" onclick={openNew}>＋ Konto hinzufügen</button>
  {/if}

  {#if archivedList.length > 0}
    <h2 class="section-title">Archiviert</h2>
    <ul class="list">
      {#each archivedList as a (a.id)}
        {@render accountRow(a)}
      {/each}
    </ul>
  {/if}
</div>

<style>
  .section-title {
    margin: 16px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }

  .stack {
    display: block;
  }

  .row-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    text-align: left;
  }

  .kind {
    font-size: 14px;
  }

  .panel {
    padding: 8px 0 12px;
  }

  .select {
    font-size: 16px;
  }

  .icon-row {
    display: flex;
    gap: 6px;
  }

  .icon-btn {
    min-width: 0;
    font-size: 22px;
    background: var(--surface);
    border: 2px solid transparent;
    border-radius: 10px;
  }

  .icon-btn.active {
    border-color: var(--primary);
    background: var(--border);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }

  .note {
    font-size: 14px;
    margin: 4px 0 0;
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }

  .add {
    margin-top: 16px;
  }
</style>
