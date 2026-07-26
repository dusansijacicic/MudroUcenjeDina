import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import AdminPredavacEditForm from './AdminPredavacEditForm';

export default async function AdminPredavacEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const admin = createAdminClient();
  const { data: instructor } = await admin
    .from('instructors')
    .select('id, ime, prezime, telefon, color')
    .eq('id', id)
    .single();

  if (!instructor) notFound();

  return (
    <div className="max-w-lg">
      <Link href="/admin/predavaci" className="text-sm text-stone-500 hover:text-amber-600 inline-block mb-4">
        ← Svi instruktori
      </Link>
      <h1 className="text-xl font-semibold text-stone-800 mb-1">
        Izmena: {instructor.ime} {instructor.prezime}
      </h1>
      <p className="text-stone-500 text-sm mb-6">Ime, telefon i boja u kalendaru.</p>
      <AdminPredavacEditForm instructor={instructor} />
    </div>
  );
}
