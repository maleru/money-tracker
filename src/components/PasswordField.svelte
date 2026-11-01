<script lang="ts">
  let {
    value = $bindable(),
    label,
    autocomplete,
    autofocus = false,
  }: {
    value: string;
    label: string;
    autocomplete: 'current-password' | 'new-password';
    autofocus?: boolean;
  } = $props();

  let visible = $state(false);
  let input: HTMLInputElement | undefined = $state();

  // Eindeutige ID pro Instanz für label/for.
  const id = `pw-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (autofocus && input) input.focus();
  });
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="wrap">
    <input {id} bind:this={input} bind:value type={visible ? 'text' : 'password'} {autocomplete} autocapitalize="off" spellcheck="false" />
    <button
      type="button"
      class="eye"
      aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
      aria-pressed={visible}
      onclick={() => (visible = !visible)}
    >
      {visible ? '🙈' : '👁️'}
    </button>
  </div>
</div>

<style>
  .wrap {
    position: relative;
  }

  input {
    padding-right: 48px;
  }

  .eye {
    position: absolute;
    top: 0;
    right: 0;
    width: 44px;
    height: 100%;
    font-size: 18px;
  }
</style>
