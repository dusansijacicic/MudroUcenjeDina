/**
 * Statistika instruktora za izabrani period (profil instruktora u adminu): održani i zakazani časovi,
 * otkazani, testiranja, po vrstama, po mesecima, vrednost časova i primljene uplate, istorija.
 *
 * Pojmovi:
 *  - čas = termin sa bar jednim detetom (grupni termin je jedan čas); NASTAVAK termini se ne broje;
 *  - dete-čas = jedno dete na jednom času (u grupi sa 3 deteta – 3 dete-časa);
 *  - održan = označen kao održan ili mu je vreme prošlo;
 *  - vrednost = cena po času vrste umanjena za popust deteta (kao automatski iznos uplate), po detetu;
 *  - uplate = novac koji je ovaj instruktor primio (Evidencija uplata) u periodu.
 */

type Jedan<T> = T | T[] | null | undefined;
function jedan<T>(v: Jedan<T>): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export type StatTermin = {
  id: string;
  date: string;
  slot_index: number;
  classroom?: Jedan<{ naziv?: string | null }>;
  term_category?: Jedan<{ is_testing?: boolean | null; is_nastavak?: boolean | null }>;
  predavanja?: {
    id: string;
    client_id?: string | null;
    odrzano?: boolean | null;
    client?: Jedan<{ ime?: string | null; prezime?: string | null; popust_percent?: number | string | null }>;
    term_type?: Jedan<{ naziv?: string | null; cena_po_casu?: number | string | null }>;
  }[];
  potential_clients?: { id: string }[];
};

export type StatOtkazan = {
  id: string;
  term_date: string;
  slot_index: number;
  client_ime?: string | null;
  client_prezime?: string | null;
  term_type_naziv?: string | null;
  classroom_naziv?: string | null;
  placeno?: boolean | null;
  razlog?: string | null;
};

export type StatUplata = {
  id: string;
  created_at: string;
  iznos?: number | string | null;
  broj_casova?: number | null;
  client?: Jedan<{ ime?: string | null; prezime?: string | null }>;
  term_type?: Jedan<{ naziv?: string | null }>;
};

export type IstorijaStavka = {
  kljuc: string;
  datum: string;
  slot: number;
  deca: string;
  vrsta: string;
  ucionica: string | null;
  status: 'odrzan' | 'zakazan' | 'otkazan-naplacen' | 'otkazan' | 'testiranje';
  vrednost: number | null;
  termId: string | null;
  razlog?: string | null;
};

export type StatistikaInstruktora = {
  odrzanoCasova: number;
  odrzanoDeceCasova: number;
  zakazanoCasova: number;
  otkazanoNaplaceno: number;
  otkazanoNenaplaceno: number;
  testiranja: number;
  testiranoDece: number;
  razliciteDece: number;
  vrednostOdrzanih: number;
  vrednostNaplacenihOtkazanih: number;
  uplateIznos: number;
  uplateBroj: number;
  uplateCasova: number;
  poVrstama: { naziv: string; odrzano: number; zakazano: number; vrednost: number }[];
  poMesecima: { mesec: string; odrzano: number; vrednost: number; uplate: number }[];
  istorija: IstorijaStavka[];
};

const broj = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
};

