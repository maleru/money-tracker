<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import PasswordField from '../components/PasswordField.svelte';
  import RecoveryKeyDisplay from '../components/RecoveryKeyDisplay.svelte';
  import { WrongSecretError } from '../lib/crypto/vault';
  import { passwordProblems } from '../lib/passwordRules';
  import { settings, transactions, updateSettings } from '../lib/state/data';
  import { changeMasterPassword, lock, newRecoveryKey, wipeEverything } from '../lib/state/session';
  import { showToast } from '../lib/state/toast';
  import type { Settings } from '../lib/types';

  type AutoLock = Settings['autoLockMinutes'];
  type Reminder = Settings['backupReminderDays'];

  const AUTO_LOCK_OPTIONS: { value: AutoLock; label: string }[] = [
    { value: 0, label: 'Sofort' },
    { value: 1, label: 'Nach 1 Minute' },
    { value: 5, label: 'Nach 5 Minuten' },
    { value: 15, label: 'Nach 15 Minuten' },
  ];
  const REMINDER_OPTIONS: { value: Reminder; label: string }[] = [
    { value: 0, label: 'Aus' },
    { value: 7, label: '7 Tage' },
    { value: 14, label: '14 Tage' },
    { value: 30, label: '30 Tage' },
  ];

  // Mapping-Funktionen mit erlaubten Werten (kein any, keine blinde Typumwandlung).
  function toAutoLock(v: string): AutoLock {
    const n = Number(v);
    return AUTO_LOCK_OPTIONS.find((o) => o.value === n)?.value ?? 1;
  }

  function toReminder(v: string): Reminder {
    const n = Number(v);
    return REMINDER_OPTIONS.find((o) => o.value === n)?.value ?? 14;
  }

  // Lokale Werte, einmalig aus den Einstellungen initialisiert.
  let autoLock = $state(String(untrack(() => get(settings)?.autoLockMinutes ?? 1)));
  let reminder = $state(String(untrack(() => get(settings)?.backupReminderDays ?? 14)));

  async function saveSetting(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
    try {
      await updateSettings(patch);
    } catch {
      // PLAN-FRAGE: Für Speicherfehler ist kein Text im Plan vorgegeben.
      showToast('Speichern fehlgeschlagen', 'error');
    }
  }

  // Passwort ändern
  let oldPw = $state('');
  let newPw = $state('');
  let repeatPw = $state('');
  let pwBusy = $state(false);
  let pwError = $state('');
  const pwProblems = $derived(passwordProblems(newPw, repeatPw));
  const canChangePw = $derived(oldPw.length > 0 && pwProblems.length === 0 && !pwBusy);

  async function changePw(): Promise<void> {
    if (!canChangePw) return;
    pwBusy = true;
    pwError = '';
    try {
      await changeMasterPassword(oldPw, newPw);
      oldPw = '';
      newPw = '';
      repeatPw = '';
      showToast('Passwort geändert');
    } catch (e) {
      pwError =
        e instanceof WrongSecretError
          ? 'Altes Passwort falsch'
          : // PLAN-FRAGE: Für sonstige Fehler ist kein Text im Plan vorgegeben.
            'Passwort konnte nicht geändert werden';
    } finally {
      pwBusy = false;
    }
  }

  // Neuer Wiederherstellungsschlüssel (nur im RAM, nie persistiert)
  let keyPw = $state('');
  let keyBusy = $state(false);
  let keyError = $state('');
  let recoveryKey = $state('');

  async function createKey(): Promise<void> {
    if (keyBusy || keyPw.length === 0) return;
    keyBusy = true;
    keyError = '';
    try {
      recoveryKey = await newRecoveryKey(keyPw);
      keyPw = '';
    } catch (e) {
      keyError =
        e instanceof WrongSecretError
          ? 'Passwort falsch'
          : // PLAN-FRAGE: Für sonstige Fehler ist kein Text im Plan vorgegeben.
            'Schlüssel konnte nicht erzeugt werden';
    } finally {
      keyBusy = false;
    }
  }

  function doneKey(): void {
    recoveryKey = '';
    keyPw = '';
    keyError = '';
  }

  // Info
  let persisted = $state('…');
  onMount(() => {
    void (async () => {
      try {
        const p = await navigator.storage?.persisted?.();
        persisted = p === undefined ? 'Unbekannt' : p ? 'Ja' : 'Nein';
      } catch {
        persisted = 'Unbekannt';
      }
    })();
  });

  function wipe(): void {
    if (prompt('Zum Bestätigen LÖSCHEN eingeben') === 'LÖSCHEN') {
      void wipeEverything();
    }
  }
</script>

