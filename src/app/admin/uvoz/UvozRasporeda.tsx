'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { TIME_SLOTS } from '@/lib/constants';
import {
  PODRAZUMEVANO_TRAJANJE,
  kandidatiZaIme,
  kljucDanVreme,
  kljucVrste,
  kratakDatum,
  normalizujIme,
  opisDanVreme,
  parsirajRaspored,
  pripremiKlijente,
  type KlijentZaUvoz,
  type UvozRed,
} from '@/lib/uvoz-rasporeda';
import { postojeciTerminiZaUvoz, uveziRasporedAsAdmin, type UvozRezultat, type UvozStavka } from './actions';

type Vrsta = { id: string; naziv: string; trajanje_minuta: number | null };

const PRESKOCI = '__preskoci__';

type StanjeImena = 'sigurno' | 'proveri' | 'nema' | 'preskoci';

type ImeGrupa = {
  imeKljuc: string;
  /** Kako je napisano na papiru (može više varijanti: "Mila", "Mila (?)"). */
  prikaz: string;
  redovi: UvozRed[];
  jaki: { k: KlijentZaUvoz; poklapanje: number }[];
  slicni: KlijentZaUvoz[];
  auto: { id: string; stanje: StanjeImena; zasto: string };
};

const PRIMER = `Darija – Čas: 16.11 12:45 P1, 19.11 12:45 P1
Lea – Reed: 16.11 12:00 P1, 20.11 12:00 P1
Luna – 1,5h: 17.11 12:00 P2
16.11 13:30 P2 Stefan – Reed

ZA PROVERU
Katra (?) – Čas: 16.11 15:00 P1

ili CSV sa zaglavljem:
date,start_time,position,client_name,service_code,duration_min,needs_review,review_reason
2026-11-16,12:45,1,Darija,CAS,45,false,`;

function opisKlijenta(k: KlijentZaUvoz): string {
  return `${k.ime} ${k.prezime}${k.godiste ? ` · ${k.godiste}.` : ''}${k.razred ? ` · ${k.razred}. razred` : ''}`;
}

function autoVrsta(vrsta: string, trajanje: number, vrste: Vrsta[]): string {
  const n = normalizujIme(vrsta);
  const poImenu = vrste.filter((v) => {
    const vn = normalizujIme(v.naziv);
    return vn === n || vn.startsWith(n) || (vn.length >= 3 && n.startsWith(vn)) || vn.split(' ').includes(n);
  });
  const istoTrajanje = poImenu.filter((v) => (v.trajanje_minuta ?? PODRAZUMEVANO_TRAJANJE) === trajanje);
  if (istoTrajanje.length === 1) return istoTrajanje[0].id;
  if (trajanje === PODRAZUMEVANO_TRAJANJE && poImenu.length === 1) return poImenu[0].id;
  return '';
}

function nazivPozicije(p: string): string {
  if (p === '1') return 'Pozicija 1 (gornje polje)';
  if (p === '2') return 'Pozicija 2 (donje polje)';
  return p ? `Pozicija ${p}` : 'Bez pozicije';
}

