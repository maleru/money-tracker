import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH } from './crypto/vault';
import { passwordProblems } from './passwordRules';

describe('passwordProblems', () => {
  it('liefert keine Probleme bei ausreichend langem, identischem Passwort', () => {
    const pw = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(passwordProblems(pw, pw)).toEqual([]);
  });

  it('meldet ein zu kurzes Passwort', () => {
    const pw = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(passwordProblems(pw, pw)).toEqual(['Mindestens 10 Zeichen']);
  });

  it('akzeptiert genau die Mindestlänge', () => {
    const pw = 'x'.repeat(10);
    expect(passwordProblems(pw, pw)).toEqual([]);
  });

  it('meldet ungleiche Wiederholung', () => {
    expect(passwordProblems('abcdefghij', 'abcdefghik')).toEqual(['Passwörter stimmen nicht überein']);
  });

  it('meldet beide Probleme gemeinsam', () => {
    expect(passwordProblems('kurz', 'anders')).toEqual(['Mindestens 10 Zeichen', 'Passwörter stimmen nicht überein']);
  });

  it('meldet leere Eingaben als zu kurz, aber nicht als ungleich', () => {
    expect(passwordProblems('', '')).toEqual(['Mindestens 10 Zeichen']);
  });

  it('unterscheidet Groß-/Kleinschreibung', () => {
    expect(passwordProblems('Abcdefghij', 'abcdefghij')).toEqual(['Passwörter stimmen nicht überein']);
  });
});
