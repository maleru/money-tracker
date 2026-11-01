// Screenshot-OCR komplett im Gerät (tesseract.js, Dateien vom eigenen Host unter <BASE_URL>tesseract/).
// tesseract.js wird dynamisch importiert, damit es weder im Haupt-Bundle noch in den Unit-Tests landet.

/** Unterhalb dieser Breite wird das Bild verdoppelt (kleine Screenshots erkennt Tesseract schlecht). */
const MIN_WIDTH = 1500;
/** Liegt die mittlere Helligkeit darunter, ist es ein Dark-Mode-Screenshot und wird invertiert. */
const DARK_THRESHOLD = 110;

// Minimale eigene Typen, damit wir nicht von den (unvollständigen) Tesseract-Typen abhängen.
interface OcrLogMessage {
  status: string;
  progress: number;
}

interface OcrWorker {
  recognize(image: Blob): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

interface OcrWorkerOptions {
  workerPath: string;
  corePath: string;
  langPath: string;
  gzip: boolean;
  workerBlobURL: boolean;
  logger: (m: OcrLogMessage) => void;
}

type CreateWorker = (lang: string, oem: number, options: OcrWorkerOptions) => Promise<OcrWorker>;

/**
 * Wandelt RGBA-Pixel in Graustufen um und invertiert sie bei dunklem Bild (mittlere Helligkeit < 110).
 * Ändert die Daten in place; der Alpha-Kanal bleibt unverändert.
 */
export function preprocessPixels(data: Uint8ClampedArray): void {
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount === 0) return;

  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const gray = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    data[o] = gray;
    data[o + 1] = gray;
    data[o + 2] = gray;
    sum += gray;
  }

  if (sum / pixelCount < DARK_THRESHOLD) {
    for (let i = 0; i < pixelCount; i++) {
      const o = i * 4;
      const inverted = 255 - data[o];
      data[o] = inverted;
      data[o + 1] = inverted;
      data[o + 2] = inverted;
    }
  }
}

async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    const scale = bitmap.width < MIN_WIDTH ? 2 : 1;
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('Canvas nicht verfügbar');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    preprocessPixels(imageData.data);
    ctx.putImageData(imageData, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob === null ? reject(new Error('Bild konnte nicht erzeugt werden')) : resolve(blob)), 'image/png');
    });
  } finally {
    bitmap.close();
    // iOS Safari begrenzt Canvas-Speicher: Puffer explizit freigeben.
    if (canvas !== undefined) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/** Erkennt den Text eines Screenshots lokal. Das Bild wird nirgends gespeichert. */
export async function recognizeImage(file: File, onProgress: (p: number) => void): Promise<string> {
  const mod = (await import('tesseract.js')) as unknown as {
    createWorker?: CreateWorker;
    default?: { createWorker?: CreateWorker };
  };
  const createWorker = mod.createWorker ?? mod.default?.createWorker;
  if (createWorker === undefined) throw new Error('tesseract.js konnte nicht geladen werden');

  const blob = await preprocessImage(file);

  const base = import.meta.env.BASE_URL + 'tesseract/';
  const worker = await createWorker('deu', 1, {
    workerPath: base + 'worker.min.js',
    // Verzeichnis: tesseract.js wählt die passende Core-Variante (SIMD/relaxedsimd, LSTM-only) selbst.
    corePath: base + 'core',
    langPath: base + 'lang',
    gzip: true,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  try {
    const result = await worker.recognize(blob);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
