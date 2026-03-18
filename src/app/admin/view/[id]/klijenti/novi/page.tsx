import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import ClientForm from '@/app/dashboard/klijenti/ClientForm';

export default async function AdminViewNoviKlijentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?reason=no_session');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login?reason=not_authorized');

  const adminSupabase = createAdminClient();
  const { data: instructor } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime')
    .eq('id', id)
    .single();
  if (!instructor) notFound();

  const listHref = `/admin/view/${id}/klijenti`;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">
        Novi polaznik – {instructor.ime} {instructor.prezime}
      </h1>
      <p className="text-stone-500 text-sm mb-6">
        Dodajte klijenta (učenika) ovom predavaču. Opciono unesite „Email za prijavu učenika” da učenik može da vidi svoje časove.
      </p>
      <ClientForm
        instructorId={instructor.id}
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
