# 02 – Phase 2: Jahresübersicht, Budgets, Wiederkehrende Buchungen, Regeln

> Voraussetzung: Phase 1 ist fertig. Die Konventionen aus [00-architektur.md](00-architektur.md) gelten.

## Schritt 2.1 – Jahresstatistik (`src/lib/stats/year.ts`, pure + Tests)
```ts
export interface MonthBar { month: string; incomeCents: number; expenseCents: number; balanceCents: number }
export interface YearSummary {
  year: number;
  incomeCents: number; expenseCents: number; balanceCents: number;
  savingsRate: number | null;
  months: MonthBar[];                    // immer 12 Einträge Jan..Dez
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
  avgMonthlyExpenseCents: number;        // expense / Anzahl Monate mit >=1 Buchung (0 wenn keine)
  topMerchants: { merchant: string; totalCents: number; count: number }[]; // nur Ausgaben, gruppiert per normalizeMerchant, Anzeige = häufigste Schreibweise, Top 5, leere Händler ignorieren
}
export function summarizeYear(txs: Transaction[], year: number): YearSummary;
export function yearsWithData(txs: Transaction[]): number[]; // absteigend, enthält immer das aktuelle Jahr
export function compareCategories(cur: CategoryTotal[], prev: CategoryTotal[]): { categoryId: string; curCents: number; prevCents: number; diffCents: number }[];
```
Nutzt `summarizeTransactions` aus `month.ts`. Tests prüfen: 12 Monate, Summen und die Gruppierung der Top-Händler (z. B. „Apple“ und „APPLE“ zählen zusammen).

## Schritt 2.2 – Komponenten
- `YearSwitcher.svelte`: `{ year: number; onchange: (y: number) => void }`
- `BarChart.svelte`: `{ bars: { label: string; a: number; b: number }[]; colorA: string; colorB: string; onselect?: (index: number) => void }`
  - SVG `viewBox="0 0 360 180"`, mit 12 Gruppen aus je 2 Balken (a = Einnahmen, b = Ausgaben).
  - Die Skala ist max(a, b) über alle Gruppen. Bei max = 0 wird nur die Grundlinie gezeichnet.
  - Unten stehen Labels (MONTH_SHORT). Jede Gruppe hat ein transparentes Klick-Rechteck, das `onselect(i)` auslöst.
  - Es gibt keine Achsenbeschriftung, nur eine Grundlinie und eine gestrichelte Linie bei 50 % mit dem Betrag `formatCents(max/2)` in klein.

## Schritt 2.3 – `Stats.svelte` (Route `/stats`, Query `year`)
Die Statistik-Tab in der TabBar wird jetzt eingeblendet.
1. `YearSwitcher` (Jahre aus `yearsWithData`, ‹ › ohne Begrenzung).
2. Kacheln für Einnahmen, Ausgaben, Ersparnis und Sparquote sowie „Ø Ausgaben/Monat“.
3. `BarChart` Einnahmen vs. Ausgaben. Ein Tipp auf einen Monat setzt `selectedMonth` und navigiert zu `/`.
4. **Ausgaben nach Kategorie:** Donut und Legende wie in der Übersicht. Pro Zeile wird zusätzlich der Vergleich zum Vorjahr angezeigt: „▲ 12 %“ (rot, mehr ausgegeben) oder „▼ 8 %“ (grün). Ohne Vorjahreswert erscheint „neu“. Ein Tipp öffnet `/transactions?year=YYYY&category=id`.
5. **Monatstabelle:** Monat | Einnahmen | Ausgaben | Saldo. Der Saldo ist farbig, und die letzte Zeile zeigt die Summe.
6. **Top-Händler:** maximal 5 Einträge.
7. **Budgets** (nur wenn mindestens eine Kategorie ein `monthlyBudgetCents` hat): Für den **gewählten Monat** (`selectedMonth`, eigener MonthSwitcher in diesem Abschnitt) zeigt jede Budget-Kategorie einen Fortschrittsbalken mit „ausgegeben / Budget“ und dem Rest.
   - Farbe: grün bis unter 80 %, orange von 80 bis 100 %, rot über 100 % („x € überschritten“).

