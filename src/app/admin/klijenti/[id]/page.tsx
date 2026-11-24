import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import AdminClientForm from './AdminClientForm';
import AdminDeleteClientButton from './AdminDeleteClientButton';
import { getStanjePoVrstamaZaKlijenta, markPastPredavanjaAsOdrzano, getTermTypes, getOtkazaneTermineZaKlijenta, getClientTermTypeStatuses, getPrograms, getClientProgrami } from '@/app/admin/actions';
import { TIME_SLOTS, isTermInPast } from '@/lib/constants';
import type { Client } from '@/types/database';
import OtkazaniTerminiSection from './OtkazaniTerminiSection';
import UplateKlijentaSection, { type UplataKlijentaRow } from './UplateKlijentaSection';
import PlaceniPaketiSection, { type PaketKlijentaRow } from './PlaceniPaketiSection';
import OznaciPlacenoDugme from './OznaciPlacenoDugme';
import UrediOtkazanDugme from './UrediOtkazanDugme';
import PlacenoStanje from '@/components/PlacenoStanje';

function getMonday(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

export default async function AdminKlijentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  await markPastPredavanjaAsOdrzano(clientId);

  const adminSupabase = createAdminClient();
  const [{ data: client, error }, stanjePoVrstama, { data: predavanjaRaw }, { data: zahteviRaw }, termTypes, otkazani, programStatuses, programs, programiSelections, { data: uplateRaw }, { data: aktivniInstruktori }, { data: paketiRaw }, { data: redniRaw }, { data: oznakeRaw }] = await Promise.all([
    adminSupabase.from('clients').select('*, popust_percent, napomena, accessible_term_type_ids').eq('id', clientId).single(),
    getStanjePoVrstamaZaKlijenta(clientId),
    adminSupabase
      .from('predavanja')
      .select('id, odrzano, placeno, term_id, term_type_id, term:terms(date, slot_index, instructor:instructors(ime, prezime)), term_type:term_types(naziv, cena_po_casu)')
      .eq('client_id', clientId),
    // Termini zakazani bez instruktora žive kao zahtevi dok ih neki predavač ne preuzme – bez ovoga
    // se u profilu ne bi videli (ni posle "Zakaži termin" sa podrazumevanim "bez instruktora").
    adminSupabase
      .from('zahtevi_za_cas')
      .select('id, requested_date, requested_slot_index, term_type_id, instructor:instructors!instructor_id(ime, prezime), term_type:term_types(naziv), classroom:classrooms(naziv)')
      .eq('client_id', clientId)
      .eq('status', 'pending'),
    getTermTypes(),
    getOtkazaneTermineZaKlijenta(clientId),
    getClientTermTypeStatuses(clientId),
    getPrograms(),
    getClientProgrami(clientId),
    adminSupabase
      .from('uplate')
      .select('id, created_at, iznos, broj_casova, popust_percent, napomena, instructor:instructors(ime, prezime), term_type:term_types(naziv)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase.from('instructors').select('id, ime, prezime').eq('aktivan', true).order('prezime').order('ime'),
    // Oznake „plaćeno od ovog časa“ (049) i status plaćanja svakog časa – pre migracije greška → prazno.
    adminSupabase
      .from('placeni_paketi')
      .select('id, od_datum, od_slot, broj_casova, created_at, term_type:term_types(naziv)')
      .eq('client_id', clientId)
      .order('od_datum', { ascending: false })
      .order('od_slot', { ascending: false }),
    adminSupabase.rpc('redni_broj_casova_klijenta', { p_client: clientId }),
    // Vrsta kojoj oznaka stvarno pripada (050) – oznaka na času bez vrste ide uz najbliži čas sa vrstom.
    adminSupabase.rpc('oznake_placanja', { p_klijenti: [clientId] }),
  ]);

  if (error || !client) notFound();

  const stanjePoVrstamaPrikaz = stanjePoVrstama;
  const redni = (redniRaw ?? {}) as Record<string, [number, number]>;

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const vrstaOznake = new Map(((oznakeRaw ?? []) as { o_id: string; o_tip: string | null }[]).map((o) => [o.o_id, o.o_tip]));
  const nazivVrste = new Map(termTypes.map((t) => [t.id, t.naziv ?? '']));
  const paketi: PaketKlijentaRow[] = (paketiRaw ?? []).map((p) => ({
    id: p.id,
    vrsta: one(p.term_type as { naziv?: string } | { naziv?: string }[] | null)?.naziv ?? null,
    vrstaIzvedena: nazivVrste.get(vrstaOznake.get(p.id) ?? '') ?? null,
    odDatum: String(p.od_datum).slice(0, 10),
    odSlot: p.od_slot,
    brojCasova: p.broj_casova,
    createdAt: p.created_at ?? null,
  }));

  const uplate: UplataKlijentaRow[] = (uplateRaw ?? []).map((u) => {
    const instr = one(u.instructor as { ime?: string; prezime?: string } | { ime?: string; prezime?: string }[] | null);
    return {
      id: u.id,
      createdAt: u.created_at ?? null,
      iznos: u.iznos != null ? Number(u.iznos) : null,
      brojCasova: u.broj_casova ?? 0,
      popustPercent: u.popust_percent != null ? Number(u.popust_percent) : null,
      napomena: u.napomena ?? null,
      primio: instr ? `${instr.ime ?? ''} ${instr.prezime ?? ''}`.trim() : null,
      vrsta: one(u.term_type as { naziv?: string } | { naziv?: string }[] | null)?.naziv ?? null,
    };
  });

  type TermInfo = { date: string; slot_index: number; instructor?: { ime?: string; prezime?: string } | { ime?: string; prezime?: string }[] | null };
  type VrstaInfo = { naziv?: string; cena_po_casu?: number | null };
  type PredavanjeRow = {
    id: string;
    odrzano: boolean;
    placeno: boolean;
    term_id: string;
    term_type_id?: string | null;
    term: TermInfo | TermInfo[] | null;
    term_type?: VrstaInfo | VrstaInfo[] | null;
  };
  const predavanjaList = (predavanjaRaw ?? []) as PredavanjeRow[];
  const withTerm = predavanjaList
    .map((p) => {
      const term = Array.isArray(p.term) ? p.term[0] : p.term;
      return { ...p, term };
    })
    .filter((p): p is PredavanjeRow & { term: TermInfo } => p.term != null && typeof p.term === 'object' && 'date' in p.term);
  const sortByDateSlot = (a: { term: TermInfo }, b: { term: TermInfo }) => {
    const d = (a.term.date ?? '').localeCompare(b.term.date ?? '');
    if (d !== 0) return d;
    return (a.term.slot_index ?? 0) - (b.term.slot_index ?? 0);
  };
  const sortByDateSlotDesc = (a: { term: TermInfo }, b: { term: TermInfo }) => -sortByDateSlot(a, b);
  const isPast = (p: { term: TermInfo }) => isTermInPast(p.term.date, p.term.slot_index ?? 0);
  const odrzani = withTerm.filter((p) => p.odrzano || isPast(p)).sort(sortByDateSlotDesc);
  const zakazaniPredavanja = withTerm.filter((p) => !p.odrzano && !isPast(p));

  type Naziv = { naziv?: string } | { naziv?: string }[] | null;
  type ZahtevRow = {
    id: string;
    requested_date: string;
    requested_slot_index: number;
    term_type_id?: string | null;
    instructor: TermInfo['instructor'];
    term_type: Naziv;
    classroom: Naziv;
  };
  const zahtevi = ((zahteviRaw ?? []) as ZahtevRow[]).map((z) => ({
    id: z.id,
    termTypeId: z.term_type_id ?? null,
    term: { date: z.requested_date, slot_index: z.requested_slot_index, instructor: z.instructor },
    vrsta: one(z.term_type)?.naziv ?? null,
    ucionica: one(z.classroom)?.naziv ?? null,
  }));

  // Otkazani časovi (mod Otkaži na kalendaru, ili brisanje časa iz forme) – u pregledu stoje na svom
  // datumu, sivi i precrtani, da se vidi da je taj čas bio pa otkazan.
  const otkazaniUPregledu = otkazani.map((o) => ({ o, term: { date: o.term_date, slot_index: o.slot_index } as TermInfo }));
  const otkazaniBuduci = otkazaniUPregledu.filter((x) => !isTermInPast(x.term.date, x.term.slot_index));
  const otkazaniProsli = otkazaniUPregledu.filter((x) => isTermInPast(x.term.date, x.term.slot_index));

  type ZakazanItem =
    | { kind: 'predavanje'; p: (typeof zakazaniPredavanja)[number]; term: TermInfo }
    | { kind: 'zahtev'; z: (typeof zahtevi)[number]; term: TermInfo }
    | { kind: 'otkazan'; o: (typeof otkazani)[number]; term: TermInfo };
  const zakazani: ZakazanItem[] = [
    ...zakazaniPredavanja.map((p) => ({ kind: 'predavanje' as const, p, term: p.term })),
    ...zahtevi.map((z) => ({ kind: 'zahtev' as const, z, term: z.term })),
    ...otkazaniBuduci.map(({ o, term }) => ({ kind: 'otkazan' as const, o, term })),
  ].sort(sortByDateSlot);
  const brojZakazanih = zakazaniPredavanja.length + zahtevi.length;
  const brojBezInstruktora = zahtevi.length;

  type ProsliItem =
    | { kind: 'predavanje'; p: (typeof odrzani)[number]; term: TermInfo }
    | { kind: 'otkazan'; o: (typeof otkazani)[number]; term: TermInfo };
  const prosli: ProsliItem[] = [
    ...odrzani.map((p) => ({ kind: 'predavanje' as const, p, term: p.term })),
    ...otkazaniProsli.map(({ o, term }) => ({ kind: 'otkazan' as const, o, term })),
  ].sort(sortByDateSlotDesc);

  // ── Plaćanje kao na kalendaru: svaki čas (i čas bez instruktora i naplaćen otkazan) sa „x/y“ ──────
  // x ≤ y = plaćen, x > y = nije plaćen; bez x/y = pre prve oznake „plaćeno“ (ne broji se).
  type CasZaPlacanje = { kljuc: string; datum: string; slot: number; termTypeId: string | null; proslo: boolean; vrsta: string | null };
  const sviCasovi: CasZaPlacanje[] = [
    ...withTerm.map((p) => {
      const v = Array.isArray(p.term_type) ? p.term_type[0] : p.term_type;
      return { kljuc: p.id, datum: p.term.date, slot: p.term.slot_index, termTypeId: p.term_type_id ?? null, proslo: p.odrzano || isPast(p), vrsta: v?.naziv ?? null };
    }),
    ...zahtevi.map((z) => ({ kljuc: z.id, datum: z.term.date, slot: z.term.slot_index, termTypeId: z.termTypeId, proslo: isTermInPast(z.term.date, z.term.slot_index), vrsta: z.vrsta })),
    ...otkazani
      .filter((o) => o.placeno)
      .map((o) => ({ kljuc: o.id, datum: o.term_date, slot: o.slot_index, termTypeId: null, proslo: true, vrsta: o.term_type_naziv ?? null })),
  ].sort((a, b) => a.datum.localeCompare(b.datum) || a.slot - b.slot);
  const placanje = { odrzanoPlaceno: 0, odrzanoNeplaceno: 0, buduciPokriveni: 0, buduciNepokriveni: 0, nebrojani: 0 };
  for (const c of sviCasovi) {
    const r = redni[c.kljuc];
    const placen = !!r && r[0] <= r[1];
    if (!r) placanje.nebrojani++;
    else if (c.proslo && placen) placanje.odrzanoPlaceno++;
    else if (c.proslo) placanje.odrzanoNeplaceno++;
    else if (placen) placanje.buduciPokriveni++;
    else placanje.buduciNepokriveni++;
  }
  const placenoUOznakama = paketi.reduce((n, pk) => n + (pk.brojCasova ?? 0), 0);
  // Prvi neplaćeni čas (posle potrošenog paketa); dete bez ijedne oznake – prvi čas od danas (ili poslednji).
  const prviNeplaceni: CasZaPlacanje | null =
    sviCasovi.find((c) => {
      const r = redni[c.kljuc];
      return r != null && r[0] > r[1];
    }) ??
    (paketi.length === 0 ? sviCasovi.find((c) => !c.proslo) ?? sviCasovi[sviCasovi.length - 1] ?? null : null);
  const opisCasa = (c: CasZaPlacanje) =>
    `${new Date(c.datum + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: 'numeric', month: 'numeric' })} ${TIME_SLOTS[c.slot] ?? ''}`;
  const pocetakPaketa = new Map(paketi.map((pk) => [`${pk.odDatum}|${pk.odSlot}`, pk.brojCasova]));
  const OznakaPaketa = ({ datum, slot }: { datum: string; slot: number }) => {
    const n = pocetakPaketa.get(`${datum}|${slot}`);
    if (n == null) return null;
    return (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{n === 1 ? '💰 plaćen ovaj čas' : `💰 od ovde (${n})`}</span>
    );
  };
  const DugmeAkoPrvi = ({ kljuc }: { kljuc: string }) =>
    prviNeplaceni && prviNeplaceni.kljuc === kljuc ? (
      <OznaciPlacenoDugme
        clientId={client.id}
        termTypeId={prviNeplaceni.termTypeId}
        datum={prviNeplaceni.datum}
        slot={prviNeplaceni.slot}
        opis={opisCasa(prviNeplaceni)}
      />
    ) : null;

  const popustDeteta = Math.min(100, Math.max(0, Number(client.popust_percent ?? 0)));
  const renderTermLink = (p: PredavanjeRow & { term: TermInfo }, isOdrzan: boolean) => {
    const t = p.term;
    const instr = t.instructor && !Array.isArray(t.instructor) ? t.instructor : (Array.isArray(t.instructor) ? t.instructor[0] : null);
    const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const timeStr = TIME_SLOTS[t.slot_index] ?? '—';
    const vrsta = Array.isArray(p.term_type) ? p.term_type[0] : p.term_type;
    // Cena časa = cena po času vrste, umanjena za popust deteta (isto kao kod automatskog iznosa uplate).
    const cena = vrsta?.cena_po_casu != null ? Math.round(Number(vrsta.cena_po_casu) * (1 - popustDeteta / 100)) : null;
    const neplacen = !!redni[p.id] && redni[p.id][0] > redni[p.id][1];
    return (
      <Link
        href={`/admin/termin/${p.term_id}`}
        className={`block rounded-xl border px-4 py-3 ui-transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${
          neplacen
            ? 'border-red-400 bg-red-50 hover:bg-red-100 hover:-translate-y-0.5'
            : isOdrzan
            ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 hover:border-emerald-300 hover:-translate-y-0.5'
            : 'border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 hover:-translate-y-0.5'
        }`}
        style={neplacen ? { borderLeft: '4px solid #dc2626' } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-stone-900">{dateStr}</span>
            <span className="text-stone-600 ml-2">{timeStr}</span>
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            <OznakaPaketa datum={t.date} slot={t.slot_index} />
            {redni[p.id] && <PlacenoStanje redni={redni[p.id]} />}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
          <span className="text-stone-600">
            <span className="font-medium text-stone-800">{vrsta?.naziv ?? 'Bez vrste'}</span>
            {instr && <> · {instr.ime} {instr.prezime}</>}
          </span>
          {cena != null && (
            <span className="font-semibold tabular-nums text-stone-800">
              {cena.toLocaleString('sr-Latn-RS')} RSD
              {popustDeteta > 0 && <span className="ml-1 text-xs font-normal text-stone-500">(−{popustDeteta}%)</span>}
            </span>
          )}
        </div>
        <DugmeAkoPrvi kljuc={p.id} />
      </Link>
    );
  };

  const renderZahtevLink = (z: (typeof zahtevi)[number]) => {
    const t = z.term;
    const instr = one(t.instructor);
    const dateStr = new Date(t.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = TIME_SLOTS[t.slot_index] ?? '—';
    const prosao = isTermInPast(t.date, t.slot_index);
    return (
      <Link
        href={`/admin/kalendar?view=nedelja&week=${getMonday(t.date)}&fokus=${t.date}`}
        className={`block rounded-xl border border-dashed px-4 py-3 ui-transition hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${
          redni[z.id] && redni[z.id][0] > redni[z.id][1] ? 'border-red-400 bg-red-50 hover:bg-red-100' : 'border-amber-300 bg-amber-50/70 hover:bg-amber-100/70'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-stone-900">{dateStr}</span>
            <span className="text-stone-600 ml-2">{timeStr}</span>
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            <OznakaPaketa datum={t.date} slot={t.slot_index} />
            {redni[z.id] && <PlacenoStanje redni={redni[z.id]} />}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prosao ? 'bg-red-100 text-red-800' : 'bg-amber-200/80 text-amber-900'}`}>
              {prosao ? 'Prošlo – niko nije preuzeo' : 'Čeka instruktora'}
            </span>
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {instr ? `${instr.ime} ${instr.prezime}` : 'Bez instruktora'}
          {z.vrsta && ` · ${z.vrsta}`}
          {z.ucionica && ` · ${z.ucionica}`}
        </p>
        <DugmeAkoPrvi kljuc={z.id} />
      </Link>
    );
  };

  const renderOtkazanLink = (o: (typeof otkazani)[number]) => {
    const dateStr = new Date(o.term_date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = TIME_SLOTS[o.slot_index] ?? '—';
    const instr = [o.instructor_ime, o.instructor_prezime].filter(Boolean).join(' ');
    // Kao na kalendaru: naplaćen otkazan čas je indigo i ima svoj „x/y“ (računa se u plaćene), nenaplaćen sivo-precrtan.
    return (
      <Link
        href={`/admin/kalendar?view=nedelja&week=${getMonday(o.term_date)}&fokus=${o.term_date}&slot=${o.slot_index}`}
        className={`block rounded-xl border px-4 py-3 ui-transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${
          o.placeno ? 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100' : 'border-stone-300 bg-stone-100 text-stone-500 hover:bg-stone-200/70'
        }`}
        style={o.placeno ? { borderLeft: '4px solid #6366f1' } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={o.placeno ? '' : 'line-through decoration-stone-400'}>
            <span className={`font-semibold ${o.placeno ? 'text-indigo-950' : 'text-stone-600'}`}>{dateStr}</span>
            <span className="ml-2">{timeStr}</span>
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            {o.placeno && redni[o.id] && <PlacenoStanje redni={redni[o.id]} />}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ${o.placeno ? 'bg-indigo-600' : 'bg-stone-600'}`}
            >
              {o.placeno ? 'Otkazan · naplaćen' : 'Otkazan · nije naplaćen'}
            </span>
          </span>
        </div>
        <p className="mt-1 text-sm">
          {o.term_type_naziv ?? 'Bez vrste'}
          {instr ? ` · ${instr}` : ' · bez instruktora'}
          {o.classroom_naziv && ` · ${o.classroom_naziv}`}
          {o.razlog && <span className="italic"> · {o.razlog}</span>}
        </p>
        <UrediOtkazanDugme
          otkazan={{
            id: o.id,
            ime: [client.ime, client.prezime].filter(Boolean).join(' '),
            kada: `${dateStr} ${timeStr}`,
            vrsta: o.term_type_naziv,
            instruktor: instr || null,
            placeno: o.placeno,
            razlog: o.razlog ?? null,
          }}
        />
        <DugmeAkoPrvi kljuc={o.id} />
      </Link>
    );
  };

  return (
    <div className="max-w-4xl space-y-10 animate-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-in-delay-1">
        <div>
          <Link href="/admin/klijenti" className="text-sm text-stone-500 hover:text-amber-600 ui-transition inline-block mb-1 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded">
            ← Svi klijenti
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            {client.ime} {client.prezime}
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">Profil klijenta · pregled termina i izmena podataka</p>
        </div>
      </div>

      {/* Summary: ukupno i održano po tipu */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-2 ui-hover-lift">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Pregled po vrstama časova</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Plaćeno = časovi iz oznaka „plaćeno“ na kalendaru (paket od 6 ili jedan čas). Nije plaćeno = održani časovi posle potrošenog paketa.
          </p>
        </div>
        <div className="overflow-x-auto">
          {stanjePoVrstamaPrikaz.length === 0 ? (
            <div className="p-5 text-sm text-stone-500">Još nema ni plaćenih ni održanih časova.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80">
                  <th className="text-left p-3 font-medium text-stone-600">Vrsta časa</th>
                  <th className="text-right p-3 font-medium text-stone-600">Održano</th>
                  <th className="text-right p-3 font-medium text-stone-600">Plaćeno</th>
                  <th className="text-right p-3 font-medium text-amber-700">Preostalo</th>
                  <th className="text-right p-3 font-medium text-red-700">Nije plaćeno</th>
                </tr>
              </thead>
              <tbody>
                {stanjePoVrstamaPrikaz.map((s) => (
                  <tr key={s.term_type_id ?? 'bez'} className="border-b border-stone-100 hover:bg-stone-50/50 ui-transition">
                    <td className="p-3 font-medium text-stone-800">{s.term_type_naziv}</td>
                    <td className="p-3 text-right text-stone-700">{s.odrzano}</td>
                    <td className="p-3 text-right text-stone-700">{s.uplaceno || '—'}</td>
                    <td className="p-3 text-right font-medium text-amber-800">{s.uplaceno ? s.ostalo : '—'}</td>
                    <td className="p-3 text-right font-semibold text-red-700">{s.duguje || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Oznake „plaćeno od ovog časa“ – jedini izvor plaćeno / nije plaćeno */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-2">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Plaćeno od (oznake)</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Svaka oznaka = taj čas i sledećih 5 časova deteta su plaćeni, bez obzira na vrstu (ili samo taj čas). Dodaje se na kalendaru (Označi plaćeno), ovde
            može da se ukloni.
          </p>
        </div>
        <div className="p-5">
          <PlaceniPaketiSection paketi={paketi} />
        </div>
      </section>

      {/* Uplate – istorija + unos nove uplate za ovo dete */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-2">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Uplate</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Evidencija novca za ovo dete, najnovije prve. Ne utiče na „plaćeno / nije plaćeno“ – to se označava na kalendaru.
          </p>
        </div>
        <div className="p-5">
          <UplateKlijentaSection
            client={{ id: client.id, ime: client.ime ?? '', prezime: client.prezime ?? '', popust_percent: Number(client.popust_percent ?? 0) }}
            uplate={uplate}
            instructors={(aktivniInstruktori ?? []).map((i) => ({ id: i.id, ime: i.ime ?? '', prezime: i.prezime ?? '' }))}
            termTypes={termTypes.map((t) => ({ id: t.id, naziv: t.naziv, cena_po_casu: t.cena_po_casu ?? null }))}
          />
        </div>
      </section>

      {/* Pregled termina – zakazani za budućnost / održani (sortirano po datumu) */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-3">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Pregled termina</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Sortirano po datumu. Termini čije je vreme prošlo automatski se označavaju kao održani. Kao na kalendaru: crveno = nije
            plaćeno, „x. čas od y plaćenih“ = plaćen, 💰 = odatle je označeno plaćeno, indigo = otkazan a naplaćen, sivo = otkazan.
          </p>
        </div>
        {/* Pregled plaćanja – koliko je plaćeno, a koliko nije (sve vrste zajedno) */}
        <div className="border-b border-stone-100 px-5 py-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Plaćeno (oznake)</div>
              <div className="text-xl font-bold tabular-nums text-emerald-900">{placenoUOznakama}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Održano, plaćeno</div>
              <div className="text-xl font-bold tabular-nums text-emerald-900">{placanje.odrzanoPlaceno}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${placanje.odrzanoNeplaceno ? 'bg-red-100' : 'bg-stone-50'}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${placanje.odrzanoNeplaceno ? 'text-red-800' : 'text-stone-500'}`}>
                Održano, nije plaćeno
              </div>
              <div className={`text-xl font-bold tabular-nums ${placanje.odrzanoNeplaceno ? 'text-red-700' : 'text-stone-700'}`}>
                {placanje.odrzanoNeplaceno}
              </div>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Zakazano, plaćeno</div>
              <div className="text-xl font-bold tabular-nums text-stone-800">{placanje.buduciPokriveni}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${placanje.buduciNepokriveni ? 'bg-amber-50' : 'bg-stone-50'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Zakazano, nije plaćeno</div>
              <div className="text-xl font-bold tabular-nums text-stone-800">{placanje.buduciNepokriveni}</div>
            </div>
          </div>
          {placanje.nebrojani > 0 && (
            <p className="mt-2 text-xs text-stone-500">
              {placanje.nebrojani} {placanje.nebrojani === 1 ? 'čas je' : 'časova je'} pre prve oznake „plaćeno“ – ne broje se.
            </p>
          )}
          {prviNeplaceni && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
              <span className="text-stone-700">
                {redni[prviNeplaceni.kljuc] ? 'Prvi neplaćeni čas' : 'Nema oznake „plaćeno“ – prvi čas od danas'}:{' '}
                <strong>{opisCasa(prviNeplaceni)}</strong>
                {prviNeplaceni.vrsta ? ` · ${prviNeplaceni.vrsta}` : ''}
              </span>
              <OznaciPlacenoDugme
                clientId={client.id}
                termTypeId={prviNeplaceni.termTypeId}
                datum={prviNeplaceni.datum}
                slot={prviNeplaceni.slot}
                opis={opisCasa(prviNeplaceni)}
                kompaktno
              />
            </div>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-5 border-b md:border-b-0 md:border-r border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-semibold text-sm">
                {brojZakazanih}
              </span>
              <h3 className="font-semibold text-stone-800">Zakazani za budućnost</h3>
              {otkazaniBuduci.length > 0 && <span className="text-xs text-stone-500">+ {otkazaniBuduci.length} otkazano</span>}
            </div>
            {brojBezInstruktora > 0 && (
              <p className="text-xs text-amber-800 mb-3">
                Od toga {brojBezInstruktora} bez instruktora (isprekidani okvir) – čekaju da ih neki predavač preuzme.
              </p>
            )}
            {zakazani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema zakazanih termina u budućnosti.</p>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {zakazani.map((item) =>
                  item.kind === 'predavanje' ? (
                    <li key={item.p.id}>{renderTermLink(item.p, false)}</li>
                  ) : item.kind === 'zahtev' ? (
                    <li key={`z-${item.z.id}`}>{renderZahtevLink(item.z)}</li>
                  ) : (
                    <li key={`o-${item.o.id}`}>{renderOtkazanLink(item.o)}</li>
                  )
                )}
              </ul>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-semibold text-sm">
                {odrzani.length}
              </span>
              <h3 className="font-semibold text-stone-800">Održani</h3>
              {otkazaniProsli.length > 0 && <span className="text-xs text-stone-500">+ {otkazaniProsli.length} otkazano</span>}
            </div>
            {prosli.length === 0 ? (
              <p className="text-sm text-stone-500">Nema održanih termina.</p>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {prosli.map((item) =>
                  item.kind === 'predavanje' ? (
                    <li key={item.p.id}>{renderTermLink(item.p, true)}</li>
                  ) : (
                    <li key={`o-${item.o.id}`}>{renderOtkazanLink(item.o)}</li>
                  )
                )}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Otkazani termini */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-4">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Otkazani termini</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Svaki otkazan čas je naplaćen ili nije. Naplaćen se računa u plaćene časove deteta (troši čas iz paketa). Naplata i razlog /
            komentar se mogu naknadno menjati ovde, u Pregledu termina (✎ Naplata i komentar) ili klikom na otkazan čas na kalendaru.
          </p>
        </div>
        <div className="p-5">
          {/* key: posle izmene u Pregledu termina (✎ Naplata i komentar) lista se osveži sa novim podacima. */}
          <OtkazaniTerminiSection
            key={otkazani.map((o) => `${o.id}:${o.placeno ? 1 : 0}:${o.razlog ?? ''}`).join('|')}
            otkazani={otkazani}
            clientId={clientId}
            redni={redni}
          />
        </div>
      </section>

      {/* Izmena podataka */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5 animate-in-delay-4">
        <h2 className="text-base font-semibold text-stone-800 mb-1">Izmena podataka klijenta</h2>
        <p className="text-xs text-stone-500 mb-4">Plaćeno časova po instruktoru se vodi kroz Evidenciju uplata.</p>
        <AdminClientForm
          client={client as Client}
          redirectAfterSave="/admin/klijenti"
          termTypes={termTypes}
          initialProgramStatuses={programStatuses}
          programs={programs}
          initialProgrami={programiSelections}
        />
      </section>

      {/* Brisanje – samo super admin (ulogovan kao admin_users) */}
      <section className="rounded-2xl border border-red-100 bg-red-50/40 shadow-sm p-5 animate-in-delay-4">
        <h2 className="text-base font-semibold text-red-900 mb-1">Opasna zona</h2>
        <p className="text-xs text-red-800/80 mb-4 max-w-xl">
          Brisanje klijenta dostupno je samo kada ste ulogovani kao <strong>super admin</strong> (nalog u Admin panelu).
          Uklanja klijenta, sve njegove radionice, veze sa instruktorima, uplate i zahtev. Nalog učenika u Auth-u (ako postoji)
          automatski se ne briše – uklonite ga ručno u Supabase Auth ako treba.
        </p>
        <AdminDeleteClientButton clientId={client.id} clientLabel={`${client.ime} ${client.prezime}`} />
      </section>
    </div>
  );
}
