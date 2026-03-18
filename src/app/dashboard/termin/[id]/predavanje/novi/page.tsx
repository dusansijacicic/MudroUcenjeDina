import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import { getTermTypes, getClassrooms } from '@/app/admin/actions';
import PredavanjeForm from '../../../PredavanjeForm';
import { TIME_SLOTS } from '@/lib/constants';

export default async function NoviPredavanjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: termId } = await params;
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: term } = await admin
    .from('terms')
    .select('*, classroom_id')
    .eq('id', termId)
    .eq('instructor_id', instructor.id)
    .single();

  if (!term) notFound();

  const [predRes, maxCasova, termTypes, classrooms] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId),
    getMaxCasovaPoTerminu(),
    getTermTypes(),
    getClassrooms(),
  ]);
  const currentCount = predRes.count ?? 0;

  const { data: allClients } = await admin.from('clients').select('id, ime, prezime').order('prezime').order('ime');
  const clients: { id: string; ime: string; prezime: string }[] = (allClients ?? []).map((c) => ({
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
      <PredavanjeForm
        termId={termId}
        termDate={term.date}
        slotLabel={slotLabel}
        clients={clients ?? []}
        termTypes={termTypes}
        maxCasova={maxCasova}
        currentCount={currentCount}
        classrooms={classrooms}
        initialClassroomId={termWithClassroom.classroom_id ?? null}
      />
    </div>
  );
}
