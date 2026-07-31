import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import PrintButton from './PrintButton';

function getMonday(d: Date): string {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x.toISOString().slice(0, 10);
}

function getWeekDates(start: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    dates.push(x.toISOString().slice(0, 10));
  }
  return dates;
}

const DAY_NAMES = ['Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota', 'Nedelja'];

function initials(ime: string | null | undefined, prezime: string | null | undefined): string {
  const a = (ime ?? '').trim().charAt(0).toUpperCase();
  const b = (prezime ?? '').trim().charAt(0).toUpperCase();
  return `${a}${b}` || '—';
}

export default async function AdminKalendarPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const params = await searchParams;
  const startOfWeek = params.week ? params.week.slice(0, 10) : getMonday(new Date());
  const dates = getWeekDates(startOfWeek);
  const dateFrom = dates[0];
  const dateTo = dates[6];

  const admin = createAdminClient();
  const [{ data: classroomsRaw }, { data: termsRaw }] = await Promise.all([
    admin.from('classrooms').select('id, naziv').order('naziv'),
    admin
      .from('terms')
      .select(
        'date, slot_index, classroom_id, nastavak_of_term_id, napomena, instructor:instructors(ime, prezime), predavanja(client:clients(ime, prezime))'
      )
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .not('classroom_id', 'is', null),
  ]);

  const classrooms = classroomsRaw ?? [];

  type CellEntry = { instructorInitials: string; clientNames: string };
  // key: `${date}|${slotIndex}|${classroomId}`
  const grid = new Map<string, CellEntry>();
  for (const t of termsRaw ?? []) {
    const isAutoSpillover = !!t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA;
    if (isAutoSpillover) continue;
    const instr = Array.isArray(t.instructor) ? t.instructor[0] : t.instructor;
    const preds = (t.predavanja ?? []) as { client: { ime: string; prezime: string } | { ime: string; prezime: string }[] | null }[];
    const clientNames = preds
      .map((p) => {
        const c = Array.isArray(p.client) ? p.client[0] : p.client;
        return c ? `${c.ime ?? ''} ${c.prezime ?? ''}`.trim() : null;
      })
      .filter((n): n is string => !!n)
      .join(', ');
    if (!clientNames) continue;
    const key = `${t.date}|${t.slot_index}|${t.classroom_id}`;
    grid.set(key, {
      instructorInitials: initials((instr as { ime?: string } | null)?.ime, (instr as { prezime?: string } | null)?.prezime),
      clientNames,
    });
  }

  const rangeLabel = `${new Date(dateFrom + 'T12:00:00').toLocaleDateString('sr-Latn-RS')} – ${new Date(dateTo + 'T12:00:00').toLocaleDateString('sr-Latn-RS')}`;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Print pregled — {rangeLabel}</h1>
          <p className="text-sm text-stone-500 mt-1">
            Po vremenu i danu, po red za svaku učionicu ({classrooms.map((c) => c.naziv).join(', ') || 'nema učionica'}). Termini bez učionice se ne prikazuju.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/kalendar?view=nedelja&week=${startOfWeek}`} className="text-sm text-stone-500 hover:text-stone-700">
            ← Kalendar
          </Link>
          <PrintButton />
        </div>
      </div>

      <table className="w-full border-collapse text-[10px] leading-tight">
        <thead>
          <tr>
            <th className="border border-stone-400 p-1 w-14 bg-stone-100">Vreme</th>
            {dates.map((d, i) => (
              <th key={d} className="border border-stone-400 p-1 bg-stone-100">
                {DAY_NAMES[i]}
                <br />
                {new Date(d + 'T12:00:00').toLocaleDateString('sr-Latn-RS')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIME_SLOTS.map((time, slotIndex) => (
            <tr key={slotIndex}>
              <td className="border border-stone-400 p-1 font-medium text-center align-middle bg-stone-50">{time}</td>
              {dates.map((d) => (
                <td key={d} className="border border-stone-400 p-0 align-top">
                  {classrooms.map((c) => {
                    const entry = grid.get(`${d}|${slotIndex}|${c.id}`);
                    return (
                      <div
                        key={c.id}
                        className="border-b border-stone-200 last:border-b-0 px-1 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {entry ? (
                          <>
                            <span className="font-semibold">{entry.instructorInitials}</span> {entry.clientNames}
                          </>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </div>
                    );
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