export function statistikaInstruktora(ulaz: {
  termini: StatTermin[];
  otkazani: StatOtkazan[];
  uplate: StatUplata[];
  /** Cena po času po nazivu vrste – za naplaćene otkazane (oni pamte samo naziv). */
  cenePoNazivu: Map<string, number>;
  /** Da li je čas (datum + blok) prošao – ubacuje se spolja (lakše za proveru). */
  jeProslo: (datum: string, slot: number) => boolean;
  /** Mesec uplate po beogradskom vremenu (YYYY-MM). */
  mesecUplate: (createdAt: string) => string;
}): StatistikaInstruktora {
  const s: StatistikaInstruktora = {
    odrzanoCasova: 0,
    odrzanoDeceCasova: 0,
    zakazanoCasova: 0,
    otkazanoNaplaceno: 0,
    otkazanoNenaplaceno: 0,
    testiranja: 0,
    testiranoDece: 0,
    razliciteDece: 0,
    vrednostOdrzanih: 0,
    vrednostNaplacenihOtkazanih: 0,
    uplateIznos: 0,
    uplateBroj: 0,
    uplateCasova: 0,
    poVrstama: [],
    poMesecima: [],
    istorija: [],
  };
  const vrste = new Map<string, { naziv: string; odrzano: number; zakazano: number; vrednost: number }>();
  const meseci = new Map<string, { mesec: string; odrzano: number; vrednost: number; uplate: number }>();
  const mesec = (m: string) => {
    let r = meseci.get(m);
    if (!r) meseci.set(m, (r = { mesec: m, odrzano: 0, vrednost: 0, uplate: 0 }));
    return r;
  };
  const deca = new Set<string>();

  for (const t of ulaz.termini) {
    const kat = jedan(t.term_category);
    if (kat?.is_nastavak) continue;
    const ucionica = jedan(t.classroom)?.naziv ?? null;
    const proslo = ulaz.jeProslo(t.date, t.slot_index);
    if (kat?.is_testing) {
      const n = (t.potential_clients ?? []).length;
      if (n === 0) continue;
      if (proslo) {
        s.testiranja++;
        s.testiranoDece += n;
      }
      s.istorija.push({
        kljuc: `t-${t.id}`,
        datum: t.date,
        slot: t.slot_index,
        deca: `${n} ${n === 1 ? 'dete' : 'dece'} na testiranju`,
        vrsta: 'Testiranje',
        ucionica,
        status: proslo ? 'testiranje' : 'zakazan',
        vrednost: null,
        termId: t.id,
      });
      continue;
    }
    const pred = t.predavanja ?? [];
    if (pred.length === 0) continue; // automatski nastavak dužeg časa ili prazan termin
    const odrzan = proslo || pred.some((p) => p.odrzano);
    let vrednostTermina = 0;
    let imaCenu = false;
    for (const p of pred) {
      const vrsta = jedan(p.term_type);
      const naziv = vrsta?.naziv ?? 'Bez vrste';
      let v = vrste.get(naziv);
      if (!v) vrste.set(naziv, (v = { naziv, odrzano: 0, zakazano: 0, vrednost: 0 }));
      if (odrzan) {
        v.odrzano++;
        s.odrzanoDeceCasova++;
        if (p.client_id) deca.add(p.client_id);
        if (vrsta?.cena_po_casu != null) {
          const popust = Math.min(100, Math.max(0, broj(jedan(p.client)?.popust_percent)));
          const cena = Math.round(broj(vrsta.cena_po_casu) * (1 - popust / 100));
          v.vrednost += cena;
          vrednostTermina += cena;
          imaCenu = true;
        }
      } else {
        v.zakazano++;
      }
    }
    if (odrzan) {
      s.odrzanoCasova++;
      s.vrednostOdrzanih += vrednostTermina;
      const m = mesec(t.date.slice(0, 7));
      m.odrzano++;
      m.vrednost += vrednostTermina;
    } else {
      s.zakazanoCasova++;
    }
    const prva = jedan(pred[0]?.term_type);
    s.istorija.push({
      kljuc: `p-${t.id}`,
      datum: t.date,
      slot: t.slot_index,
      deca: pred
        .map((p) => {
          const c = jedan(p.client);
          return `${c?.ime ?? ''} ${c?.prezime ?? ''}`.trim() || '—';
        })
        .join(', '),
      vrsta: prva?.naziv ?? 'Bez vrste',
      ucionica,
      status: odrzan ? 'odrzan' : 'zakazan',
      vrednost: odrzan && imaCenu ? vrednostTermina : null,
      termId: t.id,
    });
  }
  s.razliciteDece = deca.size;

  for (const o of ulaz.otkazani) {
    const cena = o.placeno && o.term_type_naziv ? ulaz.cenePoNazivu.get(o.term_type_naziv) ?? null : null;
    if (o.placeno) {
      s.otkazanoNaplaceno++;
      if (cena != null) {
        s.vrednostNaplacenihOtkazanih += cena;
        mesec(o.term_date.slice(0, 7)).vrednost += cena;
      }
    } else {
      s.otkazanoNenaplaceno++;
    }
    s.istorija.push({
      kljuc: `o-${o.id}`,
      datum: o.term_date,
      slot: o.slot_index,
      deca: `${o.client_ime ?? ''} ${o.client_prezime ?? ''}`.trim() || '—',
      vrsta: o.term_type_naziv ?? 'Bez vrste',
      ucionica: o.classroom_naziv ?? null,
      status: o.placeno ? 'otkazan-naplacen' : 'otkazan',
      vrednost: cena,
      termId: null,
      razlog: o.razlog ?? null,
    });
  }

  for (const u of ulaz.uplate) {
    const iznos = broj(u.iznos);
    s.uplateBroj++;
    s.uplateIznos += iznos;
    s.uplateCasova += u.broj_casova ?? 0;
    mesec(ulaz.mesecUplate(u.created_at)).uplate += iznos;
  }

  s.poVrstama = [...vrste.values()].sort((a, b) => b.odrzano - a.odrzano || b.zakazano - a.zakazano || a.naziv.localeCompare(b.naziv, 'sr'));
  s.poMesecima = [...meseci.values()].sort((a, b) => a.mesec.localeCompare(b.mesec));
  s.istorija.sort((a, b) => b.datum.localeCompare(a.datum) || b.slot - a.slot);
  return s;
}

/** Periodi za izbor na profilu (od–do, YYYY-MM-DD) u odnosu na današnji datum. */
export function periodi(danas: string): { kljuc: string; naziv: string; od: string; do: string }[] {
  const [g, m] = danas.split('-').map(Number);
  const dan = (y: number, mo: number, d: number) => {
    const x = new Date(Date.UTC(y, mo - 1, d));
    return x.toISOString().slice(0, 10);
  };
  const krajMeseca = (y: number, mo: number) => dan(y, mo + 1, 0);
  const pre30 = new Date(`${danas}T12:00:00Z`);
  pre30.setUTCDate(pre30.getUTCDate() - 29);
  const zaGodinu = new Date(`${danas}T12:00:00Z`);
  zaGodinu.setUTCFullYear(zaGodinu.getUTCFullYear() + 1);
  return [
    { kljuc: 'ovaj-mesec', naziv: 'Ovaj mesec', od: dan(g, m, 1), do: krajMeseca(g, m) },
    { kljuc: 'prosli-mesec', naziv: 'Prošli mesec', od: dan(g, m - 1, 1), do: krajMeseca(g, m - 1) },
    { kljuc: '30-dana', naziv: 'Poslednjih 30 dana', od: pre30.toISOString().slice(0, 10), do: danas },
    { kljuc: 'ova-godina', naziv: 'Ova godina', od: dan(g, 1, 1), do: dan(g, 12, 31) },
    { kljuc: 'sve', naziv: 'Sve', od: '2000-01-01', do: zaGodinu.toISOString().slice(0, 10) },
  ];
}
