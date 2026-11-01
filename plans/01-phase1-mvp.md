# 01 – Phase 1: MVP (detaillierte Spezifikation)

> Voraussetzung: [00-architektur.md](00-architektur.md) ist gelesen. Alle Typen, Konventionen und Svelte-5-Regeln von dort gelten.
> Jeder Schritt endet mit grünem `npm run check && npm test && npm run build`.

---

## Schritt 1.1 – Projekt-Setup
1. `npm create vite@latest . -- --template svelte-ts` ausführen. Falls das Verzeichnis nicht leer ist, wird „Ignore files and continue“ gewählt.
2. Pakete installieren:
   `npm i dexie` und
   `npm i -D vite-plugin-pwa @vite-pwa/assets-generator vitest fake-indexeddb`
3. Die Beispielinhalte der Vorlage löschen (`src/lib/Counter.svelte`, `src/assets/*`, Inhalt von `App.svelte` und `app.css`).
4. `vite.config.ts` wörtlich aus Architektur §12 übernehmen und um `define` ergänzen:
   ```ts
   define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
   ```
   In `src/vite-env.d.ts` kommen hinzu: `declare const __APP_VERSION__: string;` und `/// <reference types="vite-plugin-pwa/svelte" />`.
5. `index.html`-Head laut Architektur §11 anlegen und `lang="de"` setzen.
6. `public/logo.svg` anlegen: ein Quadrat 512×512, Hintergrund `#0f766e`, abgerundete Ecken (rx 96), mittig ein weißes „€“ (font-size 320, font-weight bold, `text-anchor="middle"`, `dominant-baseline="central"`). Danach `npm run icons` ausführen. Die erzeugten Dateien bleiben in `public/`.
7. `package.json`-Scripts laut Architektur §2 setzen und `"version": "0.1.0"` eintragen.
8. In `tsconfig.app.json` bzw. `tsconfig.json` muss `"strict": true` gesetzt sein.
9. Die Ordnerstruktur laut Architektur §5 anlegen, zunächst nur mit den Dateien für Phase 1.
10. `.gitignore` muss `node_modules`, `dist` und `dev-dist` enthalten.

**Abnahme:** `npm run build` erzeugt in `dist/` die Dateien `manifest.webmanifest` und `sw.js`. Die `dist/index.html` enthält das CSP-Meta-Tag.

---

## Schritt 1.2 – Basis-Utilities (pure + Tests)

### `src/lib/money.ts`
```ts
/** Liefert positive Cents oder null. Vorzeichen, Leerzeichen, '€' werden ignoriert. 0 => null. */
export function parseAmountToCents(input: string): number | null;
/** "42,15 €"; mit sign:'always' => "+42,15 €" / "−42,15 €" (U+2212 Minus). */
export function formatCents(cents: number, opts?: { sign?: 'auto' | 'always' }): string;
/** Vorzeichenbehafteter Wert: expense negativ, income positiv. */
export function signedCents(tx: { type: TxType; amountCents: number }): number;
```
Algorithmus `parseAmountToCents`:
1. `s = input.replace(/[\s€+\-−]/g, '')`. Ist das Ergebnis leer, wird `null` zurückgegeben.
2. Enthält `s` **sowohl** `.` als auch `,`: Das zuletzt vorkommende Zeichen ist der Dezimaltrenner, das andere wird entfernt.
3. Enthält `s` nur `,`: Kommt es mehr als einmal vor, ist das ungültig und die Funktion gibt `null` zurück. Sonst ist `,` der Dezimaltrenner.
4. Enthält `s` nur `.`: Passt `s` auf `/^\d{1,3}(\.\d{3})+$/`, sind die Punkte Tausendertrenner und werden entfernt. Sonst darf `.` nur einmal vorkommen und ist der Dezimaltrenner.
5. Den Dezimaltrenner auf `.` normalisieren. Danach muss `s` auf `/^\d+(\.\d{1,2})?$/` passen, sonst wird `null` zurückgegeben.
6. Die Cents werden **per String-Split** berechnet: `int*100 + frac.padEnd(2,'0')`. Es gibt kein `parseFloat`.
7. Ist das Ergebnis `0` oder größer als `99_999_999_99`, wird `null` zurückgegeben.

`formatCents` nutzt `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` auf `Math.abs(cents)/100`. Bei `sign: 'always'` kommt `+` bzw. `−` davor, bei `'auto'` nur `−`, wenn der Betrag negativ ist.

Tests (Ausgaben mit `.replace(/\s/g,' ')` vergleichen, weil Intl ein NBSP liefert):
| Eingabe | Ergebnis |
|---|---|
| `"42,15"` | 4215 |
| `"-42,15 €"` | 4215 |
| `"- 29,99 €"` | 2999 |
| `"+3,00 €"` | 300 |
| `"1.234,56"` | 123456 |
| `"1,234.56"` | 123456 |
| `"1.234"` | 123400 |
| `"12.5"` | 1250 |
| `"12,345"` | null |
| `"0"` / `""` / `"abc"` / `"1,2,3"` | null |

`formatCents(4215)` ergibt `"42,15 €"`, `formatCents(-300,{sign:'always'})` ergibt `"−3,00 €"`.

