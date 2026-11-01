import { describe, it, expect } from 'vitest';
import {
  normalizeMerchant,
  suggestCategory,
  learnRule,
  lastCategoryForMerchant,
  merchantSuggestions,
  proposeCategory,
} from './merchant';
import type { Category, MerchantRule, Transaction, TxType } from './types';

const T0 = '2026-01-01T00:00:00.000Z';

let txCounter = 0;
/** Erzeugt eine Buchung; die Reihenfolge im Array bestimmt "neueste zuerst". */
function tx(merchant: string, categoryId: string, type: TxType = 'expense'): Transaction {
  txCounter += 1;
  return {
    id: 'tx-' + txCounter,
    type,
    amountCents: 100,
    date: '2026-01-01',
    categoryId,
    merchant,
    city: '',
    note: '',
    source: 'manual',
    recurringId: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

function cat(id: string, type: TxType, archived = false): Category {
  return {
    id,
    name: id,
    type,
    icon: '📦',
    color: '#6b7280',
    archived,
    sortOrder: 0,
    monthlyBudgetCents: null,
    updatedAt: T0,
  };
}

function rule(
  pattern: string,
  categoryId: string,
  source: MerchantRule['source'] = 'default',
  updatedAt = T0,
): MerchantRule {
  return { id: 'rule-' + pattern + '-' + categoryId, pattern, categoryId, source, updatedAt };
}

describe('normalizeMerchant', () => {
  it('ersetzt Satzzeichen durch Leerzeichen', () => {
    expect(normalizeMerchant('Fashion.Outlet.Center/')).toBe('FASHION OUTLET CENTER');
  });

  it('wandelt Umlaute um', () => {
    expect(normalizeMerchant('Müller Drogerie')).toBe('MUELLER DROGERIE');
    expect(normalizeMerchant('Äpfel Öl Übung')).toBe('AEPFEL OEL UEBUNG');
    expect(normalizeMerchant('Straße')).toBe('STRASSE');
  });

  it('fasst Leerzeichen zusammen und trimmt', () => {
    expect(normalizeMerchant('  a   b  ')).toBe('A B');
  });

  it('liefert für leere oder reine Sonderzeichen-Eingaben einen leeren String', () => {
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant(' ./- ')).toBe('');
  });

  it('behält Ziffern', () => {
    expect(normalizeMerchant('H&M 123')).toBe('H M 123');
  });
});

describe('suggestCategory', () => {
  const categories = [
    cat('groceries', 'expense'),
    cat('discount', 'expense'),
    cat('old', 'expense', true),
    cat('salary', 'income'),
  ];

  it('passt auf ganze Wörter', () => {
    const rules = [rule('ALDI', 'groceries')];
    expect(suggestCategory('ALDI SUED', 'expense', rules, categories)).toBe('groceries');
    expect(suggestCategory('Aldi', 'expense', rules, categories)).toBe('groceries');
    expect(suggestCategory('Filiale Aldi Süd', 'expense', rules, categories)).toBe('groceries');
  });

  it('passt nicht auf Teilwörter', () => {
    const rules = [rule('ALDI', 'groceries')];
    expect(suggestCategory('RINALDI', 'expense', rules, categories)).toBeNull();
    expect(suggestCategory('ALDIS', 'expense', rules, categories)).toBeNull();
  });

  it('passt auf mehrteilige Muster', () => {
    const rules = [rule('AMAZON PRIME', 'groceries')];
    expect(suggestCategory('Amazon Prime Video', 'expense', rules, categories)).toBe('groceries');
    expect(suggestCategory('Amazon', 'expense', rules, categories)).toBeNull();
  });

  it('liefert null für leeren Händler', () => {
    const rules = [rule('ALDI', 'groceries')];
    expect(suggestCategory('', 'expense', rules, categories)).toBeNull();
    expect(suggestCategory(' / ', 'expense', rules, categories)).toBeNull();
  });

  it('liefert null ohne passende Regel', () => {
    expect(suggestCategory('Irgendwas', 'expense', [rule('ALDI', 'groceries')], categories)).toBeNull();
    expect(suggestCategory('Aldi', 'expense', [], categories)).toBeNull();
  });

  it('wählt das längere Muster', () => {
    const rules = [rule('ALDI', 'groceries'), rule('ALDI SUED', 'discount')];
    expect(suggestCategory('ALDI SUED', 'expense', rules, categories)).toBe('discount');
    // Reihenfolge der Regeln spielt keine Rolle
    expect(suggestCategory('ALDI SUED', 'expense', [...rules].reverse(), categories)).toBe('discount');
  });

  it('ignoriert archivierte Kategorien', () => {
    const rules = [rule('ALDI', 'old')];
    expect(suggestCategory('ALDI', 'expense', rules, categories)).toBeNull();
  });

  it('fällt auf eine kürzere Regel zurück, wenn die längere archiviert ist', () => {
    const rules = [rule('ALDI', 'groceries'), rule('ALDI SUED', 'old')];
    expect(suggestCategory('ALDI SUED', 'expense', rules, categories)).toBe('groceries');
  });

  it('ignoriert Regeln mit unbekannter Kategorie', () => {
    const rules = [rule('ALDI', 'does-not-exist')];
    expect(suggestCategory('ALDI', 'expense', rules, categories)).toBeNull();
  });

  it('schlägt keine Einnahmen-Kategorie für eine Ausgabe vor', () => {
    const rules = [rule('FIRMA', 'salary')];
    expect(suggestCategory('Firma GmbH', 'expense', rules, categories)).toBeNull();
    expect(suggestCategory('Firma GmbH', 'income', rules, categories)).toBe('salary');
  });

  it('bevorzugt bei gleicher Länge manual vor learned vor default', () => {
    const base = [
      rule('ALDI', 'groceries', 'default'),
      rule('ALDI', 'discount', 'learned'),
    ];
    expect(suggestCategory('ALDI', 'expense', base, categories)).toBe('discount');

    const withManual = [...base, rule('ALDI', 'old', 'manual'), rule('ALDI', 'groceries', 'manual', '2025-01-01T00:00:00.000Z')];
    // 'old' ist archiviert und fällt weg, die manuelle Regel für groceries gewinnt
    expect(suggestCategory('ALDI', 'expense', withManual, categories)).toBe('groceries');
  });

  it('bevorzugt bei gleicher Quelle die neueste updatedAt', () => {
    const rules = [
      rule('ALDI', 'groceries', 'learned', '2026-01-01T00:00:00.000Z'),
      rule('ALDI', 'discount', 'learned', '2026-06-01T00:00:00.000Z'),
    ];
    expect(suggestCategory('ALDI', 'expense', rules, categories)).toBe('discount');
    expect(suggestCategory('ALDI', 'expense', [...rules].reverse(), categories)).toBe('discount');
  });

  it('Länge schlägt Quelle', () => {
    const rules = [rule('ALDI', 'groceries', 'manual'), rule('ALDI SUED', 'discount', 'default')];
    expect(suggestCategory('ALDI SUED', 'expense', rules, categories)).toBe('discount');
  });
});

describe('learnRule', () => {
  it('liefert null für leeren Händler', () => {
    expect(learnRule('', 'groceries', [])).toBeNull();
    expect(learnRule(' ./ ', 'groceries', [])).toBeNull();
  });

  it('legt eine neue Regel an', () => {
    const r = learnRule('Müller Drogerie', 'drugstore', []);
    expect(r).not.toBeNull();
    expect(r?.pattern).toBe('MUELLER DROGERIE');
    expect(r?.categoryId).toBe('drugstore');
    expect(r?.source).toBe('learned');
    expect(typeof r?.id).toBe('string');
    expect(r?.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(r?.updatedAt ?? ''))).toBe(false);
  });

  it('liefert null, wenn die Regel schon existiert und die Kategorie gleich ist', () => {
    const rules = [rule('ALDI', 'groceries')];
    expect(learnRule('Aldi', 'groceries', rules)).toBeNull();
  });

  it('ändert eine bestehende default-Regel zu learned', () => {
    const existing = rule('ALDI', 'groceries', 'default');
    const r = learnRule('Aldi', 'discount', [existing]);
    expect(r).toEqual({
      ...existing,
      categoryId: 'discount',
      source: 'learned',
      updatedAt: r?.updatedAt,
    });
    expect(r?.updatedAt).not.toBe(existing.updatedAt);
  });

  it('behält bei manual die Quelle manual', () => {
    const existing = rule('ALDI', 'groceries', 'manual');
    const r = learnRule('Aldi', 'discount', [existing]);
    expect(r?.source).toBe('manual');
    expect(r?.categoryId).toBe('discount');
    expect(r?.id).toBe(existing.id);
  });

  it('verändert die übergebene Regelliste nicht', () => {
    const existing = rule('ALDI', 'groceries', 'default');
    const rules = [existing];
    learnRule('Aldi', 'discount', rules);
    expect(rules[0]).toEqual(rule('ALDI', 'groceries', 'default'));
  });
});

