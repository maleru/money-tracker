import { daysBetween, toIsoDate } from '../dates';
import type { Settings } from '../types';

/**
 * Liefert den Text der Backup-Erinnerung oder null, wenn kein Banner angezeigt werden soll.
 * `today` ist ein lokales Datum (YYYY-MM-DD).
 */
export function backupReminder(settings: Settings | null, txCount: number, today: string): string | null {
  if (!settings || settings.backupReminderDays <= 0 || txCount < 1) return null;
  if (settings.lastBackupAt === null) return 'Du hast noch keine Sicherung erstellt.';

  const last = new Date(settings.lastBackupAt);
  if (Number.isNaN(last.getTime())) return 'Du hast noch keine Sicherung erstellt.';

  const days = daysBetween(toIsoDate(last), today);
  if (days >= settings.backupReminderDays) return `Letzte Sicherung vor ${days} Tagen.`;
  return null;
}
