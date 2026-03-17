import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ClientRow from './ClientRow';

export default async function KlijentiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!instructor) redirect('/login');

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('instructor_id', instructor.id)
    .order('prezime')
    .order('ime');

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
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište</th>
              <th className="text-left p-3 font-medium text-stone-600">Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Škola</th>
              <th className="text-left p-3 font-medium text-stone-600">Roditelj / kontakt</th>
              <th className="text-right p-3 font-medium text-stone-600">Plaćeno časova</th>
              <th className="w-20 p-3" />
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((client) => (
              <ClientRow key={client.id} client={client} />
            ))}
          </tbody>
        </table>
        {(!clients || clients.length === 0) && (
          <div className="p-8 text-center text-stone-500">
            Nema unetih klijenata. Dodajte prvog preko „Novi klijent”.
          </div>
        )}
      </div>
    </div>
  );
}
