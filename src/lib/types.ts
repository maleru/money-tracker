export type TxType = 'expense' | 'income';
export type TxSource = 'manual' | 'text' | 'ocr' | 'recurring';

export interface Transaction {
  id: string;
  type: TxType;
  amountCents: number;      // Integer > 0
  date: string;             // YYYY-MM-DD
  categoryId: string;
  merchant: string;         // "Händler / Name", darf leer sein
  city: string;             // darf leer sein
  note: string;             // darf leer sein
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
  icon: string;             // ein Emoji
  color: string;            // #RRGGBB
  archived: boolean;
  sortOrder: number;
  monthlyBudgetCents: number | null;
  updatedAt: string;
}

export interface MerchantRule {
  id: string;
  pattern: string;          // Ergebnis von normalizeMerchant()
  categoryId: string;
  source: 'default' | 'learned' | 'manual';
  updatedAt: string;
}

export interface RecurringTemplate {      // Phase 2, Typ aber jetzt schon anlegen
  id: string;
  type: TxType;
  amountCents: number;
  categoryId: string;
  merchant: string;
  note: string;
  dayOfMonth: number;       // 1..31, bei kürzeren Monaten letzter Tag
  startMonth: string;       // YYYY-MM
  endMonth: string | null;  // YYYY-MM inklusiv
  lastGeneratedMonth: string | null;
  active: boolean;
  updatedAt: string;
}

export interface Settings {
  id: 'settings';
  schemaVersion: number;    // aktuell 1
  autoLockMinutes: 0 | 1 | 5 | 15;
  backupReminderDays: 0 | 7 | 14 | 30;   // 0 = aus
  lastBackupAt: string | null;
  updatedAt: string;
}

export interface AppData {
  transactions: Transaction[];
  categories: Category[];
  merchantRules: MerchantRule[];
  recurring: RecurringTemplate[];
  settings: Settings;
}
