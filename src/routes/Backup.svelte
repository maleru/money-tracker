<script lang="ts">
  import PasswordField from '../components/PasswordField.svelte';
  import {
    backupStats,
    createBackup,
    decryptBackup,
    mergeData,
    readBackupFile,
    shareOrDownload,
  } from '../lib/backup/backup';
  import { toCsv } from '../lib/backup/csv';
  import { InvalidBackupError, type BackupFileV1 } from '../lib/backup/format';
  import { formatDate, todayIso, toIsoDate } from '../lib/dates';
  import { passwordProblems } from '../lib/passwordRules';
  import { back } from '../lib/router';
  import {
    buildAppData,
    categoryMap,
    replaceAllData,
    settings,
    transactions,
    updateSettings,
  } from '../lib/state/data';
  import { showToast } from '../lib/state/toast';
  import type { AppData } from '../lib/types';

  /** ISO-Zeitstempel -> '01.11.2026' (lokales Datum). */
  function formatStamp(stamp: string): string {
    const d = new Date(stamp);
    return Number.isNaN(d.getTime()) ? '–' : formatDate(toIsoDate(d));
  }

  // ---------- Sicherung erstellen ----------

  let backupPw = $state('');
  let backupPw2 = $state('');
  let backupBusy = $state(false);
  let backupError = $state('');
  // Zweistufig (iOS): erst die Datei erzeugen und halten, dann in einem eigenen Klick teilen.
  let backupFile: File | null = $state(null);

  const lastBackupText = $derived(
    $settings?.lastBackupAt ? formatStamp($settings.lastBackupAt) : 'noch nie',
  );
  const backupProblems = $derived(passwordProblems(backupPw, backupPw2));
  const canCreateBackup = $derived(backupProblems.length === 0 && !backupBusy);

  async function makeBackup(): Promise<void> {
    if (!canCreateBackup) return;
    backupBusy = true;
    backupError = '';
    backupFile = null;
    try {
      const text = await createBackup(buildAppData(), backupPw);
      backupFile = new File([text], `money-tracker-backup-${todayIso()}.json`, { type: 'application/json' });
      // Das Backup-Passwort wird nicht aufbewahrt.
      backupPw = '';
      backupPw2 = '';
    } catch {
      // PLAN-FRAGE: Für Fehler beim Erstellen ist kein Text im Plan vorgegeben.
      backupError = 'Sicherung konnte nicht erstellt werden';
    } finally {
      backupBusy = false;
    }
  }

  /** Direkt im Klick-Handler, ohne vorheriges await (iOS-Anforderung für navigator.share). */
  function shareBackup(): void {
    const file = backupFile;
    if (!file) return;
    void shareOrDownload(file).then(
      async (result) => {
        if (result === 'cancelled') return;
        try {
          await updateSettings({ lastBackupAt: new Date().toISOString() });
        } catch {
          // Die Datei ist gespeichert; nur die Anzeige „Letzte Sicherung“ konnte nicht aktualisiert werden.
        }
        backupFile = null;
        showToast('Sicherung gespeichert');
      },
      () => {
        // PLAN-FRAGE: Für Fehler beim Teilen/Speichern ist kein Text im Plan vorgegeben.
        showToast('Speichern fehlgeschlagen', 'error');
      },
    );
  }

  // ---------- Wiederherstellen ----------

  let fileInput: HTMLInputElement | undefined = $state();
  let readFile: BackupFileV1 | null = $state(null);
  let restorePw = $state('');
  let restoreBusy = $state(false);
  let restoreError = $state('');
  let incoming: AppData | null = $state(null);

  const summary = $derived.by(() => {
    if (!readFile || !incoming) return '';
    const s = backupStats(incoming);
    const range =
      s.firstDate && s.lastDate ? ` (${formatDate(s.firstDate)} – ${formatDate(s.lastDate)})` : '';
    return `Sicherung vom ${formatStamp(readFile.createdAt)}: ${s.transactions} Buchungen${range}, ${incoming.categories.length} Kategorien`;
  });

  function resetRestore(): void {
    readFile = null;
    incoming = null;
    restorePw = '';
    restoreError = '';
    if (fileInput) fileInput.value = '';
  }

  async function onFileChosen(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    readFile = null;
    incoming = null;
    restorePw = '';
    restoreError = '';
    if (!file) return;
    try {
      readFile = readBackupFile(await file.text());
    } catch (err) {
      restoreError = err instanceof InvalidBackupError ? err.message : 'Keine gültige Backup-Datei';
    }
  }

  async function decrypt(): Promise<void> {
    if (!readFile || restorePw.length === 0 || restoreBusy) return;
    restoreBusy = true;
    restoreError = '';
    try {
      incoming = await decryptBackup(readFile, restorePw);
      restorePw = '';
    } catch (err) {
      incoming = null;
      // InvalidBackupError (z. B. neuere App-Version) wird direkt angezeigt; alles andere
      // (WrongSecretError, ValidationError, ...) als falsches Passwort bzw. beschädigte Datei.
      restoreError = err instanceof InvalidBackupError ? err.message : 'Falsches Passwort oder beschädigte Datei';
    } finally {
      restoreBusy = false;
    }
  }

  async function merge(): Promise<void> {
    if (!incoming || restoreBusy) return;
    restoreBusy = true;
    restoreError = '';
    try {
      await replaceAllData(mergeData(buildAppData(), incoming));
      showToast('Daten zusammengeführt');
      resetRestore();
    } catch {
      // PLAN-FRAGE: Für Fehler beim Wiederherstellen ist kein Text im Plan vorgegeben.
      restoreError = 'Wiederherstellung fehlgeschlagen';
    } finally {
      restoreBusy = false;
    }
  }

  async function replaceAll(): Promise<void> {
    if (!incoming || restoreBusy) return;
    if (!confirm('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')) return;
    restoreBusy = true;
    restoreError = '';
    try {
      const current = buildAppData().settings;
      // autoLockMinutes und lastBackupAt bleiben vom aktuellen Gerät erhalten.
      await replaceAllData({
        ...incoming,
        settings: {
          ...incoming.settings,
          autoLockMinutes: current.autoLockMinutes,
          lastBackupAt: current.lastBackupAt,
        },
      });
      showToast('Daten wiederhergestellt');
      resetRestore();
    } catch {
      restoreError = 'Wiederherstellung fehlgeschlagen';
    } finally {
      restoreBusy = false;
    }
  }

  // ---------- CSV ----------

  let csvFile: File | null = $state(null);
  let csvError = $state('');

  function makeCsv(): void {
    csvError = '';
    try {
      const text = toCsv($transactions, $categoryMap);
      csvFile = new File([text], `money-tracker-${todayIso()}.csv`, { type: 'text/csv' });
    } catch {
      // PLAN-FRAGE: Für Fehler beim CSV-Export ist kein Text im Plan vorgegeben.
      csvError = 'CSV konnte nicht erstellt werden';
    }
  }

  /** Direkt im Klick-Handler, ohne vorheriges await (iOS-Anforderung für navigator.share). */
  function shareCsv(): void {
    const file = csvFile;
    if (!file) return;
    void shareOrDownload(file).then(
      (result) => {
        if (result === 'cancelled') return;
        csvFile = null;
        // PLAN-FRAGE: Für den CSV-Export ist kein Erfolgs-Toast im Plan vorgegeben.
        showToast('CSV gespeichert');
      },
      () => {
        showToast('Speichern fehlgeschlagen', 'error');
      },
    );
  }
