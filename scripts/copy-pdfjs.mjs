// Kopiert die pdf.js-Dateien (Worker, CMaps, Standardschriften) nach public/pdfjs/,
// damit pdf.js komplett vom eigenen Host lädt (kein CDN). Reines Node, keine Abhängigkeiten.
// Nutzt den Legacy-Build von pdfjs-dist (iOS 17/18-kompatibel, siehe plans/05-pdf-analyse.md §1.1).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const pkgDir = join(nm, 'pdfjs-dist');
const out = join(root, 'public', 'pdfjs');

function fail(message) {
  console.error(`[copy-pdfjs] FEHLER: ${message}`);
  process.exit(1);
}

/** Dateien (nicht rekursiv) in dir, als absolute Pfade. */
function listFiles(dir) {
  return readdirSync(dir).map((name) => join(dir, name)).filter((full) => statSync(full).isFile());
}

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

/** Kopiert alle Dateien von srcDir nach destDir und gibt eine Summenzeile aus. */
function copyFolder(label, srcDir, destDir) {
  const files = listFiles(srcDir);
  let bytes = 0;
  for (const f of files) {
    copy(f, join(destDir, f.slice(srcDir.length + 1)));
    bytes += statSync(f).size;
  }
  console.log(`[copy-pdfjs] ${label}: ${files.length} Dateien (${Math.round(bytes / 1024)} KB)`);
}

// 1) Paket vorhanden? Version lesen.
const pkgJson = join(pkgDir, 'package.json');
if (!existsSync(pkgJson)) fail(`pdfjs-dist nicht gefunden: ${pkgJson} (ist pdfjs-dist installiert?)`);
const version = JSON.parse(readFileSync(pkgJson, 'utf8')).version;

// 2) Worker (Legacy-Build). Kein Fallback auf den modernen Build.
const workerSrc = join(pkgDir, 'legacy', 'build', 'pdf.worker.min.mjs');
if (!existsSync(workerSrc)) fail(`Worker nicht gefunden: ${workerSrc}`);

// 3) CMaps: Ordner muss existieren und mindestens eine .bcmap-Datei enthalten.
const cmapsDir = join(pkgDir, 'cmaps');
if (!existsSync(cmapsDir)) fail(`Ordner cmaps nicht gefunden: ${cmapsDir}`);
if (!listFiles(cmapsDir).some((f) => f.endsWith('.bcmap'))) fail(`Keine .bcmap-Dateien in ${cmapsDir}`);

// 4) Standardschriften: Ordner muss existieren und mindestens eine Datei enthalten.
const fontsDir = join(pkgDir, 'standard_fonts');
if (!existsSync(fontsDir)) fail(`Ordner standard_fonts nicht gefunden: ${fontsDir}`);
if (listFiles(fontsDir).length === 0) fail(`Keine Dateien in ${fontsDir}`);

// Erst nach allen Prüfungen neu aufbauen, damit keine veralteten Dateien liegen bleiben.
rmSync(out, { recursive: true, force: true });
copy(workerSrc, join(out, 'pdf.worker.min.mjs'));
console.log(`[copy-pdfjs] pdf.worker.min.mjs (${Math.round(statSync(workerSrc).size / 1024)} KB)`);
copyFolder('cmaps', cmapsDir, join(out, 'cmaps'));
copyFolder('standard_fonts', fontsDir, join(out, 'standard_fonts'));
console.log(`[copy-pdfjs] pdfjs-dist ${version}`);
