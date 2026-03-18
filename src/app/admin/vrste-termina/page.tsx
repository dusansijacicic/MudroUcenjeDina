import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import TermTypesForm from './TermTypesForm';
import DeleteTermTypeButton from './DeleteTermTypeButton';

export default async function AdminVrsteTerminaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: rows } = await adminSupabase.from('term_types').select('id, naziv, opis').order('naziv');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Vrste termina</h1>
      <p className="text-stone-500 text-sm mb-6">
        Dodajte vrste termina (npr. individualni, grupa). One se mogu dodeliti predavanjima.
      </p>
      <TermTypesForm />
      <div className="mt-6 rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(rows ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">Nema vrsta. Dodajte prvu.</div>
        ) : (
          (rows ?? []).map((r) => (
            <TermTypeRow key={r.id} id={r.id} naziv={r.naziv ?? ''} opis={r.opis} />
          ))
        )}
      </div>
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}

function TermTypeRow({ id, naziv, opis }: { id: string; naziv: string; opis: string | null }) {
  return (
    <div className="p-4 flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-stone-800">{naziv}</p>
        {opis && <p className="text-sm text-stone-600 mt-0.5">{opis}</p>}
      </div>
      <DeleteTermTypeButton id={id} />
    </div>
  );
}

