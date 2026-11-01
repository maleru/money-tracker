export const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
export const MONTH_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export const WEEKDAY_NAMES = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** Zerlegt 'YYYY-MM-DD' (ohne Validierung) in Zahlen. */
function splitIso(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** Lokale Zeit, YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function yesterdayIso(): string {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/** new Date(y, m-1, d) in lokaler Zeit. */
export function parseIsoDate(s: string): Date {
  const { y, m, d } = splitIso(s);
  const date = new Date(2000, 0, 1);
  // setFullYear statt Konstruktor, damit Jahre 0..99 nicht auf 1900+ abgebildet werden.
  date.setFullYear(y, m - 1, d);
  return date;
}

export function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month1) ? 30 : 31;
}

/** Regex + echtes Datum (kein 31.02.). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = splitIso(s);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

/** '2026-10-21' -> '2026-10' */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function currentMonthKey(): string {
  return monthKey(todayIso());
}

/** '2026-01', -1 -> '2025-12' */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${pad(ny, 4)}-${pad(nm)}`;
}

/** 'Oktober 2026' */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** '21.10.2026' */
export function formatDate(date: string): string {
  const { y, m, d } = splitIso(date);
  return `${pad(d)}.${pad(m)}.${pad(y, 4)}`;
}

/** 'Mittwoch, 21. Oktober 2026'; heute => 'Heute', gestern => 'Gestern' */
export function dayHeader(date: string): string {
  if (date === todayIso()) return 'Heute';
  if (date === yesterdayIso()) return 'Gestern';
  const { y, m, d } = splitIso(date);
  const weekday = WEEKDAY_NAMES[parseIsoDate(date).getDay()];
  return `${weekday}, ${d}. ${MONTH_NAMES[m - 1]} ${y}`;
}

/** '21.10.26' | '21.10.2026' -> '2026-10-21'; 2-stellig => 2000+yy; ungültig => null */
export function parseGermanDate(s: string): string | null {
  // Einstellige Tage und Monate (z. B. '1.5.2026') werden bewusst akzeptiert.
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** Anzahl Tage von fromIso bis toIso (positiv, wenn toIso später liegt). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = splitIso(fromIso);
  const b = splitIso(toIso);
  // UTC, damit Sommerzeitwechsel das Ergebnis nicht verfälschen.
  const diff = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(diff / 86_400_000);
}