const STANJE_IMENA: Record<StanjeImena, { oznaka: string; klasa: string }> = {
  sigurno: { oznaka: '✓ sigurno', klasa: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  proveri: { oznaka: '⚠ proverite', klasa: 'bg-amber-100 text-amber-900 border-amber-300' },
  nema: { oznaka: '✗ izaberite dete', klasa: 'bg-red-100 text-red-800 border-red-300' },
  preskoci: { oznaka: 'preskače se', klasa: 'bg-stone-100 text-stone-600 border-stone-300' },
};

export default function UvozRasporeda({
  danas,
  klijenti,
  vrste,
  instruktori,
  ucionice,
  zapamceno,
  obicno,
}: {
  danas: string;
  klijenti: KlijentZaUvoz[];
  vrste: Vrsta[];
  instruktori: { id: string; ime: string; prezime: string }[];
  ucionice: { id: string; naziv: string }[];
  zapamceno: Record<string, string>;
  obicno: Record<string, string[]>;
}) {
  const router = useRouter();
  const [tekst, setTekst] = useState('');
  const [izborDeteta, setIzborDeteta] = useState<Record<string, string>>({});
  const [izborVrste, setIzborVrste] = useState<Record<string, string>>({});
  const [izborPozicije, setIzborPozicije] = useState<Record<string, { instructorId: string; classroomId: string }>>({});
  const [ukljuci, setUkljuci] = useState<Record<string, boolean>>({});
  const [samoPaznja, setSamoPaznja] = useState(false);
  const [postojeci, setPostojeci] = useState<{ za: string; kljucevi: Set<string> }>({ za: '', kljucevi: new Set() });
  const [rezultati, setRezultati] = useState<Map<string, UvozRezultat>>(new Map());
  const [uvozim, startUvoz] = useTransition();

  const { redovi, neprepoznati } = useMemo(() => parsirajRaspored(tekst, danas), [tekst, danas]);
  const klijentiNorm = useMemo(() => pripremiKlijente(klijenti), [klijenti]);
  const klijentPoId = useMemo(() => new Map(klijenti.map((k) => [k.id, k])), [klijenti]);
  const obicnoSet = useMemo(() => new Map(Object.entries(obicno).map(([id, l]) => [id, new Set(l)])), [obicno]);

  const imena: ImeGrupa[] = useMemo(() => {
    const poImenu = new Map<string, UvozRed[]>();
    for (const r of redovi) poImenu.set(r.imeKljuc, [...(poImenu.get(r.imeKljuc) ?? []), r]);
    return [...poImenu.entries()].map(([imeKljuc, rs]) => {
      const poklapanje = (id: string) => {
        const s = obicnoSet.get(id);
        return s ? rs.filter((r) => s.has(kljucDanVreme(r.datum, r.slot))).length : 0;
      };
      const { jaki: jakiK, slicni } = kandidatiZaIme(imeKljuc, klijentiNorm);
      const jaki = jakiK.map((k) => ({ k, poklapanje: poklapanje(k.id) })).sort((a, b) => b.poklapanje - a.poklapanje);
      const zap = zapamceno[imeKljuc];
      let auto: ImeGrupa['auto'];
      if (zap && klijentPoId.has(zap)) {
        const jos = jaki.filter((j) => j.k.id !== zap).length;
        auto = { id: zap, stanje: 'sigurno', zasto: `zapamćeno od ranijeg uvoza${jos ? ` (postoji još ${jos} dece sa tim imenom)` : ''}` };
      } else if (jaki.length === 1) {
        const j = jaki[0];
        auto =
          obicnoSet.has(j.k.id) && j.poklapanje === 0
            ? { id: j.k.id, stanje: 'proveri', zasto: 'jedino dete sa tim imenom, ali do sada nije dolazilo u ova vremena' }
            : { id: j.k.id, stanje: 'sigurno', zasto: 'jedino dete sa tim imenom' };
      } else if (jaki.length > 1 && jaki[0].poklapanje > 0 && jaki[0].poklapanje > jaki[1].poklapanje) {
        auto = { id: jaki[0].k.id, stanje: 'proveri', zasto: `${jaki.length} dece sa tim imenom – izabrano ono koje obično dolazi u ova vremena` };
      } else if (jaki.length > 1) {
        auto = { id: '', stanje: 'nema', zasto: `${jaki.length} dece sa tim imenom – izaberite koje` };
      } else {
        auto = {
          id: '',
          stanje: 'nema',
          zasto: slicni.length > 0 ? 'nema deteta sa tim imenom – možda neko od sličnih?' : 'nema deteta sa tim imenom u bazi',
        };
      }
      return {
        imeKljuc,
        prikaz: [...new Set(rs.map((r) => r.ime))].join(' / '),
        redovi: rs,
        jaki,
        slicni,
        auto,
      };
    });
  }, [redovi, klijentiNorm, klijentPoId, obicnoSet, zapamceno]);

  const deteZaIme = (g: ImeGrupa): { id: string; stanje: StanjeImena; zasto: string } => {
    const izbor = izborDeteta[g.imeKljuc];
    if (izbor === undefined) return g.auto;
    if (izbor === PRESKOCI) return { id: '', stanje: 'preskoci', zasto: 'ne uvozi se' };
    if (!izbor) return { id: '', stanje: 'nema', zasto: g.auto.stanje === 'nema' ? g.auto.zasto : 'nije izabrano' };
    return { id: izbor, stanje: 'sigurno', zasto: izbor === g.auto.id ? 'potvrdili ste' : 'izabrali ste' };
  };
  const deteZaRed = useMemo(() => {
    const m = new Map<string, { id: string; stanje: StanjeImena }>();
    for (const g of imena) {
      const izbor = izborDeteta[g.imeKljuc];
      const id = izbor === undefined ? g.auto.id : izbor === PRESKOCI ? '' : izbor;
      const stanje: StanjeImena = izbor === PRESKOCI ? 'preskoci' : id ? 'sigurno' : 'nema';
      m.set(g.imeKljuc, { id, stanje });
    }
    return m;
  }, [imena, izborDeteta]);

  // Vrste sa papira → vrste časa u aplikaciji.
  const vrstePapira = useMemo(() => {
    const m = new Map<string, { vrsta: string; trajanje: number; broj: number }>();
    for (const r of redovi) {
      const k = kljucVrste(r);
      const v = m.get(k) ?? { vrsta: r.vrsta, trajanje: r.trajanje, broj: 0 };
      v.broj++;
      m.set(k, v);
    }
    return [...m.entries()].map(([kljuc, v]) => ({ kljuc, ...v, auto: autoVrsta(v.vrsta, v.trajanje, vrste) }));
  }, [redovi, vrste]);
  const vrstaZa = (kljuc: string) => izborVrste[kljuc] ?? vrstePapira.find((v) => v.kljuc === kljuc)?.auto ?? '';
  const vrstaPoId = useMemo(() => new Map(vrste.map((v) => [v.id, v])), [vrste]);

  const pozicije = useMemo(() => [...new Set(redovi.map((r) => r.pozicija))].sort(), [redovi]);
  const pozicijaZa = (p: string) => izborPozicije[p] ?? { instructorId: '', classroomId: '' };

  // Probni prolaz: koji termini već postoje (dete već ima čas ili zahtev u to vreme).
  const proveraKljuc = useMemo(() => {
    const ids = [...new Set([...deteZaRed.values()].map((d) => d.id).filter(Boolean))].sort();
    const datumi = [...new Set(redovi.map((r) => r.datum))].sort();
    return ids.length > 0 && datumi.length > 0 ? `${ids.join(',')}#${datumi.join(',')}` : '';
  }, [deteZaRed, redovi]);
  useEffect(() => {
    if (!proveraKljuc) return;
    let ponisteno = false;
    const t = setTimeout(async () => {
      const [ids, datumi] = proveraKljuc.split('#').map((s) => s.split(','));
      const res = await postojeciTerminiZaUvoz(ids, datumi);
      if (ponisteno) return;
      if (res.error) toast.error(res.error);
      setPostojeci({ za: proveraKljuc, kljucevi: new Set(res.kljucevi) });
    }, 400);
    return () => {
      ponisteno = true;
      clearTimeout(t);
    };
  }, [proveraKljuc]);
  const proveravam = !!proveraKljuc && postojeci.za !== proveraKljuc;

  type StanjeReda = 'spremno' | 'proveri' | 'postoji' | 'bez-deteta' | 'preskoceno' | 'duplikat';
  const pregled = useMemo(() => {
    const vidjeno = new Set<string>();
    return [...redovi]
      .sort((a, b) => a.datum.localeCompare(b.datum) || a.slot - b.slot || a.pozicija.localeCompare(b.pozicija))
      .map((r) => {
        const d = deteZaRed.get(r.imeKljuc) ?? { id: '', stanje: 'nema' as StanjeImena };
        const k = d.id ? `${d.id}|${r.datum}|${r.slot}` : '';
        let stanje: StanjeReda;
        if (d.stanje === 'preskoci') stanje = 'preskoceno';
        else if (!d.id) stanje = 'bez-deteta';
        else if (postojeci.kljucevi.has(k)) stanje = 'postoji';
        else if (vidjeno.has(k)) stanje = 'duplikat';
        else stanje = r.zaProveru ? 'proveri' : 'spremno';
        if (k) vidjeno.add(k);
        const moze = stanje === 'spremno' || stanje === 'proveri';
        const ukljucen = moze && (ukljuci[r.kljuc] ?? stanje === 'spremno');
        return { r, clientId: d.id, stanje, moze, ukljucen };
      });
  }, [redovi, deteZaRed, postojeci, ukljuci]);

  const zaUvoz = pregled.filter((p) => p.ukljucen && !rezultati.has(p.r.kljuc));
  const brojImena = (s: StanjeImena) => imena.filter((g) => deteZaIme(g).stanje === s).length;
  const brojRedova = (s: StanjeReda) => pregled.filter((p) => p.stanje === s).length;

  const uvezi = () => {
    if (zaUvoz.length === 0) return;
    const bezDeteta = pregled.filter((p) => p.stanje === 'bez-deteta').length;
    if (
      !confirm(
        `Uvesti ${zaUvoz.length} termina?${bezDeteta ? `\n\n${bezDeteta} termina se NE uvozi jer dete nije izabrano.` : ''}`
      )
    )
      return;
    const stavke: UvozStavka[] = zaUvoz.map(({ r, clientId }) => {
      const poz = pozicijaZa(r.pozicija);
      return {
        kljuc: r.kljuc,
        clientId,
        datum: r.datum,
        slot: r.slot,
        termTypeId: vrstaZa(kljucVrste(r)) || null,
        instructorId: poz.instructorId || null,
        classroomId: poz.classroomId || null,
      };
    });
    const imenaZaPamcenje = [...new Map(zaUvoz.map(({ r, clientId }) => [r.imeKljuc, clientId])).entries()].map(
      ([imeKljuc, clientId]) => ({ imeKljuc, clientId })
    );
    startUvoz(async () => {
      const res = await uveziRasporedAsAdmin(stavke, imenaZaPamcenje);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setRezultati((prev) => {
        const next = new Map(prev);
        for (const r of res.rezultati) next.set(r.kljuc, r);
        return next;
      });
      const uneto = res.rezultati.filter((r) => r.status === 'uneto').length;
      const greske = res.rezultati.filter((r) => r.status === 'greska').length;
      if (greske > 0) toast.error(`Uneto ${uneto}, greška kod ${greske} – vidi pregled.`);
      else toast.success(`Uneto ${uneto} termina.`);
      router.refresh();
    });
  };

  const imenaZaPrikaz = [...imena]
    .sort((a, b) => {
      const red: Record<StanjeImena, number> = { nema: 0, proveri: 1, sigurno: 2, preskoci: 3 };
      return red[deteZaIme(a).stanje] - red[deteZaIme(b).stanje] || a.prikaz.localeCompare(b.prikaz, 'sr');
    })
    .filter((g) => !samoPaznja || ['nema', 'proveri'].includes(deteZaIme(g).stanje));

  const datumi = [...new Set(redovi.map((r) => r.datum))].sort();
  const sviKlijentiOpcije = useMemo(
    () =>
      klijenti.map((k) => (
        <option key={k.id} value={k.id}>
          {opisKlijenta(k)}
        </option>
      )),
    [klijenti]
  );

  const sekcija = 'rounded-xl border border-stone-200 bg-white shadow-sm';
  const naslovSekcije = 'px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2';
  const selectKlasa = 'w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800';

  return (
    <div className="space-y-6">
      {/* 1. Spisak */}
      <section className={sekcija}>
        <div className={naslovSekcije}>
          <h2 className="font-semibold text-stone-800">1. Spisak termina</h2>
          <label className="text-sm font-medium text-amber-700 hover:text-amber-800 cursor-pointer">
            Učitaj CSV fajl…
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setTekst(await f.text());
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={tekst}
            onChange={(e) => {
              setTekst(e.target.value);
              setRezultati(new Map());
            }}
            rows={10}
            spellCheck={false}
            placeholder="Nalepite spisak ovde (spisak po detetu, jedan termin po redu, ili CSV – vidi primer ispod)…"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs text-stone-800"
          />
          <details className="text-sm text-stone-600">
            <summary className="cursor-pointer font-medium text-stone-700">Primer formata</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-stone-50 p-3 text-xs">{PRIMER}</pre>
            <p className="mt-2">
              P1 / P2 = gornje / donje polje na papiru. „1h“, „1,5h“ = trajanje. Iz Excela: označite ćelije sa zaglavljem i nalepite, ili
              sačuvajte kao CSV. Termini ispod reda „ZA PROVERU“ i imena sa „?“ se podrazumevano ne uvoze.
            </p>
          </details>
          {tekst.trim() && (
            <p className="text-sm text-stone-700">
              Prepoznato: <strong>{redovi.length}</strong> termina · <strong>{imena.length}</strong> imena ·{' '}
              {datumi.length > 0 ? (
                <>
                  <strong>{datumi.length}</strong> dana ({kratakDatum(datumi[0])} – {kratakDatum(datumi[datumi.length - 1])})
                </>
              ) : (
                '0 dana'
              )}
            </p>
          )}
          {neprepoznati.length > 0 && (
            <details className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <summary className="cursor-pointer font-medium">
                {neprepoznati.length} red(ova) nije prepoznato – oni se ne uvoze
              </summary>
              <ul className="mt-2 space-y-0.5 font-mono text-xs">
                {neprepoznati.slice(0, 100).map((n) => (
                  <li key={n.linija}>
                    <span className="text-amber-700">red {n.linija}:</span> {n.tekst}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      {redovi.length > 0 && (
        <>
          {/* 2. Ko je ko */}
          <section className={sekcija}>
            <div className={naslovSekcije}>
              <div>
                <h2 className="font-semibold text-stone-800">2. Ko je ko – izaberite tačno dete za svako ime</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Predlog ide po imenu i po tome kada dete obično dolazi (časovi od pre 8 nedelja). Izbor se pamti za sledeći uvoz.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(['nema', 'proveri', 'sigurno', 'preskoci'] as StanjeImena[]).map((s) =>
                  brojImena(s) > 0 ? (
                    <span key={s} className={`rounded-full border px-2 py-0.5 font-medium ${STANJE_IMENA[s].klasa}`}>
                      {STANJE_IMENA[s].oznaka}: {brojImena(s)}
                    </span>
                  ) : null
                )}
                <label className="ml-2 inline-flex items-center gap-1 text-stone-600">
                  <input type="checkbox" checked={samoPaznja} onChange={(e) => setSamoPaznja(e.target.checked)} />
                  samo ona koja traže pažnju
                </label>
              </div>
            </div>
            <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b border-stone-100 text-sm">
              <span className="text-stone-500">Dete ne postoji u bazi?</span>
              <Link href="/admin/klijenti/novi" target="_blank" className="font-medium text-amber-700 hover:text-amber-800">
                + Novi klijent (nova kartica)
              </Link>
              <button type="button" onClick={() => router.refresh()} className="font-medium text-stone-700 hover:text-stone-900">
                ↻ Osveži spisak dece
              </button>
            </div>
            <ul className="divide-y divide-stone-100">
              {imenaZaPrikaz.map((g) => {
                const d = deteZaIme(g);
                const izbor = izborDeteta[g.imeKljuc];
                const vrednost = izbor === undefined ? g.auto.id : izbor;
                const izabran = d.id ? klijentPoId.get(d.id) : undefined;
                const jak = g.jaki.find((j) => j.k.id === d.id);
                const poklapa = izabran ? (jak?.poklapanje ?? g.redovi.filter((r) => obicnoSet.get(izabran.id)?.has(kljucDanVreme(r.datum, r.slot))).length) : 0;
                const obicnoDete = izabran ? (obicno[izabran.id] ?? []).slice(0, 4).map(opisDanVreme) : [];
                return (
                  <li key={g.imeKljuc} className="p-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-stone-900">{g.prikaz}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STANJE_IMENA[d.stanje].klasa}`}>
                          {STANJE_IMENA[d.stanje].oznaka}
                        </span>
                        <span className="text-xs text-stone-500">{d.zasto}</span>
                        {d.stanje === 'proveri' && (
                          <button
                            type="button"
                            onClick={() => setIzborDeteta((prev) => ({ ...prev, [g.imeKljuc]: g.auto.id }))}
                            className="rounded-md border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            ✓ Tačno, to je to dete
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {g.redovi.length} termin(a) na papiru:{' '}
                        {g.redovi
                          .slice(0, 8)
                          .map((r) => `${kratakDatum(r.datum)} ${TIME_SLOTS[r.slot]}`)
                          .join(', ')}
                        {g.redovi.length > 8 ? ' …' : ''}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <select
                        value={vrednost}
                        onChange={(e) => setIzborDeteta((prev) => ({ ...prev, [g.imeKljuc]: e.target.value }))}
                        className={`${selectKlasa}${d.stanje === 'nema' ? ' border-red-400 ring-1 ring-red-300' : ''}`}
                        aria-label={`Dete za ime ${g.prikaz}`}
                      >
                        <option value="">— izaberite dete —</option>
                        {g.jaki.length > 0 && (
                          <optgroup label="Sa tim imenom">
                            {g.jaki.map((j) => (
                              <option key={j.k.id} value={j.k.id}>
                                {opisKlijenta(j.k)}
                                {obicnoSet.has(j.k.id) ? ` · obično u ova vremena: ${j.poklapanje}/${g.redovi.length}` : ' · nema skorijih časova'}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {g.slicni.length > 0 && (
                          <optgroup label="Slična imena">
                            {g.slicni.map((k) => (
                              <option key={k.id} value={k.id}>
                                {opisKlijenta(k)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Sva deca">{sviKlijentiOpcije}</optgroup>
                        <option value={PRESKOCI}>✕ preskoči – ne uvozi ovo ime</option>
                      </select>
                      {izabran && (
                        <p className="text-xs text-stone-600">
                          {izabran.roditelj ? `rod. ${izabran.roditelj} · ` : ''}
                          {obicnoDete.length > 0 ? `obično: ${obicnoDete.join(', ')}` : 'nema skorijih časova'}
                          {obicnoDete.length > 0 && (
                            <span className={poklapa > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                              {' '}
                              · poklapa se {poklapa}/{g.redovi.length}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 3. Vrste i pozicije */}
          <section className={sekcija}>
            <div className={naslovSekcije}>
              <h2 className="font-semibold text-stone-800">3. Vrste časa i pozicije</h2>
            </div>
            <div className="p-4 grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-stone-700">Vrsta sa papira → vrsta časa</h3>
                {vrstePapira.map((v) => {
                  const izabrana = vrstaPoId.get(vrstaZa(v.kljuc));
                  const drugoTrajanje = izabrana && (izabrana.trajanje_minuta ?? PODRAZUMEVANO_TRAJANJE) !== v.trajanje;
                  return (
                    <div key={v.kljuc} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-2">
                      <span className="text-sm text-stone-800">
                        {v.kljuc} <span className="text-xs text-stone-500">({v.broj})</span>
                      </span>
                      <div>
                        <select
                          value={vrstaZa(v.kljuc)}
                          onChange={(e) => setIzborVrste((prev) => ({ ...prev, [v.kljuc]: e.target.value }))}
                          className={selectKlasa}
                        >
                          <option value="">— bez vrste —</option>
                          {vrste.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.naziv}
                              {(t.trajanje_minuta ?? PODRAZUMEVANO_TRAJANJE) !== PODRAZUMEVANO_TRAJANJE ? ` (${t.trajanje_minuta} min)` : ''}
                            </option>
                          ))}
                        </select>
                        {drugoTrajanje && (
                          <p className="mt-0.5 text-xs text-amber-700">
                            Na papiru {v.trajanje} min, a ova vrsta traje {izabrana.trajanje_minuta ?? PODRAZUMEVANO_TRAJANJE} min.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-stone-700">Pozicija → instruktor i učionica</h3>
                {pozicije.map((p) => {
                  const poz = pozicijaZa(p);
                  return (
                    <div key={p || 'bez'} className="rounded-lg border border-stone-200 p-3">
                      <p className="mb-2 text-sm font-medium text-stone-800">{nazivPozicije(p)}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={poz.instructorId}
                          onChange={(e) => setIzborPozicije((prev) => ({ ...prev, [p]: { ...poz, instructorId: e.target.value } }))}
                          className={selectKlasa}
                          aria-label={`Instruktor za ${nazivPozicije(p)}`}
                        >
                          <option value="">bez instruktora (zahtev)</option>
                          {instruktori.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.ime} {i.prezime}
                            </option>
                          ))}
                        </select>
                        <select
                          value={poz.classroomId}
                          onChange={(e) => setIzborPozicije((prev) => ({ ...prev, [p]: { ...poz, classroomId: e.target.value } }))}
                          className={selectKlasa}
                          aria-label={`Učionica za ${nazivPozicije(p)}`}
                        >
                          <option value="">bez učionice</option>
                          {ucionice.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.naziv}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-stone-500">
                  Bez instruktora: termini ulaze kao narandžasti zahtevi, a instruktora dodelite posle na kalendaru modom Dodeli.
                </p>
              </div>
            </div>
          </section>

          {/* 4. Pregled i uvoz */}
          <section className={sekcija}>
            <div className={naslovSekcije}>
              <div>
                <h2 className="font-semibold text-stone-800">4. Pregled i uvoz</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Spremno {brojRedova('spremno')} · za proveru {brojRedova('proveri')} · već u kalendaru {brojRedova('postoji')} · dete
                  nije izabrano {brojRedova('bez-deteta')}
                  {brojRedova('preskoceno') > 0 ? ` · preskočeno ${brojRedova('preskoceno')}` : ''}
                  {brojRedova('duplikat') > 0 ? ` · dvaput u spisku ${brojRedova('duplikat')}` : ''}
                  {proveravam ? ' · proveravam kalendar…' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={uvezi}
                disabled={zaUvoz.length === 0 || uvozim || proveravam}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uvozim ? 'Uvozim…' : `Uvezi ${zaUvoz.length} termina`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-3 py-2 w-10"></th>
                    <th className="px-3 py-2">Vreme</th>
                    <th className="px-3 py-2">Poz.</th>
                    <th className="px-3 py-2">Sa papira</th>
                    <th className="px-3 py-2">Dete</th>
                    <th className="px-3 py-2">Vrsta</th>
                    <th className="px-3 py-2">Stanje</th>
                  </tr>
                </thead>
                <tbody>
                  {pregled.map((p, i) => {
                    const noviDan = i === 0 || pregled[i - 1].r.datum !== p.r.datum;
                    const dete = p.clientId ? klijentPoId.get(p.clientId) : undefined;
                    const vrsta = vrstaPoId.get(vrstaZa(kljucVrste(p.r)));
                    const rez = rezultati.get(p.r.kljuc);
                    return (
                      <FragmentRed key={p.r.kljuc} noviDan={noviDan} datum={p.r.datum} brojDana={pregled.filter((x) => x.r.datum === p.r.datum).length}>
                        <tr className={`border-t border-stone-100${p.ukljucen && !rez ? '' : ' text-stone-500'}`}>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={p.ukljucen}
                              disabled={!p.moze || !!rez}
                              onChange={(e) => setUkljuci((prev) => ({ ...prev, [p.r.kljuc]: e.target.checked }))}
                              aria-label="Uvezi ovaj termin"
                            />
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">{TIME_SLOTS[p.r.slot]}</td>
                          <td className="px-3 py-1.5">{p.r.pozicija || '—'}</td>
                          <td className="px-3 py-1.5">{p.r.ime}</td>
                          <td className="px-3 py-1.5">{dete ? `${dete.ime} ${dete.prezime}` : <span className="text-red-700">—</span>}</td>
                          <td className="px-3 py-1.5">
                            {vrsta?.naziv ?? <span className="text-stone-400">bez vrste</span>}
                            {p.r.trajanje !== PODRAZUMEVANO_TRAJANJE && <span className="text-xs text-stone-500"> · {p.r.trajanje} min</span>}
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            {rez ? (
                              rez.status === 'uneto' ? (
                                <span className="font-semibold text-emerald-700">✓ uneto</span>
                              ) : rez.status === 'postoji' ? (
                                <span className="text-stone-600">već je postojalo</span>
                              ) : (
                                <span className="font-semibold text-red-700">✗ {rez.poruka}</span>
                              )
                            ) : p.stanje === 'spremno' ? (
                              <span className="text-emerald-700">spremno</span>
                            ) : p.stanje === 'proveri' ? (
                              <span className="text-amber-800">⚠ za proveru{p.r.razlog ? `: ${p.r.razlog}` : ''}</span>
                            ) : p.stanje === 'postoji' ? (
                              <span>već u kalendaru</span>
                            ) : p.stanje === 'bez-deteta' ? (
                              <span className="text-red-700">dete nije izabrano</span>
                            ) : p.stanje === 'duplikat' ? (
                              <span>dvaput u spisku</span>
                            ) : (
                              <span>preskočeno</span>
                            )}
                          </td>
                        </tr>
                      </FragmentRed>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rezultati.size > 0 && (
              <div className="border-t border-stone-200 p-4 text-sm">
                <Link href="/admin/kalendar" className="font-medium text-amber-700 hover:text-amber-800">
                  → Otvori kalendar
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Red sa datumom iznad prvog termina tog dana. */
function FragmentRed({ noviDan, datum, brojDana, children }: { noviDan: boolean; datum: string; brojDana: number; children: React.ReactNode }) {
  return (
    <>
      {noviDan && (
        <tr className="bg-stone-100">
          <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-700">
            {kratakDatum(datum)} · {brojDana} termina
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
