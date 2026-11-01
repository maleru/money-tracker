import { describe, expect, it } from 'vitest';
import type { RecurringTemplate } from './types';
import { plannedThisMonth } from './recurring';

const NOW = '2026-11-01T12:00:00.000Z';
const TODAY = '2026-10-15';

function tpl(over: Partial<RecurringTemplate> & Pick<RecurringTemplate, 'id' | 'dayOfMonth'>): RecurringTemplate {
  return {
    type: 'expense',
    amountCents: 1000,
    categoryId: 'cat-housing-rent',
    accountId: 'acc-checking',
    direction: null,
    merchant: 'Max Mustermann',
    note: '',
    startMonth: '2026-01',
    endMonth: null,
    lastGeneratedMonth: '2026-09',
    active: true,
    updatedAt: NOW,
    ...over,
  };
}

describe('plannedThisMonth (E3.2)', () => {
  it('t1: aktiv, Termin in der Zukunft, nicht erzeugt -> gelistet', () => {
    const r = plannedThisMonth([tpl({ id: 't1', dayOfMonth: 20 })], TODAY);
    expect(r.map((x) => x.templateId)).toEqual(['t1']);
    expect(r[0].date).toBe('2026-10-20');
  });

  it('t2: Termin liegt nicht in der Zukunft -> nicht gelistet', () => {
    expect(plannedThisMonth([tpl({ id: 't2', dayOfMonth: 10 })], TODAY)).toEqual([]);
  });

  it('t3: inaktiv -> nicht gelistet', () => {
    expect(plannedThisMonth([tpl({ id: 't3', dayOfMonth: 20, active: false })], TODAY)).toEqual([]);
  });

  it('t4: endMonth vor dem Monat -> nicht gelistet', () => {
    expect(plannedThisMonth([tpl({ id: 't4', dayOfMonth: 20, endMonth: '2026-09' })], TODAY)).toEqual([]);
  });

  it('t5: startMonth nach dem Monat -> nicht gelistet', () => {
    expect(plannedThisMonth([tpl({ id: 't5', dayOfMonth: 20, startMonth: '2026-11' })], TODAY)).toEqual([]);
  });

  it('t6: Tag 31 wird auf Monatsende (31.10.) begrenzt -> gelistet', () => {
    const r = plannedThisMonth([tpl({ id: 't6', dayOfMonth: 31 })], TODAY);
    expect(r.map((x) => x.date)).toEqual(['2026-10-31']);
  });

  it('t7: bereits für den Monat erzeugt -> nicht gelistet', () => {
    expect(plannedThisMonth([tpl({ id: 't7', dayOfMonth: 20, lastGeneratedMonth: '2026-10' })], TODAY)).toEqual([]);
  });

  it('Sortierung nach Datum: [t6, t1] ergibt [t1, t6]', () => {
    const t1 = tpl({ id: 't1', dayOfMonth: 20 });
    const t6 = tpl({ id: 't6', dayOfMonth: 31 });
    expect(plannedThisMonth([t6, t1], TODAY).map((x) => x.templateId)).toEqual(['t1', 't6']);
  });
});
