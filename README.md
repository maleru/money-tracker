# Money Tracker

Eine Haushaltsbuch-App als iPhone-PWA. Alle Finanzdaten bleiben **lokal auf dem Gerät** und werden verschlüsselt gespeichert. Es gibt keinen Server und keine Cloud.

## Was ist die App?

Money Tracker ist eine Progressive Web App (PWA), die du auf dem Home-Bildschirm deines iPhones installierst und wie eine normale App nutzt, auch offline.

**Funktionsumfang:**

- Einnahmen und Ausgaben erfassen
- Kategorien (vorbelegt, anpassbar)
- Händler-Vorschläge: Aus dem Händlernamen wird automatisch eine Kategorie vorgeschlagen, zum Beispiel „Aldi“ → Lebensmittel
- Monatsübersicht mit Summen, Donut-Diagramm und Sparquote
- Verschlüsseltes Backup (Erstellen und Wiederherstellen)
- CSV-Export
- Jahresstatistik und Budgets (Phase 2)
- Wiederkehrende Buchungen (Phase 2)
- Import von Bankumsätzen als eingefügter Text (DKB-Format) mit Duplikat-Erkennung und Vorschau (Phase 3)
- Screenshot-Import per lokaler Texterkennung (OCR, Phase 4)

Die Pläne und Entscheidungen stehen in [`plans/`](plans/).

## Sicherheitskonzept

- **Verschlüsselung:** Alle Inhalte werden mit **AES-256-GCM** verschlüsselt, bevor sie in der IndexedDB landen.
- **Schlüsselableitung:** Aus deinem Passwort wird mit **PBKDF2-SHA256 (600.000 Iterationen)** ein Schlüssel abgeleitet.
- **Envelope Encryption:** Die Daten werden mit einem zufälligen Datenschlüssel (**DEK**) verschlüsselt. Der DEK selbst wird von einem aus dem Passwort abgeleiteten Schlüssel (**KEK**) verpackt. Dadurch lässt sich das Passwort ändern, ohne alle Daten neu zu verschlüsseln.
- **Wiederherstellungsschlüssel:** Beim Einrichten wird zusätzlich ein Wiederherstellungsschlüssel erzeugt, der den DEK über einen zweiten KEK verpackt. Damit kannst du ein vergessenes Passwort zurücksetzen.
- **Kein Server, keine Netzwerkaufrufe:** Die App sendet keine Daten ins Netz. Es gibt keine Analytics, keine CDNs und keine externen Fonts.
- **Strenge Content-Security-Policy:** Im Production-Build begrenzt eine CSP (`default-src 'self'`, `connect-src 'self'`, `object-src 'none'` usw.) die Quellen für Code und Verbindungen.
- **Service-Worker-Updates nur nach Bestätigung:** Eine neue Version wird erst nach deiner ausdrücklichen Bestätigung aktiviert. Code kann so nicht unbemerkt ausgetauscht werden.

### Bekannte Grenzen

- Die Anzahl der Datensätze und die UUIDs sind unverschlüsselt sichtbar. Inhalte sind es nicht.
- Wer das Passwort **und** den Wiederherstellungsschlüssel verliert, verliert die Daten.
- Wenn jemand das GitHub-Konto übernimmt, könnte er bösartigen Code ausliefern. Gegenmaßnahmen sind 2FA auf GitHub und Updates nur nach Bestätigung.
- iOS: Daten in Safari und Daten in der Home-Bildschirm-App sind **getrennt**. Wird die App vom Home-Bildschirm gelöscht, sind **auch die Daten gelöscht**. Deshalb braucht es Backups.

## Wichtige Hinweise fürs iPhone

- **Löschst du die App vom Home-Bildschirm, sind auch die Daten gelöscht.**
- Erstelle **regelmäßig Backups** und speichere sie in der **Dateien-App** oder in **iCloud Drive**.
- Bewahre **Passwort und Wiederherstellungsschlüssel sicher auf**, zum Beispiel in einem Passwortmanager. Ohne beides sind die Daten nicht wiederherstellbar.

## Lokale Entwicklung

Voraussetzung: Node.js (CI nutzt Node 22).

```bash
npm install       # Abhängigkeiten installieren
npm run dev       # Dev-Server starten
npm test          # Unit-Tests (Vitest)
npm run check     # Typprüfung (svelte-check)
npm run build     # Production-Build nach dist/
npm run preview   # Production-Build lokal ansehen
```

**Windows-Hinweis:** Starte Vitest in einem Pfad mit **großem Laufwerksbuchstaben**, zum Beispiel mit `cd /d D:\git\money-tracker`. Sonst können Testläufe fehlschlagen.

**Screenshot-OCR:** Die Texterkennung (tesseract.js) läuft komplett offline im Gerät, Bilder und Text verlassen das Gerät nicht. Die nötigen Dateien (Worker, WASM-Core, deutsche Sprachdaten) werden bei `npm install` per `postinstall` (`scripts/copy-tesseract.mjs`) aus `node_modules` nach `public/tesseract/` kopiert (nicht im Git, `npm run build` stellt sie per `prebuild` ebenfalls sicher). Es wird nichts von einem CDN geladen. Beim ersten Mal lädt die App ca. 15 MB vom eigenen Server und legt sie im Cache ab, sie sind nicht im Precache des Service Workers.

## Deployment auf GitHub Pages (kostenlos)

1. Lege ein GitHub-Konto mit aktivierter **2FA** an.
2. Lege ein Repository namens `money-tracker` an. Bei einem anderen Namen musst du `base` in [`vite.config.ts`](vite.config.ts) anpassen.
3. Gehe zu **Settings → Pages → Source** und wähle **„GitHub Actions“**.
4. Pushe auf den Branch `main`. Der Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) führt Check, Tests und Build aus und veröffentlicht die Seite.
5. Die App ist danach erreichbar unter `https://<benutzer>.github.io/money-tracker/`.

> Das Repository darf öffentlich sein, weil es nur Code und keine Daten enthält. Ein privates Repository mit Pages braucht einen kostenpflichtigen GitHub-Plan.

## Installation auf dem iPhone

1. Öffne die URL `https://<benutzer>.github.io/money-tracker/` in **Safari**.
2. Tippe auf das **Teilen-Symbol**.
3. Wähle **„Zum Home-Bildschirm“**.
4. Starte die App **vom Home-Bildschirm**. Beim ersten Start wird der Tresor angelegt (Passwort festlegen, Wiederherstellungsschlüssel notieren).

## Updates

Ein neuer Push auf GitHub führt dazu, dass die App beim nächsten Start das Banner **„Neue Version verfügbar“** anzeigt. Erst ein Tipp auf **„Aktualisieren“** aktiviert die neue Version.

## Projektstruktur

```
.github/workflows/   Deployment-Workflow (GitHub Pages)
plans/               Verbindliche Pläne (Architektur, Phasen, Konzept)
public/              Icons und statische Dateien
src/
  components/        Wiederverwendbare Svelte-Komponenten
  routes/            Bildschirme (Übersicht, Buchungen, Kategorien, Backup, ...)
  lib/
    crypto/          Verschlüsselung, Tresor, Kodierung
    db/              Dexie-Datenbank und verschlüsselte Tabellen
    backup/          Backup, CSV-Export, Validierung, Erinnerung
    state/           Session, Daten, UI- und Toast-Zustand
    stats/           Auswertungen (Monatsübersicht)
```

Die verbindlichen Pläne stehen in [`plans/`](plans/README.md), beginnend mit [`plans/00-architektur.md`](plans/00-architektur.md).
