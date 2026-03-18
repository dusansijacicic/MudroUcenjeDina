import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import AdminClientForm from './AdminClientForm';
import { getStanjePoVrstamaZaKlijenta } from '@/app/admin/actions';
import type { Client } from '@/types/database';

export default async function AdminKlijentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const [{ data: client, error }, stanjePoVrstama] = await Promise.all([
    adminSupabase.from('clients').select('*, popust_percent').eq('id', clientId).single(),
    getStanjePoVrstamaZaKlijenta(clientId),
  ]);

  if (error || !client) notFound();

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-800 mb-2">
          Izmena klijenta – {client.ime} {client.prezime}
        </h1>
        <p className="text-stone-500 text-sm mb-6">
          Super admin izmena. Plaćeno časova po predavaču se vodi kroz Evidenciju uplata.
        </p>
        <AdminClientForm client={client as Client} redirectAfterSave="/admin/klijenti" />
      </div>

      {stanjePoVrstama.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Stanje po vrstama časova (svi predavači)</h2>
          <p className="text-xs text-stone-500 mb-3">Uplaćeno / održano / ostalo za ovog klijenta.</p>
          <ul className="space-y-2">
            {stanjePoVrstama.map((s) => (
              <li key={s.term_type_id ?? 'bez'} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-stone-800">{s.term_type_naziv}</span>
                <span className="text-stone-600">uplaćeno: <strong>{s.uplaceno}</strong></span>
                <span className="text-stone-600">održano: <strong>{s.odrzano}</strong></span>
                <span className="text-amber-700">ostalo: <strong>{s.ostalo}</strong></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4">
        <Link href="/admin/klijenti" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve klijente
        </Link>
      </p>
    </div>
  );
}
