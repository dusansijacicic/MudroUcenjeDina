import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getClassrooms } from '@/app/admin/actions';
import AdminPredavanjeForm from '@/app/admin/termin/AdminPredavanjeForm';

export default async function AdminNoviPredavanjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: termId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!adminRow) redirect('/login');

  const admin = createAdminClient();
  const { data: term } = await admin.from('terms').select('*, classroom_id').eq('id', termId).single();
  if (!term) notFound();

  const [predRes, maxCasova, termTypes, classrooms] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId),
    getMaxCasovaPoTerminu(),
    getTermTypes(),
    getClassrooms(),
  ]);
  const currentCount = predRes.count ?? 0;

  const { data: allClients } = await admin.from('clients').select('id, ime, prezime').order('prezime').order('ime');
  const clients = (allClients ?? []).map((c) => ({
    id: c.id,
    ime: c.ime ?? '',
    prezime: c.prezime ?? '',
  }));

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const termWithClassroom = term as { classroom_id?: string | null };
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Novo predavanje – {term.date} {slotLabel}
      </h1>
      <AdminPredavanjeForm
        termId={termId}
        termDate={term.date}
        slotLabel={slotLabel}
        clients={clients}
        termTypes={termTypes}
        maxCasova={maxCasova}
        currentCount={currentCount}
        classrooms={classrooms}
        initialClassroomId={termWithClassroom.classroom_id ?? null}
      />
      <p className="mt-4">
        <Link href={`/admin/termin/${termId}`} className="text-sm text-amber-700 hover:underline">← Nazad na termin</Link>
      </p>
    </div>
  );
}
