import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes } from '@/app/admin/actions';
import PredavanjeForm from '../PredavanjeForm';

export default async function NoviTerminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; slot?: string }>;
}) {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const params = await searchParams;
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const slotIndex = Math.min(12, Math.max(0, parseInt(params.slot ?? '0', 10)));
  const slotLabel = TIME_SLOTS[slotIndex];

  const admin = createAdminClient();

  let term: { id: string } | null = null;
  const { data: existing } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', instructor.id)
    .eq('date', date)
    .eq('slot_index', slotIndex)
    .maybeSingle();
  term = existing;

  if (!term) {
    const { data: inserted, error } = await admin
      .from('terms')
      .insert({
        instructor_id: instructor.id,
        date,
        slot_index: slotIndex,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[termin/novi] terms insert failed', error.message);
      redirect('/dashboard?error=term');
    }
    term = inserted;
  }

  if (!term) {
    redirect('/dashboard');
  }

  const [predRes, maxCasova] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', term.id),
    getMaxCasovaPoTerminu(),
  ]);
  const currentCount = predRes.count ?? 0;

  const { data: allClients } = await admin
    .from('clients')
    .select('id, ime, prezime')
    .order('prezime')
    .order('ime');
  const clients: { id: string; ime: string; prezime: string }[] = (allClients ?? []).map((c) => ({
    id: c.id,
    ime: c.ime ?? '',
    prezime: c.prezime ?? '',
  }));

  const termTypes = await getTermTypes();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Novo predavanje – {date} {slotLabel}
      </h1>
      {clients.length === 0 && (
        <p className="mb-4 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-sm">
          Nemaš još nijednog klijenta. Prvo dodaj klijenta u <Link href="/dashboard/klijenti/novi" className="underline font-medium">Klijenti → Novi klijent</Link>, pa se vrati ovde.
        </p>
      )}
      <PredavanjeForm
        termId={term.id}
        termDate={date}
        slotLabel={slotLabel}
        clients={clients ?? []}
        termTypes={termTypes}
        maxCasova={maxCasova}
        currentCount={currentCount}
      />
    </div>
  );
}
