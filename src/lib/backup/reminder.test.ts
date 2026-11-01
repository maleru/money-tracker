import { describe, expect, it } from 'vitest';
import { toIsoDate } from '../dates';
import { defaultSettings } from '../db/defaults';
import type { Settings } from '../types';
import { backupReminder } from './reminder';

function settings(over: Partial<Settings> = {}): Settings {
  return { ...defaultSettings('2026-01-01T00:00:00.000Z'), ...over };
}

/** Lokaler Mittag eines Tages als ISO-Zeitstempel (zeitzonenunabhängig). */
function localNoon(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

describe('backupReminder', () => {
  it('null ohne Einstellungen', () => {
    expect(backupReminder(null, 5, '2026-11-01')).toBeNull();
  });

  it('null, wenn die Erinnerung aus ist (0)', () => {
    expect(backupReminder(settings({ backupReminderDays: 0, lastBackupAt: null }), 5, '2026-11-01')).toBeNull();
  });

  it('null ohne Buchungen', () => {
    expect(backupReminder(settings({ lastBackupAt: null }), 0, '2026-11-01')).toBeNull();
  });

  it('Text bei noch nie gesicherten Daten', () => {
    expect(backupReminder(settings({ lastBackupAt: null }), 1, '2026-11-01')).toBe(
      'Du hast noch keine Sicherung erstellt.',
    );
  });

  it('null, wenn die letzte Sicherung jünger als die Frist ist', () => {
    const s = settings({ backupReminderDays: 14, lastBackupAt: localNoon(2026, 10, 20) });
    expect(backupReminder(s, 3, '2026-11-01')).toBeNull(); // 12 Tage
  });

  it('Text genau bei Erreichen der Frist', () => {
    const s = settings({ backupReminderDays: 14, lastBackupAt: localNoon(2026, 10, 18) });
    expect(backupReminder(s, 3, '2026-11-01')).toBe('Letzte Sicherung vor 14 Tagen.');
  });

  it('Text mit der tatsächlichen Anzahl Tage', () => {
    const s = settings({ backupReminderDays: 7, lastBackupAt: localNoon(2026, 10, 1) });
    expect(backupReminder(s, 3, '2026-11-01')).toBe('Letzte Sicherung vor 31 Tagen.');
  });

  it('verwendet das lokale Datum des Zeitstempels', () => {
    const stamp = localNoon(2026, 10, 25);
    const s = settings({ backupReminderDays: 7, lastBackupAt: stamp });
    const local = toIsoDate(new Date(stamp));
    expect(local).toBe('2026-10-25');
    expect(backupReminder(s, 1, '2026-11-01')).toBe('Letzte Sicherung vor 7 Tagen.');
    expect(backupReminder(s, 1, '2026-10-31')).toBeNull();
  });

  it('behandelt einen unlesbaren Zeitstempel wie "noch nie"', () => {
    const s = settings({ lastBackupAt: 'kaputt' });
    expect(backupReminder(s, 1, '2026-11-01')).toBe('Du hast noch keine Sicherung erstellt.');
  });
});
