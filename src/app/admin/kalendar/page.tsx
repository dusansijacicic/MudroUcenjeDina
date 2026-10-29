import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminCalendarView, { type AdminTerm, type OtkazaniTerminCalendar } from './AdminCalendarView';
import AdminCalendarFilters from './AdminCalendarFilters';
import AdminFromDashboardToast from '@/components/AdminFromDashboardToast';
import { getMaxTerminaPoSlotu } from '@/lib/settings';
import { getTermTypes, getTermCategories } from '@/app/admin/actions';

export default async function AdminKalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; month?: string; view?: string; instructor?: string; classroom?: string; client?: string; from?: string; fokus?: string; slot?: string }>;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const params = await searchParams;
  const filterInstructorId = params.instructor?.trim() || null;
  const filterClassroomId = params.classroom?.trim() || null;
  const filterClientId = params.client?.trim() || null;
  const view = (params.view === 'dan' || params.view === 'mesec') ? params.view : 'nedelja';
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const getMonday = (d: Date) => {
    const x = new Date(d);
    const dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return x.toISOString().slice(0, 10);
  };

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
    startOfWeek = params.week ? params.week.slice(0, 10) : getMonday(today);
    const start = new Date(startOfWeek + 'T12:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    dateFrom = startOfWeek;
    dateTo = end.toISOString().slice(0, 10);
  }

  const adminSupabase = createAdminClient();
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
  ] = await Promise.all([
    adminSupabase
      .from('terms')
      .select('*, instructor:instructors(id, ime, prezime, color), classroom:classrooms(id, naziv, color), term_category:term_categories(id, naziv, is_testing), predavanja(*, client:clients(id, ime, prezime), term_type:term_types(naziv)), potential_clients(id, ime, prezime, ime_roditelja, mobilni_roditelja, status)')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date')
      .order('slot_index'),
    adminSupabase.from('instructors').select('id, ime, prezime, color, aktivan').order('prezime').order('ime'),
    adminSupabase.from('classrooms').select('id, naziv').order('naziv'),
    adminSupabase.from('clients').select('id, ime, prezime, godiste, datum_testiranja').order('ime').order('prezime'),
    adminSupabase.from('otkazani_termini').select('id, client_id, client_ime, client_prezime, instructor_id, instructor_ime, instructor_prezime, term_date, slot_index, term_type_naziv, placeno').gte('term_date', dateFrom).lte('term_date', dateTo),
    adminSupabase
      .from('zahtevi_za_cas')
      .select('id, client_id, requested_date, requested_slot_index, client:clients(ime, prezime), term_type:term_types(naziv), classroom:classrooms(naziv)')
      .eq('status', 'pending')
      .gte('requested_date', dateFrom)
      .lte('requested_date', dateTo),
    getMaxTerminaPoSlotu(),
    getTermTypes(),
    getTermCategories(),
    // Globalno (bez obzira na trenutno prikazanu nedelju/dan) – da admin ne propusti zahtev van
    // trenutnog prikaza. Samo datumi, radi lakog dugmeta "skoči na tu nedelju". U ISTOM Promise.all-u
    // (ne odvojen await posle) da ne doda dodatan sekvencijalni round-trip.
    adminSupabase.from('zahtevi_za_cas').select('requested_date').eq('status', 'pending').order('requested_date'),
    // Ako migracija 044 još nije pokrenuta, upit vraća grešku → data je null → nema blokiranih.
    adminSupabase.from('blokirani_termini').select('id, date, slot_index, napomena').gte('date', dateFrom).lte('date', dateTo),
    // "x / y" uz svako dete (koji je čas po redu od plaćenih) – baza računa; bez migracije 047 nema oznaka.
    adminSupabase.rpc('redni_broj_casova', { p_from: dateFrom, p_to: dateTo }),
  ]);
  const redniPoPredavanju = (redniRaw ?? {}) as Record<string, [number, number]>;
  const blockedSlots = (blockedRaw ?? []).map((b) => ({
    id: b.id as string,
    date: String(b.date).slice(0, 10),
    slot_index: b.slot_index as number,
    napomena: (b.napomena as string | null) ?? null,
  }));
  const allPendingZahteviDates = [...new Set((allPendingZahteviRaw ?? []).map((z) => String(z.requested_date).slice(0, 10)))];

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
    };
  });

  if (filterInstructorId) terms = terms.filter((t) => t.instructor_id === filterInstructorId);
  if (filterClassroomId) terms = terms.filter((t) => t.classroom?.id === filterClassroomId);
  if (filterClientId) terms = terms.filter((t) => (t.predavanja ?? []).some((p) => (p.client as { id?: string })?.id === filterClientId));

  // Filter po detetu važi i za zahteve (termini bez instruktora) i otkazane termine tog deteta.
  const pendingZahtevi = (zahteviRaw ?? []).filter((z) => !filterClientId || z.client_id === filterClientId).map((z) => {
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
    };
  });

  const otkazaniTermini = ((otkazaniRaw ?? []) as (OtkazaniTerminCalendar & { client_id?: string | null })[]).filter(
    (ot) => !filterClientId || ot.client_id === filterClientId
  );

  const base = '/admin/kalendar';
  // Aktivni filteri idu uz svaki link kalendara (Prethodna/Sledeća, dan, mesec…), da ne nestanu pri promeni perioda.
  const filterParams = new URLSearchParams();
  if (filterInstructorId) filterParams.set('instructor', filterInstructorId);
  if (filterClassroomId) filterParams.set('classroom', filterClassroomId);
  if (filterClientId) filterParams.set('client', filterClientId);
  const filterQuery = filterParams.size > 0 ? `&${filterParams.toString()}` : '';

  const filterClient = filterClientId ? (clientsList ?? []).find((c) => c.id === filterClientId) : null;
  const periodLabel = view === 'dan' ? 'ovog dana' : view === 'mesec' ? 'ovog meseca' : 'ove dve nedelje';
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
          <Link href="/admin/termin/novi" className="inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Novi termin
          </Link>
        </div>
      </div>
      {filterClientId && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm text-violet-950">
          <span>
            Prikazani su samo termini za: <strong>{filterClient ? `${filterClient.ime} ${filterClient.prezime}` : 'izabrano dete'}</strong>
            {' – '}
            {periodLabel}: <strong className="tabular-nums">{terms.length}</strong> zakazano
            {pendingZahtevi.length > 0 && (
              <>
                , <strong className="tabular-nums">{pendingZahtevi.length}</strong> bez instruktora
              </>
            )}
            .
          </span>
          {view !== 'mesec' && (
            <Link
              href={`${base}?view=mesec&month=${(singleDay ?? startOfWeek).slice(0, 7)}${filterQuery}`}
              className="font-medium text-violet-800 underline-offset-2 hover:underline"
            >
              Ceo mesec za ovo dete →
            </Link>
          )}
          <Link href={`/admin/klijenti/${filterClientId}`} className="font-medium text-violet-800 underline-offset-2 hover:underline">
            Profil klijenta →
          </Link>
          <Link
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
          <div className="text-xs text-stone-600">
            Svako dete je u svom redu – boje redova (žuta, plava, zelena…) idu redom unutar termina, da se vidi koliko dece je u isto vreme. Učionica je u maloj sivoj oznaci gore desno na terminu.
            <span className="mt-1 block">
              <strong>x/y</strong> desno od imena = koji je to čas po redu od plaćenih za tu vrstu časa.{' '}
              <span className="rounded bg-red-600 px-1 font-bold text-white">! 11/10</span> crveni red = čas nije plaćen;{' '}
              <span className="font-bold text-amber-700">10/10</span> = poslednji plaćeni čas.
            </span>
          </div>
        </div>
      )}
      <p className="text-sm text-stone-600 mb-4 max-w-3xl">
        U jednom slotu (npr. 9:00) može biti do <strong>{maxTerminaPoSlotu}</strong> paralelnih termina — svaki svoj predavač i svoja učionica.
        Svaki od njih može biti <strong>individualni</strong> (jedno dete) ili <strong>grupni</strong> (više dece). Ispod postojećih termina u ćeliji: „Dodaj još termin u ovom slotu“.
      </p>
    </>
  );

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
      />
    </div>
  );
}
