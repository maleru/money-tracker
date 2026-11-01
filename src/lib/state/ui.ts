import { writable } from 'svelte/store';
import { currentMonthKey } from '../dates';

/** Geteilt von Overview und Transactions. */
export const selectedMonth = writable<string>(currentMonthKey());

/** Backup-Banner in der Übersicht wurde in dieser Session mit ✕ ausgeblendet. */
export const backupBannerDismissed = writable<boolean>(false);
