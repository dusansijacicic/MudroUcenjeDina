/** Vrednosti u koloni clients.pol (migracija 026). */
export type ClientPolValue = 'muski' | 'zenski';

export const CLIENT_POL_OPTIONS: { value: ClientPolValue; label: string }[] = [
  { value: 'muski', label: 'Muški' },
  { value: 'zenski', label: 'Ženski' },
];

export function normalizeClientPol(raw: string | null | undefined): ClientPolValue | null {
  const t = raw?.trim().toLowerCase();
  if (t === 'muski' || t === 'zenski') return t;
  return null;
}