### `src/lib/dates.ts`
Keine Intl-Datumsfunktionen, damit die Ergebnisse deterministisch sind. Monats- und Wochentagsnamen stehen als feste Arrays im Code.
```ts
export const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
export const MONTH_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export const WEEKDAY_NAMES = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
export function toIsoDate(d: Date): string;            // lokale Zeit, YYYY-MM-DD
export function todayIso(): string;
export function yesterdayIso(): string;
export function parseIsoDate(s: string): Date;          // new Date(y, m-1, d) lokal
export function isValidIsoDate(s: string): boolean;     // Regex + echtes Datum (kein 31.02.)
export function monthKey(date: string): string;         // '2026-10-21' -> '2026-10'
export function currentMonthKey(): string;
export function addMonths(month: string, n: number): string; // '2026-01', -1 -> '2025-12'
export function monthLabel(month: string): string;      // 'Oktober 2026'
export function daysInMonth(year: number, month1: number): number;
export function formatDate(date: string): string;       // '21.10.2026'
export function dayHeader(date: string): string;        // 'Mittwoch, 21. Oktober 2026'; heute => 'Heute', gestern => 'Gestern'
export function parseGermanDate(s: string): string | null; // '21.10.26' | '21.10.2026' -> '2026-10-21'; 2-stellig => 2000+yy; ungültig => null
export function daysBetween(fromIso: string, toIso: string): number;
```
Tests: `addMonths` über Jahresgrenzen in beide Richtungen, `parseGermanDate('31.02.26')` ergibt `null`, `daysInMonth(2028,2)` ergibt 29, `dayHeader` für ein festes Datum (ohne Heute/Gestern-Fall).

### `src/lib/merchant.ts`
```ts
/** Großbuchstaben, Ä->AE Ö->OE Ü->UE ß->SS, alles außer A-Z0-9 -> Leerzeichen, Mehrfach-Leerzeichen zusammenfassen, trim. */
export function normalizeMerchant(s: string): string;
/** Liefert categoryId oder null. */
export function suggestCategory(merchant: string, type: TxType, rules: MerchantRule[], categories: Category[]): string | null;
/** Liefert die anzulegende/zu ändernde Regel oder null, wenn nichts zu tun ist. */
export function learnRule(merchant: string, categoryId: string, rules: MerchantRule[]): MerchantRule | null;
```
`suggestCategory`:
1. `n = normalizeMerchant(merchant)`. Ist `n` leer, wird `null` zurückgegeben.
2. Eine Regel *passt*, wenn `(' ' + n + ' ').includes(' ' + rule.pattern + ' ')`.
3. Berücksichtigt werden nur Regeln, deren Kategorie existiert, **nicht archiviert** ist und `category.type === type` hat.
4. Gewinner ist die Regel mit dem längsten `pattern`. Bei Gleichstand gewinnt `manual` vor `learned` vor `default`, danach die neueste `updatedAt`.

`learnRule`:
1. `pattern = normalizeMerchant(merchant)`. Ist es leer, wird `null` zurückgegeben.
2. Gibt es eine Regel mit exakt diesem `pattern`: Ist die Kategorie gleich, wird `null` zurückgegeben. Sonst kommt `{...rule, categoryId, source: rule.source === 'manual' ? 'manual' : 'learned', updatedAt: now}` zurück.
3. Sonst wird eine neue Regel `{ id: randomUUID, pattern, categoryId, source: 'learned', updatedAt }` erzeugt.

Tests: `normalizeMerchant('Fashion.Outlet.Center/')` ergibt `'FASHION OUTLET CENTER'`, `'Müller Drogerie'` ergibt `'MUELLER DROGERIE'`. Die Regel `ALDI` passt auf `'ALDI SUED'`, aber nicht auf `'RINALDI'`. Ein längeres Muster gewinnt. Archivierte Kategorien werden ignoriert. Eine Einnahmen-Kategorie wird für eine Ausgabe nicht vorgeschlagen.

---

## Schritt 1.3 – Krypto
Wird umgesetzt wie in Architektur §7.2–7.4, inklusive aller dort genannten Tests. Zusätzlich kommt diese Funktion in `crypto.ts` hinzu (für Backups):
```ts
export async function deriveDataKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey>;
// wie deriveKek, aber Key-Usages ['encrypt','decrypt'].
```
Um Code-Duplikat zu vermeiden, nutzen beide Funktionen eine interne Funktion `deriveAesKey(secret, salt, iterations, usages)`.

---

## Schritt 1.4 – Datenbank & Defaults
- `db.ts` und `encryptedTable.ts` laut Architektur §8 umsetzen, inklusive Tests.
- `src/lib/db/defaults.ts`:

```ts
export const CURRENT_SCHEMA_VERSION = 1;
export const FALLBACK_EXPENSE_CATEGORY = 'cat-other-expense';
export const FALLBACK_INCOME_CATEGORY = 'cat-other-income';
export function defaultCategories(now: string): Category[];
export function defaultRules(now: string): MerchantRule[];   // id = 'rule-' + pattern.toLowerCase().replace(/ /g,'-')
export function defaultSettings(now: string): Settings;     // autoLockMinutes 1, backupReminderDays 14, lastBackupAt null
```

**Standardkategorien** (feste IDs; `sortOrder` = Reihenfolge in der Tabelle ab 0, getrennt je Typ; `archived:false`, `monthlyBudgetCents:null`):

| id | name | type | icon | color |
|---|---|---|---|---|
| cat-groceries | Lebensmittel | expense | 🛒 | #16a34a |
| cat-restaurant | Restaurant & Essen | expense | 🍽️ | #ea580c |
| cat-cafe | Café & Snacks | expense | ☕ | #a16207 |
| cat-clothing | Kleidung | expense | 👕 | #db2777 |
| cat-drugstore | Drogerie & Haushalt | expense | 🧴 | #0891b2 |
| cat-housing | Wohnen & Nebenkosten | expense | 🏠 | #4f46e5 |
| cat-telecom | Handy & Internet | expense | 📱 | #0284c7 |
| cat-subscriptions | Abos & Digitales | expense | 💳 | #7c3aed |
| cat-mobility | Mobilität & Parken | expense | 🚗 | #475569 |
| cat-travel | Urlaub & Reisen | expense | ✈️ | #0d9488 |
| cat-leisure | Freizeit & Hobby | expense | 🎉 | #c026d3 |
| cat-health | Gesundheit | expense | 💊 | #dc2626 |
| cat-gifts | Geschenke | expense | 🎁 | #e11d48 |
| cat-other-expense | Sonstiges | expense | 📦 | #6b7280 |
| cat-salary | Gehalt | income | 💼 | #15803d |
| cat-refund | Erstattung & Gutschrift | income | ↩️ | #0f766e |
| cat-sale | Verkauf | income | 🏷️ | #65a30d |
| cat-gift-income | Geschenk erhalten | income | 🎁 | #ca8a04 |
| cat-other-income | Sonstige Einnahmen | income | 💰 | #6b7280 |

