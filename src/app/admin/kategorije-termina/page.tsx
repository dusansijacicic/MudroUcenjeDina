import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import TermCategoriesForm from './TermCategoriesForm';
import DeleteTermCategoryButton from './DeleteTermCategoryButton';

export default async function AdminKategorijeTerminaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: rows } = await adminSupabase
    .from('term_categories')
    .select('id, naziv, opis, jedan_klijent_po_terminu')
    .order('naziv');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Kategorije termina</h1>
      <p className="text-stone-500 text-sm mb-6">
        Određuju da li u terminu može biti samo jedno dete ili više (grupa). Menjaju se ovde; instruktori biraju kategoriju pri radu sa
        terminom.
      </p>
      <TermCategoriesForm />
      <div className="mt-6 rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(rows ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">Nema kategorija. Dodajte prvu.</div>
        ) : (
          (rows ?? []).map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-stone-800">{r.naziv}</p>
                {r.opis && <p className="text-sm text-stone-600 mt-0.5">{r.opis}</p>}
                <p className="text-sm text-amber-700 mt-0.5">
                  {r.jedan_klijent_po_terminu ? 'Jedno dete u terminu' : 'Grupa (više radionica do limita)'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/admin/kategorije-termina/${r.id}`} className="text-sm text-amber-600 hover:underline">
                  Izmeni
                </Link>
                <DeleteTermCategoryButton id={r.id} />
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">
          ← Nazad na admin
        </Link>
      </p>
    </div>
  );
}
