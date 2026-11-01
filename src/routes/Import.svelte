<script lang="ts">
  import AmountText from '../components/AmountText.svelte';
  import { selectableAccounts } from '../lib/accounts';
  import { formatDate, isValidIsoDate, monthKey } from '../lib/dates';
  import { DEFAULT_ACCOUNT_ID } from '../lib/db/defaults';
  import { categoryOptions } from '../lib/categoryTree';
  import {
    buildImportItems,
    itemsToTxInputs,
    newestDate,
    suggestForEdit,
    type ImportContext,
    type ImportItem,
  } from '../lib/import/importItems';
  import { recognizeImage } from '../lib/import/ocr';
  import { parseBankText } from '../lib/import/parse';
  import { centsToInput, parseAmountToCents } from '../lib/money';
  import { back, navigate } from '../lib/router';
  import {
    accountMap,
    accounts,
    addTransactions,
    categories,
    merchantRules,
    rememberMerchant,
    rememberRename,
    settings,
    transactions,
  } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import { selectedMonth } from '../lib/state/ui';
  import type { TxDirection, TxType } from '../lib/types';

  let step = $state<'input' | 'preview'>('input');
  let text = $state('');
  // Wird bei Screenshot-OCR auf 'ocr' gesetzt und bleibt dann so (auch bei manueller Textänderung).
  let source = $state<'text' | 'ocr'>('text');
  let ocrBusy = $state(false);
  let progress = $state(0);
  let fileInput = $state<HTMLInputElement | null>(null);
  let items = $state<ImportItem[]>([]);
  let unparsed = $state<string[]>([]);
  let parseError = $state('');
  let busy = $state(false);
  let accountId = $state(DEFAULT_ACCOUNT_ID);
  // Kontext der letzten Erkennung; wird für die Bearbeitung (Kategorie-Vorschlag) gebraucht.
  let importCtx: ImportContext | null = null;

  // Inline-Bearbeitung: höchstens eine Karte gleichzeitig.
  let editingKey = $state<string | null>(null);
  let draftMerchant = $state('');
  let draftDate = $state('');
  let draftAmount = $state('');
  let draftType = $state<TxType>('expense');
  let draftDirection = $state<TxDirection>('out');
  let draftRemember = $state(false);
  let editError = $state('');

  const selectedAccount = $derived($accountMap.get(accountId) ?? null);
  const duplicateCount = $derived(items.filter((i) => i.dup.kind !== 'none').length);
  const transferCount = $derived(items.filter((i) => i.type === 'transfer').length);
  const selectedCount = $derived(items.filter((i) => i.selected).length);
  const allSelected = $derived(items.length > 0 && selectedCount === items.length);

  const TYPE_OPTIONS: { value: TxType; label: string }[] = [
    { value: 'expense', label: 'Ausgabe' },
    { value: 'income', label: 'Einnahme' },
    { value: 'transfer', label: 'Umbuchung' },
  ];

  const DIRECTION_OPTIONS: { value: TxDirection; label: string }[] = [
    { value: 'out', label: 'Abgang vom Konto' },
    { value: 'in', label: 'Zugang aufs Konto' },
  ];

  async function pasteFromClipboard(): Promise<void> {
    try {
      text = await navigator.clipboard.readText();
      parseError = '';
    } catch {
      showToast('Bitte manuell einfügen');
    }
  }

  function recognize(): void {
    if (text.trim() === '') return;
    const result = parseBankText(text);
    if (result.rows.length === 0) {
      parseError = 'Keine Buchungen erkannt';
      return;
    }
    parseError = '';
    unparsed = result.unparsedLines;
    const account = $accountMap.get(accountId) ?? $accounts[0];
    importCtx = {
      txs: $transactions,
      rules: $merchantRules,
      cats: $categories,
      account,
      ownNames: $settings?.ownNames ?? [],
    };
    items = buildImportItems(result.rows, importCtx);
    editingKey = null;
    step = 'preview';
  }

  async function onFileSelected(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined || ocrBusy) {
      input.value = '';
      return;
    }
    ocrBusy = true;
    progress = 0;
    parseError = '';
    try {
      text = await recognizeImage(file, (p) => (progress = p));
      source = 'ocr';
      recognize();
    } catch {
      showToast('Texterkennung fehlgeschlagen', 'error');
    } finally {
      ocrBusy = false;
      input.value = '';
    }
  }

  function cancel(): void {
    editingKey = null;
    step = 'input';
  }

  function toggleAll(): void {
    const target = !allSelected;
    for (const item of items) item.selected = target;
  }

  function startEdit(item: ImportItem): void {
    editingKey = item.key;
    draftMerchant = item.merchant;
    draftDate = item.date;
    draftAmount = centsToInput(item.amountCents);
    draftType = item.type;
    draftDirection = item.direction ?? (item.row.type === 'income' ? 'in' : 'out');
    draftRemember = item.remember;
    editError = '';
  }

  function cancelEdit(): void {
    editingKey = null;
    editError = '';
  }

  function finishEdit(item: ImportItem): void {
    const cents = parseAmountToCents(draftAmount);
    if (cents === null) {
      editError = 'Ungültiger Betrag';
      return;
    }
    if (!isValidIsoDate(draftDate)) {
      editError = 'Ungültiges Datum';
      return;
    }
    if (importCtx === null) return;

    const merchant = draftMerchant.trim();
    const merchantChanged = merchant !== item.merchant;
    const typeChanged = draftType !== item.type || (draftType === 'transfer' && draftDirection !== item.direction);

    item.merchant = merchant;
    item.date = draftDate;
    item.amountCents = cents;
    item.type = draftType;
    item.direction = draftType === 'transfer' ? draftDirection : null;
    item.remember = draftRemember;
    if (typeChanged) item.transferDetected = false;

    const mustSuggest =
      ((merchantChanged || typeChanged) && !item.categoryTouched) ||
      !categoryOptions($categories, item.type).some((o) => o.id === item.categoryId);
    if (mustSuggest) {
      item.categoryId = suggestForEdit(item, importCtx);
    }
    editingKey = null;
    editError = '';
  }

  async function confirmImport(): Promise<void> {
    if (busy || selectedCount === 0) return;
    busy = true;
    try {
      const chosen = items.filter((i) => i.selected);
      const inputs = itemsToTxInputs(items, source, accountId);
      const newest = newestDate(items);
      await addTransactions(inputs);
      // Regeln lernen ist nachrangig: Ein Fehler darf den erfolgreichen Import nicht verdecken.
      try {
        for (const item of chosen) {
          if (item.remember) {
            await rememberRename(item.row.merchant, item.merchant, item.categoryId);
          } else if (!item.transferDetected && item.row.merchant.trim() !== '') {
            // Gelernt wird auf dem Originaltext.
            await rememberMerchant(item.row.merchant, item.categoryId);
          }
        }
      } catch {
        // bewusst ignoriert
      }
      showToast(`${inputs.length} Buchungen importiert`);
      if (newest !== null) {
        selectedMonth.set(monthKey(newest));
        navigate('/transactions?month=' + monthKey(newest));
      } else {
        navigate('/transactions');
      }
    } catch {
      showToast('Import fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={back}>‹ Zurück</button>
    <h1>Importieren</h1>
  </div>

  {#if step === 'input'}
    <div class="field">
      <label for="import-account">Konto</label>
      <select id="import-account" aria-label="Konto" bind:value={accountId}>
        {#each selectableAccounts($accounts, accountId) as acc (acc.id)}
          <option value={acc.id}>
            {acc.icon} {acc.name}{acc.archived ? ' (archiviert)' : ''}
          </option>
        {/each}
      </select>
      {#if selectedAccount?.kind === 'credit_card'}
        <p class="muted small hint">
          Das Format der Kreditkarten-App wird noch nicht gesondert erkannt (DKB- bzw. allgemeiner Parser). Format der
          Kreditkarten-App ggf. später anpassen.
        </p>
      {/if}
    </div>

    <div class="card guide">
      1. Screenshot der Umsätze in der DKB-App machen. 2. Screenshot öffnen, Text lange drücken → ‚Alles auswählen‘ →
      ‚Kopieren‘. 3. Hier einfügen.
    </div>

    <div class="field">
      <textarea
        rows="10"
        placeholder="Text hier einfügen…"
        aria-label="Bankumsätze als Text"
        bind:value={text}
        oninput={() => (parseError = '')}
      ></textarea>
      {#if parseError !== ''}
        <p class="error" role="alert">{parseError}</p>
      {/if}
    </div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" disabled={ocrBusy} onclick={pasteFromClipboard}>
        📋 Aus Zwischenablage einfügen
      </button>
      <button type="button" class="btn btn-secondary" disabled={ocrBusy} onclick={() => fileInput?.click()}>
        🖼️ Screenshot auswählen
      </button>
      <input
        bind:this={fileInput}
        class="file-input"
        type="file"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        onchange={onFileSelected}
      />
      <p class="muted small hint">
        Beim ersten Mal werden die Texterkennungs-Daten (~15 MB) einmalig vom eigenen Server geladen.
      </p>
      {#if ocrBusy}
        <div class="ocr-progress" role="status">
          <span>Texterkennung… {Math.round(progress * 100)} %</span>
          <div class="bar"><div class="bar-fill" style:width="{Math.round(progress * 100)}%"></div></div>
        </div>
      {/if}
      <button type="button" class="btn btn-primary" disabled={ocrBusy || text.trim() === ''} onclick={recognize}>
        Erkennen
      </button>
    </div>
  {:else}
    <p class="summary">
      {items.length} Buchungen erkannt · {duplicateCount} mögliche Duplikate{transferCount > 0
        ? ` · ${transferCount} Umbuchungen`
        : ''}
    </p>

    <div class="toolbar">
      <button type="button" class="toggle-all" onclick={toggleAll}>
        {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
      </button>
    </div>

    {#if unparsed.length > 0}
      <details class="card unparsed">
        <summary>{unparsed.length} Zeilen nicht erkannt</summary>
        <pre>{unparsed.join('\n')}</pre>
      </details>
    {/if}

    <ul class="items">
      {#each items as item (item.key)}
        <li class="card item" class:dimmed={!item.selected}>
          <div class="item-main">
            <input type="checkbox" aria-label="Buchung übernehmen" bind:checked={item.selected} />
            <div class="item-text">
              <span class="muted small">{formatDate(item.date)}</span>
              <strong class="merchant">{item.merchant === '' ? '(ohne Händler)' : item.merchant}</strong>
              {#if item.merchant !== item.row.merchant}
                <span class="muted small">Original: {item.row.merchant}</span>
              {/if}
              {#if item.row.city !== ''}
                <span class="muted small">{item.row.city}</span>
              {/if}
            </div>
            <AmountText cents={item.amountCents} type={item.type} direction={item.direction} />
            <button type="button" class="edit-btn" aria-label="Bearbeiten" onclick={() => startEdit(item)}>✏️</button>
          </div>

          {#if item.dup.kind === 'exact' || item.dup.kind === 'likely'}
            <span class="badge">Bereits vorhanden?</span>
          {:else if item.dup.kind === 'recurring'}
            <span class="badge">Vermutlich schon als feste Buchung erfasst</span>
          {/if}
          {#if item.transferDetected}
            <span class="badge">Umbuchung erkannt</span>
          {/if}
          {#if item.row.pending}
            <span class="badge">Vorgemerkt</span>
          {/if}

          <select aria-label="Kategorie" bind:value={item.categoryId} onchange={() => (item.categoryTouched = true)}>
            {#each categoryOptions($categories, item.type, item.categoryId) as o (o.id)}
              <option value={o.id}>{o.label}</option>
            {/each}
          </select>

          {#if editingKey === item.key}
            <div class="edit">
              <div class="field">
                <label for="merchant-{item.key}">Anzeigen als</label>
                <input id="merchant-{item.key}" type="text" bind:value={draftMerchant} />
                <p class="muted small">Original: {item.row.merchant}</p>
              </div>
              <div class="field">
                <label for="date-{item.key}">Datum</label>
                <input id="date-{item.key}" type="date" bind:value={draftDate} />
              </div>
              <div class="field">
                <label for="amount-{item.key}">Betrag</label>
                <input id="amount-{item.key}" type="text" inputmode="decimal" bind:value={draftAmount} />
              </div>
              <div class="field">
                <span class="label">Typ</span>
                <div class="segmented" role="group" aria-label="Typ">
                  {#each TYPE_OPTIONS as option (option.value)}
                    <button
                      type="button"
                      class:active={draftType === option.value}
                      aria-pressed={draftType === option.value}
                      onclick={() => (draftType = option.value)}
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              </div>
              {#if draftType === 'transfer'}
                <div class="field">
                  <span class="label">Richtung</span>
                  <div class="segmented" role="group" aria-label="Richtung">
                    {#each DIRECTION_OPTIONS as option (option.value)}
                      <button
                        type="button"
                        class:active={draftDirection === option.value}
                        aria-pressed={draftDirection === option.value}
                        onclick={() => (draftDirection = option.value)}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={draftRemember} />
                Für künftige Importe merken
              </label>
              {#if editError !== ''}
                <p class="error" role="alert">{editError}</p>
              {/if}
              <div class="edit-actions">
                <button type="button" class="btn btn-secondary" onclick={cancelEdit}>Abbrechen</button>
                <button type="button" class="btn btn-primary" onclick={() => finishEdit(item)}>Fertig</button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="actions">
      <button type="button" class="btn btn-primary" disabled={busy || selectedCount === 0} onclick={confirmImport}>
        {selectedCount} Buchungen übernehmen
      </button>
      <button type="button" class="btn btn-secondary" disabled={busy} onclick={cancel}>Abbrechen</button>
    </div>
  {/if}
</div>

<style>
  .guide {
    margin-bottom: 14px;
    font-size: 15px;
  }

  textarea {
    resize: vertical;
  }

  select,
  input[type='text'],
  input[type='date'] {
    font-size: 16px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }

  .file-input {
    display: none;
  }

  .hint {
    margin: 0;
  }

  .ocr-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }

  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--border);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.2s;
  }

  .summary {
    margin: 0 0 8px;
    font-weight: 600;
  }

  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }

  .toggle-all {
    color: var(--primary);
    font-weight: 500;
    padding: 0 8px;
  }

  .unparsed {
    margin-bottom: 12px;
    font-size: 14px;
  }

  .unparsed summary {
    cursor: pointer;
    min-height: 24px;
  }

  .unparsed pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .item.dimmed .item-main {
    opacity: 0.6;
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .item-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .merchant {
    overflow-wrap: anywhere;
  }

  .small {
    font-size: 13px;
  }

  .edit-btn {
    flex: none;
  }

  .badge {
    align-self: flex-start;
    padding: 2px 10px;
    border-radius: 10px;
    background: #fef3c7;
    color: #92400e;
    font-size: 13px;
    font-weight: 600;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
  }

  .edit {
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .edit-actions {
    display: flex;
    gap: 10px;
  }
</style>
