import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const { data: term } = await supabase
    .from('terms')
    .select('*')
    .eq('id', termId)
    .eq('instructor_id', instructor.id)
    .single();

  if (!term) notFound();

  const [{ count: currentCount }, maxCasova] = await Promise.all([
    supabase.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId).then((r) => ({ count: r.count ?? 0 })),
    getMaxCasovaPoTerminu(),
  ]);

  let clients: { id: string; ime: string; prezime: string }[] = [];
  try {
    const admin = createAdminClient();
    const { data: linkRows } = await admin
      .from('instructor_clients')
      .select('client:clients(id, ime, prezime)')
      .eq('instructor_id', instructor.id);
    clients = (linkRows ?? []).map((r) => r.client).filter(Boolean) as unknown as { id: string; ime: string; prezime: string }[];
    clients.sort((a, b) => (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? ''));
  } catch (e) {
    console.error('[novi predavanje page] load clients failed', e);
  }

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
