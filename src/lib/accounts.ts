import type { Account, AccountKind } from './types';

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: 'Girokonto',
  credit_card: 'Kreditkarte',
  savings: 'Sparkonto / Tagesgeld',
  other: 'Sonstiges',
};

export const ACCOUNT_ICONS: string[] = ['🏦', '💳', '🐷', '👛', '💶'];

export const MAX_ACCOUNT_NAME_LENGTH = 30;

/**
 * trim; '' -> 'Bitte einen Namen eingeben'; > 30 -> 'Name ist zu lang (max. 30 Zeichen)';
 * gleicher Name (case-insensitive) bei anderem Konto -> 'Name bereits vergeben'; sonst null.
 */
export function validateAccountName(name: string, accounts: Account[], ownId?: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Bitte einen Namen eingeben';
  if (trimmed.length > MAX_ACCOUNT_NAME_LENGTH) return 'Name ist zu lang (max. 30 Zeichen)';
  const key = trimmed.toLowerCase();
  const taken = accounts.some((a) => a.id !== ownId && a.name.trim().toLowerCase() === key);
  return taken ? 'Name bereits vergeben' : null;
}

/** Nicht archivierte Konten, sortiert nach sortOrder, dann name; keepId wird angehängt, falls archiviert. */
export function selectableAccounts(accounts: Account[], keepId: string | null = null): Account[] {
  const active = accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de'));
  if (keepId !== null && !active.some((a) => a.id === keepId)) {
    const kept = accounts.find((a) => a.id === keepId);
    if (kept) active.push(kept);
  }
  return active;
}
