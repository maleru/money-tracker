<script lang="ts">
  import AmountText from '../components/AmountText.svelte';
  import { formatDate, isValidIsoDate, monthKey } from '../lib/dates';
  import { buildImportItems, itemsToTxInputs, newestDate, type ImportItem } from '../lib/import/importItems';
  import { recognizeImage } from '../lib/import/ocr';
  import { parseBankText, suggestForRow } from '../lib/import/parse';
  import { centsToInput, parseAmountToCents } from '../lib/money';
  import { back, navigate } from '../lib/router';
  import { addTransactions, categories, merchantRules, rememberMerchant, transactions } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import { selectedMonth } from '../lib/state/ui';
  import type { TxType } from '../lib/types';

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

  // Inline-Bearbeitung: höchstens eine Karte gleichzeitig.
  let editingKey = $state<string | null>(null);
  let draftMerchant = $state('');
  let draftDate = $state('');
  let draftAmount = $state('');
  let draftType = $state<TxType>('expense');
  let editError = $state('');

  const duplicateCount = $derived(items.filter((i) => i.duplicate).length);
  const selectedCount = $derived(items.filter((i) => i.selected).length);
  const allSelected = $derived(items.length > 0 && selectedCount === items.length);

  const TYPE_OPTIONS: { value: TxType; label: string }[] = [
    { value: 'expense', label: 'Ausgabe' },
    { value: 'income', label: 'Einnahme' },
  ];

  function categoriesFor(type: TxType) {
    return $categories.filter((c) => c.type === type && !c.archived);
  }

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
    items = buildImportItems(result.rows, $transactions, $merchantRules, $categories);
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
    draftMerchant = item.row.merchant;
    draftDate = item.row.date;
    draftAmount = centsToInput(item.row.amountCents);
    draftType = item.row.type;
    editError = '';
  }

  function cancelEdit(): void {
    editingKey = null;
    editError = '';
  }

  function categoryFits(categoryId: string, type: TxType): boolean {
    return categoriesFor(type).some((c) => c.id === categoryId);
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
    const merchant = draftMerchant.trim();
    const merchantChanged = merchant !== item.row.merchant;
    const typeChanged = draftType !== item.row.type;

    item.row = { ...item.row, merchant, date: draftDate, amountCents: cents, type: draftType };

    const mustSuggest =
      ((merchantChanged || typeChanged) && !item.categoryTouched) ||
      (typeChanged && !categoryFits(item.categoryId, item.row.type));
    if (mustSuggest) {
      item.categoryId = suggestForRow(item.row, $transactions, $merchantRules, $categories);
    }
    editingKey = null;
    editError = '';
  }

  async function confirmImport(): Promise<void> {
    if (busy || selectedCount === 0) return;
    busy = true;
    try {
      const chosen = items.filter((i) => i.selected);
      const inputs = itemsToTxInputs(items, source);
      const newest = newestDate(items);
      await addTransactions(inputs);
      // Händler-Regeln lernen ist nachrangig: Ein Fehler darf den erfolgreichen Import nicht verdecken.
      try {
        for (const item of chosen) {
          if (item.row.merchant.trim() !== '') await rememberMerchant(item.row.merchant, item.categoryId);
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
    <p class="summary">{items.length} Buchungen erkannt · {duplicateCount} mögliche Duplikate</p>

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
              <span class="muted small">{formatDate(item.row.date)}</span>
              <strong class="merchant">{item.row.merchant === '' ? '(ohne Händler)' : item.row.merchant}</strong>
              {#if item.row.city !== ''}
                <span class="muted small">{item.row.city}</span>
              {/if}
            </div>
            <AmountText cents={item.row.amountCents} type={item.row.type} />
            <button type="button" class="edit-btn" aria-label="Bearbeiten" onclick={() => startEdit(item)}>✏️</button>
          </div>

          {#if item.duplicate}
            <span class="badge">Bereits vorhanden?</span>
          {/if}

          <select
            aria-label="Kategorie"
            bind:value={item.categoryId}
            onchange={() => (item.categoryTouched = true)}
          >
            {#each categoriesFor(item.row.type) as c (c.id)}
              <option value={c.id}>{c.icon} {c.name}</option>
            {/each}
          </select>

          {#if editingKey === item.key}
            <div class="edit">
              <div class="field">
                <label for="merchant-{item.key}">Händler</label>
                <input id="merchant-{item.key}" type="text" bind:value={draftMerchant} />
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

  .edit {
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .edit-actions {
    display: flex;
    gap: 10px;
  }
</style>
