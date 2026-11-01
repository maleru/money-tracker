import { readable, type Readable } from 'svelte/store';

export interface Route { path: string; query: URLSearchParams }

/** '#/edit/abc?type=income' -> { path: '/edit/abc', query }. '' oder '#' -> '/'. */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIndex = raw.indexOf('?');
  const pathPart = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : raw.slice(qIndex + 1);

  let path = pathPart.startsWith('/') ? pathPart : '/' + pathPart;
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  return { path, query: new URLSearchParams(queryPart) };
}

/** '/edit/:id' vs '/edit/abc' -> { id: 'abc' }. Kein Match -> null. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternSegs = pattern.split('/').filter((s) => s !== '');
  const pathSegs = path.split('/').filter((s) => s !== '');
  if (patternSegs.length !== pathSegs.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i];
    const s = pathSegs[i];
    if (p.startsWith(':')) {
      try {
        params[p.slice(1)] = decodeURIComponent(s);
      } catch {
        return null;
      }
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

function currentRoute(): Route {
  if (typeof window === 'undefined') return { path: '/', query: new URLSearchParams() };
  return parseHash(window.location.hash);
}

export const route: Readable<Route> = readable<Route>(currentRoute(), (set) => {
  if (typeof window === 'undefined') return;
  const update = (): void => set(currentRoute());
  window.addEventListener('hashchange', update);
  update();
  return () => window.removeEventListener('hashchange', update);
});

// Navigationstiefe innerhalb der App, gespeichert in history.state.mtDepth pro Eintrag.
// Vorteil gegenüber einem Zähler: Der Wert gehört zum Eintrag selbst, also bleibt er bei
// history.back() korrekt, ohne Flags oder Timer. Einträge von außerhalb der App (ohne mtDepth)
// werden beim ersten hashchange als neue Navigation mit Tiefe lastDepth + 1 markiert.

/** Liest die Tiefe des aktuellen History-Eintrags. Fehlt sie, gilt 0. */
function readDepth(): number {
  if (typeof window === 'undefined') return 0;
  const depth: unknown = window.history.state?.mtDepth;
  return typeof depth === 'number' ? depth : 0;
}

let lastDepth = 0;

if (typeof window !== 'undefined') {
  if (typeof window.history.state?.mtDepth !== 'number') {
    window.history.replaceState({ mtDepth: 0 }, '');
  }
  lastDepth = readDepth();

  // hashchange feuert erst nach dem ersten Laden: Links (<a href="#/...">) und navigate() zählen gleichermaßen.
  // history.back() stellt den state des Vorgängers wieder her (mit mtDepth), dort wird nichts neu markiert.
  window.addEventListener('hashchange', () => {
    if (typeof window.history.state?.mtDepth !== 'number') {
      window.history.replaceState({ mtDepth: lastDepth + 1 }, '');
    }
    lastDepth = readDepth();
  });
}

/** `path` beginnt mit '/'. */
export function navigate(path: string): void {
  if (typeof window === 'undefined') return;
  window.location.hash = path;
}

/** Geht einen Schritt zurück, aber nur innerhalb der App; sonst zur Übersicht. */
export function back(): void {
  if (typeof window === 'undefined') return;
  if (readDepth() > 0) {
    window.history.back();
  } else {
    navigate('/');
  }
}
