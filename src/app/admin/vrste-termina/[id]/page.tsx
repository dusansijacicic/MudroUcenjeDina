import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import TermTypeEditForm from './TermTypeEditForm';

export default async function AdminVrstaTerminaEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: row, error } = await adminSupabase
    .from('term_types')
    .select('id, naziv, opis, cena_po_casu')
    .eq('id', id)
    .single();

  if (error || !row) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Izmena vrste termina</h1>
      <TermTypeEditForm
        id={row.id}
        initialNaziv={row.naziv ?? ''}
        initialOpis={row.opis ?? ''}
        initialCenaPoCasu={row.cena_po_casu != null ? String(row.cena_po_casu) : ''}
      />
      <p className="mt-4">
        <Link href="/admin/vrste-termina" className="text-sm text-amber-700 hover:underline">← Nazad na vrste termina</Link>
      </p>
    </div>
  );
}
