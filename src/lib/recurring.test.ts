import { describe, expect, it } from 'vitest';
import { generateDue, MAX_MONTHS_PER_RUN } from './recurring';
import type { RecurringTemplate, Transaction } from './types';

const NOW = '2026-10-21T10:00:00.000Z';

function tpl(over: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 'r1',
    type: 'expense',
    amountCents: 1000,
    categoryId: 'cat-rent',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'Vermieter',
    note: 'Miete',
    dayOfMonth: 15,
    startMonth: '2026-07',
    endMonth: null,
    lastGeneratedMonth: null,
    active: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function ex(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    amountCents: 1000,
    date: '2026-10-01',
    categoryId: 'cat-rent',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'Vermieter',
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

describe('generateDue', () => {
  it('Start vor 3 Monaten, Tag bereits erreicht: 4 Buchungen (Jul..Okt)', () => {
    const { newTx, updated } = generateDue([tpl()], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15']);
    expect(updated).toHaveLength(1);
    expect(updated[0].lastGeneratedMonth).toBe('2026-10');
    expect(updated[0].updatedAt).toBe(NOW);
  });

  it('Start vor 3 Monaten, Tag noch nicht erreicht: 3 Buchungen', () => {
    const { newTx, updated } = generateDue([tpl({ dayOfMonth: 25 })], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-07-25', '2026-08-25', '2026-09-25']);
    expect(updated[0].lastGeneratedMonth).toBe('2026-09');
  });

  it('Buchungsfelder stammen aus der Vorlage', () => {
    const { newTx } = generateDue([tpl({ startMonth: '2026-10' })], '2026-10-21', NOW, []);
    expect(newTx).toEqual([
      {
        type: 'expense',
        amountCents: 1000,
        date: '2026-10-15',
        categoryId: 'cat-rent',
        accountId: 'acc-checking',
        direction: null,
        merchant: 'Vermieter',
        originalText: '',
        city: '',
        note: 'Miete',
        source: 'recurring',
        recurringId: 'r1',
      },
    ]);
  });

  it('dayOfMonth 31 im Februar ergibt den 28.', () => {
    const { newTx } = generateDue([tpl({ dayOfMonth: 31, startMonth: '2026-02' })], '2026-03-05', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-02-28']);
  });

  it('dayOfMonth 31 im Schaltjahr: am 29.02.2028 ergibt sich der 29.', () => {
    const { newTx } = generateDue([tpl({ dayOfMonth: 31, startMonth: '2028-02' })], '2028-02-29', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2028-02-29']);
  });

  it('endMonth wird eingehalten (inklusiv)', () => {
    const { newTx, updated } = generateDue([tpl({ endMonth: '2026-08' })], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-07-15', '2026-08-15']);
    expect(updated[0].lastGeneratedMonth).toBe('2026-08');
  });

  it('zweiter Aufruf erzeugt nichts mehr (Idempotenz)', () => {
    const first = generateDue([tpl()], '2026-10-21', NOW, []);
    const second = generateDue(first.updated, '2026-10-21', NOW, []);
    expect(second.newTx).toHaveLength(0);
    expect(second.updated).toHaveLength(0);
  });

  it('setzt nach lastGeneratedMonth fort', () => {
    const { newTx } = generateDue([tpl({ lastGeneratedMonth: '2026-08' })], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-09-15', '2026-10-15']);
  });

  it('beginnt nie vor startMonth', () => {
    const { newTx } = generateDue(
      [tpl({ startMonth: '2026-09', lastGeneratedMonth: '2026-05' })],
      '2026-10-21',
      NOW,
      [],
    );
    expect(newTx.map((t) => t.date)).toEqual(['2026-09-15', '2026-10-15']);
  });

  it('inaktive Vorlagen erzeugen nichts', () => {
    const { newTx, updated } = generateDue([tpl({ active: false })], '2026-10-21', NOW, []);
    expect(newTx).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('startMonth in der Zukunft erzeugt nichts', () => {
    const { newTx, updated } = generateDue([tpl({ startMonth: '2026-12' })], '2026-10-21', NOW, []);
    expect(newTx).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('updated enthält nur geänderte Vorlagen', () => {
    const unchanged = tpl({ id: 'r2', lastGeneratedMonth: '2026-10' });
    const changed = tpl({ id: 'r1' });
    const { updated } = generateDue([unchanged, changed], '2026-10-21', NOW, []);
    expect(updated.map((t) => t.id)).toEqual(['r1']);
  });

  it('Schutz: höchstens 120 Monate pro Vorlage und Aufruf', () => {
    const { newTx, updated } = generateDue([tpl({ startMonth: '2000-01' })], '2026-10-21', NOW, []);
    expect(newTx).toHaveLength(MAX_MONTHS_PER_RUN);
    expect(updated[0].lastGeneratedMonth).toBe('2009-12');
  });

  it('dayOfMonth 31 im April ergibt den 30.', () => {
    const { newTx } = generateDue([tpl({ dayOfMonth: 31, startMonth: '2026-04' })], '2026-04-30', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-04-30']);
  });

  it('aktueller Monat mit Datum in der Zukunft wird NICHT als lastGeneratedMonth markiert', () => {
    // Start im aktuellen Monat (Oktober), Tag 25 liegt nach heute (21.10.)
    const { newTx, updated } = generateDue([tpl({ startMonth: '2026-10', dayOfMonth: 25 })], '2026-10-21', NOW, []);
    expect(newTx).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('aktueller Monat mit Datum in der Zukunft: Vormonat wird erzeugt, aktueller Monat nicht markiert', () => {
    const { newTx, updated } = generateDue([tpl({ startMonth: '2026-09', dayOfMonth: 25 })], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-09-25']);
    expect(updated[0].lastGeneratedMonth).toBe('2026-09');
  });

  it('aktueller Monat am heutigen Tag wird erzeugt', () => {
    const { newTx, updated } = generateDue([tpl({ startMonth: '2026-10', dayOfMonth: 21 })], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-10-21']);
    expect(updated[0].lastGeneratedMonth).toBe('2026-10');
  });

  it('endMonth vor dem aktuellen Monat stoppt die Erzeugung', () => {
    const { newTx } = generateDue([tpl({ startMonth: '2026-01', endMonth: '2026-02' })], '2026-10-21', NOW, []);
    expect(newTx.map((t) => t.date)).toEqual(['2026-01-15', '2026-02-15']);
  });
});

describe('generateDue – Recurring-Skip', () => {
  // Vorlage t: 89900 ct, Tag 1, Girokonto, Start 2026-09, aktiv; heute 2026-10-15
  const t = tpl({ id: 'rt', amountCents: 89900, dayOfMonth: 1, startMonth: '2026-09', merchant: 'Miete' });
  const TODAY = '2026-10-15';

  it('R1: manuelle Buchung 1 Tag vor dem Termin verhindert September, Oktober wird erzeugt', () => {
    const { newTx, updated } = generateDue(
      [t],
      TODAY,
      NOW,
      [ex({ id: 'e1', amountCents: 89900, date: '2026-09-02', merchant: 'Miete' })],
    );
    expect(newTx.map((x) => x.date)).toEqual(['2026-10-01']);
    expect(updated[0].lastGeneratedMonth).toBe('2026-10');
  });

  it('R2: 6 Tage Abstand überschreitet die Toleranz, September wird erzeugt', () => {
    const { newTx } = generateDue([t], TODAY, NOW, [ex({ id: 'e1', amountCents: 89900, date: '2026-09-07' })]);
    expect(newTx).toHaveLength(2);
  });

  it('R3: anderes Konto verhindert den Skip', () => {
    const { newTx } = generateDue(
      [t],
      TODAY,
      NOW,
      [ex({ id: 'e1', amountCents: 89900, date: '2026-09-02', accountId: 'acc-credit-card' })],
    );
    expect(newTx).toHaveLength(2);
  });

  it('R4: Buchung aus einer anderen Vorlage (recurringId gesetzt) verhindert den Skip nicht', () => {
    const { newTx } = generateDue(
      [t],
      TODAY,
      NOW,
      [ex({ id: 'e1', amountCents: 89900, date: '2026-09-02', recurringId: 'other' })],
    );
    expect(newTx).toHaveLength(2);
  });

  it('R5: Buchung am 30.09. verhindert den Oktober-Termin (1 Tag Abstand), September bleibt', () => {
    const { newTx } = generateDue([t], TODAY, NOW, [ex({ id: 'e1', amountCents: 89900, date: '2026-09-30' })]);
    expect(newTx.map((x) => x.date)).toEqual(['2026-09-01']);
  });

  it('R6: zwei Vorlagen mit gleichen Daten: die Buchung wird nur einmal verbraucht', () => {
    const t2 = { ...t, id: 'rt2' };
    const { newTx } = generateDue([t, t2], TODAY, NOW, [ex({ id: 'e1', amountCents: 89900, date: '2026-09-01' })]);
    expect(newTx).toHaveLength(3);
  });

  it('R7: Transfer-Vorlage überspringt nur bei gleicher Richtung', () => {
    const transferTpl = tpl({
      id: 'rt3',
      type: 'transfer',
      direction: 'out',
      categoryId: 'cat-transfer-invest',
      amountCents: 89900,
      dayOfMonth: 1,
      startMonth: '2026-09',
      merchant: 'Depot',
    });
    const { newTx } = generateDue(
      [transferTpl],
      TODAY,
      NOW,
      [ex({ id: 'e1', type: 'transfer', direction: 'in', amountCents: 89900, date: '2026-09-01', categoryId: 'cat-transfer-invest' })],
    );
    expect(newTx).toHaveLength(2);
  });

  it('R8: Monate sind bereits durch Buchungen belegt, der Monat gilt trotzdem als generiert', () => {
    const { newTx, updated } = generateDue(
      [t],
      TODAY,
      NOW,
      [
        ex({ id: 'e1', amountCents: 89900, date: '2026-09-01' }),
        ex({ id: 'e2', amountCents: 89900, date: '2026-10-01' }),
      ],
    );
    expect(newTx).toEqual([]);
    expect(updated[0].lastGeneratedMonth).toBe('2026-10');
  });
});
