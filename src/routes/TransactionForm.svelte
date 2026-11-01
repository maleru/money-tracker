<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import CategoryIcon from '../components/CategoryIcon.svelte';
  import { isValidIsoDate, monthKey, todayIso, yesterdayIso } from '../lib/dates';
  import { merchantSuggestions, proposeCategory } from '../lib/merchant';
  import { centsToInput, parseAmountToCents } from '../lib/money';
  import { back, navigate, route } from '../lib/router';
  import {
    addTransaction,
    categories,
    categoryMap,
    deleteTransaction,
    merchantRules,
    rememberMerchant,
    saveRecurring,
    transactions,
    updateTransaction,
  } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { RecurringTemplate, TxType } from '../lib/types';

  let { id }: { id?: string } = $props();

  // Bearbeiten-Modus: Die Buchung wird einmalig gesucht (kein reaktiver Zugriff nötig).
  const editId = untrack(() => id);
  const existing = editId ? get(transactions).find((t) => t.id === editId) : undefined;
  const isEdit = editId !== undefined;

  const initialType: TxType = existing
    ? existing.type
    : untrack(() => $route.query.get('type')) === 'income'
      ? 'income'
      : 'expense';

  let type = $state<TxType>(initialType);
  let amount = $state(existing ? centsToInput(existing.amountCents) : '');
  let merchant = $state(existing?.merchant ?? '');
  let city = $state(existing?.city ?? '');
  let note = $state(existing?.note ?? '');
  let date = $state(existing?.date ?? todayIso());
  let categoryId = $state(existing?.categoryId ?? '');
  let categoryTouched = $state(existing !== undefined);

  let amountError = $state('');
  let categoryError = $state('');
  let dateError = $state('');
  let busy = $state(false);
  let merchantFocused = $state(false);

  let amountInput: HTMLInputElement | undefined = $state();

  onMount(() => {
    if (isEdit && !existing) {
      showToast('Buchung nicht gefunden');
      navigate('/');
      return;
    }
    if (!isEdit) amountInput?.focus();
  });

  // Automatische Kategorie. Liest nur merchant und type; schreibt nur categoryId.
  $effect(() => {
    const m = merchant;
    const t = type;
    untrack(() => {
      if (categoryTouched) return;
      const proposed = proposeCategory(m, t, get(transactions), get(merchantRules), get(categories));
      if (proposed) categoryId = proposed;
    });
  });

  const suggestions = $derived(merchantSuggestions(merchant, $transactions));
  const showSuggestions = $derived(merchantFocused && merchant.trim().length > 0 && suggestions.length > 0);

  const visibleCategories = $derived(
    $categories.filter(
      (c) => c.type === type && (!c.archived || (existing !== undefined && c.id === existing.categoryId)),
    ),
  );

  function setType(next: TxType): void {
    if (type === next) return;
    type = next;
    const current = $categoryMap.get(categoryId);
    if (!current || current.type !== next) categoryId = '';
    categoryTouched = false;
  }

  function pickCategory(cid: string): void {
    categoryId = cid;
    categoryTouched = true;
    categoryError = '';
  }

  function pickSuggestion(text: string): void {
    merchant = text;
    merchantFocused = false;
  }

  function onMerchantBlur(): void {
    setTimeout(() => {
      merchantFocused = false;
    }, 150);
  }

  function setDate(iso: string): void {
    date = iso;
    dateError = '';
  }

  function resetForNext(): void {
    amount = '';
    merchant = '';
    city = '';
    note = '';
    categoryId = '';
    categoryTouched = false;
    amountError = '';
    categoryError = '';
    dateError = '';
    amountInput?.focus();
  }

  /** Validiert das Formular und liefert die Felder oder null (Fehlermeldungen werden gesetzt). */
  function validate(): {
    type: TxType;
    amountCents: number;
    date: string;
    categoryId: string;
    merchant: string;
    city: string;
    note: string;
  } | null {
    const cents = parseAmountToCents(amount);
    amountError = cents === null ? 'Bitte einen gültigen Betrag eingeben' : '';
    categoryError = categoryId === '' ? 'Bitte eine Kategorie wählen' : '';
    dateError = isValidIsoDate(date) ? '' : 'Ungültiges Datum';
    if (cents === null || categoryId === '' || dateError !== '') return null;
    return {
      type,
      amountCents: cents,
      date,
      categoryId,
      merchant: merchant.trim(),
      city: city.trim(),
      note: note.trim(),
    };
  }

  /** Speichert die Buchung (nur im Neu-Modus) und legt eine monatliche Vorlage an. */
  async function saveAsRecurring(): Promise<void> {
    if (busy || isEdit) return;
    const fields = validate();
    if (!fields) return;

    busy = true;
    try {
      const tx = await addTransaction({ ...fields, source: 'manual', recurringId: null });
      if (fields.merchant !== '') await rememberMerchant(fields.merchant, fields.categoryId);
      const month = monthKey(fields.date);
      const template: RecurringTemplate = {
        id: crypto.randomUUID(),
        type: fields.type,
        amountCents: fields.amountCents,
        categoryId: fields.categoryId,
        merchant: fields.merchant,
        note: fields.note,
        dayOfMonth: Number(fields.date.slice(8, 10)),
        startMonth: month,
        endMonth: null,
        lastGeneratedMonth: month,
        active: true,
        updatedAt: new Date().toISOString(),
      };
      await saveRecurring(template);
      await updateTransaction({ ...tx, recurringId: template.id });
      showToast('Gespeichert – wiederholt sich monatlich');
      back();
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function save(another: boolean): Promise<void> {
    if (busy) return;

    const fields = validate();
    if (!fields) return;

    busy = true;
    try {
      if (existing) {
        await updateTransaction({ ...existing, ...fields });
      } else {
        await addTransaction({ ...fields, source: 'manual', recurringId: null });
      }
      if (fields.merchant !== '') await rememberMerchant(fields.merchant, fields.categoryId);
      showToast('Gespeichert');
      if (another && !isEdit) resetForNext();
      else back();
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    if (busy || !existing) return;
    if (!confirm('Buchung wirklich löschen?')) return;
    busy = true;
    try {
      await deleteTransaction(existing.id);
      showToast('Gelöscht');
      back();
    } catch {
      // PLAN-FRAGE: Für Löschfehler ist kein Text im Plan vorgegeben.
      showToast('Löschen fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>{isEdit ? 'Buchung bearbeiten' : 'Neue Buchung'}</h1>
  </div>

  {#if existing?.recurringId}
    <p class="muted note-hint">Automatisch aus wiederkehrender Buchung erzeugt</p>
  {/if}

  <form
    onsubmit={(e) => {
      e.preventDefault();
      void save(false);
    }}
  >
    <div class="field">
      <div class="segmented" role="group" aria-label="Typ">
        <button type="button" class:active={type === 'expense'} onclick={() => setType('expense')}>Ausgabe</button>
        <button type="button" class:active={type === 'income'} onclick={() => setType('income')}>Einnahme</button>
      </div>
    </div>

    <div class="field">
      <label for="tx-amount">Betrag</label>
      <div class="amount-row">
        <input
          id="tx-amount"
          class="amount"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0,00"
          bind:this={amountInput}
          bind:value={amount}
          oninput={() => (amountError = '')}
        />
        <span class="suffix">€</span>
      </div>
      {#if amountError}<span class="error">{amountError}</span>{/if}
    </div>

    <div class="field merchant-field">
      <label for="tx-merchant">Händler / Name</label>
      <input
        id="tx-merchant"
        type="text"
        autocomplete="off"
        bind:value={merchant}
        onfocus={() => (merchantFocused = true)}
        onblur={onMerchantBlur}
      />
      {#if showSuggestions}
        <ul class="list suggestions">
          {#each suggestions as s (s)}
            <li>
              <button type="button" class="list-item" onclick={() => pickSuggestion(s)}>{s}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="field">
      <span class="label">Kategorie</span>
      <div class="grid">
        {#each visibleCategories as c (c.id)}
          {@const active = c.id === categoryId}
          <button
            type="button"
            class="cat"
            class:active
            aria-pressed={active}
            style:border-color={active ? c.color : null}
            style:background={active ? c.color + '33' : null}
            onclick={() => pickCategory(c.id)}
          >
            <CategoryIcon category={c} size={32} />
            <span class="cat-name">{c.name}</span>
          </button>
        {/each}
      </div>
      {#if categoryError}<span class="error">{categoryError}</span>{/if}
    </div>

    <div class="field">
      <label for="tx-date">Datum</label>
      <input id="tx-date" type="date" value={date} oninput={(e) => setDate(e.currentTarget.value)} />
      <div class="chips">
        <button type="button" class="chip" class:active={date === todayIso()} onclick={() => setDate(todayIso())}>
          Heute
        </button>
        <button
          type="button"
          class="chip"
          class:active={date === yesterdayIso()}
          onclick={() => setDate(yesterdayIso())}
        >
          Gestern
        </button>
      </div>
      {#if dateError}<span class="error">{dateError}</span>{/if}
    </div>

    <div class="field">
      <label for="tx-city">Ort</label>
      <input id="tx-city" type="text" autocomplete="off" bind:value={city} />
    </div>

    <div class="field">
      <label for="tx-note">Notiz</label>
      <textarea id="tx-note" rows="2" bind:value={note}></textarea>
    </div>

    <div class="actions">
      <button type="submit" class="btn btn-primary" disabled={busy}>Speichern</button>
      {#if isEdit}
        <button type="button" class="btn btn-danger" disabled={busy} onclick={() => void remove()}>Löschen</button>
      {:else}
        <button type="button" class="btn btn-secondary" disabled={busy} onclick={() => void save(true)}>
          Speichern &amp; weitere
        </button>
        <button type="button" class="btn btn-secondary" disabled={busy} onclick={() => void saveAsRecurring()}>
          Als wiederkehrend speichern
        </button>
      {/if}
    </div>
  </form>
</div>

<style>
  .note-hint {
    font-size: 13px;
    margin: 0 0 12px;
  }

  .amount-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .amount {
    font-size: 40px;
    text-align: center;
    min-height: 64px;
    font-weight: 600;
  }

  .suffix {
    font-size: 40px;
    color: var(--muted);
  }

  .suggestions {
    margin-top: 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .cat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 8px 4px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px;
    text-align: center;
  }

  .cat-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chips {
    display: flex;
    gap: 8px;
  }

  .chip.active {
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
</style>