**Standardregeln** (`source: 'default'`), Muster → Kategorie:
- cat-groceries: `ALDI`, `LIDL`, `REWE`, `EDEKA`, `PENNY`, `NETTO`, `KAUFLAND`, `NORMA`, `TEGUT`
- cat-drugstore: `ROSSMANN`, `DM`, `MUELLER`
- cat-telecom: `TELEKOM`, `VODAFONE`, `O2`
- cat-subscriptions: `APPLE`, `NETFLIX`, `SPOTIFY`, `AMAZON PRIME`, `DISNEY`
- cat-mobility: `PARKEN`, `SHELL`, `ARAL`, `ESSO`, `MVG`, `MVV`
- cat-travel: `LUFTHANSA`, `RYANAIR`, `EUROWINGS`, `DB VERTRIEB`, `BOOKING`, `AIRBNB`
- cat-cafe: `STARBUCKS`
- cat-restaurant: `MCDONALDS`, `BURGER KING`, `LIEFERANDO`, `GASTRONOMIE`
- cat-clothing: `ZALANDO`, `H M`, `ZARA`, `PRIMARK`, `OUTLET`

---

## Schritt 1.5 – State-Schicht

### `src/lib/state/toast.ts`
```ts
export interface ToastMsg { id: number; text: string; kind: 'info' | 'error' }
export const toasts: Readable<ToastMsg[]>;
export function showToast(text: string, kind?: 'info' | 'error'): void; // verschwindet nach 2500 ms
```
`Toast.svelte` zeigt die Toasts fixiert über der TabBar an.

### `src/lib/state/ui.ts`
```ts
export const selectedMonth: Writable<string>;   // Initial currentMonthKey(); geteilt von Overview und Transactions
```

### `src/lib/state/data.ts`
```ts
export const transactions: Writable<Transaction[]>;
export const categories: Writable<Category[]>;
export const merchantRules: Writable<MerchantRule[]>;
export const recurring: Writable<RecurringTemplate[]>;
export const settings: Writable<Settings | null>;
export const categoryMap: Readable<Map<string, Category>>;   // derived

export async function loadAll(): Promise<void>;     // alle Tabellen entschlüsseln -> Stores
export function clearAll(): void;                   // Stores leeren (settings=null)
export async function seedDefaults(): Promise<void>;// Kategorien, Regeln, Settings schreiben

export type TxInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
export async function addTransaction(input: TxInput): Promise<Transaction>;
export async function updateTransaction(tx: Transaction): Promise<void>;  // setzt updatedAt
export async function deleteTransaction(id: string): Promise<void>;
export async function addTransactions(inputs: TxInput[]): Promise<void>;  // bulk (Import)

export async function saveCategory(c: Category): Promise<void>;           // insert or update, setzt updatedAt
export function categoryUsage(id: string): { transactions: number; rules: number; recurring: number };
export async function deleteCategory(id: string): Promise<void>;          // nur wenn transactions===0 && recurring===0; löscht zugehörige Regeln mit
export async function moveCategory(id: string, dir: -1 | 1): Promise<void>; // tauscht sortOrder mit Nachbar gleichen Typs (nur nicht archivierte)

export async function putRule(r: MerchantRule): Promise<void>;
export async function deleteRule(id: string): Promise<void>;
export async function rememberMerchant(merchant: string, categoryId: string): Promise<void>; // learnRule + putRule wenn != null

export async function updateSettings(patch: Partial<Omit<Settings,'id'>>): Promise<void>;
export async function replaceAllData(data: AppData): Promise<void>;        // alle Tabellen clear + bulkPut, dann loadAll
```
- Jede Tabelle wird über `new EncryptedTable<T>(db.xxx, getDek)` angesprochen.
- **Reihenfolge immer:** zuerst die DB schreiben, dann den Store mit `update()` aktualisieren.
- Stores werden **sortiert** gehalten: Transaktionen nach `date` absteigend, bei Gleichstand nach `createdAt` absteigend. Kategorien nach `type` und dann `sortOrder`.

### `src/lib/state/session.ts`
Wie in Architektur §9, mit folgender Ergänzung:
- `setupVault(password)` erzeugt den Tresor, speichert die Meta, setzt den DEK, ruft `seedDefaults()` und `loadAll()` auf und gibt den `recoveryKey` zurück. **Der Status bleibt `'setup'`.**
- `finishSetup()` setzt den Status auf `'unlocked'`.
- `changeMasterPassword(old, neu)` und `newRecoveryKey(password): Promise<string>` aktualisieren die Meta in der DB.
- `wipeEverything()` ruft `lock()`, danach `await db.delete()` und dann `location.reload()` auf.
- Auto-Lock-Listener werden **einmal** in `initSession()` registriert.
- `navigator.storage?.persist?.()` wird beim Setup **und** bei jedem Entsperren aufgerufen. Fehler werden ignoriert.

---