describe('lastCategoryForMerchant', () => {
  const cats = [cat('groceries', 'expense'), cat('discount', 'expense'), cat('old', 'expense', true), cat('salary', 'income')];

  it('die neueste Buchung gewinnt (erste Fundstelle)', () => {
    const txs = [tx('Aldi Süd', 'discount'), tx('ALDI SUED', 'groceries')];
    expect(lastCategoryForMerchant('aldi süd', 'expense', txs, cats)).toBe('discount');
  });

  it('überspringt Buchungen mit archivierter Kategorie', () => {
    const txs = [tx('Aldi', 'old'), tx('Aldi', 'groceries')];
    expect(lastCategoryForMerchant('Aldi', 'expense', txs, cats)).toBe('groceries');
  });

  it('ignoriert Buchungen eines anderen Typs', () => {
    const txs = [tx('Firma', 'salary', 'income')];
    expect(lastCategoryForMerchant('Firma', 'expense', txs, cats)).toBeNull();
    expect(lastCategoryForMerchant('Firma', 'income', txs, cats)).toBe('salary');
  });

  it('liefert null bei unbekannter Kategorie, leerem Händler oder ohne Treffer', () => {
    expect(lastCategoryForMerchant('Aldi', 'expense', [tx('Aldi', 'gone')], cats)).toBeNull();
    expect(lastCategoryForMerchant('', 'expense', [tx('', 'groceries')], cats)).toBeNull();
    expect(lastCategoryForMerchant('Rewe', 'expense', [tx('Aldi', 'groceries')], cats)).toBeNull();
  });
});

