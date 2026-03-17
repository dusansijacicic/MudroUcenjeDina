import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import PredavanjeForm from '@/app/dashboard/termin/PredavanjeForm';
import { TIME_SLOTS } from '@/lib/constants';

export default async function EditPredavanjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!instructor) redirect('/login');

  const { data: predavanje } = await supabase
    .from('predavanja')
    .select('*, term:terms(*)')
    .eq('id', id)
    .single();

  if (!predavanje || (predavanje.term as { instructor_id?: string })?.instructor_id !== instructor.id) {
    notFound();
  }

  const term = predavanje.term as { id: string; date: string; slot_index: number };
  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';

  const { data: clients } = await supabase
    .from('clients')
    .select('id, ime, prezime')
    .eq('instructor_id', instructor.id)
    .order('prezime');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Izmena predavanja
      </h1>
      <PredavanjeForm
        termId={term.id}
        termDate={term.date}
        slotLabel={slotLabel}
        clients={clients ?? []}
        predavanje={predavanje}
      />
    </div>
  );
}
