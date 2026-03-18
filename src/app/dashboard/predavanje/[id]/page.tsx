import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import PredavanjeForm from '@/app/dashboard/termin/PredavanjeForm';
import { TIME_SLOTS } from '@/lib/constants';

export default async function EditPredavanjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

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

  const { data: linkRows } = await supabase
    .from('instructor_clients')
    .select('client:clients(id, ime, prezime)')
    .eq('instructor_id', instructor.id);
  const clients = (linkRows ?? []).map((r) => r.client).filter(Boolean) as unknown as { id: string; ime: string; prezime: string }[];
  clients.sort((a, b) => (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? ''));

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
