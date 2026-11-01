<script lang="ts">
  import { onDestroy } from 'svelte';
  import PasswordField from '../components/PasswordField.svelte';
  import { WrongSecretError } from '../lib/crypto/vault';
  import { unlock } from '../lib/state/session';
  import Recover from './Recover.svelte';

  let mode = $state<'unlock' | 'recover'>('unlock');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  // Fehlversuche liegen nur im RAM.
  let failures = 0;
  let remaining = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const canSubmit = $derived(!busy && remaining === 0 && password.length > 0);

  function stopTimer(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  function startCountdown(seconds: number): void {
    stopTimer();
    const endAt = Date.now() + seconds * 1000;
    remaining = seconds;
    timer = setInterval(() => {
      remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (remaining === 0) stopTimer();
    }, 250);
  }

  onDestroy(stopTimer);

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    busy = true;
    error = '';
    try {
      await unlock(password);
      password = '';
      failures = 0;
    } catch (e) {
      if (e instanceof WrongSecretError) {
        error = 'Falsches Passwort';
        password = '';
        failures += 1;
        startCountdown(Math.min(30, 2 ** (failures - 1)));
      } else {
        error = 'Entsperren fehlgeschlagen';
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <div class="screen">
    {#if mode === 'unlock'}
      <div class="card">
        <div class="logo" aria-hidden="true">🔒</div>
        <h1>Money Tracker</h1>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <PasswordField bind:value={password} label="Passwort" autocomplete="current-password" autofocus />
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          <button type="submit" class="btn btn-primary" disabled={!canSubmit}>
            {busy ? 'Entsperre…' : remaining > 0 ? `Entsperren (${remaining} s)` : 'Entsperren'}
          </button>
        </form>
        <button type="button" class="link" onclick={() => (mode = 'recover')}>Passwort vergessen?</button>
      </div>
    {:else}
      <Recover onback={() => (mode = 'unlock')} />
    {/if}
  </div>
</div>

<style>
  .screen {
    max-width: 400px;
    margin: 0 auto;
  }

  .logo {
    font-size: 56px;
    text-align: center;
    line-height: 1.2;
  }

  h1 {
    text-align: center;
  }

  .link {
    display: block;
    margin: 8px auto 0;
    color: var(--primary);
    text-decoration: underline;
  }
</style>
