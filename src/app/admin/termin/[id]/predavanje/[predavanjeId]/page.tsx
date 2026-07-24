import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getClassrooms, getStanjePoVrstamaZaKlijenteBatch, getTermCategories, getAdminInstructorsList, type StanjeVrstaRow } from '@/app/admin/actions';
import AdminPredavanjeForm from '@/app/admin/termin/AdminPredavanjeForm';
import { SEEDED_TERM_CATEGORY_INDIVIDUAL_ID } from '@/lib/term-categories';

export default async function AdminEditPredavanjePage({
  params,
}: {
  params: Promise<{ id: string; predavanjeId: string }>;
}) {
  const { id: termId, predavanjeId } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const admin = createAdminClient();
  const { data: term } = await admin
    .from('terms')
    .select('*, classroom_id, term_category_id, napomena')
    .eq('id', termId)
    .single();
  if (!term) notFound();

  const { data: predavanje } = await admin
    .from('predavanja')
    .select('*')
    .eq('id', predavanjeId)
    .eq('term_id', termId)
    .single();
  if (!predavanje) notFound();

  const [termTypes, termCategoriesAll, classrooms, instructors] = await Promise.all([
    getTermTypes(),
    getTermCategories(),
    getClassrooms(),
    getAdminInstructorsList(),
  ]);
  const termCategories = termCategoriesAll.filter((c) => !c.is_testing);

  const { data: allClients } = await admin
    .from('clients')
    .select('id, ime, prezime')
    .order('ime')
    .order('prezime');
  const clients = (allClients ?? []).map((c) => ({
    id: c.id,
    ime: c.ime ?? '',
    prezime: c.prezime ?? '',
  }));

  const instructorId = (term as { instructor_id?: string }).instructor_id ?? '';
  const stanjeMap = instructorId
    ? await getStanjePoVrstamaZaKlijenteBatch(clients.map((c) => c.id), instructorId)
    : new Map<string, StanjeVrstaRow[]>();
  const clientStanjeList = clients.map((c) => ({ clientId: c.id, stanje: stanjeMap.get(c.id) ?? [] }));

  const termsInSlot = await admin
    .from('terms')
    .select('classroom_id')
    .eq('date', term.date)
    .eq('slot_index', term.slot_index)
    .neq('id', termId);
  const takenClassroomIds = (termsInSlot.data ?? [])
    .map((t: { classroom_id: string | null }) => t.classroom_id)
    .filter((id: string | null): id is string => id != null);

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const termWithClassroom = term as { classroom_id?: string | null };

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Izmena radionice – {term.date} {slotLabel}
      </h1>
      <AdminPredavanjeForm
        termId={termId}
        termDate={term.date}
        slotIndex={term.slot_index}
        slotLabel={slotLabel}
        clients={clients}
        termTypes={termTypes}
        termCategories={termCategories}
        initialTermCategoryId={(term as { term_category_id?: string }).term_category_id ?? SEEDED_TERM_CATEGORY_INDIVIDUAL_ID}
        initialTermNapomena={(term as { napomena?: string | null }).napomena ?? null}
        classrooms={classrooms}
        initialClassroomId={termWithClassroom.classroom_id ?? null}
        takenClassroomIds={takenClassroomIds}
        clientStanjeList={clientStanjeList}
        instructors={instructors}
        initialInstructorId={instructorId}
        predavanje={{
          id: predavanje.id,
          client_id: predavanje.client_id,
          odrzano: predavanje.odrzano,
          placeno: predavanje.placeno,
          komentar: predavanje.komentar,
          term_type_id: (predavanje as { term_type_id?: string | null }).term_type_id,
        }}
      />
      <p className="mt-4">
        <Link href={`/admin/termin/${termId}`} className="text-sm text-amber-700 hover:underline">
          ← Nazad na termin
        </Link>
      </p>
    </div>
  );
}
