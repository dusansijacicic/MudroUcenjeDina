import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getStanjePoVrstamaZaKlijenta } from '@/app/admin/actions';
import ClientRow from './ClientRow';
import type { Client } from '@/types/database';

export type StanjeVrsta = { term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number };

/** Svi klijenti – predavač vidi sve. Za svaki tip časa gde je plaćen makar jedan: plaćeno / održano / preostalo. */
export default async function KlijentiPage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  type Row = { client: Client & { placeno_casova?: number }; placeno_casova: number; stanjePoVrstama: StanjeVrsta[] };
  let rows: Row[] = [];
  try {
    const admin = createAdminClient();
    const [{ data: clients }, { data: icRows }] = await Promise.all([
      admin.from('clients').select('*').order('prezime').order('ime'),
      admin.from('instructor_clients').select('client_id, placeno_casova').eq('instructor_id', instructor.id),
    ]);
    const placenoMap = new Map((icRows ?? []).map((r) => [r.client_id, r.placeno_casova ?? 0]));
    const stanjeByClient = await Promise.all(
      (clients ?? []).map(async (c) => {
        const stanje = await getStanjePoVrstamaZaKlijenta(c.id);
        const samoPlaceni = stanje.filter((s) => s.uplaceno >= 1).map((s) => ({
          term_type_naziv: s.term_type_naziv,
          uplaceno: s.uplaceno,
          odrzano: s.odrzano,
          ostalo: s.ostalo,
        }));
        return { clientId: c.id, stanjePoVrstama: samoPlaceni };
      })
    );
    const stanjeMap = new Map(stanjeByClient.map((s) => [s.clientId, s.stanjePoVrstama]));
    rows = (clients ?? []).map((c) => ({
      client: { ...c, placeno_casova: placenoMap.get(c.id) ?? 0 } as Client & { placeno_casova?: number },
      placeno_casova: placenoMap.get(c.id) ?? 0,
      stanjePoVrstama: stanjeMap.get(c.id) ?? [],
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
        Svi klijenti. Za svaki tip časa gde je plaćen makar jedan: plaćeno / održano / preostalo.
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
              <th className="text-left p-3 font-medium text-stone-600">Po vrstama (plaćeno / održano / preostalo)</th>
              <th className="text-right p-3 font-medium text-stone-600">Plaćeno (kod vas)</th>
              <th className="w-20 p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client, stanjePoVrstama }) => (
              <ClientRow key={client.id} client={client} stanjePoVrstama={stanjePoVrstama} />
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
