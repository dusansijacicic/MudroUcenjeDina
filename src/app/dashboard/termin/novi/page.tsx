import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
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

  const [maxCasova, { count: currentCount }] = await Promise.all([
    getMaxCasovaPoTerminu(),
    supabase.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', term.id).then((r) => ({ count: r.count ?? 0 })),
  ]);

  const { data: linkRows } = await supabase
    .from('instructor_clients')
    .select('client:clients(id, ime, prezime)')
    .eq('instructor_id', instructor.id);
  const clients = (linkRows ?? []).map((r) => r.client).filter(Boolean) as unknown as { id: string; ime: string; prezime: string }[];
  clients.sort((a, b) => (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? ''));

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
        maxCasova={maxCasova}
        currentCount={currentCount}
      />
    </div>
  );
}
