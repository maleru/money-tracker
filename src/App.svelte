<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import TabBar from './components/TabBar.svelte';
  import Toast from './components/Toast.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { matchRoute, navigate, route } from './lib/router';
  import { initSession, status } from './lib/state/session';
  import Accounts from './routes/Accounts.svelte';
  import Backup from './routes/Backup.svelte';
  import Categories from './routes/Categories.svelte';
  import CategoryForm from './routes/CategoryForm.svelte';
  import CategoryDrilldown from './routes/CategoryDrilldown.svelte';
  import Import from './routes/Import.svelte';
  import ImportSettings from './routes/ImportSettings.svelte';
  import Lock from './routes/Lock.svelte';
  import Overview from './routes/Overview.svelte';
  import Settings from './routes/Settings.svelte';
  import Recurring from './routes/Recurring.svelte';
  import Rules from './routes/Rules.svelte';
  import Setup from './routes/Setup.svelte';
  import Stats from './routes/Stats.svelte';
  import TransactionForm from './routes/TransactionForm.svelte';
  import Transactions from './routes/Transactions.svelte';

  type IdProps = { id?: string };
  // Svelte typisiert Komponenten ohne Props als Record<string, never>.
  type NoProps = Record<string, never>;

  type RouteEntry =
    | { pattern: string; component: Component<IdProps>; withParams: true }
    | { pattern: string; component: Component<NoProps>; withParams: false };

  // Routen (Architektur §10). Die erste passende Route gewinnt.
  const routes: RouteEntry[] = [
    { pattern: '/', component: Overview, withParams: false },
    { pattern: '/transactions', component: Transactions, withParams: false },
    { pattern: '/add', component: TransactionForm, withParams: true },
    { pattern: '/edit/:id', component: TransactionForm, withParams: true },
    { pattern: '/category/:id', component: CategoryDrilldown, withParams: true },
    { pattern: '/settings', component: Settings, withParams: false },
    { pattern: '/settings/categories', component: Categories, withParams: false },
    { pattern: '/settings/categories/new', component: CategoryForm, withParams: true },
    { pattern: '/settings/categories/:id', component: CategoryForm, withParams: true },
    { pattern: '/settings/accounts', component: Accounts, withParams: false },
    { pattern: '/settings/import', component: ImportSettings, withParams: false },
    { pattern: '/backup', component: Backup, withParams: false },
    { pattern: '/stats', component: Stats, withParams: false },
    { pattern: '/settings/recurring', component: Recurring, withParams: false },
    { pattern: '/settings/rules', component: Rules, withParams: false },
    { pattern: '/import', component: Import, withParams: false },
  ];

  onMount(() => {
    void initSession();
  });

  const match = $derived.by(() => {
    for (const entry of routes) {
      const params = matchRoute(entry.pattern, $route.path);
      if (params) return { entry, params };
    }
    return null;
  });

  // Unbekannte Route -> Übersicht.
  $effect(() => {
    if ($status === 'unlocked' && match === null) navigate('/');
  });
</script>

{#if $status === 'loading'}
  <div class="center"><p class="muted">Lädt…</p></div>
{:else if $status === 'setup'}
  <Setup />
{:else if $status === 'locked'}
  <Lock />
{:else if match}
  {@const entry = match.entry}
  <!-- {#key}: Bei Wechsel zwischen z. B. /edit/a und /edit/b wird die Komponente neu erzeugt,
       damit id-abhängiger Zustand (Formularfelder, Kategorie) nicht veraltet. -->
  {#key $route.path + '?' + $route.query.toString()}
    {#if entry.withParams}
      {@const C = entry.component}
      <C {...match.params} />
    {:else}
      {@const C = entry.component}
      <C />
    {/if}
  {/key}
  <TabBar />
{/if}

<Toast />
<UpdateBanner />

<style>
  .center {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
</style>
