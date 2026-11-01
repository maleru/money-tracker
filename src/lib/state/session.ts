import { get, writable, type Writable } from 'svelte/store';
import { db } from '../db/db';
import {
  MIN_PASSWORD_LENGTH,
  changePassword,
  createVault,
  regenerateRecoveryKey,
  resetPasswordWithRecovery,
  unlockWithPassword,
  type VaultMeta,
} from '../crypto/vault';
import { clearAll, loadAll, runRecurring, seedDefaults, settings } from './data';
import { clearDek, setDek } from './key';
import { showToast } from './toast';

export { getDek } from './key';

export type SessionStatus = 'loading' | 'setup' | 'locked' | 'unlocked';
export const status: Writable<SessionStatus> = writable<SessionStatus>('loading');

const INACTIVITY_MS = 5 * 60_000;
const CHECK_INTERVAL_MS = 15_000;
const DEFAULT_AUTO_LOCK_MINUTES = 1;

let lastActivity = Date.now();
let hiddenAt: number | null = null;
let listenersRegistered = false;
// Erhöht bei jedem lock(). Entsperr-Vorgänge merken sich den Wert vor dem ersten await
// und brechen ab, wenn während des Vorgangs gesperrt wurde (Race-Schutz).
let generation = 0;

function assertPasswordLength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`);
  }
}

async function readMeta(): Promise<VaultMeta> {
  const meta = await db.meta.get('vault');
  if (!meta) throw new Error('Kein Tresor vorhanden');
  return meta;
}

/** Fehler werden ignoriert. */
async function requestPersist(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // ignoriert
  }
}

function autoLockMinutes(): number {
  return get(settings)?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES;
}

function registerAutoLock(): void {
  if (listenersRegistered) return;
  if (typeof document === 'undefined') return;
  listenersRegistered = true;

  document.addEventListener('visibilitychange', () => {
    if (get(status) !== 'unlocked') return;
    if (document.visibilityState === 'hidden') {
      if (autoLockMinutes() === 0) {
        lock();
      } else {
        hiddenAt = Date.now();
      }
    } else if (document.visibilityState === 'visible') {
      const since = hiddenAt;
      hiddenAt = null;
      if (since !== null && Date.now() - since >= autoLockMinutes() * 60_000) {
        lock();
      }
    }
  });

  const touch = (): void => { lastActivity = Date.now(); };
  document.addEventListener('pointerdown', touch);
  document.addEventListener('keydown', touch);

  setInterval(() => {
    if (get(status) === 'unlocked' && Date.now() - lastActivity >= INACTIVITY_MS) {
      lock();
    }
  }, CHECK_INTERVAL_MS);
}

export async function initSession(): Promise<void> {
  const meta = await db.meta.get('vault');
  status.set(meta ? 'locked' : 'setup');
  registerAutoLock();
}

/** Gibt den Wiederherstellungsschlüssel zurück. Der Status bleibt 'setup'. */
export async function setupVault(password: string): Promise<string> {
  assertPasswordLength(password);
  // Schutz: Ein bestehender Tresor darf niemals überschrieben werden (sonst wären alle Daten verloren).
  if (await db.meta.get('vault')) throw new Error('Tresor existiert bereits');
  const { meta, dek, recoveryKey } = await createVault(password);
  await db.meta.put(meta);
  setDek(dek);
  await seedDefaults();
  await loadAll();
  await requestPersist();
  return recoveryKey;
}

/** Erzeugt fällige wiederkehrende Buchungen. Fehler verhindern das Entsperren nicht. */
async function generateRecurring(): Promise<void> {
  try {
    const n = await runRecurring();
    if (n > 0) showToast(`${n} wiederkehrende Buchung(en) hinzugefügt`);
  } catch {
    showToast('Wiederkehrende Buchungen konnten nicht erzeugt werden', 'error');
  }
}

export async function finishSetup(): Promise<void> {
  const gen = generation;
  await generateRecurring();
  if (gen !== generation) return; // während der Erzeugung wurde gesperrt
  status.set('unlocked');
  lastActivity = Date.now();
}

async function enterUnlocked(dek: CryptoKey, gen: number): Promise<void> {
  // Wurde während des Entsperrens gesperrt, bleibt der Zustand 'locked'.
  if (gen !== generation) return;
  setDek(dek);
  await loadAll();
  if (gen !== generation) return; // lock() hat den DEK bereits gelöscht und die Stores geleert
  await generateRecurring();
  if (gen !== generation) return;
  await requestPersist();
  status.set('unlocked');
  lastActivity = Date.now();
}

/** Wirft WrongSecretError bei falschem Passwort. */
export async function unlock(password: string): Promise<void> {
  const gen = generation;
  const meta = await readMeta();
  const dek = await unlockWithPassword(meta, password);
  await enterUnlocked(dek, gen);
}

export async function recover(recoveryKey: string, newPassword: string): Promise<void> {
  assertPasswordLength(newPassword);
  const gen = generation;
  const meta = await readMeta();
  const result = await resetPasswordWithRecovery(meta, recoveryKey, newPassword);
  await db.meta.put(result.meta);
  await enterUnlocked(result.dek, gen);
}

export function lock(): void {
  generation += 1;
  clearDek();
  clearAll();
  hiddenAt = null;
  status.set('locked');
  if (typeof location !== 'undefined') location.hash = '#/';
}

export async function changeMasterPassword(oldPw: string, newPw: string): Promise<void> {
  assertPasswordLength(newPw);
  const meta = await readMeta();
  const newMeta = await changePassword(meta, oldPw, newPw);
  await db.meta.put(newMeta);
}

export async function newRecoveryKey(password: string): Promise<string> {
  const meta = await readMeta();
  const result = await regenerateRecoveryKey(meta, password);
  await db.meta.put(result.meta);
  return result.recoveryKey;
}

export async function wipeEverything(): Promise<void> {
  lock();
  await db.delete();
  location.reload();
}
