import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CalendarView from './CalendarView';
import AddTermButton from './AddTermButton';
import CalendarFilters from './CalendarFilters';
import { DEFAULT_INSTRUCTOR_COLOR } from '@/lib/constants';

type RawTerm = {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
  predavanja?: Array<{
    id: string;
    term_id: string;
    client_id: string;
    odrzano: boolean;
    placeno: boolean;
    komentar: string | null;
    client?: { id: string; ime: string; prezime: string } | null;
  }>;
};

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, color')
    .eq('user_id', user.id)
    .single();
  if (!instructor) redirect('/login');

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

  const { data: termsRaw } = await supabase
    .from('terms')
    .select('*, predavanja(*, client:clients(id, ime, prezime))')
    .eq('instructor_id', instructor.id)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date')
    .order('slot_index');

  let terms: RawTerm[] = (termsRaw ?? []) as RawTerm[];
  if (clientFilterId) {
    terms = terms
      .map((t) => ({
        ...t,
        predavanja: (t.predavanja ?? []).filter((p) => p.client_id === clientFilterId),
      }))
      .filter((t) => (t.predavanja?.length ?? 0) > 0);
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, ime, prezime')
    .eq('instructor_id', instructor.id)
    .order('prezime')
    .order('ime');

  const instructorColor = instructor.color ?? DEFAULT_INSTRUCTOR_COLOR;

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
          <AddTermButton instructorId={instructor.id} />
        </div>
      </div>
      <CalendarView
        view={view}
        terms={terms}
        instructorId={instructor.id}
        instructorColor={instructorColor}
        startOfWeek={startOfWeek}
        singleDay={singleDay}
        monthStart={monthStart}
        clientFilterId={clientFilterId}
      />
    </div>
  );
}
