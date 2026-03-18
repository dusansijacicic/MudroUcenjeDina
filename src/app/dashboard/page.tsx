import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getOdrzanoPoVrstamaZaPredavaca } from '@/app/admin/actions';
import CalendarView from './CalendarView';
import AddTermButton from './AddTermButton';
import CalendarFilters from './CalendarFilters';
import DashboardErrorToast from './DashboardErrorToast';
import { DEFAULT_INSTRUCTOR_COLOR } from '@/lib/constants';
import type { RawTerm, OtherTerm } from './CalendarView';

// Uvek sveži podaci po korisniku – predavač mora da vidi i tuđe termine (samo pregled).
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
    end.setDate(end.getDate() + 6);
    dateFrom = startOfWeek;
    dateTo = end.toISOString().slice(0, 10);
  }

  const admin = createAdminClient();
  const { data: allTermsRaw } = await admin
    .from('terms')
    .select('id, instructor_id, date, slot_index, classroom_id, instructor:instructors(id, ime, prezime, color), classroom:classrooms(id, naziv, color), predavanja(*, client:clients(id, ime, prezime))')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date')
    .order('slot_index');

  type TermRow = {
    id: string;
    instructor_id: string;
    date: string;
    slot_index: number;
    classroom_id?: string | null;
    instructor?: { id: string; ime: string; prezime: string; color?: string | null } | { id: string; ime: string; prezime: string; color?: string | null }[] | null;
    classroom?: { id: string; naziv: string; color?: string | null } | { id: string; naziv: string; color?: string | null }[] | null;
    predavanja?: RawTerm['predavanja'];
  };
  const allTerms = (allTermsRaw ?? []) as TermRow[];
  const norm = (t: TermRow) => ({
    instructor: Array.isArray(t.instructor) ? t.instructor[0] : t.instructor,
    classroom: Array.isArray(t.classroom) ? t.classroom[0] : t.classroom,
  });
  const myTerms = allTerms.filter((t) => t.instructor_id === instructorId);
  const otherTerms: OtherTerm[] = allTerms
    .filter((t) => t.instructor_id !== instructorId)
    .map((t) => {
      const { instructor: inst, classroom: room } = norm(t);
      return {
        id: t.id,
        instructor_id: t.instructor_id,
        date: t.date,
        slot_index: t.slot_index,
        predavanja: t.predavanja,
        instructor: inst ? { ime: inst.ime, prezime: inst.prezime, color: inst.color ?? undefined } : null,
        classroom: room ? { id: room.id, naziv: room.naziv, color: room.color ?? undefined } : null,
      };
    });

  let terms: RawTerm[] = myTerms.map((t) => {
    const { instructor: inst, classroom: room } = norm(t);
    return {
      id: t.id,
      instructor_id: t.instructor_id,
      date: t.date,
      slot_index: t.slot_index,
      predavanja: t.predavanja,
      classroom: room ? { id: room.id, naziv: room.naziv, color: room.color ?? undefined } : null,
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

  const { data: classroomsRaw } = await admin.from('classrooms').select('id, naziv, color').order('naziv');

  const clientMap = new Map<string, { id: string; ime: string; prezime: string }>();
  for (const t of allTerms) {
    for (const p of t.predavanja ?? []) {
      const client = (p as { client?: { id: string; ime: string; prezime: string } | null }).client;
      if (client && !clientMap.has(client.id)) {
        clientMap.set(client.id, { id: client.id, ime: client.ime ?? '', prezime: client.prezime ?? '' });
      }
    }
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
      <DashboardErrorToast />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 animate-in-delay-1">
        <h1 className="text-xl font-semibold text-stone-800">Kalendar</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarFilters
            clients={clients ?? []}
            clientFilterId={clientFilterId}
            currentView={view}
            currentParams={params}
          />
          <AddTermButton instructorId={instructorId} />
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
          <span className="text-stone-500">Predavači (zauzeli termin):</span>
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
      />
    </div>
  );
}
