import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDashboardInstructor } from '@/lib/dashboard';
import ClientRow from './ClientRow';

export default async function KlijentiPage() {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const { data: links } = await supabase
    .from('instructor_clients')
    .select('client_id, placeno_casova, client:clients(*)')
    .eq('instructor_id', instructor.id);

  type Row = { client: import('@/types/database').Client & { placeno_casova?: number }; placeno_casova: number };
  const rows: Row[] = (links ?? [])
    .map((l) => ({
      client: { ...(l.client as unknown as import('@/types/database').Client), placeno_casova: l.placeno_casova } as Row['client'],
      placeno_casova: l.placeno_casova,
    }))
    .sort((a, b) => {
      const p = (a.client.prezime ?? '').localeCompare(b.client.prezime ?? '');
      return p !== 0 ? p : (a.client.ime ?? '').localeCompare(b.client.ime ?? '');
    });

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
        Isti klijent (dete) može biti vezan za više predavača. Ovde su klijenti povezani sa vama; „Plaćeno časova” je za vas.
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
            Nema klijenata. Dodajte prvog preko „Novi klijent”.
          </div>
        )}
      </div>
    </div>
  );
}