describe('merchantSuggestions', () => {
  it('leerer Input liefert []', () => {
    expect(merchantSuggestions('', [tx('Aldi', 'groceries')])).toEqual([]);
    expect(merchantSuggestions('  ./ ', [tx('Aldi', 'groceries')])).toEqual([]);
  });

  it('gruppiert nach normalisiertem Händler und zeigt die Schreibweise der neuesten Buchung', () => {
    const txs = [tx('Aldi Süd', 'groceries'), tx('ALDI SUED', 'groceries')];
    expect(merchantSuggestions('ald', txs)).toEqual(['Aldi Süd']);
  });

  it('matcht, wenn der Kandidat den Input enthält', () => {
    const txs = [tx('Edeka Center', 'groceries'), tx('Rewe', 'groceries')];
    expect(merchantSuggestions('center', txs)).toEqual(['Edeka Center']);
  });

  it('sortiert nach Häufigkeit absteigend, dann alphabetisch', () => {
    const txs = [
      tx('Beta Markt', 'groceries'),
      tx('Alpha Markt', 'groceries'),
      tx('Gamma Markt', 'groceries'),
      tx('Gamma Markt', 'groceries'),
    ];
    expect(merchantSuggestions('markt', txs)).toEqual(['Gamma Markt', 'Alpha Markt', 'Beta Markt']);
  });

  it('hält das Limit ein (Default 5)', () => {
    const txs = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => tx('Laden ' + l, 'groceries'));
    expect(merchantSuggestions('laden', txs)).toHaveLength(5);
    expect(merchantSuggestions('laden', txs, 2)).toHaveLength(2);
  });

  it('schließt den exakt gleichen Kandidaten aus', () => {
    const txs = [tx('Aldi', 'groceries'), tx('Aldi Süd', 'groceries')];
    expect(merchantSuggestions('aldi', txs)).toEqual(['Aldi Süd']);
  });

  it('ignoriert leere Händler', () => {
    expect(merchantSuggestions('a', [tx('', 'groceries')])).toEqual([]);
  });
});

describe('proposeCategory', () => {
  const cats = [cat('groceries', 'expense'), cat('discount', 'expense')];
  const rules = [rule('ALDI', 'groceries')];

  it('bevorzugt die Historie', () => {
    expect(proposeCategory('Aldi', 'expense', [tx('Aldi', 'discount')], rules, cats)).toBe('discount');
  });

  it('greift auf die Regeln zurück, wenn keine Historie existiert', () => {
    expect(proposeCategory('Aldi Süd', 'expense', [], rules, cats)).toBe('groceries');
  });

  it('liefert null ohne Historie und Regel', () => {
    expect(proposeCategory('Unbekannt', 'expense', [], rules, cats)).toBeNull();
  });
});
