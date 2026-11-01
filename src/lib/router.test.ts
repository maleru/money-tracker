import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { back, matchRoute, navigate, parseHash, route } from './router';

describe('parseHash', () => {
  it('leerer Hash und "#" ergeben "/"', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#').path).toBe('/');
    expect(parseHash('#/').path).toBe('/');
  });

  it('liest Pfad und Query', () => {
    const r = parseHash('#/edit/abc?type=income&x=1');
    expect(r.path).toBe('/edit/abc');
    expect(r.query.get('type')).toBe('income');
    expect(r.query.get('x')).toBe('1');
  });

  it('entfernt einen abschließenden Slash außer bei "/"', () => {
    expect(parseHash('#/settings/').path).toBe('/settings');
    expect(parseHash('#/settings/categories//').path).toBe('/settings/categories');
    expect(parseHash('#/').path).toBe('/');
  });

  it('liefert eine leere Query ohne "?"', () => {
    expect(Array.from(parseHash('#/add').query.keys())).toHaveLength(0);
  });

  it('behandelt Query ohne Pfad', () => {
    const r = parseHash('#?month=2026-10');
    expect(r.path).toBe('/');
    expect(r.query.get('month')).toBe('2026-10');
  });

  it('ergänzt einen fehlenden führenden Slash', () => {
    expect(parseHash('#settings').path).toBe('/settings');
  });
});

describe('matchRoute', () => {
  it('extrahiert Parameter', () => {
    expect(matchRoute('/edit/:id', '/edit/abc')).toEqual({ id: 'abc' });
  });

  it('matcht statische Pfade mit leeren Params', () => {
    expect(matchRoute('/settings', '/settings')).toEqual({});
    expect(matchRoute('/', '/')).toEqual({});
  });

  it('liefert null bei abweichendem statischem Segment', () => {
    expect(matchRoute('/edit/:id', '/add/abc')).toBeNull();
    expect(matchRoute('/settings', '/backup')).toBeNull();
  });

  it('liefert null bei unterschiedlicher Segmentanzahl', () => {
    expect(matchRoute('/edit/:id', '/edit')).toBeNull();
    expect(matchRoute('/edit/:id', '/edit/abc/def')).toBeNull();
    expect(matchRoute('/', '/transactions')).toBeNull();
  });

  it('dekodiert Parameter', () => {
    expect(matchRoute('/edit/:id', '/edit/a%20b')).toEqual({ id: 'a b' });
  });

  it('liefert null bei ungültiger Kodierung', () => {
    expect(matchRoute('/edit/:id', '/edit/%E0%A4%A')).toBeNull();
  });

  it('statische Route hat Vorrang nur durch Reihenfolge: "new" matcht auch :id', () => {
    expect(matchRoute('/settings/categories/new', '/settings/categories/new')).toEqual({});
    expect(matchRoute('/settings/categories/:id', '/settings/categories/new')).toEqual({ id: 'new' });
  });
});

describe('navigate/back (Node)', () => {
  it('sind ohne window sicher aufrufbar', () => {
    expect(() => navigate('/add')).not.toThrow();
    expect(() => back()).not.toThrow();
  });
});

describe('route store (Node)', () => {
  it('liefert ohne window "/" mit leerer Query', () => {
    const r = get(route);
    expect(r.path).toBe('/');
    expect(Array.from(r.query.keys())).toHaveLength(0);
  });
});

describe('back() über history.state (simuliertes window)', () => {
  type Listener = () => void;

  interface FakeWindow {
    location: { hash: string };
    history: {
      state: { mtDepth?: number } | null;
      replaceState: (state: { mtDepth?: number } | null, title: string) => void;
      back: ReturnType<typeof vi.fn>;
    };
    addEventListener: (type: string, fn: Listener) => void;
  }

  /** Lädt das Router-Modul frisch mit einem Fake-window, damit der Modul-Init läuft. */
  async function loadWithWindow(initialState: { mtDepth?: number } | null) {
    const listeners: Listener[] = [];
    const fake: FakeWindow = {
      location: { hash: '' },
      history: {
        state: initialState,
        replaceState(state) {
          this.state = state;
        },
        back: vi.fn(),
      },
      addEventListener(type, fn) {
        if (type === 'hashchange') listeners.push(fn);
      },
    };
    vi.stubGlobal('window', fake);
    vi.resetModules();
    const mod = await import('./router');
    /** Simuliert einen hashchange nach einer Navigation. */
    const fireHashchange = (): void => listeners.forEach((fn) => fn());
    return { fake, mod, fireHashchange };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setzt beim Init mtDepth 0, wenn kein State vorhanden ist', async () => {
    const { fake } = await loadWithWindow(null);
    expect(fake.history.state).toEqual({ mtDepth: 0 });
  });

  it('lässt einen vorhandenen mtDepth-State unverändert', async () => {
    const { fake } = await loadWithWindow({ mtDepth: 3 });
    expect(fake.history.state).toEqual({ mtDepth: 3 });
  });

  it('back() auf Tiefe 0 navigiert zur Übersicht statt history.back()', async () => {
    const { fake, mod } = await loadWithWindow({ mtDepth: 0 });
    mod.back();
    expect(fake.history.back).not.toHaveBeenCalled();
    expect(fake.location.hash).toBe('/');
  });

  it('back() auf Tiefe > 0 ruft history.back() auf', async () => {
    const { fake, mod } = await loadWithWindow({ mtDepth: 2 });
    mod.back();
    expect(fake.history.back).toHaveBeenCalledTimes(1);
    expect(fake.location.hash).toBe('');
  });

  it('markiert eine neue Navigation (State ohne mtDepth) mit lastDepth + 1', async () => {
    const { fake, fireHashchange } = await loadWithWindow({ mtDepth: 0 });
    fake.history.state = null;
    fireHashchange();
    expect(fake.history.state).toEqual({ mtDepth: 1 });
    fake.history.state = null;
    fireHashchange();
    expect(fake.history.state).toEqual({ mtDepth: 2 });
  });

  it('erkennt einen history.back()-Eintrag (mtDepth vorhanden) nicht als neue Navigation', async () => {
    const { fake, fireHashchange } = await loadWithWindow({ mtDepth: 0 });
    fake.history.state = null;
    fireHashchange(); // neue Navigation -> Tiefe 1
    fake.history.state = { mtDepth: 0 }; // simuliert history.back() auf Tiefe 0
    fireHashchange();
    expect(fake.history.state).toEqual({ mtDepth: 0 });
  });
});
