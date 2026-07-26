import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import ClientForm from '@/app/dashboard/klijenti/ClientForm';
import { getTermTypes, getPrograms } from '@/app/admin/actions';

export default async function AdminViewNoviKlijentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login?reason=no_session');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login?reason=not_authorized');

  const adminSupabase = createAdminClient();
  const { data: instructor } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime')
    .eq('id', id)
    .single();
  if (!instructor) notFound();

  const [termTypes, programs] = await Promise.all([getTermTypes(), getPrograms()]);
  const listHref = `/admin/view/${id}/klijenti`;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">
        Novi polaznik – {instructor.ime} {instructor.prezime}
      </h1>
      <p className="text-stone-500 text-sm mb-6">
        Dodajte klijenta (učenika) ovom instruktoru. Opciono unesite „Email za prijavu učenika” da učenik može da vidi svoje časove.
      </p>
      <ClientForm
        instructorId={instructor.id}
        termTypes={termTypes}
        programs={programs}
        redirectAfterSave={listHref}
        cancelLabel="Nazad na klijente"
      />
      <p className="mt-4">
        <Link href={listHref} className="text-sm text-amber-700 hover:underline">
          ← Nazad na listu klijenata
        </Link>
      </p>
    </div>
  );
}
