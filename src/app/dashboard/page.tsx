import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readAllCalendarRows } from '@/lib/calendar-rows';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getOdrzanoPoVrstamaZaPredavaca } from '@/app/admin/actions';
import { mapBlokada, mapNedeljna, nedeljneUDatume } from '@/lib/blokade';
import CalendarView from './CalendarView';
import AddTermButton from './AddTermButton';
import CalendarFilters from './CalendarFilters';
import DashboardErrorToast from './DashboardErrorToast';
import DashboardDebugLog from './DashboardDebugLog';
import { DEFAULT_INSTRUCTOR_COLOR, TIME_SLOTS, slotsNeeded } from '@/lib/constants';
import type { RawTerm, OtherTerm } from './CalendarView';

// Svaki instruktor vidi ceo raspored, uključujući časove koji čekaju instruktora.
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    day?: string;
    month?: string;
    view?: string;
    client?: string;
    instructor?: string;
  }>;
}) {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const instructorId = instructor.id;
  const instructorColor = instructor.color ?? DEFAULT_INSTRUCTOR_COLOR;

  const params = await searchParams;
  const view = (params.view === 'dan' || params.view === 'mesec') ? params.view : 'nedelja';
  const clientFilterId = params.client?.trim() || null;

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
  const today = new Date(todayStr + 'T12:00:00');
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

  type TermRow = {
    id: string;
    instructor_id: string | null;
    date: string;
    slot_index: number;
    classroom_id?: string | null;
    napomena?: string | null;
    nastavak_of_term_id?: string | null;
    instructor?: { id: string; ime: string; prezime: string; color?: string | null } | { id: string; ime: string; prezime: string; color?: string | null }[] | null;
    classroom?: { id: string; naziv: string; color?: string | null } | { id: string; naziv: string; color?: string | null }[] | null;
    term_category?: { id: string; naziv: string; is_testing: boolean } | { id: string; naziv: string; is_testing: boolean }[] | null;
    predavanja?: RawTerm['predavanja'];
    potential_clients?: RawTerm['potential_clients'];
  };

  // Isti pristup kao admin: raspored se čita bez ograničenja po instruktoru, klijentu ili učionici.
  // Korisnički RLS nije rezerva: on može da sakrije zahteve nepovezane dece i drugih instruktora.
  const calendarSupabase = createAdminClient();
  const [allTermsRaw, classRes, requestsRaw, cancelledRaw] = await Promise.all([
    readAllCalendarRows('Termini nisu učitani', (from, to) => calendarSupabase.from('terms').select('id, instructor_id, date, slot_index, classroom_id, napomena, nastavak_of_term_id, instructor:instructors(id, ime, prezime, color), classroom:classrooms(id, naziv, color), term_category:term_categories(id, naziv, is_testing), predavanja(*, client:clients(id, ime, prezime), term_type:term_types(naziv)), potential_clients(id, ime, prezime, ime_roditelja, mobilni_roditelja, status)').gte('date', dateFrom).lte('date', dateTo).order('date').order('slot_index').order('id').range(from, to)),
    calendarSupabase.from('classrooms').select('id, naziv, color').order('naziv'),
    readAllCalendarRows('Časovi na čekanju nisu učitani', (from, to) => calendarSupabase.from('zahtevi_za_cas').select('id, client_id, requested_date, requested_slot_index, client:clients(id, ime, prezime), term_type:term_types(naziv, trajanje_minuta), classroom:classrooms(id, naziv, color)').eq('status', 'pending').gte('requested_date', dateFrom).lte('requested_date', dateTo).order('requested_date').order('requested_slot_index').order('id').range(from, to)),
    readAllCalendarRows('Otkazani časovi nisu učitani', (from, to) => calendarSupabase.from('otkazani_termini').select('id, client_id, client_ime, client_prezime, instructor_id, instructor_ime, instructor_prezime, classroom_naziv, term_date, slot_index, term_type_naziv, placeno').gte('term_date', dateFrom).lte('term_date', dateTo).order('term_date').order('slot_index').order('id').range(from, to)),
  ]);
  const classroomsRaw = classRes.data ?? [];

  const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
  const pendingTerms: OtherTerm[] = requestsRaw.flatMap((r) => {
    const termType = one(r.term_type);
    const term: OtherTerm = {
      id: `zahtev-${r.id}`,
      request_id: r.id,
      instructor_id: null,
      date: r.requested_date,
      slot_index: r.requested_slot_index,
      classroom: one(r.classroom),
      predavanja: [{
        id: r.id,
        term_id: '',
        client_id: r.client_id,
        odrzano: false,
        placeno: false,
        komentar: null,
        client: one(r.client),
        term_type: termType,
      }],
    };
    const occupiedSlots = Math.min(slotsNeeded(termType?.trajanje_minuta), TIME_SLOTS.length - term.slot_index);
    return Array.from({ length: occupiedSlots }, (_, offset) => ({
      ...term,
      id: offset === 0 ? term.id : `${term.id}-nastavak-${offset}`,
      slot_index: term.slot_index + offset,
      request_continuation: offset > 0,
    }));
  });
  const cancelledTerms: OtherTerm[] = cancelledRaw.map((r) => ({
    id: `otkazan-${r.id}`,
    cancelled: true,
    instructor_id: r.instructor_id,
    instructor: r.instructor_ime ? { ime: r.instructor_ime, prezime: r.instructor_prezime ?? '' } : null,
    date: r.term_date,
    slot_index: r.slot_index,
    classroom: r.classroom_naziv ? { id: '', naziv: r.classroom_naziv } : null,
    predavanja: [{
      id: r.id,
      term_id: '',
      client_id: r.client_id ?? '',
      odrzano: false,
      placeno: r.placeno,
      komentar: null,
      client: { id: r.client_id ?? '', ime: r.client_ime, prezime: r.client_prezime ?? '' },
      term_type: r.term_type_naziv ? { naziv: r.term_type_naziv } : null,
    }],
  }));

  // Predavač vidi
  // blokade za SVE i SVOJE (za datum i stalne nedeljne) – tuđe blokade instruktora ga se ne tiču.
  // select('*') radi i pre migracije 048; bez 044/048 data je null → nema blokada.
  const [{ data: blockedRaw }, { data: nedeljneRaw }] = await Promise.all([
    calendarSupabase.from('blokirani_termini').select('*').gte('date', dateFrom).lte('date', dateTo),
    calendarSupabase.from('instruktor_nedeljne_blokade').select('*').eq('instructor_id', instructorId),
  ]);
  const blockedSlots = [
    ...(blockedRaw ?? []).map(mapBlokada),
    ...nedeljneUDatume((nedeljneRaw ?? []).map(mapNedeljna), dateFrom, dateTo),
  ]
    .filter((b) => b.instructor_id === null || b.instructor_id === instructorId)
    .map((b) => ({
      date: b.date,
      slot_index: b.slot_index,
      ownOnly: b.instructor_id !== null,
      napomena: b.instructor_id ? `Vi ne radite${b.nedeljna ? ' (svake nedelje)' : ''}${b.napomena ? ` – ${b.napomena}` : ''}` : b.napomena,
    }));

  const allTerms = (allTermsRaw ?? []) as TermRow[];
  const normOne = (t: TermRow) => ({
    instructor: Array.isArray(t.instructor) ? t.instructor[0] : t.instructor,
    classroom: Array.isArray(t.classroom) ? t.classroom[0] : t.classroom,
  });
  const termsSummary = allTerms.map((t) => {
    const { instructor: inst } = normOne(t);
    return {
      id: t.id,
      instructor_id: t.instructor_id,
      date: t.date,
      slot_index: t.slot_index,
      instructor_name: inst ? `${(inst as { ime?: string }).ime} ${(inst as { prezime?: string }).prezime}` : null,
      predavanja_count: (t.predavanja ?? []).length,
    };
  });
  const norm = (t: TermRow) => ({
    instructor: Array.isArray(t.instructor) ? t.instructor[0] : t.instructor,
    classroom: Array.isArray(t.classroom) ? t.classroom[0] : t.classroom,
  });
  const myTerms = allTerms.filter((t) => t.instructor_id === instructorId);
  const otherTerms: OtherTerm[] = allTerms
    .filter((t) => t.instructor_id !== instructorId)
    .map<OtherTerm>((t) => {
      const { instructor: inst, classroom: room } = norm(t);
      return {
        id: t.id,
        instructor_id: t.instructor_id,
        date: t.date,
        slot_index: t.slot_index,
        predavanja: t.predavanja,
        term_category: one(t.term_category ?? null),
        potential_clients: t.potential_clients,
        napomena: t.napomena ?? null,
        nastavak_of_term_id: t.nastavak_of_term_id ?? null,
        instructor: inst ? { ime: inst.ime, prezime: inst.prezime, color: inst.color ?? undefined } : null,
        classroom: room ? { id: room.id, naziv: room.naziv, color: room.color ?? undefined } : null,
      };
    }).concat(pendingTerms, cancelledTerms);

  let terms: RawTerm[] = myTerms.map((t) => {
    const { classroom: room } = norm(t);
    const tcRaw = t.term_category;
    const term_category = (Array.isArray(tcRaw) ? tcRaw[0] : tcRaw) as RawTerm['term_category'];
    return {
      id: t.id,
      instructor_id: t.instructor_id,
      date: t.date,
      slot_index: t.slot_index,
      predavanja: t.predavanja,
      classroom: room ? { id: room.id, naziv: room.naziv, color: room.color ?? undefined } : null,
      term_category,
      potential_clients: t.potential_clients,
      napomena: t.napomena ?? null,
      nastavak_of_term_id: t.nastavak_of_term_id ?? null,
    };
  });
  let filteredOtherTerms = otherTerms;
  if (clientFilterId) {
    terms = terms
      .map((t) => ({
        ...t,
        predavanja: (t.predavanja ?? []).filter((p) => p.client_id === clientFilterId),
      }))
      .filter((t) => (t.predavanja?.length ?? 0) > 0);
    filteredOtherTerms = otherTerms
      .map((ot) => ({ ...ot, predavanja: (ot.predavanja ?? []).filter((p) => p.client_id === clientFilterId) }))
      .filter((ot) => (ot.predavanja?.length ?? 0) > 0);
  }

  const clientMap = new Map<string, { id: string; ime: string; prezime: string }>();
  for (const t of allTerms) {
    for (const p of t.predavanja ?? []) {
      const client = (p as { client?: { id: string; ime: string; prezime: string } | null }).client;
      if (client && !clientMap.has(client.id)) {
        clientMap.set(client.id, { id: client.id, ime: client.ime ?? '', prezime: client.prezime ?? '' });
      }
    }
  }
  for (const t of [...pendingTerms, ...cancelledTerms]) {
    const client = t.predavanja?.[0]?.client;
    if (client?.id) clientMap.set(client.id, client);
  }
  const clients = Array.from(clientMap.values()).sort(
    (a, b) => (a.prezime || '').localeCompare(b.prezime || '') || (a.ime || '').localeCompare(b.ime || '')
  );

  const odrzanoPoVrstama = await getOdrzanoPoVrstamaZaPredavaca(instructorId);

  const legendClassrooms = (classroomsRaw ?? []).map((c) => ({
    id: c.id,
    naziv: c.naziv ?? '',
    color: c.color ?? '#94a3b8',
  }));
  const seenInstructorIds = new Set<string>();
  const legendInstructors: { id: string; ime: string; prezime: string; color: string }[] = [];
  for (const t of allTerms) {
    const { instructor: inst } = norm(t);
    if (!inst || seenInstructorIds.has(inst.id)) continue;
    seenInstructorIds.add(inst.id);
    legendInstructors.push({
      id: inst.id,
      ime: inst.ime ?? '',
      prezime: inst.prezime ?? '',
      color: inst.color ?? DEFAULT_INSTRUCTOR_COLOR,
    });
  }
  legendInstructors.sort((a, b) => (a.prezime || '').localeCompare(b.prezime || '') || (a.ime || '').localeCompare(b.ime || ''));

  return (
    <div className="animate-in">
      <DashboardDebugLog
        payload={{
          serviceRoleUsed: true,
          allTermsLength: allTerms.length,
          myTermsLength: myTerms.length,
          otherTermsLength: otherTerms.length,
          instructorId,
          termsSummary,
        }}
      />
      <DashboardErrorToast />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 animate-in-delay-1">
        <h1 className="text-xl font-semibold text-stone-800">Kalendar (svi termini)</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarFilters
            clients={clients ?? []}
            clientFilterId={clientFilterId}
            currentView={view}
            currentParams={params}
          />
          <AddTermButton />
        </div>
      </div>
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4 text-sm animate-in-delay-1">
        <p className="font-medium text-stone-700 mb-2">Legenda</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span className="text-stone-500">Učionice:</span>
          {legendClassrooms.length === 0 ? (
            <span className="text-stone-400">Nema učionica</span>
          ) : (
            legendClassrooms.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border border-stone-300 shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-stone-700">{c.naziv}</span>
              </span>
            ))
          )}
          <span className="w-px h-4 bg-stone-200 shrink-0" aria-hidden />
          <span className="text-stone-500">Instruktori (zauzeli termin):</span>
          {legendInstructors.map((inst) => (
            <span key={inst.id} className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded border border-stone-300 shrink-0" style={{ backgroundColor: inst.color }} />
              <span className={inst.id === instructorId ? 'font-medium text-stone-800' : 'text-stone-700'}>
                {inst.ime} {inst.prezime}{inst.id === instructorId ? ' (vi)' : ''}
              </span>
            </span>
          ))}
        </div>
      </div>
      {odrzanoPoVrstama.length > 0 && (
        <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 animate-in-delay-2 ui-transition shadow-sm">
          <span className="font-medium text-stone-600">Održano po vrstama časova: </span>
          {odrzanoPoVrstama.map((s) => (
            <span key={s.term_type_id ?? 'bez'} className="mr-3">
              {s.term_type_naziv} <strong>{s.count}</strong>
            </span>
          ))}
        </div>
      )}
      <CalendarView
        view={view}
        terms={terms}
        instructorId={instructorId}
        instructorColor={instructorColor}
        startOfWeek={startOfWeek}
        singleDay={singleDay}
        monthStart={monthStart}
        clientFilterId={clientFilterId}
        otherTerms={filteredOtherTerms}
        blockedSlots={blockedSlots}
      />
    </div>
  );
}
