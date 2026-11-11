/**
 * Koliko narednih nedelja (posle prikazane) admin kalendar pokazuje u nedeljnom prikazu. Bira se
 * klizačem na kalendaru i pamti u kolačiću – posebno za svaki uređaj (tablet može manje od računara).
 */
export const NAREDNIH_NEDELJA_COOKIE = 'kalendar_narednih_nedelja';
export const NAREDNIH_NEDELJA_DEFAULT = 2;
export const NAREDNIH_NEDELJA_MAX = 8;

export function parseNarednihNedelja(v: string | undefined | null): number {
  const n = Number(v);
  if (v == null || v === '' || !Number.isInteger(n)) return NAREDNIH_NEDELJA_DEFAULT;
  return Math.min(NAREDNIH_NEDELJA_MAX, Math.max(0, n));
}

/** "Ova nedelja", "Sledeća nedelja", "Za 3 nedelje", "Prošla nedelja"… u odnosu na trenutnu nedelju. */
export function nazivNedelje(weekStart: string, trenutnaNedelja: string): string {
  const razlika = Math.round((Date.parse(`${weekStart}T12:00:00Z`) - Date.parse(`${trenutnaNedelja}T12:00:00Z`)) / (7 * 86400000));
  if (razlika === 0) return 'Ova nedelja';
  if (razlika === 1) return 'Sledeća nedelja';
  if (razlika === -1) return 'Prošla nedelja';
  const n = Math.abs(razlika);
  const rec = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'nedelje' : 'nedelja';
  return razlika > 0 ? `Za ${n} ${rec}` : `Pre ${n} ${rec}`;
}
