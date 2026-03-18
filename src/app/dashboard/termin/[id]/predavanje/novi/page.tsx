import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
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
    .select('*')
    .eq('id', termId)
    .eq('instructor_id', instructor.id)
    .single();

  if (!term) notFound();

  const [predRes, maxCasova] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId),
    getMaxCasovaPoTerminu(),
  ]);
  const currentCount = predRes.count ?? 0;

  const { data: linkRows } = await admin
    .from('instructor_clients')
    .select('client:clients(id, ime, prezime)')
    .eq('instructor_id', instructor.id);
  const clients = (linkRows ?? []).map((r) => r.client).filter(Boolean) as unknown as { id: string; ime: string; prezime: string }[];
  clients.sort((a, b) => (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? ''));

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';

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
        maxCasova={maxCasova}
        currentCount={currentCount}
      />
    </div>
  );
}
