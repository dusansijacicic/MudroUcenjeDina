/**
 * Stanje časova jednog klijenta po vrsti: plaćeno (paketi iz moda „Označi plaćeno“, migracija 049),
 * održano, preostalo (plaćeno, a još nije održano) i nije plaćeno (održano posle prve oznake, a van paketa).
 * Polje se i dalje zove `uplaceno` da ga sve stranice čitaju isto.
 */
export type StanjeVrstaRow = {
  term_type_id: string | null;
  term_type_naziv: string;
  uplaceno: number;
  odrzano: number;
  ostalo: number;
  duguje: number;
};

/** Red iz baze (stanje_placanja / stanje_svih_klijenata posle 049): [client_id, term_type_id, placeno, odrzano, nije_placeno, preostalo]. */
export type StanjePlacanjaTuple = [string, string | null, number, number, number, number];

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
      duguje: Math.max(0, odrzano - uplaceno),
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
      duguje: Math.max(0, bezVrsteOdrz - bezVrsteUpl),
    });
  }
  return result;
}

/** Redovi iz baze (paketi) → Map<clientId, stanje po vrsti>, istim redosledom vrsta kao šifarnik. */
export function buildStanjeIzPlacanja(
  rows: StanjePlacanjaTuple[],
  termTypes: { id: string; naziv: string | null }[]
): Map<string, StanjeVrstaRow[]> {
  const redosled = new Map(termTypes.map((t, i) => [t.id, i]));
  const naziv = new Map(termTypes.map((t) => [t.id, t.naziv ?? '']));
  const out = new Map<string, StanjeVrstaRow[]>();
  for (const [cid, tid, placeno, odrzano, duguje, preostalo] of rows) {
    const lista = out.get(cid) ?? [];
    lista.push({
      term_type_id: tid,
      term_type_naziv: tid ? (naziv.get(tid) ?? '') : 'Bez vrste',
      uplaceno: placeno,
      odrzano,
      ostalo: preostalo,
      duguje,
    });
    out.set(cid, lista);
  }
  for (const lista of out.values()) {
    lista.sort((a, b) => (a.term_type_id ? (redosled.get(a.term_type_id) ?? 0) : 1e9) - (b.term_type_id ? (redosled.get(b.term_type_id) ?? 0) : 1e9));
  }
  return out;
}
