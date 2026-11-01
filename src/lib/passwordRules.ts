import { MIN_PASSWORD_LENGTH } from './crypto/vault';

/** Liefert die deutschen Meldungen zu allen verletzten Passwort-Regeln (leer = gültig). */
export function passwordProblems(pw: string, repeat: string): string[] {
  const problems: string[] = [];
  if (pw.length < MIN_PASSWORD_LENGTH) problems.push(`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`);
  if (pw !== repeat) problems.push('Passwörter stimmen nicht überein');
  return problems;
}
