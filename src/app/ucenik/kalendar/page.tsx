import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UcenikCalendarView from './UcenikCalendarView';

export type UcenikTerm = {
  id: string;
  date: string;
  slot_index: number;
  classroom?: { id: string; naziv: string; color?: string | null } | null;
  instructor?: { id: string; ime: string; prezime: string; color?: string | null } | null;
};

export default async function UcenikKalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string; view?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('id, ime, prezime').eq('user_id', user.id).single();
  if (!client) redirect('/login');

  const params = await searchParams;
  const view = params.view === 'dan' ? 'dan' : 'nedelja';
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

  if (view === 'dan') {
    singleDay = params.day ? params.day.slice(0, 10) : todayStr;
    dateFrom = singleDay;
    dateTo = singleDay;
    startOfWeek = getMonday(new Date(singleDay + 'T12:00:00'));
  } else {
    startOfWeek = params.week ? params.week.slice(0, 10) : getMonday(today);
    const start = new Date(startOfWeek + 'T12:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    dateFrom = startOfWeek;
    dateTo = end.toISOString().slice(0, 10);
  }

  const { data: termIdsInRange } = await admin
    .from('terms')
    .select('id')
    .gte('date', dateFrom)
    .lte('date', dateTo);
  const ids = (termIdsInRange ?? []).map((t) => t.id);

  let terms: UcenikTerm[] = [];
  if (ids.length > 0) {
    const { data: predavanjaRaw } = await admin
      .from('predavanja')
      .select('term_id, term:terms(id, date, slot_index, instructor:instructors(id, ime, prezime, color), classroom:classrooms(id, naziv, color))')
      .eq('client_id', client.id)
      .in('term_id', ids);

    const termsMap = new Map<string, UcenikTerm>();
    for (const p of predavanjaRaw ?? []) {
      const t = (p as { term?: unknown }).term;
      const term = Array.isArray(t) ? t[0] : t;
      if (!term || typeof term !== 'object' || !('id' in term)) continue;
      const termObj = term as {
        id: string;
        date: string;
        slot_index: number;
        instructor?: { id: string; ime: string; prezime: string; color?: string | null } | unknown[];
        classroom?: { id: string; naziv: string; color?: string | null } | unknown[];
      };
      const date = termObj.date;
      const slot = termObj.slot_index;
      const instructor = Array.isArray(termObj.instructor) ? termObj.instructor[0] : termObj.instructor;
      const classroom = Array.isArray(termObj.classroom) ? termObj.classroom[0] : termObj.classroom;
      termsMap.set(`${date}-${slot}`, {
        id: termObj.id,
        date,
        slot_index: slot,
        instructor: instructor as UcenikTerm['instructor'],
        classroom: classroom as UcenikTerm['classroom'],
      });
    }
    terms = Array.from(termsMap.values());
  }

  const classroomMap = new Map<string, { id: string; naziv: string; color: string }>();
  const instructorMap = new Map<string, { id: string; ime: string; prezime: string; color: string }>();
  for (const t of terms) {
    if (t.classroom?.id) {
      classroomMap.set(t.classroom.id, {
        id: t.classroom.id,
        naziv: t.classroom.naziv ?? 'Učionica',
        color: t.classroom.color ?? '#64748b',
      });
    }
    if (t.instructor?.id) {
      instructorMap.set(t.instructor.id, {
        id: t.instructor.id,
        ime: t.instructor.ime ?? '',
        prezime: t.instructor.prezime ?? '',
        color: t.instructor.color ?? '#0d9488',
      });
    }
  }
  const legendClassrooms = Array.from(classroomMap.values());
  const legendInstructors = Array.from(instructorMap.values());

  return (
    <div className="animate-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 animate-in-delay-1">
        <h1 className="text-xl font-semibold text-[var(--kid-text)]">Moj kalendar</h1>
        <Link href="/ucenik" className="text-sm text-[var(--kid-teal)] hover:underline font-medium">
          ← Moj pregled
        </Link>
      </div>
      <p className="text-sm text-[var(--kid-text-muted)] mb-4 animate-in-delay-1">
        Samo tvoji zakazani časovi. Boja okvira = učionica, boja teksta = instruktor.
      </p>

      {(legendClassrooms.length > 0 || legendInstructors.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-6 rounded-xl border-2 border-[var(--kid-sky)]/50 bg-white/80 px-4 py-3 text-sm animate-in-delay-2">
          {legendClassrooms.length > 0 && (
            <div>
              <span className="font-medium text-[var(--kid-text)]">Učionice (boja okvira):</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {legendClassrooms.map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-4 w-4 rounded border-2"
                      style={{ borderColor: c.color, backgroundColor: `${c.color}30` }}
                    />
                    <span className="text-[var(--kid-text)]">{c.naziv}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {legendInstructors.length > 0 && (
            <div>
              <span className="font-medium text-[var(--kid-text)]">Instruktori (boja teksta):</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {legendInstructors.map((i) => (
                  <span key={i.id} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-4 w-4 rounded border border-stone-300"
                      style={{ backgroundColor: i.color }}
                    />
                    <span className="text-[var(--kid-text)]">{i.ime} {i.prezime}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <UcenikCalendarView
        terms={terms}
        view={view}
        startOfWeek={startOfWeek}
        singleDay={singleDay}
      />
    </div>
  );
}
