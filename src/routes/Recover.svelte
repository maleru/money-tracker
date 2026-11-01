<script lang="ts">
  import PasswordField from '../components/PasswordField.svelte';
  import { MIN_PASSWORD_LENGTH } from '../lib/crypto/vault';
  import { passwordProblems } from '../lib/passwordRules';
  import { recover } from '../lib/state/session';
  import { showToast } from '../lib/state/toast';

  let { onback }: { onback: () => void } = $props();

  let recoveryKey = $state('');
  let password = $state('');
  let repeat = $state('');
  let busy = $state(false);
  let error = $state('');

  const keyId = `rk-${Math.random().toString(36).slice(2)}`;

  const problems = $derived(passwordProblems(password, repeat));
  const canSubmit = $derived(recoveryKey.trim().length > 0 && problems.length === 0 && !busy);

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    busy = true;
    error = '';
    try {
      await recover(recoveryKey, password);
      recoveryKey = '';
      password = '';
      repeat = '';
      showToast('Passwort geändert');
    } catch {
      // Die Passwortlänge wurde bereits im UI geprüft; jeder Fehler gilt hier als ungültiger Schlüssel.
      error = 'Wiederherstellungsschlüssel ungültig';
    } finally {
      busy = false;
    }
  }
</script>

<div class="card">
  <h1>Passwort zurücksetzen</h1>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void submit();
    }}
  >
    <div class="field">
      <label for={keyId}>Wiederherstellungsschlüssel</label>
      <input id={keyId} class="key-input" type="text" bind:value={recoveryKey} autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" />
    </div>
    <PasswordField bind:value={password} label="Neues Passwort" autocomplete="new-password" />
    <PasswordField bind:value={repeat} label="Passwort wiederholen" autocomplete="new-password" />
    <p class="hint" class:error={password.length > 0 && password.length < MIN_PASSWORD_LENGTH} class:muted={password.length === 0 || password.length >= MIN_PASSWORD_LENGTH}>
      Mindestens {MIN_PASSWORD_LENGTH} Zeichen (aktuell: {password.length})
    </p>
    {#if repeat.length > 0 && password !== repeat}
      <p class="error">Passwörter stimmen nicht überein</p>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button type="submit" class="btn btn-primary" disabled={!canSubmit}>Passwort zurücksetzen</button>
  </form>
  <button type="button" class="link" onclick={onback}>Zurück</button>
</div>

<style>
  .hint {
    font-size: 14px;
    margin: 0 0 8px;
  }

  .key-input {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: uppercase;
  }

  .link {
    display: block;
    margin: 8px auto 0;
    color: var(--primary);
    text-decoration: underline;
  }
</style>
