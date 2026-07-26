import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import ProgramEditForm from './ProgramEditForm';

export default async function AdminProgramEditPage({
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
    .from('programi')
    .select('id, naziv, opis')
    .eq('id', id)
    .single();

  if (error || !row) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Izmena programa</h1>
      <ProgramEditForm id={row.id} initialNaziv={row.naziv ?? ''} initialOpis={row.opis ?? ''} />
      <p className="mt-4">
        <Link href="/admin/programi" className="text-sm text-amber-700 hover:underline">
          ← Nazad na programe
        </Link>
      </p>
    </div>
  );
}
