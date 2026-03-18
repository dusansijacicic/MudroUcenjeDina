import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminCalendarView, { type AdminTerm } from './AdminCalendarView';

export default async function AdminKalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; month?: string; view?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const params = await searchParams;
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
    end.setDate(end.getDate() + 6);
    dateFrom = startOfWeek;
    dateTo = end.toISOString().slice(0, 10);
  }

  const adminSupabase = createAdminClient();
  const [{ data: termsRaw }, { data: instructorsList }] = await Promise.all([
    adminSupabase
      .from('terms')
      .select('*, instructor:instructors(id, ime, prezime, color), classroom:classrooms(id, naziv, color), predavanja(*, client:clients(id, ime, prezime))')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date')
      .order('slot_index'),
    adminSupabase.from('instructors').select('id, ime, prezime, color').order('prezime').order('ime'),
  ]);

  const terms: AdminTerm[] = (termsRaw ?? []).map((t) => {
    const instr = (t as {
      instructor?: { id: string; ime: string; prezime: string; color?: string | null } | Array<unknown>;
      classroom?: { id: string; naziv: string; color?: string | null } | Array<unknown>;
    }).instructor;
    const instructor = Array.isArray(instr) ? instr[0] : instr;
    const classroomRaw = (t as {
      classroom?: { id: string; naziv: string; color?: string | null } | Array<unknown>;
    }).classroom;
    const classroom = Array.isArray(classroomRaw) ? classroomRaw[0] : classroomRaw;
    return {
      id: t.id,
      instructor_id: t.instructor_id,
      date: t.date,
      slot_index: t.slot_index,
      classroom: classroom as AdminTerm['classroom'],
      instructor: instructor as AdminTerm['instructor'],
      predavanja: t.predavanja as AdminTerm['predavanja'],
    };
  });

  const base = '/admin/kalendar';
  const month = params.month || new Date().toISOString().slice(0, 7);
  const day = singleDay ?? todayStr;
  const legendInstructors = (instructorsList ?? []).map((i) => ({
    id: i.id,
    ime: i.ime ?? '',
    prezime: i.prezime ?? '',
    color: i.color ?? '#0d9488',
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-stone-800">Kalendar (svi predavači)</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
            <Link href={`${base}?view=dan&day=${day}`} className={`px-3 py-1.5 rounded-md ${view === 'dan' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Dan</Link>
            <Link href={base} className={`px-3 py-1.5 rounded-md ${view === 'nedelja' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Nedelja</Link>
            <Link href={`${base}?view=mesec&month=${month}`} className={`px-3 py-1.5 rounded-md ${view === 'mesec' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Mesec</Link>
          </div>
          <Link href="/admin/termin/novi" className="inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Novi termin
          </Link>
        </div>
      </div>
      {legendInstructors.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-2 text-sm">
          <span className="font-medium text-stone-600">Legenda:</span>
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
      )}
      <AdminCalendarView
        terms={terms}
        view={view}
        startOfWeek={startOfWeek}
        singleDay={singleDay}
        monthStart={monthStart}
      />
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