## Schritt 1.6 – App-Shell & Komponenten
`App.svelte`:
- `onMount(initSession)`.
- `status === 'loading'` zeigt einen zentrierten Text „Lädt…“.
- `'setup'` zeigt `<Setup/>`, `'locked'` zeigt `<Lock/>` ohne TabBar.
- `'unlocked'` zeigt die passende Route laut Routen-Tabelle sowie `<TabBar/>`.
- `<Toast/>` und `<UpdateBanner/>` werden immer gerendert.
- Der Seiteninhalt bekommt `padding-bottom`, damit nichts unter der TabBar verschwindet.

**Komponenten (Props exakt so):**
- `TabBar.svelte`: keine Props, liest `route`.
- `MonthSwitcher.svelte`: `{ month: string; onchange: (m: string) => void }`. Darstellung `‹  Oktober 2026  ›`. Ein Tipp auf das Label springt zum aktuellen Monat.
- `AmountText.svelte`: `{ cents: number; type: TxType | 'balance'; size?: 'sm'|'md'|'lg' }`. `expense` erscheint in `--expense` mit `−`, `income` in `--income` mit `+`, `balance` mit Vorzeichen und einer Farbe je nach Vorzeichen.
- `CategoryIcon.svelte`: `{ category: Category | undefined; size?: number }`. Ein Kreis in der Kategoriefarbe mit 20 % Deckkraft und dem Emoji. Bei `undefined` wird ❓ grau angezeigt.
- `TransactionRow.svelte`: `{ tx: Transaction; category: Category | undefined; onclick: () => void }`. Links `CategoryIcon`, Titel = `merchant || category.name`, Unterzeile = `category.name` plus ggf. ` · ${note}`, rechts `AmountText`.
- `PasswordField.svelte`: `{ value: string (bindable via $bindable()); label: string; autocomplete: 'current-password'|'new-password'; autofocus?: boolean }` mit einem Auge-Button, der zwischen `type="password"` und `text` umschaltet.
- `DonutChart.svelte`: `{ segments: { value: number; color: string }[]; centerTop: string; centerBottom: string }`
  - SVG `viewBox="0 0 120 120"`, ein Kreis mit `cx=cy=60`, `r=45`, `fill="none"`, `stroke-width=18`, umgeben von `transform="rotate(-90 60 60)"`.
  - `C = 2*Math.PI*45`. Jedes Segment ist ein `<circle>` mit `stroke-dasharray="{len} {C-len}"` und `stroke-dashoffset="{-offset}"`, wobei `len = value/total*C`.
  - Ist `total === 0`, wird ein grauer Ring (`var(--border)`) gezeichnet.
  - In der Mitte stehen zwei `<text>`-Elemente (`text-anchor="middle"`).
- `UpdateBanner.svelte`: `const { needRefresh, updateServiceWorker } = useRegisterSW()`. Ist `$needRefresh`, wird ein Banner „Neue Version verfügbar“ mit den Buttons [Aktualisieren] (`updateServiceWorker(true)`) und [Später] angezeigt.

---

## Schritt 1.7 – Setup, Lock, Recover

### `Setup.svelte` (2 Schritte, lokaler Zustand `step: 1 | 2`)
**Schritt 1:**
- Überschrift „Willkommen bei Money Tracker“, darunter der Text: „Deine Daten werden ausschließlich auf diesem iPhone gespeichert und mit deinem Passwort verschlüsselt. Niemand – auch nicht der Entwickler – kann sie ohne Passwort lesen.“
- `PasswordField` „Passwort“ (new-password) und `PasswordField` „Passwort wiederholen“.
- Eine Längenanzeige: „Mindestens 10 Zeichen (aktuell: n)“.
- Checkbox: „Ich habe verstanden: Wenn ich Passwort **und** Wiederherstellungsschlüssel verliere, sind meine Daten unwiederbringlich verloren.“
- Button „Tresor anlegen“, aktiv nur wenn: Länge ≥ 10, beide Felder gleich, Checkbox gesetzt und keine laufende Aktion. Während der Ausführung lautet die Beschriftung „Wird eingerichtet…“.
- Fehlermeldungen erscheinen inline in Rot.

**Schritt 2:**
- Überschrift „Dein Wiederherstellungsschlüssel“ und der Schlüssel groß in Monospace-Schrift (`user-select: all`).
- Text: „Notiere diesen Schlüssel auf Papier oder speichere ihn in deinem Passwort-Manager. Er ist die einzige Möglichkeit, an deine Daten zu kommen, falls du dein Passwort vergisst.“
- Button „Kopieren“ (`navigator.clipboard.writeText`, danach Toast „Kopiert“).
- Checkbox „Ich habe den Schlüssel sicher notiert“ und Button „Weiter“ (`finishSetup()`).

### `Lock.svelte`
- Zentriertes 🔒-Logo, Titel „Money Tracker“, `PasswordField` (current-password, autofocus) und Button „Entsperren“. Enter löst das Absenden aus.
- Bei `WrongSecretError` erscheint „Falsches Passwort“, und das Feld wird geleert.
- Fehlversuche werden gezählt (`failures`). Nach jedem Fehlversuch wird der Button für `Math.min(30, 2 ** (failures - 1))` Sekunden gesperrt, mit Countdown-Anzeige. Der Zähler liegt nur im RAM.
- Ein Link „Passwort vergessen?“ schaltet auf die eingebettete Komponente `<Recover onback={...}/>` um.

### `Recover.svelte`
- Props: `{ onback: () => void }`.
- Felder: Wiederherstellungsschlüssel (Textfeld mit `autocapitalize="characters"` und `autocomplete="off"`), neues Passwort und Wiederholung (mit denselben Regeln wie beim Setup).
- Button „Passwort zurücksetzen“ ruft `recover()` auf. Bei Erfolg erscheint der Toast „Passwort geändert“ und der Status wechselt automatisch auf `unlocked`.
- Bei einem Fehler erscheint „Wiederherstellungsschlüssel ungültig“.

