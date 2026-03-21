import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import TermCategoryEditForm from './TermCategoryEditForm';

export default async function AdminKategorijaTerminaEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: row, error } = await adminSupabase
    .from('term_categories')
    .select('id, naziv, opis, jedan_klijent_po_terminu')
    .eq('id', id)
    .single();

  if (error || !row) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Izmena kategorije termina</h1>
      <TermCategoryEditForm
        id={row.id}
        initialNaziv={row.naziv ?? ''}
        initialOpis={row.opis ?? ''}
        initialJedanKlijent={Boolean(row.jedan_klijent_po_terminu)}
      />
      <p className="mt-4">
        <Link href="/admin/kategorije-termina" className="text-sm text-amber-700 hover:underline">
          ← Nazad na kategorije termina
        </Link>
      </p>
    </div>
  );
}
