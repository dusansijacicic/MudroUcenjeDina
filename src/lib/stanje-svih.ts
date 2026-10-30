import { createAdminClient } from '@/lib/supabase/admin';
import { buildStanjeFromMaps, buildStanjeIzPlacanja, type StanjePlacanjaTuple, type StanjeVrstaRow } from '@/lib/stanje';
import { isTermInPast } from '@/lib/constants';

/** [client_id, term_type_id, uplaceno, odrzano] – red iz baze funkcije stanje_svih_klijenata pre migracije 049. */
type StanjeTuple = [string, string | null, number, number];

type Admin = ReturnType<typeof createAdminClient>;

/** Svi redovi upita, stranu po stranu – PostgREST vraća najviše ~1000 redova po zahtevu. */
async function sviRedovi<T>(strana: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await strana(from, from + 999);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    from += data.length;
  }
  return out;
}

/**
 * Rezerva dok migracija 046 nije pokrenuta: isto pravilo kao baza (održano = označeno ili termin prošao,
 * NASTAVAK se ne broji), ali sabrano ovde. Sporije, ali tačno – bez ogromnog .in(id-jevi svih klijenata)
 * i bez gubljenja redova preko limita od 1000.
 */
async function stanjeBezMigracije(admin: Admin): Promise<Map<string, Map<string, number>>[]> {
  type Upl = { client_id: string; term_type_id: string | null; broj_casova: number | null };
  type Pred = {
    client_id: string;
    term_type_id: string | null;
    odrzano: boolean;
    term: { date: string; slot_index: number; category: { is_nastavak: boolean } | { is_nastavak: boolean }[] | null } | null;
  };
  const [uplate, predavanja] = await Promise.all([
    sviRedovi<Upl>((a, b) => admin.from('uplate').select('client_id, term_type_id, broj_casova').order('id').range(a, b)),
    sviRedovi<Pred>((a, b) =>
      admin
        .from('predavanja')
        .select('client_id, term_type_id, odrzano, term:terms(date, slot_index, category:term_categories(is_nastavak))')
        .order('id')
        .range(a, b) as unknown as PromiseLike<{ data: Pred[] | null; error: unknown }>
    ),
  ]);
  const upl = new Map<string, Map<string, number>>();
  const odr = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, cid: string, tid: string | null, n: number) => {
    const inner = m.get(cid) ?? new Map<string, number>();
    const key = tid ?? '__bez_vrste__';
    inner.set(key, (inner.get(key) ?? 0) + n);
    m.set(cid, inner);
  };
  for (const u of uplate) add(upl, u.client_id, u.term_type_id, u.broj_casova ?? 0);
  for (const p of predavanja) {
    const t = Array.isArray(p.term) ? p.term[0] : p.term;
    if (!t) continue;
    const cat = Array.isArray(t.category) ? t.category[0] : t.category;
    if (cat?.is_nastavak) continue;
    if (p.odrzano || isTermInPast(t.date, t.slot_index)) add(odr, p.client_id, p.term_type_id, 1);
  }
  return [upl, odr];
}

/**
 * Stanje (kupljeno / održano do danas / preostalo po vrsti) za SVE klijente. Baza sabira (migracija 046,
 * jedan mali odgovor); dok migracija nije pokrenuta – tačna rezerva koja sabira ovde.
 */
export async function getStanjeSvihKlijenata(): Promise<Map<string, StanjeVrstaRow[]>> {
  const admin = createAdminClient();
  const [stanjeRpc, { data: termTypes }] = await Promise.all([
    admin.rpc('stanje_svih_klijenata'),
    admin.from('term_types').select('id, naziv').order('naziv'),
  ]);
  // Posle 049 funkcija vraća stanje po paketima (6 polja po redu).
  if (!stanjeRpc.error && Array.isArray(stanjeRpc.data) && (stanjeRpc.data.length === 0 || (stanjeRpc.data[0] as unknown[]).length >= 6)) {
    return buildStanjeIzPlacanja(stanjeRpc.data as StanjePlacanjaTuple[], termTypes ?? []);
  }
  let upl: Map<string, Map<string, number>>;
  let odr: Map<string, Map<string, number>>;
  if (!stanjeRpc.error && Array.isArray(stanjeRpc.data)) {
    upl = new Map();
    odr = new Map();
    for (const [cid, tid, u, o] of stanjeRpc.data as StanjeTuple[]) {
      const key = tid ?? '__bez_vrste__';
      if (!upl.has(cid)) {
        upl.set(cid, new Map());
        odr.set(cid, new Map());
      }
      upl.get(cid)!.set(key, u);
      odr.get(cid)!.set(key, o);
    }
  } else {
    [upl, odr] = await stanjeBezMigracije(admin);
  }
  const ids = new Set([...upl.keys(), ...odr.keys()]);
  return new Map(
    [...ids].map((cid) => [cid, buildStanjeFromMaps(upl.get(cid) ?? new Map(), odr.get(cid) ?? new Map(), termTypes ?? [])])
  );
}

/**
 * Stanje po paketima (migracija 049) za izabrane klijente. null ako migracija još nije pokrenuta –
 * pozivalac tada koristi stari obračun.
 */
export async function getStanjePlacanja(clientIds: string[]): Promise<Map<string, StanjeVrstaRow[]> | null> {
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return new Map();
  const admin = createAdminClient();
  const [rpc, { data: termTypes }] = await Promise.all([
    admin.rpc('stanje_placanja', { p_klijenti: ids }),
    admin.from('term_types').select('id, naziv').order('naziv'),
  ]);
  if (rpc.error || !Array.isArray(rpc.data)) return null;
  const out = buildStanjeIzPlacanja(rpc.data as StanjePlacanjaTuple[], termTypes ?? []);
  for (const id of ids) if (!out.has(id)) out.set(id, []);
  return out;
}