**`Transactions.svelte` erweitern:** Den Query-Parameter `year` unterstützen. Ist er gesetzt, wird das ganze Jahr gefiltert, und statt des MonthSwitchers erscheint der Text „Jahr 2026“ mit ✕ (✕ führt zur Monatsansicht zurück).

**Overview erweitern:** Hat eine Kategorie ein Budget, zeigt die Legendenzeile darunter einen dünnen Fortschrittsbalken mit derselben Farblogik.

## Schritt 2.4 – Wiederkehrende Buchungen (`src/lib/recurring.ts`, pure + Tests)
```ts
/** Liefert neu zu erzeugende Buchungen + aktualisierte Templates (lastGeneratedMonth). Erzeugt nichts in der Zukunft. */
export function generateDue(templates: RecurringTemplate[], today: string, now: string): { newTx: TxInput[]; updated: RecurringTemplate[] };
```
Regeln:
- Nur `active`-Vorlagen werden verarbeitet.
- Für jeden Monat m von `max(startMonth, addMonths(lastGeneratedMonth, 1))` bis `currentMonthKey`, und höchstens bis `endMonth`, wird geprüft:
  - Das Buchungsdatum ist `min(dayOfMonth, daysInMonth)` in m.
  - Liegt es nach `today`, wird die Schleife abgebrochen (keine Zukunft).
  - Sonst wird eine Buchung erzeugt mit `source: 'recurring'`, `recurringId: template.id`, `city: ''`, `note` aus der Vorlage, und `lastGeneratedMonth = m` gesetzt.
- Tests:
  - Start vor 3 Monaten erzeugt 3 bzw. 4 Buchungen, je nachdem ob der Tag schon erreicht ist.
  - `dayOfMonth` 31 im Februar ergibt den 28. bzw. 29.
  - `endMonth` wird eingehalten.
  - Ein zweiter Aufruf erzeugt nichts mehr (Idempotenz).

Einbindung: In `session.unlock()` und nach `finishSetup()` wird `generateDue` aufgerufen. Danach werden `addTransactions(newTx)` und die aktualisierten Vorlagen gespeichert. Bei `newTx.length > 0` erscheint der Toast „n wiederkehrende Buchung(en) hinzugefügt“. In `data.ts` kommen `saveRecurring(t)` und `deleteRecurring(id)` hinzu.

**`Recurring.svelte`** (`/settings/recurring`):
- Liste der Vorlagen mit Icon, Händler, Betrag, „monatlich am 25.“ und einem Aktiv-Toggle.
- Ein Formular, das inline aufklappt, für neue Vorlagen und zum Bearbeiten:
  - Typ, Betrag, Kategorie (Select), Händler, Notiz
  - Tag im Monat (1–31)
  - Startmonat (`<input type="month">`, Standard ist der aktuelle Monat)
  - Endmonat (optional)
- Buttons: [Speichern], [Löschen] (bereits erzeugte Buchungen bleiben erhalten, Hinweistext).

**TransactionForm:** Beim Bearbeiten einer Buchung mit `recurringId` erscheint der Hinweis „Automatisch aus wiederkehrender Buchung erzeugt“. Bei neuen Buchungen gibt es einen Link „Als wiederkehrend speichern“. Er speichert die Buchung und legt eine Vorlage an mit `dayOfMonth` = Tag des Datums, `startMonth` = Monat des Datums und `lastGeneratedMonth` = Monat des Datums.

## Schritt 2.5 – Händler-Regeln (`Rules.svelte`, `/settings/rules`)
- Liste aller Regeln, sortiert nach Pattern, mit Pattern, Kategorie-Icon und -Name sowie einem Badge („Standard“, „Gelernt“, „Manuell“).
- Ein Tipp auf eine Regel öffnet einen Select zum Ändern der Kategorie (danach `source = 'manual'`) und einen Button zum Löschen.
- [＋ Regel] mit einem Feld „Händler enthält“ (wird über `normalizeMerchant` gespeichert) und einer Kategorie.
- Ein Suchfeld oben.
- Einträge in `Settings.svelte` unter „Daten“ ergänzen.
