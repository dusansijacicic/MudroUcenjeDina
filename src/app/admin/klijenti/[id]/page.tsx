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
  const [{ data: client, error }, stanjePoVrstama, { data: predavanjaRaw }, { data: zahteviRaw }, termTypes, otkazani, programStatuses, programs, programiSelections, { data: uplateRaw }, { data: aktivniInstruktori }] = await Promise.all([
    adminSupabase.from('clients').select('*, popust_percent, napomena, accessible_term_type_ids').eq('id', clientId).single(),
    getStanjePoVrstamaZaKlijenta(clientId),
    adminSupabase
      .from('predavanja')
      .select('id, odrzano, placeno, term_id, term:terms(date, slot_index, instructor:instructors(ime, prezime)), term_type:term_types(naziv, cena_po_casu)')
      .eq('client_id', clientId),
    // Termini zakazani bez instruktora žive kao zahtevi dok ih neki predavač ne preuzme – bez ovoga
    // se u profilu ne bi videli (ni posle "Zakaži termin" sa podrazumevanim "bez instruktora").
    adminSupabase
      .from('zahtevi_za_cas')
      .select('id, requested_date, requested_slot_index, instructor:instructors!instructor_id(ime, prezime), term_type:term_types(naziv), classroom:classrooms(naziv)')
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
  ]);

  if (error || !client) notFound();

  const stanjePoVrstamaPrikaz = stanjePoVrstama;

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
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
    instructor: TermInfo['instructor'];
    term_type: Naziv;
    classroom: Naziv;
  };
  const zahtevi = ((zahteviRaw ?? []) as ZahtevRow[]).map((z) => ({
    id: z.id,
    term: { date: z.requested_date, slot_index: z.requested_slot_index, instructor: z.instructor },
    vrsta: one(z.term_type)?.naziv ?? null,
    ucionica: one(z.classroom)?.naziv ?? null,
  }));

  type ZakazanItem =
    | { kind: 'predavanje'; p: (typeof zakazaniPredavanja)[number]; term: TermInfo }
    | { kind: 'zahtev'; z: (typeof zahtevi)[number]; term: TermInfo };
  const zakazani: ZakazanItem[] = [
    ...zakazaniPredavanja.map((p) => ({ kind: 'predavanje' as const, p, term: p.term })),
    ...zahtevi.map((z) => ({ kind: 'zahtev' as const, z, term: z.term })),
  ].sort(sortByDateSlot);
  const brojBezInstruktora = zahtevi.length;

  const popustDeteta = Math.min(100, Math.max(0, Number(client.popust_percent ?? 0)));
  const renderTermLink = (p: PredavanjeRow & { term: TermInfo }, isOdrzan: boolean) => {
    const t = p.term;
    const instr = t.instructor && !Array.isArray(t.instructor) ? t.instructor : (Array.isArray(t.instructor) ? t.instructor[0] : null);
    const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const timeStr = TIME_SLOTS[t.slot_index] ?? '—';
    const vrsta = Array.isArray(p.term_type) ? p.term_type[0] : p.term_type;
    // Cena časa = cena po času vrste, umanjena za popust deteta (isto kao kod automatskog iznosa uplate).
    const cena = vrsta?.cena_po_casu != null ? Math.round(Number(vrsta.cena_po_casu) * (1 - popustDeteta / 100)) : null;
    return (
      <Link
        href={`/admin/termin/${p.term_id}`}
        className={`block rounded-xl border px-4 py-3 ui-transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${
          isOdrzan
            ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 hover:border-emerald-300 hover:-translate-y-0.5'
            : 'border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 hover:-translate-y-0.5'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-stone-900">{dateStr}</span>
            <span className="text-stone-600 ml-2">{timeStr}</span>
          </div>
          {isOdrzan && p.placeno && (
            <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Plaćeno</span>
          )}
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
        className="block rounded-xl border border-dashed border-amber-300 bg-amber-50/70 px-4 py-3 ui-transition hover:shadow-lg hover:bg-amber-100/70 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-stone-900">{dateStr}</span>
            <span className="text-stone-600 ml-2">{timeStr}</span>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prosao ? 'bg-red-100 text-red-800' : 'bg-amber-200/80 text-amber-900'}`}>
            {prosao ? 'Prošlo – niko nije preuzeo' : 'Čeka instruktora'}
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {instr ? `${instr.ime} ${instr.prezime}` : 'Bez instruktora'}
          {z.vrsta && ` · ${z.vrsta}`}
          {z.ucionica && ` · ${z.ucionica}`}
        </p>
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
          <p className="text-xs text-stone-500 mt-0.5">Plaćeno / održano / preostalo – sve vrste gde ima plaćenih ili održanih časova.</p>
        </div>
        <div className="overflow-x-auto">
          {stanjePoVrstamaPrikaz.length === 0 ? (
            <div className="p-5 text-sm text-stone-500">Još nema ni plaćenih ni održanih časova.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80">
                  <th className="text-left p-3 font-medium text-stone-600">Vrsta časa</th>
                  <th className="text-right p-3 font-medium text-stone-600">Plaćeno</th>
                  <th className="text-right p-3 font-medium text-stone-600">Održano</th>
                  <th className="text-right p-3 font-medium text-amber-700">Preostalo</th>
                </tr>
              </thead>
              <tbody>
                {stanjePoVrstamaPrikaz.map((s) => (
                  <tr key={s.term_type_id ?? 'bez'} className="border-b border-stone-100 hover:bg-stone-50/50 ui-transition">
                    <td className="p-3 font-medium text-stone-800">{s.term_type_naziv}</td>
                    <td className="p-3 text-right text-stone-700">{s.uplaceno}</td>
                    <td className="p-3 text-right text-stone-700">{s.odrzano}</td>
                    <td className="p-3 text-right font-medium text-amber-800">{s.ostalo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Uplate – istorija + unos nove uplate za ovo dete */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-2">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Uplate</h2>
          <p className="text-xs text-stone-500 mt-0.5">Sve uplate za ovo dete, najnovije prve. Nova uplata odmah menja stanje gore i „x/y“ na kalendaru.</p>
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
          <p className="text-xs text-stone-500 mt-0.5">Sortirano po datumu. Termini čije je vreme prošlo automatski se označavaju kao održani.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-5 border-b md:border-b-0 md:border-r border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-semibold text-sm">
                {zakazani.length}
              </span>
              <h3 className="font-semibold text-stone-800">Zakazani za budućnost</h3>
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
                  ) : (
                    <li key={`z-${item.z.id}`}>{renderZahtevLink(item.z)}</li>
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
            </div>
            {odrzani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema održanih termina.</p>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {odrzani.map((p) => (
                  <li key={p.id}>{renderTermLink(p, true)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Otkazani termini */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-4">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Otkazani termini</h2>
          <p className="text-xs text-stone-500 mt-0.5">Istorijat otkazanih termina. Može se označiti kao naplaćen ili obrisati iz istorije.</p>
        </div>
        <div className="p-5">
          <OtkazaniTerminiSection otkazani={otkazani} clientId={clientId} />
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
