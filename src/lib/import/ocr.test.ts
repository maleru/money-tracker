import { describe, expect, it } from 'vitest';
import { preprocessPixels } from './ocr';

function pixels(...rgba: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba.flat());
}

describe('preprocessPixels', () => {
  it('lässt ein helles Bild hell (nur Graustufen)', () => {
    const data = pixels([255, 255, 255, 255], [200, 200, 200, 255], [250, 240, 230, 255]);
    preprocessPixels(data);
    expect(data[0]).toBe(255);
    expect(data[4]).toBe(200);
    // Graustufen: R = G = B
    expect(data[8]).toBe(data[9]);
    expect(data[9]).toBe(data[10]);
    expect(data[8]).toBeGreaterThan(200);
  });

  it('invertiert ein dunkles Bild', () => {
    const data = pixels([0, 0, 0, 255], [20, 20, 20, 255], [30, 30, 30, 255]);
    preprocessPixels(data);
    expect(data[0]).toBe(255);
    expect(data[4]).toBe(235);
    expect(data[8]).toBe(225);
  });

  it('wandelt Farbe in Graustufen um und lässt Alpha unverändert', () => {
    const data = pixels([255, 0, 0, 128], [255, 255, 255, 255]);
    preprocessPixels(data);
    expect(data[0]).toBe(76);
    expect(data[1]).toBe(76);
    expect(data[2]).toBe(76);
    expect(data[3]).toBe(128);
  });

  it('invertiert Dark-Mode-Screenshot mit heller Schrift auf dunklem Grund', () => {
    // 9 dunkle Pixel (Hintergrund), 1 heller Pixel (Text)
    const rows: number[][] = Array.from({ length: 9 }, () => [10, 10, 10, 255]);
    rows.push([240, 240, 240, 255]);
    const data = pixels(...rows);
    preprocessPixels(data);
    expect(data[0]).toBe(245); // Hintergrund wird hell
    expect(data[36]).toBe(15); // Text wird dunkel
  });

  it('verträgt leere Daten', () => {
    const data = new Uint8ClampedArray(0);
    expect(() => preprocessPixels(data)).not.toThrow();
  });
});
