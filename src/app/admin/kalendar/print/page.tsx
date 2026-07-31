import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import DateRangeForm from './DateRangeForm';
import DownloadPdfButton from './DownloadPdfButton';

function getMonday(d: Date): string {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x.toISOString().slice(0, 10);
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  const cursor = new Date(start);
  // Bezbednosna kočnica – ne dozvoljava beskonačnu petlju ako je opseg nevalidan; ograničava na 62 dana.
  let guard = 0;
  while (cursor <= end && guard < 62) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

const DAY_NAMES_SHORT = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

function initials(ime: string | null | undefined, prezime: string | null | undefined): string {
  const a = (ime ?? '').trim().charAt(0).toUpperCase();
  const b = (prezime ?? '').trim().charAt(0).toUpperCase();
  return `${a}${b}` || '—';
}

export default async function AdminKalendarPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; week?: string }>;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const params = await searchParams;
  // "week" (iz starog linka sa kalendara) i dalje radi – tumači se kao ponedeljak-nedelja.
  let dateFrom: string;
  let dateTo: string;
  if (params.from && params.to) {
    dateFrom = params.from.slice(0, 10);
    dateTo = params.to.slice(0, 10);
  } else if (params.week) {
    const monday = getMonday(new Date(params.week.slice(0, 10) + 'T12:00:00'));
    const sunday = new Date(monday + 'T12:00:00');
    sunday.setDate(sunday.getDate() + 6);
    dateFrom = monday;
    dateTo = sunday.toISOString().slice(0, 10);
  } else {
    const monday = getMonday(new Date());
    const sunday = new Date(monday + 'T12:00:00');
    sunday.setDate(sunday.getDate() + 6);
    dateFrom = monday;
    dateTo = sunday.toISOString().slice(0, 10);
  }
  if (dateTo < dateFrom) [dateFrom, dateTo] = [dateTo, dateFrom];

  const dates = datesBetween(dateFrom, dateTo);

  const admin = createAdminClient();
  const { data: termsRaw } = await admin
    .from('terms')
    .select(
      'date, slot_index, nastavak_of_term_id, napomena, instructor:instructors(ime, prezime), predavanja(client:clients(ime, prezime))'
    )
    .gte('date', dateFrom)
    .lte('date', dateTo);

  type CellEntry = { instructorInitials: string; clientName: string };
  // key: `${date}|${slotIndex}`, value: sve radionice u tom danu/slotu (jedan ili više paralelnih termina)
  const grid = new Map<string, CellEntry[]>();
  for (const t of termsRaw ?? []) {
    const isAutoSpillover = !!t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA;
    if (isAutoSpillover) continue;
    const instr = Array.isArray(t.instructor) ? t.instructor[0] : t.instructor;
    const instrInitials = initials((instr as { ime?: string } | null)?.ime, (instr as { prezime?: string } | null)?.prezime);
    const preds = (t.predavanja ?? []) as { client: { ime: string; prezime: string } | { ime: string; prezime: string }[] | null }[];
    for (const p of preds) {
      const c = Array.isArray(p.client) ? p.client[0] : p.client;
      if (!c) continue;
      const clientName = `${c.ime ?? ''} ${c.prezime ?? ''}`.trim();
      if (!clientName) continue;
      const key = `${t.date}|${t.slot_index}`;
      const list = grid.get(key) ?? [];
      list.push({ instructorInitials: instrInitials, clientName });
      grid.set(key, list);
    }
  }

  const rangeLabel = `${new Date(dateFrom + 'T12:00:00').toLocaleDateString('sr-Latn-RS')} – ${new Date(dateTo + 'T12:00:00').toLocaleDateString('sr-Latn-RS')}`;

  return (
    <div>
      <div className="no-print mb-4 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Print / PDF pregled — {rangeLabel}</h1>
          <p className="text-sm text-stone-500 mt-1">Po vremenu i danu: inicijali predavača + ime i prezime deteta.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/kalendar" className="text-sm text-stone-500 hover:text-stone-700">
            ← Kalendar
          </Link>
          <DownloadPdfButton fileName={`raspored_${dateFrom}_${dateTo}`} />
        </div>
      </div>

      <DateRangeForm initialFrom={dateFrom} initialTo={dateTo} />

      <div id="print-table-wrap" className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px] leading-tight">
          <thead>
            <tr>
              <th className="border border-stone-400 p-1 w-14 bg-stone-100">Vreme</th>
              {dates.map((d) => {
                const dow = new Date(d + 'T12:00:00').getDay();
                return (
                  <th key={d} className="border border-stone-400 p-1 bg-stone-100">
                    {DAY_NAMES_SHORT[dow === 0 ? 6 : dow - 1]}
                    <br />
                    {new Date(d + 'T12:00:00').toLocaleDateString('sr-Latn-RS')}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((time, slotIndex) => (
              <tr key={slotIndex}>
                <td className="border border-stone-400 p-1 font-medium text-center align-middle bg-stone-50">{time}</td>
                {dates.map((d) => {
                  const entries = grid.get(`${d}|${slotIndex}`) ?? [];
                  return (
                    <td key={d} className="border border-stone-400 p-1 align-top">
                      {entries.length === 0 ? (
                        <span className="text-stone-300">—</span>
                      ) : (
                        entries.map((e, i) => (
                          <div key={i} className="whitespace-nowrap">
                            <span className="font-semibold">{e.instructorInitials}</span> {e.clientName}
                          </div>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
