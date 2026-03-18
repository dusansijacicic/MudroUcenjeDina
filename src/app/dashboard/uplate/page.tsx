import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDashboardInstructor } from '@/lib/dashboard';

export default async function DashboardUplatePage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('uplate')
    .select(`
      id,
      created_at,
      iznos,
      broj_casova,
      popust_percent,
      napomena,
      client:clients(id, ime, prezime),
      term_type:term_types(id, naziv)
    `)
    .eq('instructor_id', instructor.id)
    .order('created_at', { ascending: false })
    .limit(200);

  type UplataRow = {
    id: string;
    created_at: string | null;
    iznos: number | null;
    broj_casova: number | null;
    popust_percent: number | null | undefined;
    napomena: string | null;
    client: { ime?: string; prezime?: string } | null;
    term_type: { naziv?: string } | null;
  };
  const list: UplataRow[] = (rows ?? []).map((r: Record<string, unknown>) => {
    const client = Array.isArray(r.client) ? r.client[0] : r.client;
    const tt = Array.isArray(r.term_type) ? r.term_type[0] : r.term_type;
    return {
      id: r.id as string,
      created_at: (r.created_at as string | null) ?? null,
      iznos: typeof r.iznos === 'number' ? r.iznos : null,
      broj_casova: typeof r.broj_casova === 'number' ? r.broj_casova : null,
      popust_percent: r.popust_percent as number | null | undefined,
      napomena: (r.napomena as string | null) ?? null,
      client: client as { ime?: string; prezime?: string } | null,
      term_type: tt as { naziv?: string } | null,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Evidencija uplata</h1>
        <Link
          href="/dashboard/uplate/novi"
          className="inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + Unesi uplatu
        </Link>
      </div>
      <p className="text-stone-500 text-sm mb-4">
        Istorija uplata koje ste vi primili (za vaše klijente).
      </p>
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Datum i vreme</th>
              <th className="text-left p-3 font-medium text-stone-600">Klijent</th>
              <th className="text-right p-3 font-medium text-stone-600">Iznos</th>
              <th className="text-right p-3 font-medium text-stone-600">Popust %</th>
              <th className="text-right p-3 font-medium text-stone-600">Br. časova</th>
              <th className="text-left p-3 font-medium text-stone-600">Vrsta</th>
              <th className="text-left p-3 font-medium text-stone-600">Napomena</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-stone-500">
                  Nema unetih uplata. Kliknite „Unesi uplatu”.
                </td>
              </tr>
            ) : (
              list.map((u) => (
                <tr key={u.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="p-3 text-stone-700">
                    {u.created_at
                      ? new Date(u.created_at).toLocaleString('sr-Latn-RS', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="p-3 font-medium text-stone-800">
                    {u.client ? `${u.client.ime} ${u.client.prezime}` : '—'}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {u.iznos != null ? `${Number(u.iznos).toLocaleString('sr-Latn-RS')} RSD` : '—'}
                  </td>
                  <td className="p-3 text-right">{u.popust_percent != null ? `${u.popust_percent}%` : '—'}</td>
                  <td className="p-3 text-right">{u.broj_casova ?? '—'}</td>
                  <td className="p-3 text-stone-600">{u.term_type?.naziv ?? '—'}</td>
                  <td className="p-3 text-stone-500 max-w-[180px] truncate" title={u.napomena ?? ''}>
                    {u.napomena ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4">
        <Link href="/dashboard" className="text-sm text-amber-700 hover:underline">← Nazad na kalendar</Link>
      </p>
    </div>
  );
}
