import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import ClientRow from './ClientRow';
import type { Client } from '@/types/database';

/** Svi klijenti (kao admin) – predavač vidi sve, „Plaćeno kod vas” iz veze instructor_clients. */
export default async function KlijentiPage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  type Row = { client: Client & { placeno_casova?: number }; placeno_casova: number };
  let rows: Row[] = [];
  try {
    const admin = createAdminClient();
    const [{ data: clients }, { data: icRows }] = await Promise.all([
      admin.from('clients').select('*').order('prezime').order('ime'),
      admin.from('instructor_clients').select('client_id, placeno_casova').eq('instructor_id', instructor.id),
    ]);
    const placenoMap = new Map((icRows ?? []).map((r) => [r.client_id, r.placeno_casova ?? 0]));
    rows = (clients ?? []).map((c) => ({
      client: { ...c, placeno_casova: placenoMap.get(c.id) ?? 0 } as Client & { placeno_casova?: number },
      placeno_casova: placenoMap.get(c.id) ?? 0,
    }));
  } catch (e) {
    console.error('[klijenti page] load failed', e);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Klijenti</h1>
        <Link
          href="/dashboard/klijenti/novi"
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Novi klijent
        </Link>
      </div>
      <p className="text-stone-500 text-sm mb-4">
        Svi klijenti u školi. „Plaćeno časova (kod vas)” je broj unapred plaćenih kod vas (veza predavač–klijent).
      </p>
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište</th>
              <th className="text-left p-3 font-medium text-stone-600">Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Škola</th>
              <th className="text-left p-3 font-medium text-stone-600">Roditelj / kontakt</th>
              <th className="text-right p-3 font-medium text-stone-600">Plaćeno časova (kod vas)</th>
              <th className="w-20 p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client }) => (
              <ClientRow key={client.id} client={client} />
            ))}
          </tbody>
        </table>
        {(rows.length === 0) && (
          <div className="p-8 text-center text-stone-500">
            Nema klijenata u bazi. Dodajte prvog preko „Novi klijent”.
          </div>
        )}
      </div>
    </div>
  );
}
