import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import CalendarView from './CalendarView';
import AddTermButton from './AddTermButton';
import CalendarFilters from './CalendarFilters';
import { DEFAULT_INSTRUCTOR_COLOR } from '@/lib/constants';
import type { RawTerm, OtherTerm } from './CalendarView';

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
    .select('*, instructor:instructors(id, ime, prezime), predavanja(*, client:clients(id, ime, prezime))')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date')
    .order('slot_index');

  const allTerms = (allTermsRaw ?? []) as Array<RawTerm & { instructor?: { ime: string; prezime: string } | null }>;
  const myTerms = allTerms.filter((t) => t.instructor_id === instructorId);
  const otherTerms: OtherTerm[] = allTerms
    .filter((t) => t.instructor_id !== instructorId)
    .map((t) => ({
      id: t.id,
      instructor_id: t.instructor_id,
      date: t.date,
      slot_index: t.slot_index,
      predavanja: t.predavanja,
      instructor: t.instructor ?? null,
    }));

  let terms: RawTerm[] = myTerms.map((t) => ({
    id: t.id,
    instructor_id: t.instructor_id,
    date: t.date,
    slot_index: t.slot_index,
    predavanja: t.predavanja,
  }));
  if (clientFilterId) {
    terms = terms
      .map((t) => ({
        ...t,
        predavanja: (t.predavanja ?? []).filter((p) => p.client_id === clientFilterId),
      }))
      .filter((t) => (t.predavanja?.length ?? 0) > 0);
  }

  const { data: links } = await admin
    .from('instructor_clients')
    .select('client:clients(id, ime, prezime)')
    .eq('instructor_id', instructorId);
  const clients = (links ?? []).map((l) => l.client).filter(Boolean) as unknown as { id: string; ime: string; prezime: string }[];
  clients.sort((a, b) => (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? ''));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
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
      <CalendarView
        view={view}
        terms={terms}
        instructorId={instructorId}
        instructorColor={instructorColor}
        startOfWeek={startOfWeek}
        singleDay={singleDay}
        monthStart={monthStart}
        clientFilterId={clientFilterId}
        otherTerms={otherTerms}
      />
    </div>
  );
}
