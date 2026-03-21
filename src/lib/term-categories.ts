/** Podrazumevani seed iz migracije 024 / FULL_RESET (Individualni). */
export const SEEDED_TERM_CATEGORY_INDIVIDUAL_ID = 'e8b4c5d0-1111-4a2a-9c3d-000000000001';
export const SEEDED_TERM_CATEGORY_GRUPNI_ID = 'e8b4c5d0-1111-4a2a-9c3d-000000000002';

export type TermCategoryRow = {
  id: string;
  naziv: string;
  opis: string | null;
  jedan_klijent_po_terminu: boolean;
};

export function effectiveMaxRadionica(
  jedanKlijentPoTerminu: boolean | null | undefined,
  maxCasovaPoTerminu: number
): number {
  return jedanKlijentPoTerminu !== false ? 1 : maxCasovaPoTerminu;
}

/** Iz Supabase join-a `term_categories`: da li je u terminu dozvoljena samo jedna radionica. */
export function jedanKlijentIzJoina(
  tc: { jedan_klijent_po_terminu?: boolean } | { jedan_klijent_po_terminu?: boolean }[] | null | undefined
): boolean {
  if (tc == null) return true;
  if (Array.isArray(tc)) return tc[0]?.jedan_klijent_po_terminu !== false;
  return tc.jedan_klijent_po_terminu !== false;
}

export function nazivKategorijeIzJoina(
  tc: { naziv?: string } | { naziv?: string }[] | null | undefined
): string {
  if (tc == null) return 'Kategorija';
  if (Array.isArray(tc)) return tc[0]?.naziv ?? 'Kategorija';
  return tc.naziv ?? 'Kategorija';
}
