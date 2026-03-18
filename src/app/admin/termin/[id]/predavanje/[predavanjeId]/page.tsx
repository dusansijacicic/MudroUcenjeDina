import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes } from '@/app/admin/actions';
import AdminPredavanjeForm from '@/app/admin/termin/AdminPredavanjeForm';

export default async function AdminEditPredavanjePage({
  params,
}: {
  params: Promise<{ id: string; predavanjeId: string }>;
}) {
  const { id: termId, predavanjeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!adminRow) redirect('/login');

  const admin = createAdminClient();
  const { data: term } = await admin.from('terms').select('*').eq('id', termId).single();
  if (!term) notFound();

  const { data: predavanje } = await admin
    .from('predavanja')
    .select('*')
    .eq('id', predavanjeId)
    .eq('term_id', termId)
    .single();
  if (!predavanje) notFound();

  const { data: allClients } = await admin.from('clients').select('id, ime, prezime').order('prezime').order('ime');
  const clients = (allClients ?? []).map((c) => ({
    id: c.id,
    ime: c.ime ?? '',
    prezime: c.prezime ?? '',
  }));

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const termTypes = await getTermTypes();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Izmena predavanja – {term.date} {slotLabel}
      </h1>
      <AdminPredavanjeForm
        termId={termId}
        termDate={term.date}
        slotLabel={slotLabel}
        clients={clients}
        termTypes={termTypes}
        predavanje={{
          id: predavanje.id,
          client_id: predavanje.client_id,
          odrzano: predavanje.odrzano,
          placeno: predavanje.placeno,
          komentar: predavanje.komentar,
          term_type_id: (predavanje as { term_type_id?: string | null }).term_type_id,
        }}
      />
      <p className="mt-4">
        <Link href={`/admin/termin/${termId}`} className="text-sm text-amber-700 hover:underline">← Nazad na termin</Link>
      </p>
    </div>
  );
}
