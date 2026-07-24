import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import ClientForm from '@/app/dashboard/klijenti/ClientForm';
import { getTermTypes, getClientTermTypeStatuses } from '@/app/admin/actions';
import type { Client } from '@/types/database';

export default async function AdminViewKlijentEditPage({
  params,
}: {
  params: Promise<{ id: string; clientId: string }>;
}) {
  const { id: instructorId, clientId } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: instructor } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime')
    .eq('id', instructorId)
    .single();
  if (!instructor) notFound();

  const { data: link } = await adminSupabase
    .from('instructor_clients')
    .select('placeno_casova, client:clients(*)')
    .eq('instructor_id', instructorId)
    .eq('client_id', clientId)
    .single();

  if (!link?.client) notFound();
  const client = { ...(link.client as unknown as Client), placeno_casova: link.placeno_casova };
  const listHref = `/admin/view/${instructorId}/klijenti`;

  const [termTypes, initialProgramStatuses] = await Promise.all([
    getTermTypes(),
    getClientTermTypeStatuses(clientId),
  ]);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">
        Izmena klijenta – {client.ime} {client.prezime}
      </h1>
      <p className="text-stone-500 text-sm mb-6">
        Instruktor: {instructor.ime} {instructor.prezime}
      </p>
      <ClientForm
        instructorId={instructor.id}
        client={client}
        termTypes={termTypes}
        initialProgramStatuses={initialProgramStatuses}
        redirectAfterSave={listHref}
        cancelLabel="Nazad na listu"
      />
      <p className="mt-4">
        <Link href={listHref} className="text-sm text-amber-700 hover:underline">
          ← Nazad na klijente ovog instruktora
        </Link>
      </p>
    </div>
  );
}