---

## Schritt 1.8 – Buchung erfassen/bearbeiten (`TransactionForm.svelte`)
Props: `{ id?: string }`, gesetzt über `/edit/:id`. Der Typ für neue Buchungen kommt aus der Query (`type=income`). Existiert die id nicht, erscheint der Toast „Buchung nicht gefunden“ und die App navigiert zu `/`.

**Layout von oben nach unten:**
1. Header mit „‹ Zurück“, Titel „Neue Buchung“ bzw. „Buchung bearbeiten“.
2. Segmented Control **Ausgabe | Einnahme**. Beim Wechsel wird `categoryId` geleert, wenn die Kategorie nicht zum neuen Typ passt, und `categoryTouched=false` gesetzt.
3. **Betrag:** großes Eingabefeld (`font-size: 40px`, zentriert, `inputmode="decimal"`, Placeholder `0,00`, Suffix „€“), bei neuen Buchungen mit Autofokus. Validiert wird über `parseAmountToCents`.
4. **Händler / Name:** Textfeld (`autocomplete="off"`) mit eigener Vorschlagsliste darunter. Diese erscheint, solange das Feld fokussiert ist und Eingabe ≥ 1 Zeichen enthält:
   - Kandidaten sind alle unterschiedlichen `merchant`-Werte aus `$transactions` (gruppiert nach `normalizeMerchant`, angezeigt wird die zuletzt verwendete Schreibweise).
   - Ein Kandidat passt, wenn sein normalisierter Wert den normalisierten Input **enthält**.
   - Sortiert wird nach Häufigkeit absteigend, maximal 5 Einträge.
   - Ein Tipp auf einen Eintrag übernimmt den Text und schließt die Liste. Die Liste schließt sich per `onblur` mit 150 ms Verzögerung, damit der Tipp noch registriert wird.
5. **Automatische Kategorie:** Bei jeder Änderung von Händler oder Typ, und **nur wenn `categoryTouched === false`**, wird die Kategorie so gesetzt:
   1. Kategorie der neuesten Buchung mit gleichem `normalizeMerchant` und gleichem Typ, sofern die Kategorie nicht archiviert ist.
   2. Sonst `suggestCategory(...)`.
   3. Sonst bleibt der Wert unverändert.
6. **Kategorie:** Ein Raster (3 Spalten) aus Chips mit Icon und Name für alle nicht archivierten Kategorien des Typs, sortiert nach `sortOrder`. Die gewählte Kategorie ist mit Rahmen und Hintergrund in der Kategoriefarbe hervorgehoben. Ein Tipp setzt `categoryTouched = true`.
7. **Datum:** `<input type="date">` (Standard `todayIso()`) plus die Chips „Heute“ und „Gestern“.
8. **Ort:** optionales Textfeld.
9. **Notiz:** optionales Textfeld (`<textarea rows=2>`).
10. Buttons:
    - **Neu:** [Speichern] (primär) und [Speichern & weitere] (sekundär). Die zweite Variante setzt Betrag, Händler, Ort, Notiz, Kategorie und `categoryTouched` zurück, behält Typ und Datum und fokussiert das Betragsfeld.
    - **Bearbeiten:** [Speichern] und [Löschen] (rot, mit `confirm('Buchung wirklich löschen?')`).

**Validierung beim Speichern** (Fehler erscheinen inline unter dem jeweiligen Feld):
- Betrag ungültig: „Bitte einen gültigen Betrag eingeben“
- keine Kategorie: „Bitte eine Kategorie wählen“
- Datum ungültig: „Ungültiges Datum“

**Speichern:**
- Felder trimmen. `source` ist `'manual'` bei neuen Buchungen und bleibt beim Bearbeiten unverändert. `recurringId` bleibt unverändert bzw. ist `null`.
- Ist `merchant` nicht leer, wird `rememberMerchant(merchant, categoryId)` aufgerufen.
- Danach erscheint der Toast „Gespeichert“. Bei [Speichern] navigiert die App über `history.length > 1 ? back() : navigate('/')` zurück.
- Die Übersicht springt beim Zurückkehren **nicht** automatisch auf den Monat der Buchung.

---

## Schritt 1.9 – Buchungsliste (`Transactions.svelte`)
- **Query-Parameter:** `month` (Standard `$selectedMonth`), `category` (id) und `type` (`expense|income`). Ein `month` aus der Query wird in `selectedMonth` übernommen.
- **Kopfbereich:**
  - `MonthSwitcher`
  - Suchfeld „Suchen…“ (`type="search"`)
  - Segmented Control **Alle | Ausgaben | Einnahmen**
  - ist ein Kategoriefilter aktiv, ein Chip „🛒 Lebensmittel ✕“, wobei ✕ den Filter entfernt
- **Suche:** Bei nicht leerem Suchtext erscheint eine Checkbox „Alle Monate durchsuchen“. Die Suche ist case-insensitive und durchsucht `merchant`, `note`, `city`, den Kategorienamen sowie den Betrag formatiert über `formatCents` ohne Währungszeichen (z. B. „42,15“).
- **Liste:** Die Buchungen werden nach `date` gruppiert. Jede Gruppe hat einen Header mit `dayHeader(date)` links und der Tagessumme (Saldo, `AmountText` balance, klein) rechts, darunter folgen die `TransactionRow`s. Ein Tipp auf eine Zeile ruft `navigate('/edit/' + id)` auf.
- **Fußzeile:** „n Buchungen · Summe“ (Saldo der gefilterten Liste).
- **Leerer Zustand:** „Keine Buchungen gefunden“.
- Filter werden nur in lokalen Variablen gespeichert. Beim Wechsel aus dem MonthSwitcher wird `selectedMonth` aktualisiert. Die URL wird dabei nicht verändert.

