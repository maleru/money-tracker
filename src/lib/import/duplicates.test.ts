import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { markDuplicates, type DupCandidate } from './duplicates';

const NOW = '2026-11-01T12:00:00.000Z';

function tx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    amountCents: 4215,
    date: '2026-10-21',
    categoryId: 'cat-groceries',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'Lidl',
    originalText: '',
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function row(date: string, signedCents: number, merchants: string[]): DupCandidate {
  return { date, signedCents, merchants };
}

// Bestehende Buchungen aus der Tabelle in E5.3
const L = tx({ id: 'L', date: '2026-10-21', amountCents: 4215, merchant: 'Lidl' });
const R = tx({
  id: 'R',
  date: '2026-10-01',
  amountCents: 89900,
  merchant: 'Miete',
  categoryId: 'cat-housing-rent',
  recurringId: 'rec-1',
});
const A = tx({ id: 'A', date: '2026-10-10', amountCents: 1999, merchant: 'AMAZON PRIME' });
const D = tx({ id: 'D', date: '2026-10-10', amountCents: 2500, merchant: 'DB VERTRIEB' });
const W = tx({
  id: 'W',
  date: '2026-10-15',
  amountCents: 112000,
  merchant: 'Miete Wohnung',
  originalText: 'ERIKA UND HANS MUSTER',
  categoryId: 'cat-housing-rent',
});
const T = tx({
  id: 'T',
  type: 'transfer',
  direction: 'in',
  date: '2026-10-26',
  amountCents: 300000,
  merchant: 'Max Mustermann',
  originalText: 'Max Mustermann',
  categoryId: 'cat-transfer-savings',
});

/** Ergebnis-Kurzform: [kind, matchId] */
function kinds(candidates: DupCandidate[], existing: Transaction[]): { kind: string; matchId?: string }[] {
  return markDuplicates(candidates, existing).map((m) => (m.matchId ? { kind: m.kind, matchId: m.matchId } : { kind: m.kind }));
}

describe('markDuplicates', () => {
  it('D1: exact, Händler enthält den Buchungstext', () => {
    expect(kinds([row('2026-10-21', -4215, ['LIDL SAGT DANKE'])], [L])).toEqual([{ kind: 'exact', matchId: 'L' }]);
  });

  it('D2: likely bei einem Tag Abstand und ähnlichem Händler', () => {
    expect(kinds([row('2026-10-22', -4215, ['Lidl'])], [L])).toEqual([{ kind: 'likely', matchId: 'L' }]);
  });

  it('D3: kein Duplikat bei 4 Tagen Abstand', () => {
    expect(kinds([row('2026-10-25', -4215, ['Lidl'])], [L])).toEqual([{ kind: 'none' }]);
  });

  it('D4: kein Duplikat bei anderem Händler', () => {
    expect(kinds([row('2026-10-22', -4215, ['Aldi'])], [L])).toEqual([{ kind: 'none' }]);
  });

  it('D5: kein Duplikat bei umgekehrtem Vorzeichen', () => {
    expect(kinds([row('2026-10-21', 4215, ['Lidl'])], [L])).toEqual([{ kind: 'none' }]);
  });

  it('D6: Multiset, zwei gleiche Zeilen bei einer Buchung ergeben exact und none', () => {
    expect(
      kinds([row('2026-10-21', -4215, ['Lidl']), row('2026-10-21', -4215, ['Lidl'])], [L]),
    ).toEqual([{ kind: 'exact', matchId: 'L' }, { kind: 'none' }]);
  });

  it('D7: recurring bei 2 Tagen Abstand, Händler egal', () => {
    expect(kinds([row('2026-10-03', -89900, ['Erika und Hans Muster'])], [R])).toEqual([
      { kind: 'recurring', matchId: 'R' },
    ]);
  });

  it('D8: kein Duplikat bei recurring und 6 Tagen Abstand', () => {
    expect(kinds([row('2026-10-07', -89900, ['Erika und Hans Muster'])], [R])).toEqual([{ kind: 'none' }]);
  });

  it('D9: exact bei gleichem Datum und gleichem Händler, auch wenn recurring', () => {
    expect(kinds([row('2026-10-01', -89900, ['Miete'])], [R])).toEqual([{ kind: 'exact', matchId: 'R' }]);
  });

  it('D10: recurring wird vor exact geprüft, auch wenn die exact-Zeile später steht', () => {
    expect(kinds([row('2026-10-02', -89900, ['X']), row('2026-10-21', -4215, ['Lidl'])], [R, L])).toEqual([
      { kind: 'recurring', matchId: 'R' },
      { kind: 'exact', matchId: 'L' },
    ]);
  });

  it('D11: likely bei gemeinsamem Wort AMAZON', () => {
    expect(kinds([row('2026-10-11', -1999, ['Amazon Marketplace'])], [A])).toEqual([
      { kind: 'likely', matchId: 'A' },
    ]);
  });

  it('D12: likely bei gemeinsamem Wort PRIME', () => {
    expect(kinds([row('2026-10-11', -1999, ['AMZ PRIME'])], [A])).toEqual([{ kind: 'likely', matchId: 'A' }]);
  });

  it('D13: kein Duplikat, weil DB nur 2 Zeichen hat', () => {
    expect(kinds([row('2026-10-11', -2500, ['DB AG'])], [D])).toEqual([{ kind: 'none' }]);
  });

  it('D14: exact über originalText', () => {
    expect(kinds([row('2026-10-15', -112000, ['Erika und Hans Muster', 'Miete Wohnung'])], [W])).toEqual([
      { kind: 'exact', matchId: 'W' },
    ]);
  });

  it('D15: exact für Umbuchung eingehend, Vorzeichen positiv', () => {
    expect(kinds([row('2026-10-26', 300000, ['Max Mustermann'])], [T])).toEqual([{ kind: 'exact', matchId: 'T' }]);
  });

  it('D16: leere Händlerliste gilt als passend (exact)', () => {
    expect(kinds([row('2026-10-21', -4215, [''])], [L])).toEqual([{ kind: 'exact', matchId: 'L' }]);
  });

  it('D17: bei mehreren exakten Treffern gewinnt die erste Buchung in Listenreihenfolge', () => {
    const copy = tx({ id: 'Lcopy', date: '2026-10-01', amountCents: 89900, merchant: 'Miete', recurringId: null });
    expect(kinds([row('2026-10-01', -89900, ['Miete'])], [R, copy])).toEqual([{ kind: 'exact', matchId: 'R' }]);
  });
});
