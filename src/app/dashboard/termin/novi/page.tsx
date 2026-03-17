import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import { TIME_SLOTS } from '@/lib/constants';
import PredavanjeForm from '../PredavanjeForm';

export default async function NoviTerminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; slot?: string }>;
}) {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const params = await searchParams;
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const slotIndex = Math.min(12, Math.max(0, parseInt(params.slot ?? '0', 10)));
  const slotLabel = TIME_SLOTS[slotIndex];

  let { data: term } = await supabase
    .from('terms')
    .select('id')
    .eq('instructor_id', instructor.id)
    .eq('date', date)
    .eq('slot_index', slotIndex)
    .single();

  if (!term) {
    const { data: inserted } = await supabase
      .from('terms')
      .insert({
        instructor_id: instructor.id,
        date: date,
        slot_index: slotIndex,
      })
      .select('id')
      .single();
    term = inserted;
  }

  if (!term) {
    redirect('/dashboard');
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, ime, prezime')
    .eq('instructor_id', instructor.id)
    .order('prezime');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Novo predavanje – {date} {slotLabel}
      </h1>
      <PredavanjeForm
        termId={term.id}
        termDate={date}
        slotLabel={slotLabel}
        clients={clients ?? []}
      />
    </div>
  );
}
