import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { WrongSecretError } from '../crypto/vault';
import { db } from '../db/db';
import { addMonths, currentMonthKey } from '../dates';
import { addTransaction, categories, clearAll, recurring, saveRecurring, transactions } from './data';
import { clearDek, hasDek } from './key';
import {
  changeMasterPassword,
  finishSetup,
  getDek,
  initSession,
  lock,
  newRecoveryKey,
  recover,
  setupVault,
  status,
  unlock,
} from './session';

const PASSWORD = 'correct horse battery';
const TIMEOUT = 30000;

beforeEach(async () => {
  clearDek();
  clearAll();
  await db.delete();
  await db.open();
  status.set('loading');
});

describe('session', () => {
  it('initSession auf leerer DB ergibt setup', async () => {
    await initSession();
    expect(get(status)).toBe('setup');
  });

  it('setupVault liefert Recovery-Key (8 Gruppen), Status bleibt setup', async () => {
    await initSession();
    const key = await setupVault(PASSWORD);
    expect(key).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(get(status)).toBe('setup');
    expect(hasDek()).toBe(true);
    expect(get(categories).length).toBeGreaterThan(0);

    await finishSetup();
    expect(get(status)).toBe('unlocked');
  }, TIMEOUT);

  it('setupVault lehnt zu kurze Passwörter ab', async () => {
    await expect(setupVault('kurz')).rejects.toThrow();
    expect(await db.meta.count()).toBe(0);
  });

  it('initSession mit vorhandenem Tresor ergibt locked', async () => {
    await setupVault(PASSWORD);
    await initSession();
    expect(get(status)).toBe('locked');
  }, TIMEOUT);

  it('lock sperrt, leert die Stores, getDek wirft', async () => {
    await setupVault(PASSWORD);
    await finishSetup();
    await addTransaction({
      type: 'expense', amountCents: 100, date: '2026-10-01', categoryId: 'cat-groceries',
      accountId: 'acc-checking', direction: null, merchant: '', originalText: '',
      city: '', note: '', source: 'manual', recurringId: null,
    });
    expect(get(transactions)).toHaveLength(1);

    lock();
    expect(get(status)).toBe('locked');
    expect(get(transactions)).toHaveLength(0);
    expect(get(categories)).toHaveLength(0);
    expect(() => getDek()).toThrow();
  }, TIMEOUT);

  it('unlock: falsches Passwort wirft WrongSecretError, richtiges lädt Daten', async () => {
    await setupVault(PASSWORD);
    await finishSetup();
    await addTransaction({
      type: 'expense', amountCents: 100, date: '2026-10-01', categoryId: 'cat-groceries',
      accountId: 'acc-checking', direction: null, merchant: '', originalText: '',
      city: '', note: '', source: 'manual', recurringId: null,
    });
    lock();

    await expect(unlock('völlig falsches passwort')).rejects.toBeInstanceOf(WrongSecretError);
    expect(get(status)).toBe('locked');
    expect(hasDek()).toBe(false);

    await unlock(PASSWORD);
    expect(get(status)).toBe('unlocked');
    expect(get(transactions)).toHaveLength(1);
    expect(get(categories).length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('recover setzt neues Passwort, danach funktioniert unlock damit', async () => {
    const recoveryKey = await setupVault(PASSWORD);
    await finishSetup();
    lock();

    const newPassword = 'ein ganz neues passwort';
    await recover(recoveryKey.toLowerCase().replace(/-/g, ''), newPassword);
    expect(get(status)).toBe('unlocked');
    expect(get(categories).length).toBeGreaterThan(0);

    lock();
    await expect(unlock(PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    await unlock(newPassword);
    expect(get(status)).toBe('unlocked');
  }, TIMEOUT);

  it('changeMasterPassword und newRecoveryKey aktualisieren die Meta', async () => {
    const oldKey = await setupVault(PASSWORD);
    await finishSetup();

    await expect(changeMasterPassword(PASSWORD, 'kurz')).rejects.toThrow();
    const newPw = 'noch ein neues passwort';
    await changeMasterPassword(PASSWORD, newPw);

    const newKey = await newRecoveryKey(newPw);
    expect(newKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(newKey).not.toBe(oldKey);

    lock();
    await expect(unlock(PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    await unlock(newPw);
    expect(get(status)).toBe('unlocked');
    await expect(recover(oldKey, 'wieder ein anderes passwort')).rejects.toBeInstanceOf(WrongSecretError);
  }, 60000);

  it('setupVault überschreibt keinen bestehenden Tresor', async () => {
    await setupVault(PASSWORD);
    await finishSetup();
    lock();
    await expect(setupVault('ein anderes passwort')).rejects.toThrow('Tresor existiert bereits');
    await unlock(PASSWORD);
    expect(get(status)).toBe('unlocked');
  }, TIMEOUT);

  it('unlock erzeugt wiederkehrende Buchungen genau einmal', async () => {
    await setupVault(PASSWORD);
    await finishSetup();
    await saveRecurring({
      id: 'rec-1', type: 'expense', amountCents: 5000, categoryId: 'cat-groceries', accountId: 'acc-checking',
      direction: null, merchant: 'Verein', note: '',
      dayOfMonth: 1, startMonth: addMonths(currentMonthKey(), -2), endMonth: null, lastGeneratedMonth: null,
      active: true, updatedAt: '',
    });
    lock();

    await unlock(PASSWORD);
    expect(get(status)).toBe('unlocked');
    expect(get(transactions)).toHaveLength(3);
    expect(get(recurring)[0].lastGeneratedMonth).toBe(currentMonthKey());

    lock();
    await unlock(PASSWORD);
    expect(get(transactions)).toHaveLength(3);
  }, TIMEOUT);

  it('lock während unlock hebt das Entsperren auf', async () => {
    await setupVault(PASSWORD);
    await finishSetup();
    await addTransaction({
      type: 'expense', amountCents: 100, date: '2026-10-01', categoryId: 'cat-groceries',
      accountId: 'acc-checking', direction: null, merchant: '', originalText: '',
      city: '', note: '', source: 'manual', recurringId: null,
    });
    lock();
    const pending = unlock(PASSWORD);
    lock();
    await pending;
    expect(get(status)).toBe('locked');
    expect(hasDek()).toBe(false);
    expect(get(transactions)).toHaveLength(0);
    expect(get(categories)).toHaveLength(0);
  }, TIMEOUT);
});
