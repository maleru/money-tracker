import type { AppData } from '../types';

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

/** Die Datei ist keine gültige Backup-Datei (Struktur, Version, Schema). Die Meldung ist für den Nutzer bestimmt. */
export class InvalidBackupError extends Error {
  constructor(message = 'Keine gültige Backup-Datei') {
    super(message);
    this.name = 'InvalidBackupError';
  }
}
