import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import { getTermTypes, getClassrooms, getStanjePoVrstamaZaKlijenta, getTermCategories } from '@/app/admin/actions';
import PredavanjeForm from '../../../PredavanjeForm';
import { TIME_SLOTS } from '@/lib/constants';
import { jedanKlijentIzJoina, SEEDED_TERM_CATEGORY_INDIVIDUAL_ID } from '@/lib/term-categories';

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
    .select('*, classroom_id, term_category_id, napomena')
    .eq('id', termId)
    .eq('instructor_id', instructor.id)
    .single();

  if (!term) notFound();

  const [predRes, maxCasova, termTypes, termCategories, classrooms, termsInSlotRes, termWithCatRes] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId),
    getMaxCasovaPoTerminu(),
    getTermTypes(),
    getTermCategories(),
    getClassrooms(),
    admin.from('terms').select('classroom_id').eq('date', term.date).eq('slot_index', term.slot_index).neq('id', termId),
    admin.from('terms').select('term_categories(jedan_klijent_po_terminu)').eq('id', termId).single(),
  ]);
  const currentCount = predRes.count ?? 0;
  const tc = termWithCatRes.data?.term_categories as
    | { jedan_klijent_po_terminu?: boolean }
    | { jedan_klijent_po_terminu?: boolean }[]
    | null;
  const effectiveMax = jedanKlijentIzJoina(tc) ? 1 : maxCasova;
  if (currentCount >= effectiveMax) {
    redirect(`/dashboard/termin/${termId}?error=max_predavanja&message=${encodeURIComponent(`Ovaj termin već ima maksimalan broj radionica (${effectiveMax}).`)}`);
  }
  const termsInSlot = termsInSlotRes.data ?? [];
  const takenClassroomIds = termsInSlot.map((t: { classroom_id: string | null }) => t.classroom_id).filter((id: string | null): id is string => id != null);

  const { data: allClients } = await admin.from('clients').select('id, ime, prezime').order('prezime').order('ime');
  const clients: { id: string; ime: string; prezime: string }[] = (allClients ?? []).map((c) => ({
    id: c.id,
    ime: c.ime ?? '',
    prezime: c.prezime ?? '',
  }));

  const clientStanjeList = await Promise.all(
    clients.map(async (c) => ({ clientId: c.id, stanje: await getStanjePoVrstamaZaKlijenta(c.id, instructor.id) }))
  );

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const termWithClassroom = term as { classroom_id?: string | null };
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Nova radionica – {term.date} {slotLabel}
      </h1>
      <PredavanjeForm
        termId={termId}
        termDate={term.date}
        slotLabel={slotLabel}
        clients={clients ?? []}
        termTypes={termTypes}
        termCategories={termCategories}
        maxCasova={maxCasova}
        currentCount={currentCount}
        classrooms={classrooms}
        initialClassroomId={termWithClassroom.classroom_id ?? null}
        takenClassroomIds={takenClassroomIds}
        clientStanjeList={clientStanjeList}
        initialTermCategoryId={(term as { term_category_id?: string }).term_category_id ?? SEEDED_TERM_CATEGORY_INDIVIDUAL_ID}
        initialTermNapomena={(term as { napomena?: string | null }).napomena ?? null}
      />
    </div>
  );
}