---

## Schritt 1.10 – Monatsübersicht

### `src/lib/stats/month.ts` (pure + Tests)
```ts
export interface CategoryTotal { categoryId: string; totalCents: number; count: number; share: number } // share 0..1
export interface MonthSummary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;          // income - expense
  savingsRate: number | null;    // balance / income, null wenn income === 0
  expenseByCategory: CategoryTotal[];  // absteigend nach totalCents, Gleichstand nach categoryId
  incomeByCategory: CategoryTotal[];
  count: number;
}
export function inMonth(tx: Transaction, month: string): boolean;
export function summarizeMonth(txs: Transaction[], month: string): MonthSummary;
export function summarizeTransactions(txs: Transaction[]): Omit<MonthSummary, 'month'>; // gemeinsam genutzt (auch Jahr)
```
Tests: ein leerer Monat ergibt nur Nullen und `savingsRate: null`. Buchungen anderer Monate werden ignoriert. Die `share`-Werte einer Liste summieren sich auf 1, mit einer Toleranz von 1e-9.

### `Overview.svelte`
Von oben nach unten:
1. **Backup-Banner** (siehe 1.12), falls fällig.
2. `MonthSwitcher` (bindet an `selectedMonth`).
3. Drei Kacheln nebeneinander (auf schmalen Geräten untereinander): **Einnahmen** (grün), **Ausgaben** (rot), **Saldo** (Vorzeichen). Unter dem Saldo steht „Sparquote 23,4 %“, wenn `savingsRate !== null`. Formatiert wird mit 1 Nachkommastelle und deutschem Komma. Eine negative Quote erscheint rot.
4. **Ausgaben nach Kategorie:**
   - `DonutChart` mit `centerTop = formatCents(expenseCents)` und `centerBottom = 'Ausgaben'`.
   - Darunter eine Legende als Liste: Farbpunkt, Icon, Name, Betrag und Anteil („34 %“, gerundet).
   - Ein Tipp auf einen Eintrag ruft `navigate('/transactions?month=..&category=..')` auf.
5. **Einnahmen nach Kategorie:** dieselbe Liste ohne Donut (nur wenn Einnahmen vorhanden sind).
6. **Letzte Buchungen:** die 5 neuesten Buchungen des Monats als `TransactionRow` und ein Link „Alle anzeigen →“ zu `/transactions`.
7. **Leerer Zustand** (keine Buchungen im Monat): „Noch keine Buchungen im Oktober 2026“ mit den Buttons [Ausgabe erfassen] und [Einnahme erfassen] (`/add?type=income`).

---

## Schritt 1.11 – Kategorien

### `Categories.svelte`
- Abschnitte „Ausgaben“ und „Einnahmen“ mit den nicht archivierten Kategorien, sortiert. Jede Zeile zeigt Icon, Name und rechts die Buttons ▲ ▼ (`moveCategory`, deaktiviert an den Rändern). Ein Tipp auf die Zeile führt zu `/settings/categories/:id`.
- Darunter ein einklappbarer Abschnitt „Archiviert (n)“.
- Button „＋ Neue Kategorie“ (`/settings/categories/new`).

### `CategoryForm.svelte` (Props `{ id?: string }`)
- **Name:** Pflichtfeld, max. 30 Zeichen, eindeutig innerhalb eines Typs (case-insensitive). Fehlermeldung: „Name bereits vergeben“.
- **Typ:** Segmented Control, nur beim Anlegen änderbar, danach nur angezeigt.
- **Icon:** ein Raster aus folgenden Emojis zur Auswahl:
  `🛒 🍽️ ☕ 🍺 🍕 👕 👟 🧴 🏠 💡 📱 💳 🚗 ⛽ 🚆 ✈️ 🏨 🎉 🎬 🎮 📚 🏋️ ⚽ 💊 🦷 🐶 👶 🎁 💇 🛠️ 💻 📦 💼 ↩️ 🏷️ 💰 🏦 📈 🧾 ❤️`
- **Farbe:** 12 Farbkreise:
  `#16a34a #ea580c #a16207 #db2777 #0891b2 #4f46e5 #0284c7 #7c3aed #475569 #0d9488 #dc2626 #6b7280`
- **Monatsbudget** (nur bei Ausgaben): optionales Betragsfeld (`parseAmountToCents`, leer bedeutet `null`). Darunter der Hinweis „Wird in der Statistik angezeigt“.
- Vorschau der Kategorie mit `CategoryIcon` und Name.
- **Buttons:**
  - [Speichern] (neu: `sortOrder` = max + 1 des Typs).
  - Im Bearbeiten-Modus zusätzlich:
    - ist `categoryUsage` bei Buchungen und Wiederkehrendem 0: [Löschen] mit `confirm`
    - sonst: [Archivieren] bzw. [Wiederherstellen] mit dem Hinweis „Wird von n Buchungen verwendet und kann daher nur archiviert werden. Archivierte Kategorien erscheinen nicht mehr bei der Erfassung, bleiben aber in Auswertungen erhalten.“
- Die Fallback-Kategorien `cat-other-expense` und `cat-other-income` dürfen weder gelöscht noch archiviert werden. Die Buttons werden für sie ausgeblendet.

---

## Schritt 1.12 – Backup, Wiederherstellung, CSV

### Dateiformat (`src/lib/backup/format.ts`)
```ts
export interface BackupFileV1 {
  format: 'money-tracker-backup';
  version: 1;
  createdAt: string;
  appVersion: string;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };   // base64, 16 Byte
  cipher: { name: 'AES-256-GCM'; iv: string };                       // base64, 12 Byte
  data: string;                                                       // base64 Ciphertext
}
export interface BackupPayload { schemaVersion: number; exportedAt: string; data: AppData }
```
Die Backup-Datei ist ein JSON-Text mit 2 Leerzeichen Einrückung. Der Dateiname lautet `money-tracker-backup-YYYY-MM-DD.json`, der MIME-Typ `application/json`.

