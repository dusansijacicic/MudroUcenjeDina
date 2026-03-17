import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
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

  const { data: clients } = await supabase
    .from('clients')
    .select('id, ime, prezime')
    .eq('instructor_id', instructor.id)
    .order('prezime');

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
      />
    </div>
  );
}
