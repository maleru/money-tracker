<script lang="ts">
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import AmountText from '../components/AmountText.svelte';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import { selectableAccounts } from '../lib/accounts';
  import { categoryOptions } from '../lib/categoryTree';
  import { DEFAULT_ACCOUNT_ID, fallbackCategoryFor } from '../lib/db/defaults';
  import { currentMonthKey, formatDate, monthKey } from '../lib/dates';
  import { centsToInput, parseAmountToCents } from '../lib/money';
  import { back, route } from '../lib/router';
  import {
    accounts,
    accountMap,
    categories,
    categoryMap,
    deleteRecurring,
    recurring,
    runRecurring,
    saveRecurring,
    transactions,
    updateTransaction,
  } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { RecurringTemplate, Transaction, TxDirection, TxType } from '../lib/types';

  // null = Formular geschlossen, 'new' = neue Vorlage, sonst die id der bearbeiteten Vorlage.
  let editingId = $state<string | null>(null);

  let type = $state<TxType>('expense');
  let direction = $state<TxDirection>('out');
  let accountId = $state(DEFAULT_ACCOUNT_ID);
  let amount = $state('');
  let categoryId = $state('');
  let merchant = $state('');
  let note = $state('');
  let day = $state<number | null>(1);
  let startMonth = $state(currentMonthKey());
  let endMonth = $state('');

  let amountError = $state('');
  let categoryError = $state('');
  let dayError = $state('');
  let monthError = $state('');
  let busy = $state(false);

  const editing = $derived(editingId === null || editingId === 'new' ? undefined : $recurring.find((t) => t.id === editingId));

  const sorted = $derived(
    [...$recurring].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.merchant.localeCompare(b.merchant, 'de')),
  );

  // Flache Optionsliste mit Unterkategorien; beim Bearbeiten bleibt die bisherige Kategorie auswählbar.
  const categoryChoices = $derived(categoryOptions($categories, type, editing?.categoryId));

  const accountChoices = $derived(selectableAccounts($accounts, accountId));

  function clearErrors(): void {
    amountError = '';
    categoryError = '';
    dayError = '';
    monthError = '';
  }

  function openNew(): void {
    clearErrors();
    editingId = 'new';
    type = 'expense';
    direction = 'out';
    accountId = DEFAULT_ACCOUNT_ID;
    amount = '';
    categoryId = '';
    merchant = '';
    note = '';
    day = 1;
    startMonth = currentMonthKey();
    endMonth = '';
  }

  function openEdit(t: RecurringTemplate): void {
    if (editingId === t.id) {
      editingId = null;
      return;
    }
    clearErrors();
    editingId = t.id;
    type = t.type;
    direction = t.direction ?? 'out';
    accountId = t.accountId;
    amount = centsToInput(t.amountCents);
    categoryId = t.categoryId;
    merchant = t.merchant;
    note = t.note;
    day = t.dayOfMonth;
    startMonth = t.startMonth;
    endMonth = t.endMonth ?? '';
  }

  // Bestehende Buchung als Vorlage (Aufruf über '#/settings/recurring?from=<id>').
  let sourceTx = $state<Transaction | undefined>(undefined);

  function openFromTransaction(tx: Transaction): void {
    clearErrors();
    editingId = 'new';
    sourceTx = tx;
    type = tx.type;
    direction = tx.direction ?? 'out';
    accountId = tx.accountId;
    amount = centsToInput(tx.amountCents);
    categoryId = tx.categoryId;
    merchant = tx.merchant;
    note = tx.note;
    day = Number(tx.date.slice(8, 10));
    startMonth = monthKey(tx.date);
    endMonth = '';
  }

  {
    const fromId = untrack(() => $route.query.get('from'));
    if (fromId) {
      const tx = get(transactions).find((t) => t.id === fromId);
      if (tx) openFromTransaction(tx);
      else showToast('Buchung nicht gefunden');
    }
  }

  function setType(next: TxType): void {
    if (type === next) return;
    type = next;
    const current = $categoryMap.get(categoryId);
    if (!current || current.type !== next) categoryId = fallbackCategoryFor(next);
  }

  function displayName(t: RecurringTemplate): string {
    return t.merchant.trim() !== '' ? t.merchant : ($categoryMap.get(t.categoryId)?.name ?? 'Unbekannt');
  }

  async function toggleActive(t: RecurringTemplate, active: boolean): Promise<void> {
    try {
      await saveRecurring({ ...t, active });
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    }
  }

  async function save(): Promise<void> {
    if (busy || editingId === null) return;

    const cents = parseAmountToCents(amount);
    amountError = cents === null ? 'Bitte einen gültigen Betrag eingeben' : '';
    categoryError = categoryId === '' ? 'Bitte eine Kategorie wählen' : '';
    const dayValue = day;
    const dayValid = dayValue !== null && Number.isInteger(dayValue) && dayValue >= 1 && dayValue <= 31;
    dayError = dayValid ? '' : 'Tag muss zwischen 1 und 31 liegen';
    // PLAN-FRAGE: Für einen leeren Startmonat ist kein Text im Plan vorgegeben.
    if (!/^\d{4}-\d{2}$/.test(startMonth)) monthError = 'Bitte einen Startmonat wählen';
    else if (endMonth !== '' && endMonth < startMonth) monthError = 'Endmonat liegt vor Startmonat';
    else monthError = '';
    if (cents === null || categoryId === '' || !dayValid || dayValue === null || monthError !== '') return;

    busy = true;
    try {
      // lastGeneratedMonth bleibt beim Bearbeiten immer erhalten (auch wenn startMonth geändert wurde):
      // generateDue beginnt ohnehin nie vor startMonth und erzeugt nichts doppelt.
      const template: RecurringTemplate = {
        id: editing?.id ?? crypto.randomUUID(),
        type,
        amountCents: cents,
        categoryId,
        accountId,
        direction: type === 'transfer' ? direction : null,
        merchant: merchant.trim(),
        note: note.trim(),
        dayOfMonth: dayValue,
        startMonth,
        endMonth: endMonth === '' ? null : endMonth,
        lastGeneratedMonth: editing?.lastGeneratedMonth ?? null,
        active: editing?.active ?? true,
        updatedAt: new Date().toISOString(),
      };
      // Vorlage aus bestehender Buchung: Liegt die Buchung im Startmonat, gilt dieser Monat als bereits
      // erzeugt und die Buchung wird mit der Vorlage verknüpft (verhindert eine Doppelbuchung).
      const fromTx = editingId === 'new' ? sourceTx : undefined;
      const linkSource = fromTx !== undefined && fromTx.recurringId === null && monthKey(fromTx.date) === startMonth;
      if (linkSource) template.lastGeneratedMonth = startMonth;
      await saveRecurring(template);
      if (linkSource && fromTx) await updateTransaction({ ...fromTx, recurringId: template.id });
      editingId = null;
      sourceTx = undefined;
      let created = 0;
      try {
        created = await runRecurring();
      } catch {
        showToast('Wiederkehrende Buchungen konnten nicht erzeugt werden', 'error');
        return;
      }
      showToast(created > 0 ? `${created} wiederkehrende Buchung(en) hinzugefügt` : 'Gespeichert');
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (busy || !editing) return;
    if (!confirm('Wiederkehrende Buchung löschen? Bereits erzeugte Buchungen bleiben erhalten.')) return;
    busy = true;
    try {
      await deleteRecurring(editing.id);
      editingId = null;
      showToast('Gelöscht');
    } catch {
      // PLAN-FRAGE: Für Löschfehler ist kein Text im Plan vorgegeben.
      showToast('Löschen fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

{#snippet form()}
  <form
    class="form"
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <div class="field">
      <div class="segmented" role="group" aria-label="Typ">
        <button type="button" class:active={type === 'expense'} onclick={() => setType('expense')}>Ausgabe</button>
        <button type="button" class:active={type === 'income'} onclick={() => setType('income')}>Einnahme</button>
        <button type="button" class:active={type === 'transfer'} onclick={() => setType('transfer')}>Umbuchung</button>
      </div>
      {#if type === 'transfer'}
        <div class="segmented direction" role="group" aria-label="Richtung">
          <button type="button" class:active={direction === 'out'} onclick={() => (direction = 'out')}>
            Abgang vom Konto
          </button>
          <button type="button" class:active={direction === 'in'} onclick={() => (direction = 'in')}>
            Zugang aufs Konto
          </button>
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="rec-amount">Betrag</label>
      <input
        id="rec-amount"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        placeholder="0,00"
        bind:value={amount}
        oninput={() => (amountError = '')}
      />
      {#if amountError}<span class="error">{amountError}</span>{/if}
    </div>

    <div class="field">
      <label for="rec-category">Kategorie</label>
      <select id="rec-category" bind:value={categoryId} onchange={() => (categoryError = '')}>
        <option value="">Kategorie wählen…</option>
        {#each categoryChoices as c (c.id)}
          <option value={c.id}>{c.label}</option>
        {/each}
      </select>
      {#if categoryError}<span class="error">{categoryError}</span>{/if}
    </div>

    <div class="field">
      <label for="rec-account">Konto</label>
      <select id="rec-account" bind:value={accountId}>
        {#each accountChoices as a (a.id)}
          <option value={a.id}>{a.icon} {a.name}{a.archived ? ' (archiviert)' : ''}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="rec-merchant">Händler / Name</label>
      <input id="rec-merchant" type="text" autocomplete="off" bind:value={merchant} />
    </div>

    <div class="field">
      <label for="rec-note">Notiz</label>
      <input id="rec-note" type="text" autocomplete="off" bind:value={note} />
    </div>

    <div class="field">
      <label for="rec-day">Tag im Monat</label>
      <input
        id="rec-day"
        type="number"
        min="1"
        max="31"
        inputmode="numeric"
        bind:value={day}
        oninput={() => (dayError = '')}
      />
      {#if dayError}<span class="error">{dayError}</span>{/if}
    </div>

    <div class="field">
      <label for="rec-start">Startmonat</label>
      <input id="rec-start" type="month" bind:value={startMonth} oninput={() => (monthError = '')} />
    </div>

    <div class="field">
      <label for="rec-end">Endmonat (optional)</label>
      <input id="rec-end" type="month" bind:value={endMonth} oninput={() => (monthError = '')} />
      {#if monthError}<span class="error">{monthError}</span>{/if}
    </div>

    <div class="actions">
      <button type="submit" class="btn btn-primary" disabled={busy}>Speichern</button>
      <button
        type="button"
        class="btn btn-secondary"
        disabled={busy}
        onclick={() => {
          editingId = null;
          sourceTx = undefined;
        }}
      >
        Abbrechen
      </button>
      {#if editing}
        <button type="button" class="btn btn-danger" disabled={busy} onclick={() => void remove()}>Löschen</button>
        <p class="muted hint">Bereits erzeugte Buchungen bleiben beim Löschen erhalten.</p>
      {/if}
    </div>
  </form>
{/snippet}

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Wiederkehrende Buchungen</h1>
  </div>

  {#if sorted.length === 0}
    <p class="muted empty">Keine wiederkehrenden Buchungen</p>
  {:else}
    <ul class="list">
      {#each sorted as t (t.id)}
        <li class="list-item item" class:inactive={!t.active}>
          <div class="row">
            <button type="button" class="main" onclick={() => openEdit(t)}>
              <CategoryIcon category={$categoryMap.get(t.categoryId)} size={36} />
              <span class="text">
                <span class="name">{displayName(t)}</span>
                <span class="muted sub">monatlich am {t.dayOfMonth}.</span>
              </span>
              <AmountText cents={t.amountCents} type={t.type} direction={t.direction} />
            </button>
            <input
              type="checkbox"
              role="switch"
              class="toggle"
              aria-label="Aktiv"
              checked={t.active}
              onchange={(e) => void toggleActive(t, e.currentTarget.checked)}
            />
          </div>
          {#if editingId === t.id}
            {@render form()}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if editingId === 'new'}
    <div class="card new-form">
      <h2>Neue wiederkehrende Buchung</h2>
      {#if sourceTx}
        <p class="muted hint">
          Vorlage: Buchung vom {formatDate(sourceTx.date)}{sourceTx.merchant ? ` – ${sourceTx.merchant}` : ''}
        </p>
      {/if}
      {@render form()}
    </div>
  {:else}
    <button
      type="button"
      class="btn btn-primary add"
      onclick={() => {
        sourceTx = undefined;
        openNew();
      }}
    >
      ＋ Neue wiederkehrende Buchung
    </button>
  {/if}
</div>

<style>
  .empty {
    text-align: center;
    padding: 24px 0;
  }

  .item {
    display: block;
    padding: 0;
  }

  .inactive .main {
    opacity: 0.5;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 16px 4px 0;
  }

  .main {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding: 4px 8px 4px 16px;
    text-align: left;
  }

  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: 13px;
  }

  .toggle {
    flex: none;
    width: 44px;
    min-height: 28px;
    height: 28px;
  }

  .form {
    padding: 8px 16px 16px;
  }

  .new-form {
    margin-top: 16px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hint {
    font-size: 14px;
    margin: 0;
  }

  .add {
    margin-top: 20px;
  }
</style>