### `src/lib/backup/backup.ts`
```ts
export async function createBackup(data: AppData, password: string, iterations = PBKDF2_ITERATIONS): Promise<string>; // JSON-String
export async function readBackupFile(text: string): BackupFileV1;   // JSON.parse + Strukturprüfung, wirft InvalidBackupError('Keine gültige Backup-Datei')
export async function decryptBackup(file: BackupFileV1, password: string): Promise<AppData>; // wirft WrongSecretError; dann migratePayload + validateAppData
export function mergeData(current: AppData, incoming: AppData): AppData;
export function backupStats(d: AppData): { transactions: number; firstDate: string | null; lastDate: string | null };
```
- **Verschlüsselung:** `deriveDataKey(password, salt, iterations)`, danach `encryptJson(key, payload)`.
- **Migration:** `migratePayload(p)` hat eine Tabelle `MIGRATIONS: Record<number, (d: unknown) => unknown>`, die vorerst leer ist. Migrationen laufen von `p.schemaVersion` bis `CURRENT_SCHEMA_VERSION`. Ist die Version **größer** als `CURRENT_SCHEMA_VERSION`, wird der Fehler „Backup stammt aus einer neueren App-Version“ geworfen.
- **`mergeData`:** Für jede Sammlung wird die Vereinigung über `id` gebildet. Bei gleicher id gewinnt der höhere `updatedAt`. `settings` kommt aus `current`.

### `src/lib/backup/validate.ts`
```ts
export class ValidationError extends Error {}
export function validateAppData(x: unknown): AppData;
```
- Jedes Feld wird nach Typ geprüft, passend zu `types.ts`.
- `amountCents` ist ein Integer mit 0 < x ≤ 9.999.999.999. `date` erfüllt `isValidIsoDate`. `type` ist eines der erlaubten Literale. `color` passt auf `/^#[0-9a-fA-F]{6}$/`.
- Jede `categoryId` einer Buchung, Regel oder Vorlage muss in `categories` existieren.
- Die Fehlermeldung nennt Sammlung und Index, z. B. `"transactions[12].amountCents ungültig"`.
- Tests: gültige Daten laufen durch. Ein String als Betrag, ein unbekannter Typ und eine fehlende Kategorie werfen jeweils.

### `src/lib/backup/csv.ts`
```ts
export function toCsv(txs: Transaction[], cats: Map<string, Category>): string;
```
- Beginnt mit dem BOM `\uFEFF`. Trennzeichen ist `;`, Zeilenende `\r\n`.
- Kopfzeile: `Datum;Typ;Betrag;Kategorie;Händler;Ort;Notiz`
- Werte:
  - `formatDate(date)`
  - `Ausgabe` bzw. `Einnahme`
  - Betrag vorzeichenbehaftet mit Komma, ohne Tausenderpunkt und ohne €-Zeichen (`-42,15`, `3,00`)
  - Kategoriename, `merchant`, `city`, `note`
- Felder mit `;`, `"`, `\n` oder `\r` werden in `"` eingeschlossen, enthaltene `"` werden verdoppelt.
- Sortierung: nach Datum aufsteigend.
- Tests: Escaping und Betragsformat.

### Teilen/Speichern einer Datei (Hilfsfunktion in `backup.ts`, nicht pure)
```ts
export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'>;
```
- Ist `navigator.canShare?.({ files: [file] })` erfüllt, wird `await navigator.share({ files: [file] })` aufgerufen und `'shared'` zurückgegeben. Bei einem `AbortError` wird `'cancelled'` zurückgegeben.
- Sonst wird ein `<a download>` mit `URL.createObjectURL` erzeugt und geklickt, danach `revokeObjectURL` nach 1 s aufgerufen und `'downloaded'` zurückgegeben.
- **Wichtig (iOS):** `navigator.share` muss **direkt** in einem Klick-Handler aufgerufen werden, ohne vorherige lange `await`s. Deshalb ist der Ablauf immer zweistufig: erst die Datei erzeugen, dann ein separater Button „Teilen / Speichern“.

### `Backup.svelte` (Route `/backup`)
**Bereich „Sicherung erstellen“:**
- Text: „Erstellt eine verschlüsselte Datei mit allen Daten. Speichere sie z. B. in der Dateien-App oder in iCloud Drive.“
- Darunter die Anzeige „Letzte Sicherung: 01.11.2026“ oder „noch nie“.
- `PasswordField` „Backup-Passwort“ und „Wiederholen“ (min. 10 Zeichen) mit dem Hinweis „Du kannst dein App-Passwort verwenden. Ohne dieses Passwort kann die Sicherung nicht geöffnet werden.“
- [Sicherung erstellen] baut ein `AppData`-Objekt aus allen Stores, ruft `createBackup` auf und erzeugt ein `File`. Danach erscheint der Button [📤 Datei teilen / speichern] (`shareOrDownload`).
- Bei `'shared'` oder `'downloaded'`: `updateSettings({ lastBackupAt: now })` und der Toast „Sicherung gespeichert“.

