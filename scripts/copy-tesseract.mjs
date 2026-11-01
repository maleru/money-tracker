// Kopiert die OCR-Dateien (Worker, WASM-Core, deutsche Sprachdaten) nach public/tesseract/,
// damit Tesseract komplett vom eigenen Host lädt (kein CDN). Reines Node, keine Abhängigkeiten.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'tesseract');

function fail(message) {
  console.error(`[copy-tesseract] FEHLER: ${message}`);
  process.exit(1);
}

/** Alle Dateien unterhalb von dir (rekursiv), als absolute Pfade. */
function walk(dir) {
  const result = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`[copy-tesseract] ${to.slice(root.length + 1)} (${Math.round(statSync(to).size / 1024)} KB)`);
}

// 1) Worker
const workerSrc = join(nm, 'tesseract.js', 'dist', 'worker.min.js');
if (!existsSync(workerSrc)) fail(`worker.min.js nicht gefunden: ${workerSrc} (ist tesseract.js installiert?)`);

// 2) Core-Dateien (WASM + JS-Loader, alle Varianten: SIMD, relaxedsimd, lstm …)
const coreDir = join(nm, 'tesseract.js-core');
if (!existsSync(coreDir)) fail(`Ordner tesseract.js-core nicht gefunden: ${coreDir}`);
const coreFiles = readdirSync(coreDir).filter((f) => /^tesseract-core.*\.wasm(\.js)?$/.test(f));
if (coreFiles.length === 0) fail(`Keine tesseract-core*.wasm(.js)-Dateien in ${coreDir} gefunden`);
if (!coreFiles.some((f) => f.endsWith('.wasm.js')) || !coreFiles.some((f) => f.endsWith('.wasm'))) {
  fail(`Unvollständige Core-Dateien in ${coreDir}: ${coreFiles.join(', ')}`);
}

// 3) Sprachdaten: best_int bevorzugt, sonst 4.0.0, sonst fast
const dataDir = join(nm, '@tesseract.js-data', 'deu');
if (!existsSync(dataDir)) fail(`Ordner @tesseract.js-data/deu nicht gefunden: ${dataDir}`);
const candidates = walk(dataDir).filter((f) => f.endsWith('deu.traineddata.gz'));
const norm = (p) => p.split('\\').join('/');
const langSrc =
  candidates.find((f) => norm(f).includes('best_int')) ??
  candidates.find((f) => /\/4\.0\.0\/[^/]+$/.test(norm(f))) ??
  candidates.find((f) => norm(f).includes('fast'));
if (!langSrc) fail(`deu.traineddata.gz nicht gefunden unter ${dataDir}`);

// Sauber neu aufbauen, damit keine veralteten Dateien liegen bleiben.
rmSync(out, { recursive: true, force: true });
copy(workerSrc, join(out, 'worker.min.js'));
for (const f of coreFiles) copy(join(coreDir, f), join(out, 'core', f));
copy(langSrc, join(out, 'lang', 'deu.traineddata.gz'));
console.log(`[copy-tesseract] Sprachdaten aus ${norm(langSrc).slice(norm(root).length + 1)}`);
