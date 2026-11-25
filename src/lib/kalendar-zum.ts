/**
 * Zum kalendara (−/+ ili štipanje sa dva prsta): manji prikaz = više termina na ekranu odjednom (telefon,
 * tablet). Pamti se u kolačiću – posebno za svaki uređaj, kao i izbor „Narednih nedelja“.
 */
export const ZUM_COOKIE = 'kalendar_zum';
export const ZUM_MIN = 0.4;
export const ZUM_MAX = 1.2;
export const ZUM_KORAK = 0.1;

/** Na korak od 5% i u granicama [ZUM_MIN, ZUM_MAX]. */
export function zaokruziZum(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZUM_MAX, Math.max(ZUM_MIN, Math.round(z * 20) / 20));
}

export function parseZum(v: string | undefined | null): number {
  if (v == null || v === '') return 1;
  return zaokruziZum(Number(v));
}
