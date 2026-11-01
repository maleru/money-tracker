<script lang="ts">
  import PasswordField from '../components/PasswordField.svelte';
  import RecoveryKeyDisplay from '../components/RecoveryKeyDisplay.svelte';
  import { MIN_PASSWORD_LENGTH } from '../lib/crypto/vault';
  import { passwordProblems } from '../lib/passwordRules';
  import { finishSetup, setupVault } from '../lib/state/session';

  let step = $state<1 | 2>(1);
  let password = $state('');
  let repeat = $state('');
  let understood = $state(false);
  let busy = $state(false);
  let error = $state('');

  let recoveryKey = $state('');
  let noted = $state(false);

  const problems = $derived(passwordProblems(password, repeat));
  const canSubmit = $derived(problems.length === 0 && understood && !busy);

  async function create(): Promise<void> {
    if (!canSubmit) return;
    busy = true;
    error = '';
    try {
      recoveryKey = await setupVault(password);
      password = '';
      repeat = '';
      understood = false;
      step = 2;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Einrichtung fehlgeschlagen';
    } finally {
      busy = false;
    }
  }

  async function proceed(): Promise<void> {
    if (!noted) return;
    recoveryKey = '';
    await finishSetup();
  }
</script>

<div class="page">
  <div class="screen">
    {#if step === 1}
      <div class="card">
        <h1>Willkommen bei Money Tracker</h1>
        <p class="muted">
          Deine Daten werden ausschließlich auf diesem iPhone gespeichert und mit deinem Passwort verschlüsselt. Niemand – auch nicht der Entwickler – kann sie ohne Passwort lesen.
        </p>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <PasswordField bind:value={password} label="Passwort" autocomplete="new-password" />
          <PasswordField bind:value={repeat} label="Passwort wiederholen" autocomplete="new-password" />
          <p class="hint" class:error={password.length < MIN_PASSWORD_LENGTH && password.length > 0} class:muted={password.length === 0 || password.length >= MIN_PASSWORD_LENGTH}>
            Mindestens {MIN_PASSWORD_LENGTH} Zeichen (aktuell: {password.length})
          </p>
          {#if repeat.length > 0 && password !== repeat}
            <p class="error">Passwörter stimmen nicht überein</p>
          {/if}
          <label class="check">
            <input type="checkbox" bind:checked={understood} />
            <span>Ich habe verstanden: Wenn ich Passwort <strong>und</strong> Wiederherstellungsschlüssel verliere, sind meine Daten unwiederbringlich verloren.</span>
          </label>
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          <button type="submit" class="btn btn-primary" disabled={!canSubmit}>{busy ? 'Wird eingerichtet…' : 'Tresor anlegen'}</button>
        </form>
      </div>
    {:else}
      <div class="card">
        <h1>Dein Wiederherstellungsschlüssel</h1>
        <RecoveryKeyDisplay {recoveryKey} />
        <p class="muted">
          Notiere diesen Schlüssel auf Papier oder speichere ihn in deinem Passwort-Manager. Er ist die einzige Möglichkeit, an deine Daten zu kommen, falls du dein Passwort vergisst.
        </p>
        <label class="check">
          <input type="checkbox" bind:checked={noted} />
          <span>Ich habe den Schlüssel sicher notiert</span>
        </label>
        <button type="button" class="btn btn-primary" disabled={!noted} onclick={() => void proceed()}>Weiter</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    max-width: 400px;
    margin: 0 auto;
  }

  .hint {
    font-size: 14px;
    margin: 0 0 8px;
  }

  .check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 14px 0;
    min-height: 44px;
  }

  .check input {
    flex: none;
    margin-top: 2px;
  }

</style>
