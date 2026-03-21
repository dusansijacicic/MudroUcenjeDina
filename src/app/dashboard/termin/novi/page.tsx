import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu, getMaxTerminaPoSlotu } from '@/lib/settings';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getClassrooms, getTermCategories } from '@/app/admin/actions';
import { SEEDED_TERM_CATEGORY_INDIVIDUAL_ID, jedanKlijentIzJoina } from '@/lib/term-categories';
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

  let term: { id: string; classroom_id?: string | null } | null = null;
  const { data: existing } = await admin
    .from('terms')
    .select('id, classroom_id, term_category_id, napomena')
    .eq('instructor_id', instructor.id)
    .eq('date', date)
    .eq('slot_index', slotIndex)
    .maybeSingle();
  term = existing;

  if (!term) {
    const [maxTerminaPoSlotu, { count: termCount }] = await Promise.all([
      getMaxTerminaPoSlotu(),
      admin.from('terms').select('*', { count: 'exact', head: true }).eq('date', date).eq('slot_index', slotIndex),
    ]);
    if ((termCount ?? 0) >= maxTerminaPoSlotu) {
      redirect(`/dashboard?error=slot_pun&message=${encodeURIComponent(`U ovom terminu je već ${maxTerminaPoSlotu} termina (maksimum). Izaberite drugi datum ili vreme.`)}`);
    }
    const { data: inserted, error } = await admin
      .from('terms')
      .insert({
        instructor_id: instructor.id,
        date,
        slot_index: slotIndex,
        term_category_id: SEEDED_TERM_CATEGORY_INDIVIDUAL_ID,
      })
      .select('id, classroom_id, term_category_id, napomena')
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

  const [predRes, maxCasova, termsInSlotRes, termWithCatRes] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', term.id),
    getMaxCasovaPoTerminu(),
    admin.from('terms').select('classroom_id').eq('date', date).eq('slot_index', slotIndex).neq('id', term.id),
    admin.from('terms').select('term_categories(jedan_klijent_po_terminu)').eq('id', term.id).single(),
  ]);
  const currentCount = predRes.count ?? 0;
  const tc = termWithCatRes.data?.term_categories as
    | { jedan_klijent_po_terminu?: boolean }
    | { jedan_klijent_po_terminu?: boolean }[]
    | null;
  const effectiveMax = jedanKlijentIzJoina(tc) ? 1 : maxCasova;
  if (currentCount >= effectiveMax) {
    redirect(`/dashboard?error=max_predavanja&message=${encodeURIComponent(`Ovaj termin već ima maksimalan broj radionica (${effectiveMax}). Ne možete dodati novu radionicu.`)}`);
  }
  const termsInSlot = termsInSlotRes.data ?? [];
  const takenClassroomIds = termsInSlot.map((t: { classroom_id: string | null }) => t.classroom_id).filter((id: string | null): id is string => id != null);

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

  const [termTypes, termCategories, classrooms] = await Promise.all([
    getTermTypes(),
    getTermCategories(),
    getClassrooms(),
  ]);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Nova radionica – {date} {slotLabel}
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
        termCategories={termCategories}
        maxCasova={maxCasova}
        currentCount={currentCount}
        classrooms={classrooms}
        initialClassroomId={term.classroom_id ?? null}
        takenClassroomIds={takenClassroomIds}
        initialTermCategoryId={(term as { term_category_id?: string }).term_category_id ?? SEEDED_TERM_CATEGORY_INDIVIDUAL_ID}
        initialTermNapomena={(term as { napomena?: string | null }).napomena ?? null}
      />
    </div>
  );
}
