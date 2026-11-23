import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import AdminCalendarView, { type AdminTerm, type OtkazaniTerminCalendar } from './AdminCalendarView';
import AdminCalendarFilters from './AdminCalendarFilters';
import AdminFromDashboardToast from '@/components/AdminFromDashboardToast';
import { getMaxTerminaPoSlotu, DEFAULT_MAX_TERMINA_PO_SLOTU } from '@/lib/settings';
import { AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import { VRSTA_BEZ, VRSTA_TESTIRANJE } from '@/lib/kalendar-filter';
import { getTermTypes, getTermCategories, type PlaceniPaket } from '@/app/admin/actions';
import { mapBlokada, mapNedeljna, nedeljneUDatume, type BlokiranTermin } from '@/lib/blokade';
import { NAREDNIH_NEDELJA_COOKIE, parseNarednihNedelja } from '@/lib/kalendar-nedelje';
import { merenje } from '@/lib/merenje';
import { readCalendarRpc } from '@/lib/calendar-rpc';
import { sviRedovi } from '@/lib/svi-redovi';

export default async function AdminKalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; month?: string; view?: string; instructor?: string; classroom?: string; client?: string; vrsta?: string; from?: string; fokus?: string; slot?: string }>;
}) {
  // Vreme učitavanja kalendara i svakog upita → Vercel Logs, „[merenje] kalendar …“.
  const m = merenje('kalendar');
  const { user } = await m.meri('prijava', getAuthedUser());
  if (!user) redirect('/login');

  // Provera admina ide ZAJEDNO sa upitima ispod (ne pre njih) – jedan krug do baze manje pri otvaranju.
  // Podaci se ne prikazuju dok provera ne prođe (redirect odmah posle Promise.all).
  const adminProvera = getIsAdmin();

  const params = await searchParams;
  const filterInstructorId = params.instructor?.trim() || null;
  const filterClassroomId = params.classroom?.trim() || null;
  const filterClientId = params.client?.trim() || null;
  // Filter po vrsti časa: id vrste, "testiranje" ili "bez" (časovi bez vrste).
  const filterVrsta = params.vrsta?.trim() || null;
  const view = (params.view === 'dan' || params.view === 'mesec') ? params.view : 'nedelja';
  // Danas po beogradskom vremenu (server radi u UTC – posle ponoći u ponedeljak bi inače pokazao prošlu nedelju).
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
  const today = new Date(todayStr + 'T12:00:00');
  const getMonday = (d: Date) => {
    const x = new Date(d);
    const dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return x.toISOString().slice(0, 10);
  };

  // Nedeljni prikaz: prikazana nedelja + koliko narednih (izbor na kalendaru, pamti se po uređaju).
  const narednihNedelja = parseNarednihNedelja((await cookies()).get(NAREDNIH_NEDELJA_COOKIE)?.value);
  const trenutnaNedelja = getMonday(today);

  let dateFrom: string;
  let dateTo: string;
  let startOfWeek: string;
  let singleDay: string | undefined;
  let monthStart: string | undefined;

  if (view === 'dan') {
    singleDay = params.day ? params.day.slice(0, 10) : todayStr;
    dateFrom = singleDay;
    dateTo = singleDay;
    startOfWeek = getMonday(new Date(singleDay + 'T12:00:00'));
  } else if (view === 'mesec') {
    const ym = params.month || today.toISOString().slice(0, 7);
    monthStart = ym + '-01';
    const first = new Date(monthStart + 'T12:00:00');
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    dateFrom = monthStart;
    dateTo = last.toISOString().slice(0, 10);
    startOfWeek = monthStart;
  } else {
    startOfWeek = params.week ? params.week.slice(0, 10) : trenutnaNedelja;
    const start = new Date(startOfWeek + 'T12:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 7 * (narednihNedelja + 1) - 1);
    dateFrom = startOfWeek;
    dateTo = end.toISOString().slice(0, 10);
  }

  const adminSupabase = createAdminClient();

  // Stari put (pre migracije 056, ili ako ona ne uspe): ~16 upita odjednom – u bazi se međusobno čekaju.
  const viseUpita = async () => {
    const [
      { data: termsRaw },
      { data: instructorsList },
      { data: classroomsList },
      { data: clientsList },
      { data: otkazaniRaw },
      { data: zahteviRaw },
      maxTerminaPoSlotu,
      termTypes,
      termCategories,
      { data: allPendingZahteviRaw },
      { data: blockedRaw },
      { data: redniRaw },
      { data: nedeljneRaw },
      paketiRes,
    ] = await Promise.all([
      m.meri(
        'terms',
        adminSupabase
          .from('terms')
          // Uz dete samo ono što kalendar prikazuje (bez komentara i ostalih polja časa) – manje podataka za prenos.
          .select('*, instructor:instructors(id, ime, prezime, color), classroom:classrooms(id, naziv, color), term_category:term_categories(id, naziv, is_testing), predavanja(id, client_id, term_type_id, client:clients(id, ime, prezime), term_type:term_types(naziv)), potential_clients(*)')
          .gte('date', dateFrom)
          .lte('date', dateTo)
          .order('date')
          .order('slot_index')
      ),
      m.meri('instruktori', adminSupabase.from('instructors').select('id, ime, prezime, color, aktivan').order('prezime').order('ime')),
      m.meri('ucionice', adminSupabase.from('classrooms').select('id, naziv').order('naziv')),
      m.meri('klijenti', sviRedovi((od, doReda) => adminSupabase.from('clients').select('id, ime, prezime, godiste, datum_testiranja').order('ime').order('prezime').order('id').range(od, doReda)).then((data) => ({ data }))),
      m.meri(
        'otkazani',
        // select('*'): radi i pre i posle migracije 059 (razlog otkazivanja).
        adminSupabase.from('otkazani_termini').select('*').gte('term_date', dateFrom).lte('term_date', dateTo)
      ),
      m.meri(
        'zahtevi',
        adminSupabase
          .from('zahtevi_za_cas')
          // '*': i napomena (migracija 060), a radi i pre nje.
          .select('*, client:clients(ime, prezime), term_type:term_types(naziv), classroom:classrooms(naziv)')
          .eq('status', 'pending')
          .gte('requested_date', dateFrom)
          .lte('requested_date', dateTo)
      ),
      m.meri('podesavanja', getMaxTerminaPoSlotu()),
      m.meri('vrste', getTermTypes()),
      m.meri('kategorije', getTermCategories()),
      // Globalno (bez obzira na trenutno prikazanu nedelju/dan) – da admin ne propusti zahtev van
      // trenutnog prikaza. Samo datumi (i da li je podsetnik uklonjen ✕, migracija 055), radi lakog dugmeta
      // "skoči na tu nedelju". U ISTOM Promise.all-u (ne odvojen await posle) da ne doda dodatan krug.
      m.meri('podsetnik', adminSupabase.from('zahtevi_za_cas').select('requested_date, podsetnik_skriven').eq('status', 'pending').order('requested_date')),
      // Ako migracija 044 još nije pokrenuta, upit vraća grešku → data je null → nema blokiranih.
      // select('*'): radi i pre migracije 048 (tada nema instructor_id → sve blokade su "za sve").
      m.meri('blokade', adminSupabase.from('blokirani_termini').select('*').gte('date', dateFrom).lte('date', dateTo)),
      // "x / y" uz svako dete (koji je čas po redu od plaćenih) – baza računa; bez migracije 047 nema oznaka.
      m.meri('redni', adminSupabase.rpc('redni_broj_casova', { p_from: dateFrom, p_to: dateTo })),
      // Stalne nedeljne blokade instruktora (048) – pre migracije greška → null → nema ih.
      m.meri('nedeljne', adminSupabase.from('instruktor_nedeljne_blokade').select('*')),
      // Oznake „plaćeno od ovog časa“ (049) – za mod Označi plaćeno (💰 od ovde / uklanjanje).
      m.meri(
        'paketi',
        adminSupabase.from('placeni_paketi').select('id, client_id, term_type_id, od_datum, od_slot, broj_casova').gte('od_datum', dateFrom).lte('od_datum', dateTo)
      ),
    ]);
    return {
      termsRaw,
      instructorsList,
      classroomsList,
      clientsList,
      otkazaniRaw,
      zahteviRaw,
      maxTerminaPoSlotu,
      termTypes,
      termCategories,
      allPendingZahteviRaw,
      blockedRaw,
      redniRaw,
      nedeljneRaw,
      paketi: paketiRes.data,
      paketiMigracija: !paketiRes.error,
    };
  };
  type Podaci = Awaited<ReturnType<typeof viseUpita>>;

  // Svi podaci kalendara JEDNIM pozivom ka bazi (migracija 056) – isti oblik kao stari put.
  const [isAdmin, jedanPoziv] = await Promise.all([
    m.meri('admin', adminProvera),
    m.meri('jedan_poziv', readCalendarRpc(adminSupabase, dateFrom, dateTo)),
  ]);
  if (!isAdmin) redirect('/login');
  let nacin = 'jedan poziv';
  let podaci: Podaci;
  const jp = jedanPoziv.data as Record<string, unknown> | null;
  if (!jedanPoziv.error && jp && Array.isArray(jp.terms)) {
    const maxIzBaze = parseInt(String(jp.max_termina_po_slotu ?? ''), 10);
    podaci = {
      termsRaw: jp.terms as Podaci['termsRaw'],
      instructorsList: jp.instruktori as Podaci['instructorsList'],
      classroomsList: jp.ucionice as Podaci['classroomsList'],
      clientsList: jp.klijenti as Podaci['clientsList'],
      otkazaniRaw: jp.otkazani as Podaci['otkazaniRaw'],
      zahteviRaw: jp.zahtevi as Podaci['zahteviRaw'],
      maxTerminaPoSlotu: Number.isFinite(maxIzBaze) && maxIzBaze >= 1 ? maxIzBaze : DEFAULT_MAX_TERMINA_PO_SLOTU,
      termTypes: jp.vrste as Podaci['termTypes'],
      termCategories: jp.kategorije as Podaci['termCategories'],
      allPendingZahteviRaw: jp.podsetnik as Podaci['allPendingZahteviRaw'],
      blockedRaw: jp.blokade as Podaci['blockedRaw'],
      redniRaw: jp.redni as Podaci['redniRaw'],
      nedeljneRaw: jp.nedeljne as Podaci['nedeljneRaw'],
      paketi: jp.paketi as Podaci['paketi'],
      paketiMigracija: true,
    };
  } else {
    nacin = `rezerva, upit po upit: ${jedanPoziv.error?.message ?? 'prazan odgovor'}`;
    podaci = await viseUpita();
  }
  const {
    termsRaw,
    instructorsList,
    classroomsList,
    clientsList,
    otkazaniRaw,
    zahteviRaw,
    maxTerminaPoSlotu,
    termTypes,
    termCategories,
    allPendingZahteviRaw,
    blockedRaw,
    redniRaw,
    nedeljneRaw,
    paketi,
    paketiMigracija,
  } = podaci;
  const redniPoPredavanju = (redniRaw ?? {}) as Record<string, [number, number]>;
  const imeInstruktora = new Map((instructorsList ?? []).map((i) => [i.id, `${i.ime ?? ''} ${i.prezime ?? ''}`.trim()]));
  const blockedSlots: BlokiranTermin[] = [
    ...(blockedRaw ?? []).map(mapBlokada),
    ...nedeljneUDatume((nedeljneRaw ?? []).map(mapNedeljna), dateFrom, dateTo),
  ].map((b) => ({ ...b, instructor_naziv: b.instructor_id ? (imeInstruktora.get(b.instructor_id) ?? null) : null }));
  // Datumi u žutoj traci – bez onih čiji je podsetnik uklonjen (✕, migracija 055).
  const allPendingZahteviDates = [
    ...new Set(
      ((allPendingZahteviRaw ?? []) as { requested_date: string; podsetnik_skriven?: boolean | null }[])
        .filter((z) => z.podsetnik_skriven !== true)
        .map((z) => String(z.requested_date).slice(0, 10))
    ),
  ];

  let terms: AdminTerm[] = (termsRaw ?? []).map((t) => {
    const instr = (t as {
      instructor?: { id: string; ime: string; prezime: string; color?: string | null } | Array<unknown>;
      classroom?: { id: string; naziv: string; color?: string | null } | Array<unknown>;
    }).instructor;
    const instructor = Array.isArray(instr) ? instr[0] : instr;
    const classroomRaw = (t as {
      classroom?: { id: string; naziv: string; color?: string | null } | Array<unknown>;
    }).classroom;
    const classroom = Array.isArray(classroomRaw) ? classroomRaw[0] : classroomRaw;
    const tcRaw = (t as { term_category?: unknown }).term_category;
    const term_category = (Array.isArray(tcRaw) ? tcRaw[0] : tcRaw) as AdminTerm['term_category'];
    const potential_clients = ((t as { potential_clients?: unknown[] }).potential_clients ?? []) as AdminTerm['potential_clients'];
    return {
      id: t.id,
      instructor_id: t.instructor_id,
      date: t.date,
      slot_index: t.slot_index,
      classroom: classroom as AdminTerm['classroom'],
      instructor: instructor as AdminTerm['instructor'],
      term_category,
      predavanja: ((t.predavanja ?? []) as NonNullable<AdminTerm['predavanja']>).map((p) => ({
        ...p,
        redni: redniPoPredavanju[p.id] ?? null,
      })),
      potential_clients,
      napomena: (t as { napomena?: string | null }).napomena ?? null,
      nastavak_of_term_id: (t as { nastavak_of_term_id?: string | null }).nastavak_of_term_id ?? null,
      dozvoli_preklapanje: (t as { dozvoli_preklapanje?: boolean }).dozvoli_preklapanje === true,
    };
  });

  if (filterInstructorId) terms = terms.filter((t) => t.instructor_id === filterInstructorId);
  if (filterClassroomId) terms = terms.filter((t) => t.classroom?.id === filterClassroomId);
  // Filter po detetu i/ili vrsti časa – važi za isto dete (dete te vrste). Automatski nastavak dužeg
  // časa ostaje uz svoj čas.
  const vrstaOk = (termTypeId: string | null | undefined) =>
    !filterVrsta || (filterVrsta === VRSTA_BEZ ? !termTypeId : termTypeId === filterVrsta);
  const jeNastavak = (t: AdminTerm) => !!t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA && (t.predavanja ?? []).length === 0;
  if (filterClientId || filterVrsta) {
    const prolazi = (t: AdminTerm) => {
      const testiranje = t.term_category?.is_testing === true;
      if (filterVrsta === VRSTA_TESTIRANJE) return testiranje && !filterClientId;
      if (testiranje) return false;
      return (t.predavanja ?? []).some(
        (p) => (!filterClientId || (p.client_id ?? (p.client as { id?: string } | null)?.id) === filterClientId) && vrstaOk(p.term_type_id)
      );
    };
    const prosli = new Set(terms.filter((t) => !jeNastavak(t) && prolazi(t)).map((t) => t.id));
    terms = terms.filter((t) => prosli.has(t.id) || (jeNastavak(t) && prosli.has(t.nastavak_of_term_id as string)));
  }
  const brojCasova = terms.filter((t) => !jeNastavak(t)).length;

  // Filteri po detetu i vrsti važe i za zahteve (termini bez instruktora) i otkazane termine.
  const pendingZahtevi = (zahteviRaw ?? [])
    .filter((z) => (!filterClientId || z.client_id === filterClientId) && filterVrsta !== VRSTA_TESTIRANJE && vrstaOk(z.term_type_id as string | null))
    .map((z) => {
    const client = Array.isArray(z.client) ? z.client[0] : z.client;
    const termType = Array.isArray(z.term_type) ? z.term_type[0] : z.term_type;
    const classroom = Array.isArray(z.classroom) ? z.classroom[0] : z.classroom;
    return {
      id: z.id,
      date: String(z.requested_date).slice(0, 10),
      slot_index: z.requested_slot_index,
      client_ime: (client as { ime?: string } | null)?.ime ?? '',
      client_prezime: (client as { prezime?: string } | null)?.prezime ?? null,
      term_type_naziv: (termType as { naziv?: string } | null)?.naziv ?? null,
      classroom_naziv: (classroom as { naziv?: string } | null)?.naziv ?? null,
      client_id: z.client_id as string,
      term_type_id: (z.term_type_id as string | null) ?? null,
      redni: redniPoPredavanju[z.id] ?? null,
      napomena: ((z as { napomena?: string | null }).napomena ?? null) as string | null,
    };
  });

  // Otkazani pamte samo naziv vrste (ne id) – upoređuje se po nazivu.
  const nazivFilterVrste =
    filterVrsta && filterVrsta !== VRSTA_TESTIRANJE && filterVrsta !== VRSTA_BEZ ? (termTypes.find((tt) => tt.id === filterVrsta)?.naziv ?? '') : null;
  const otkazaniVrstaOk = (naziv: string | null | undefined) =>
    !filterVrsta ||
    (filterVrsta === VRSTA_TESTIRANJE ? naziv?.toLowerCase() === 'testiranje' : filterVrsta === VRSTA_BEZ ? !naziv : naziv === nazivFilterVrste);
  const otkazaniTermini = ((otkazaniRaw ?? []) as (OtkazaniTerminCalendar & { client_id?: string | null })[])
    .filter((ot) => (!filterClientId || ot.client_id === filterClientId) && otkazaniVrstaOk(ot.term_type_naziv))
    // Naplaćen otkazan čas ima svoj „x/y“ (računa se u plaćene časove, migracija 059).
    .map((ot) => ({ ...ot, redni: redniPoPredavanju[ot.id] ?? null }));

  const base = '/admin/kalendar';
  // Aktivni filteri idu uz svaki link kalendara (Prethodna/Sledeća, dan, mesec…), da ne nestanu pri promeni perioda.
  const filterParams = new URLSearchParams();
  if (filterInstructorId) filterParams.set('instructor', filterInstructorId);
  if (filterClassroomId) filterParams.set('classroom', filterClassroomId);
  if (filterClientId) filterParams.set('client', filterClientId);
  if (filterVrsta) filterParams.set('vrsta', filterVrsta);
  const filterQuery = filterParams.size > 0 ? `&${filterParams.toString()}` : '';

  const filterClient = filterClientId ? (clientsList ?? []).find((c) => c.id === filterClientId) : null;
  const periodLabel = view === 'dan' ? 'ovog dana' : view === 'mesec' ? 'ovog meseca' : narednihNedelja === 0 ? 'ove nedelje' : narednihNedelja + 1 <= 4 ? `ove ${narednihNedelja + 1} nedelje` : `ovih ${narednihNedelja + 1} nedelja`;
  const clearClientParams = new URLSearchParams(filterParams);
  clearClientParams.delete('client');
  if (params.view) clearClientParams.set('view', params.view);
  if (params.week) clearClientParams.set('week', params.week);
  if (params.day) clearClientParams.set('day', params.day);
  if (params.month) clearClientParams.set('month', params.month);
  // Suspendovan instruktor se nigde ne nudi kao opcija (ni u filteru, ni u legendi, ni u pickerima za
  // dodelu novog posla) – i dalje se vidi NA SAMOM rasporedu ako već ima zakazane termine (ti termini
  // se ne diraju), samo se ne pojavljuje po imenu u listama za izbor.
  const activeInstructors = (instructorsList ?? []).filter((i) => (i as { aktivan?: boolean }).aktivan !== false);
  const legendInstructors = activeInstructors.map((i) => ({
    id: i.id,
    ime: i.ime ?? '',
    prezime: i.prezime ?? '',
    color: i.color ?? '#0d9488',
  }));

  // Zaglavlje (naslov, filteri, legenda, napomena) – prosleđuje se u AdminCalendarView da bi na velikim
  // ekranima moglo da bude "zamrznuto" (sticky) ZAJEDNO sa njegovom traka alata (Swap/Copy/Delete/…),
  // umesto da svaki blok ima svoj nezavisan (i nepouzdan) sticky offset.
  const headerContent = (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-stone-800">Kalendar (svi instruktori)</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <AdminCalendarFilters
            instructors={activeInstructors.map((i) => ({ id: i.id, ime: i.ime ?? '', prezime: i.prezime ?? '' }))}
            classrooms={(classroomsList ?? []).map((c) => ({ id: c.id, naziv: c.naziv ?? '' }))}
            clients={(clientsList ?? []).map((c) => ({ id: c.id, ime: c.ime ?? '', prezime: c.prezime ?? '' }))}
            termTypes={termTypes.map((tt) => ({ id: tt.id, naziv: tt.naziv }))}
            filterVrsta={filterVrsta}
            filterInstructorId={filterInstructorId}
            filterClassroomId={filterClassroomId}
            filterClientId={filterClientId}
            currentView={view}
            currentParams={{ week: params.week, day: params.day, month: params.month, view: params.view }}
            shownStartOfWeek={startOfWeek}
            shownDay={singleDay}
            shownMonth={monthStart?.slice(0, 7)}
            base={base}
          />
          <Link prefetch={false} href="/admin/termin/novi" className="inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Novi termin
          </Link>
        </div>
      </div>
      {filterClientId && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm text-violet-950">
          <span>
            Prikazani su samo termini za: <strong>{filterClient ? `${filterClient.ime} ${filterClient.prezime}` : 'izabrano dete'}</strong>
            {' – '}
            {periodLabel}: <strong className="tabular-nums">{brojCasova}</strong> zakazano
            {pendingZahtevi.length > 0 && (
              <>
                , <strong className="tabular-nums">{pendingZahtevi.length}</strong> bez instruktora
              </>
            )}
            .
          </span>
          {view !== 'mesec' && (
            <Link prefetch={false}
              href={`${base}?view=mesec&month=${(singleDay ?? startOfWeek).slice(0, 7)}${filterQuery}`}
              className="font-medium text-violet-800 underline-offset-2 hover:underline"
            >
              Ceo mesec za ovo dete →
            </Link>
          )}
          <Link prefetch={false} href={`/admin/klijenti/${filterClientId}`} className="font-medium text-violet-800 underline-offset-2 hover:underline">
            Profil klijenta →
          </Link>
          <Link prefetch={false}
            href={clearClientParams.size > 0 ? `${base}?${clearClientParams.toString()}` : base}
            className="ml-auto rounded-md px-2 py-1 font-medium text-violet-800 hover:bg-violet-100"
          >
            ✕ Ukloni filter
          </Link>
        </div>
      )}
      {legendInstructors.length > 0 && (
        <div className="mb-4 flex flex-wrap items-start gap-4 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-2 text-sm">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-stone-600">Legenda boja instruktora (font):</span>
            <div className="flex flex-wrap gap-3">
              {legendInstructors.map((i) => (
                <span key={i.id} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-4 w-4 rounded border border-stone-300"
                    style={{ backgroundColor: i.color }}
                  />
                  <span className="text-stone-800">{i.ime} {i.prezime}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  m.kraj(`${view}, ${dateFrom}–${dateTo}, ${terms.length} termina, ${nacin}`);
  return (
    <div>
      <AdminFromDashboardToast from={params.from} />
      <AdminCalendarView
        headerContent={headerContent}
        terms={terms}
        otkazaniTermini={otkazaniTermini}
        filterQuery={filterQuery}
        filterClientId={filterClientId}
        view={view}
        startOfWeek={startOfWeek}
        narednihNedelja={narednihNedelja}
        trenutnaNedelja={trenutnaNedelja}
        singleDay={singleDay}
        monthStart={monthStart}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
        clients={(clientsList ?? []).map((c) => ({
          id: c.id,
          ime: c.ime ?? '',
          prezime: c.prezime ?? '',
          godiste: (c as { godiste?: number | null }).godiste ?? null,
          datumTestiranja: (c as { datum_testiranja?: string | null }).datum_testiranja ?? null,
        }))}
        termTypes={termTypes}
        termCategories={termCategories}
        instructorsList={activeInstructors.map((i) => ({ id: i.id, ime: i.ime ?? '', prezime: i.prezime ?? '' }))}
        classroomsList={(classroomsList ?? []).map((c) => ({ id: c.id, naziv: c.naziv ?? '' }))}
        pendingZahtevi={pendingZahtevi}
        allPendingZahteviDates={allPendingZahteviDates}
        focusDate={params.fokus?.slice(0, 10)}
        focusSlot={params.slot && /^\d{1,2}$/.test(params.slot) ? Number(params.slot) : undefined}
        blockedSlots={blockedSlots}
        placeniPaketi={(paketi ?? []).map((p) => ({ ...p, od_datum: String(p.od_datum).slice(0, 10) })) as PlaceniPaket[]}
        paketiMigracija={paketiMigracija}
      />
    </div>
  );
}
