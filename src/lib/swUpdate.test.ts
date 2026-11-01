import { beforeEach, describe, expect, it, vi } from 'vitest';

type SwModule = typeof import('./swUpdate');

async function loadModule(): Promise<SwModule> {
  vi.resetModules();
  return import('./swUpdate');
}

function mockRegistration(update: () => Promise<void>): ServiceWorkerRegistration {
  return { update } as unknown as ServiceWorkerRegistration;
}

describe('checkForUpdate', () => {
  let mod: SwModule;

  beforeEach(async () => {
    mod = await loadModule();
  });

  it("liefert 'unsupported' ohne Registrierung", async () => {
    await expect(mod.checkForUpdate()).resolves.toBe('unsupported');
  });

  it("liefert 'checked', wenn update() erfolgreich ist", async () => {
    const update = vi.fn(() => Promise.resolve());
    mod.setRegistration(mockRegistration(update));
    await expect(mod.checkForUpdate()).resolves.toBe('checked');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("liefert 'error', wenn update() rejected (z. B. offline)", async () => {
    mod.setRegistration(mockRegistration(() => Promise.reject(new Error('offline'))));
    await expect(mod.checkForUpdate()).resolves.toBe('error');
  });
});
