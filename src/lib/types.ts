export type TxType = 'expense' | 'income' | 'transfer';
export type TxDirection = 'in' | 'out';
export type TxSource = 'manual' | 'text' | 'ocr' | 'recurring';
export type AccountKind = 'checking' | 'credit_card' | 'savings' | 'other';

export interface Transaction {
  id: string;
  type: TxType;
  amountCents: number;      // Integer > 0
  date: string;             // YYYY-MM-DD
  categoryId: string;       // Haupt- oder Unterkategorie, Typ passt zu type
  accountId: string;        // verweist auf Account.id
  direction: TxDirection | null; // nur bei type 'transfer' gesetzt, sonst null
  merchant: string;         // Anzeige-Händler, darf leer sein
  originalText: string;     // Händlertext aus dem Import vor Umbenennung; '' bei manueller Erfassung
  city: string;
  note: string;
  source: TxSource;
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Eingabedaten für eine neue Buchung (id und Zeitstempel werden beim Speichern vergeben). */
export type TxInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export interface Category {
  id: string;
  name: string;
  type: TxType;
  parentId: string | null;  // null = Hauptkategorie; sonst id einer Hauptkategorie gleichen Typs
  icon: string;
  color: string;
  archived: boolean;
  sortOrder: number;        // Reihenfolge unter Geschwistern (gleicher Typ, gleicher parentId)
  monthlyBudgetCents: number | null; // nur bei Hauptkategorien vom Typ expense sinnvoll
  updatedAt: string;
}

export interface MerchantRule {
  id: string;
  pattern: string;          // Ergebnis von normalizeMerchant()
  categoryId: string;       // darf auf Unter- und Transfer-Kategorien zeigen
  displayName: string | null; // Anzeige-Händler beim Import; null = Originaltext behalten
  source: 'default' | 'learned' | 'manual';
  updatedAt: string;
}

export interface RecurringTemplate {
  id: string;
  type: TxType;
  amountCents: number;
  categoryId: string;
  accountId: string;
  direction: TxDirection | null;
  merchant: string;
  note: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  lastGeneratedMonth: string | null;
  active: boolean;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  icon: string;
  archived: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface Settings {
  id: 'settings';
  schemaVersion: number;    // aktuell 2
  autoLockMinutes: 0 | 1 | 5 | 15;
  backupReminderDays: 0 | 7 | 14 | 30;
  lastBackupAt: string | null;
  ownNames: string[];       // „Eigene Namen“ für die Umbuchungs-Heuristik
  updatedAt: string;
}

export interface AppData {
  transactions: Transaction[];
  categories: Category[];
  merchantRules: MerchantRule[];
  recurring: RecurringTemplate[];
  accounts: Account[];
  settings: Settings;
}
