import { writable, type Readable } from 'svelte/store';

export interface ToastMsg { id: number; text: string; kind: 'info' | 'error' }

const store = writable<ToastMsg[]>([]);
let nextId = 1;

export const toasts: Readable<ToastMsg[]> = { subscribe: store.subscribe };

/** Zeigt einen Toast; er verschwindet nach 2500 ms. */
export function showToast(text: string, kind: 'info' | 'error' = 'info'): void {
  const id = nextId++;
  store.update((list) => [...list, { id, text, kind }]);
  setTimeout(() => {
    store.update((list) => list.filter((t) => t.id !== id));
  }, 2500);
}
