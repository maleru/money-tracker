// Zentrale Update-Prüfung des Service Workers.
// Node-sicher: keine Zugriffe auf window/document beim Modulladen.

export type UpdateCheckResult = 'checked' | 'unsupported' | 'error';

let registration: ServiceWorkerRegistration | null = null;

export function setRegistration(r: ServiceWorkerRegistration): void {
  registration = r;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const r = registration;
  if (!r) return 'unsupported';
  try {
    await r.update();
    return 'checked';
  } catch {
    // Typisch offline; der Fehler wird bewusst verschluckt, damit keine unbehandelte Rejection entsteht.
    return 'error';
  }
}