**Bereich „Wiederherstellen“:**
1. `<input type="file" accept="application/json,.json">`. Nach der Auswahl wird `readBackupFile(await file.text())` aufgerufen.
2. Ein Passwortfeld und [Entschlüsseln]. Bei einem Fehler erscheint „Falsches Passwort oder beschädigte Datei“.
3. Danach eine Zusammenfassung: „Sicherung vom {createdAt formatiert}: {n} Buchungen ({firstDate} – {lastDate}), {k} Kategorien“.
4. Zwei Buttons:
   - [Zusammenführen] ruft `mergeData` und danach `replaceAllData(merged)` auf. Toast: „Daten zusammengeführt“.
   - [Alles ersetzen] fragt mit `confirm('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')` nach, dann wird `replaceAllData(incoming)` aufgerufen. Dabei bleibt `settings.autoLockMinutes` vom aktuellen Gerät erhalten.

**Bereich „Export als CSV (Excel)“:**
- Ein Hinweis in Gelb: „Achtung: Die CSV-Datei ist **nicht verschlüsselt**.“
- [CSV erstellen] und danach [📤 Teilen / speichern]. Der Dateiname lautet `money-tracker-YYYY-MM-DD.csv`, der Typ `text/csv`.

### Backup-Erinnerung (in `Overview.svelte`)
Das Banner wird angezeigt, wenn `settings.backupReminderDays > 0` gilt, mindestens eine Buchung existiert und außerdem eine dieser Bedingungen erfüllt ist:
- `lastBackupAt === null`: Text „Du hast noch keine Sicherung erstellt.“
- `daysBetween(lastBackup, today) >= backupReminderDays`: Text „Letzte Sicherung vor {n} Tagen.“

Das Banner hat einen Button [Jetzt sichern] (`/backup`) und ein ✕. Das ✕ blendet es nur für die aktuelle Session aus (Modulvariable).

---

## Schritt 1.13 – Einstellungen (`Settings.svelte`)
Gruppierte Listen im iOS-Stil:
- **Daten:**
  - Kategorien → `/settings/categories`
  - Sicherung & Wiederherstellung → `/backup`
  - in Phase 2 zusätzlich: Wiederkehrende Buchungen, Händler-Regeln
- **Sicherheit:**
  - **Automatisch sperren:** `<select>` mit Sofort (0), Nach 1 Minute, Nach 5 Minuten, Nach 15 Minuten
  - **Backup-Erinnerung:** `<select>` mit Aus, 7, 14, 30 Tage
  - **Passwort ändern:** aufklappbar mit altem Passwort, neuem Passwort und Wiederholung. Bei Erfolg der Toast „Passwort geändert“, bei einem falschen alten Passwort „Altes Passwort falsch“.
  - **Neuer Wiederherstellungsschlüssel:** aufklappbar. Nach Passworteingabe wird der neue Schlüssel wie im Setup-Schritt 2 angezeigt, mit dem Hinweis „Der alte Schlüssel ist ab sofort ungültig.“
  - [🔒 Jetzt sperren]
- **Info:**
  - Version `__APP_VERSION__`
  - Speicher dauerhaft: Ja/Nein (`navigator.storage?.persisted?.()`)
  - Anzahl Buchungen
  - Hinweis: „Tipp: Lösche die App nicht vom Home-Bildschirm – dabei werden alle Daten gelöscht. Erstelle regelmäßig Sicherungen.“
- **Gefahrenzone:** [Alle Daten löschen]. Ein `prompt('Zum Bestätigen LÖSCHEN eingeben')` muss exakt `LÖSCHEN` zurückgeben, dann wird `wipeEverything()` aufgerufen.

---

## Schritt 1.14 – Deployment & Doku
1. `.github/workflows/deploy.yml` anlegen:
   ```yaml
   name: Deploy
   on:
     push: { branches: [main] }
     workflow_dispatch:
   permissions: { contents: read, pages: write, id-token: write }
   concurrency: { group: pages, cancel-in-progress: true }
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npm run check
         - run: npm test
         - run: npm run build
         - uses: actions/upload-pages-artifact@v3
           with: { path: dist }
     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment: { name: github-pages, url: ${{ steps.d.outputs.page_url }} }
       steps:
         - id: d
           uses: actions/deploy-pages@v4
   ```
2. `README.md` (deutsch) mit folgenden Abschnitten:
   - Was ist die App?
   - Sicherheitskonzept (kurz, inkl. bekannter Grenzen aus Architektur §7.6)
   - Lokale Entwicklung (`npm i`, `npm run dev`, `npm test`)
   - Deployment (Repo `money-tracker` auf GitHub anlegen, 2FA aktivieren, Settings → Pages → Source: „GitHub Actions“, pushen)
   - **Installation auf dem iPhone:** URL `https://<user>.github.io/money-tracker/` in **Safari** öffnen → Teilen → „Zum Home-Bildschirm“ → App von dort starten
   - Backup-Empfehlung

## Abnahme Phase 1 (manuell im Browser, Dev-Tools mit iPhone-Größe)
- [ ] Erststart zeigt Setup. Nach dem Setup wird der Wiederherstellungsschlüssel angezeigt, danach die leere Übersicht.
- [ ] In IndexedDB (DevTools → Application) ist **kein Klartext** sichtbar.
- [ ] Ein Reload zeigt den Lock-Screen. Ein falsches Passwort führt zu Fehlermeldung und Sperrzeit, das richtige Passwort entsperrt.
- [ ] Eine Ausgabe „Aldi“ wird automatisch als Lebensmittel vorgeschlagen.
- [ ] Die Monatsübersicht zeigt korrekte Summen, Donut und Sparquote.
- [ ] Ein Backup lässt sich erstellen. Nach „Alle Daten löschen“, neuem Setup und Wiederherstellung (Ersetzen) sind alle Daten wieder da.
- [ ] Recovery-Flow mit dem Wiederherstellungsschlüssel funktioniert.
- [ ] Der Tab wird bei „Sofort sperren“ beim Wechsel in den Hintergrund gesperrt.
- [ ] `npm run build && npm run preview` → Offline-Modus in DevTools → Reload → die App funktioniert.