<div class="page">
  <div class="header">
    <h1>Einstellungen</h1>
  </div>

  <h2 class="group-title">Daten</h2>
  <ul class="list">
    <li class="list-item"><a class="row-link" href="#/settings/categories"><span>Kategorien</span><span class="muted">›</span></a></li>
    <li class="list-item"><a class="row-link" href="#/settings/recurring"><span>Wiederkehrende Buchungen</span><span class="muted">›</span></a></li>
    <li class="list-item"><a class="row-link" href="#/settings/rules"><span>Händler-Regeln</span><span class="muted">›</span></a></li>
    <li class="list-item"><a class="row-link" href="#/backup"><span>Sicherung &amp; Wiederherstellung</span><span class="muted">›</span></a></li>
  </ul>

  <h2 class="group-title">Sicherheit</h2>
  <ul class="list">
    <li class="list-item">
      <label class="row-label" for="set-autolock">Automatisch sperren</label>
      <select
        id="set-autolock"
        class="inline-select"
        bind:value={autoLock}
        onchange={(e) => void saveSetting({ autoLockMinutes: toAutoLock(e.currentTarget.value) })}
      >
        {#each AUTO_LOCK_OPTIONS as o (o.value)}
          <option value={String(o.value)}>{o.label}</option>
        {/each}
      </select>
    </li>
    <li class="list-item">
      <label class="row-label" for="set-reminder">Backup-Erinnerung</label>
      <select
        id="set-reminder"
        class="inline-select"
        bind:value={reminder}
        onchange={(e) => void saveSetting({ backupReminderDays: toReminder(e.currentTarget.value) })}
      >
        {#each REMINDER_OPTIONS as o (o.value)}
          <option value={String(o.value)}>{o.label}</option>
        {/each}
      </select>
    </li>
    <li class="list-item stack">
      <details>
        <summary>Passwort ändern</summary>
        <form
          class="panel"
          onsubmit={(e) => {
            e.preventDefault();
            void changePw();
          }}
        >
          <PasswordField bind:value={oldPw} label="Altes Passwort" autocomplete="current-password" />
          <PasswordField bind:value={newPw} label="Neues Passwort" autocomplete="new-password" />
          <PasswordField bind:value={repeatPw} label="Neues Passwort wiederholen" autocomplete="new-password" />
          {#if newPw.length > 0 || repeatPw.length > 0}
            {#each pwProblems as p (p)}<p class="error">{p}</p>{/each}
          {/if}
          {#if pwError}<p class="error" role="alert">{pwError}</p>{/if}
          <button type="submit" class="btn btn-primary" disabled={!canChangePw}>Passwort ändern</button>
        </form>
      </details>
    </li>
    <li class="list-item stack">
      <details>
        <summary>Neuer Wiederherstellungsschlüssel</summary>
        <div class="panel">
          {#if recoveryKey}
            <RecoveryKeyDisplay {recoveryKey} />
            <p class="error">Der alte Schlüssel ist ab sofort ungültig.</p>
            <button type="button" class="btn btn-primary" onclick={doneKey}>Fertig</button>
          {:else}
            <form
              onsubmit={(e) => {
                e.preventDefault();
                void createKey();
              }}
            >
              <PasswordField bind:value={keyPw} label="Passwort" autocomplete="current-password" />
              {#if keyError}<p class="error" role="alert">{keyError}</p>{/if}
              <button type="submit" class="btn btn-secondary" disabled={keyBusy || keyPw.length === 0}>
                Neuen Schlüssel erzeugen
              </button>
            </form>
          {/if}
        </div>
      </details>
    </li>
    <li class="list-item">
      <button type="button" class="row-button" onclick={() => lock()}>🔒 Jetzt sperren</button>
    </li>
  </ul>

  <h2 class="group-title">Info</h2>
  <ul class="list">
    <li class="list-item"><span class="row-label">Version</span><span class="muted">{__APP_VERSION__}</span></li>
    <li class="list-item"><span class="row-label">Speicher dauerhaft</span><span class="muted">{persisted}</span></li>
    <li class="list-item"><span class="row-label">Anzahl Buchungen</span><span class="muted">{$transactions.length}</span></li>
  </ul>
  <p class="muted tip">
    Tipp: Lösche die App nicht vom Home-Bildschirm – dabei werden alle Daten gelöscht. Erstelle regelmäßig Sicherungen.
  </p>

  <h2 class="group-title">Gefahrenzone</h2>
  <button type="button" class="btn btn-danger" onclick={wipe}>Alle Daten löschen</button>
</div>

<style>
  .group-title {
    margin: 20px 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }

  .row-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    color: var(--text);
    text-decoration: none;
  }

  .row-label {
    flex: 1;
  }

  .inline-select {
    width: auto;
    max-width: 55%;
  }

  .stack {
    display: block;
  }

  details summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .panel {
    padding: 4px 0 8px;
  }

  .row-button {
    width: 100%;
    text-align: left;
  }

  .tip {
    font-size: 14px;
    margin: 8px 4px 0;
  }
</style>
