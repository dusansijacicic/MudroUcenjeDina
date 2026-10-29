/** Stanje časova jednog klijenta po vrsti: kupljeno (uplate), održano i preostalo. */
export type StanjeVrstaRow = { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number };

/** Spaja uplate i održane časove (po id-u vrste, '__bez_vrste__' za časove bez vrste) u redove za prikaz. */
export function buildStanjeFromMaps(
  uplateByType: Map<string, number>,
  odrzanoByType: Map<string, number>,
  termTypes: { id: string; naziv: string | null }[]
): StanjeVrstaRow[] {
  const result: StanjeVrstaRow[] = [];
  for (const tt of termTypes) {
    const uplaceno = uplateByType.get(tt.id) ?? 0;
    const odrzano = odrzanoByType.get(tt.id) ?? 0;
    if (uplaceno === 0 && odrzano === 0) continue;
    result.push({
      term_type_id: tt.id,
      term_type_naziv: tt.naziv ?? '',
      uplaceno,
      odrzano,
      ostalo: Math.max(0, uplaceno - odrzano),
    });
  }
  const bezVrsteUpl = uplateByType.get('__bez_vrste__') ?? 0;
  const bezVrsteOdrz = odrzanoByType.get('__bez_vrste__') ?? 0;
  if (bezVrsteUpl > 0 || bezVrsteOdrz > 0) {
    result.push({
      term_type_id: null,
      term_type_naziv: 'Bez vrste',
      uplaceno: bezVrsteUpl,
      odrzano: bezVrsteOdrz,
      ostalo: Math.max(0, bezVrsteUpl - bezVrsteOdrz),
    });
  }
  return result;
}
