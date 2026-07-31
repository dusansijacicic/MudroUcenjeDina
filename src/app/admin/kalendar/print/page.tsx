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
  const instructorCounts = new Map<string, number>();
  const clientCounts = new Map<string, number>();
  for (const t of termsRaw ?? []) {
    const isAutoSpillover = !!t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA;
    if (isAutoSpillover) continue;
    const instr = Array.isArray(t.instructor) ? t.instructor[0] : t.instructor;
    const instrIme = (instr as { ime?: string } | null)?.ime;
    const instrPrezime = (instr as { prezime?: string } | null)?.prezime;
    const instrInitials = initials(instrIme, instrPrezime);
    const instrName = `${instrIme ?? ''} ${instrPrezime ?? ''}`.trim() || '—';
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
      instructorCounts.set(instrName, (instructorCounts.get(instrName) ?? 0) + 1);
      clientCounts.set(clientName, (clientCounts.get(clientName) ?? 0) + 1);
    }
  }
  const instructorStats = [...instructorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const clientStats = [...clientCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalCasova = [...clientCounts.values()].reduce((sum, n) => sum + n, 0);

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
          <DownloadPdfButton
            targetId="print-table-wrap"
            fileName={`raspored_${dateFrom}_${dateTo}_sa_statistikom`}
            label="⬇ PDF sa statistikom"
          />
          <DownloadPdfButton
            targetId="print-table-only"
            fileName={`raspored_${dateFrom}_${dateTo}`}
            label="⬇ PDF bez statistike"
          />
        </div>
      </div>

      <DateRangeForm initialFrom={dateFrom} initialTo={dateTo} />

      {/*
        Boje su namerno INLINE (ne Tailwind klase) unutar #print-table-wrap: Tailwind v4 generiše
        boje preko oklch()/lab(), a html2canvas (koristi ga DownloadPdfButton) ume da parsira samo
        standardne rgb/hex vrednosti – sa Tailwind klasama je bacao "unsupported color function" i
        tabela je na ekranu izgledala izbledelo. Plain hex ovde rešava oba problema odjednom.
      */}
      <div id="print-table-wrap" className="overflow-x-auto" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
        <div style={{ color: '#000000', fontSize: '13px', marginBottom: '14px', padding: '10px', border: '1px solid #94a3b8', borderRadius: '6px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>
            Period: {rangeLabel} — ukupno {totalCasova} {totalCasova === 1 ? 'čas' : 'časova'}
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Predavači (broj časova)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', columnGap: '16px' }}>
                {instructorStats.map(([name, count]) => (
                  <div key={name} style={{ whiteSpace: 'nowrap' }}>
                    {name}: {count}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: '2 1 400px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Deca (broj časova)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', columnGap: '16px' }}>
                {clientStats.map(([name, count]) => (
                  <div key={name} style={{ whiteSpace: 'nowrap' }}>
                    {name}: {count}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div id="print-table-only">
        <table
          className="w-full border-collapse leading-tight"
          style={{ color: '#000000', fontSize: '12px', tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={{ width: '7%' }} />
            {dates.map((d) => (
              <col key={d} style={{ width: `${93 / dates.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="p-1" style={{ border: '1px solid #94a3b8', backgroundColor: '#f1f5f9', color: '#000000' }}>
                Vreme
              </th>
              {dates.map((d) => {
                const dow = new Date(d + 'T12:00:00').getDay();
                return (
                  <th key={d} className="p-1" style={{ border: '1px solid #94a3b8', backgroundColor: '#f1f5f9', color: '#000000' }}>
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
                <td
                  className="p-1 font-medium text-center align-middle"
                  style={{ border: '1px solid #94a3b8', backgroundColor: '#f8fafc', color: '#000000' }}
                >
                  {time}
                </td>
                {dates.map((d) => {
                  const entries = grid.get(`${d}|${slotIndex}`) ?? [];
                  return (
                    <td key={d} className="p-1 align-top" style={{ border: '1px solid #94a3b8', color: '#000000' }}>
                      {entries.length === 0 ? (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      ) : (
                        entries.map((e, i) => (
                          <div key={i} style={{ color: '#000000' }}>
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
    </div>
  );
}