</script>

<div class="page">
  <div class="header">
    <button type="button" class="back" onclick={() => back()}>‹ Zurück</button>
    <h1>Sicherung &amp; Wiederherstellung</h1>
  </div>

  <section class="section">
    <h2>Sicherung erstellen</h2>
    <div class="card">
      <p>
        Erstellt eine verschlüsselte Datei mit allen Daten. Speichere sie z. B. in der Dateien-App oder in iCloud
        Drive.
      </p>
      <p class="muted">Letzte Sicherung: {lastBackupText}</p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void makeBackup();
        }}
      >
        <PasswordField bind:value={backupPw} label="Backup-Passwort" autocomplete="new-password" />
        <PasswordField bind:value={backupPw2} label="Wiederholen" autocomplete="new-password" />
        <p class="muted hint">
          Du kannst dein App-Passwort verwenden. Ohne dieses Passwort kann die Sicherung nicht geöffnet werden.
        </p>
        {#if backupPw.length > 0 || backupPw2.length > 0}
          {#each backupProblems as p (p)}<p class="error">{p}</p>{/each}
        {/if}
        {#if backupError}<p class="error" role="alert">{backupError}</p>{/if}
        <button type="submit" class="btn btn-primary" disabled={!canCreateBackup}>
          {backupBusy ? 'Wird erstellt …' : 'Sicherung erstellen'}
        </button>
      </form>
      {#if backupFile}
        <div class="share">
          <button type="button" class="btn btn-secondary" onclick={shareBackup}>📤 Datei teilen / speichern</button>
        </div>
      {/if}
    </div>
  </section>

  <section class="section">
    <h2>Wiederherstellen</h2>
    <div class="card">
      <div class="field">
        <label for="restore-file">Sicherungsdatei wählen</label>
        <input
          id="restore-file"
          type="file"
          accept="application/json,.json"
          bind:this={fileInput}
          onchange={(e) => void onFileChosen(e)}
        />
      </div>

      {#if readFile && !incoming}
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void decrypt();
          }}
        >
          <PasswordField bind:value={restorePw} label="Passwort der Sicherung" autocomplete="current-password" />
          <button type="submit" class="btn btn-primary" disabled={restoreBusy || restorePw.length === 0}>
            {restoreBusy ? 'Wird entschlüsselt …' : 'Entschlüsseln'}
          </button>
        </form>
      {/if}

      {#if incoming}
        <p class="summary">{summary}</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" disabled={restoreBusy} onclick={() => void merge()}>
            Zusammenführen
          </button>
          <button type="button" class="btn btn-danger" disabled={restoreBusy} onclick={() => void replaceAll()}>
            Alles ersetzen
          </button>
        </div>
      {/if}

      {#if restoreError}<p class="error" role="alert">{restoreError}</p>{/if}
    </div>
  </section>

  <section class="section">
    <h2>Export als CSV (Excel)</h2>
    <div class="card">
      <p class="warning"><strong>Achtung:</strong> Die CSV-Datei ist <strong>nicht verschlüsselt</strong>.</p>
      {#if csvError}<p class="error" role="alert">{csvError}</p>{/if}
      <button type="button" class="btn btn-secondary" onclick={makeCsv}>CSV erstellen</button>
      {#if csvFile}
        <div class="share">
          <button type="button" class="btn btn-secondary" onclick={shareCsv}>📤 Teilen / speichern</button>
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .section {
    margin-bottom: 24px;
  }

  .card p:first-child {
    margin-top: 0;
  }

  .hint {
    font-size: 14px;
    margin: 0 0 12px;
  }

  .share,
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  .summary {
    font-weight: 600;
  }

  .warning {
    padding: 10px 12px;
    border-radius: var(--radius);
    background: #fef3c7;
    color: #78350f;
    border: 1px solid #f59e0b;
  }
</style>
