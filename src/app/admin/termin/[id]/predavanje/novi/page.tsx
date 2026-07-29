import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getClassrooms, getStanjePoVrstamaZaKlijenteBatch, getAllClientsCompletedProgramIds, type StanjeVrstaRow } from '@/app/admin/actions';
import AdminPredavanjeForm from '@/app/admin/termin/AdminPredavanjeForm';

export default async function AdminNoviPredavanjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: termId } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const admin = createAdminClient();
  const { data: term } = await admin.from('terms').select('*, classroom_id').eq('id', termId).single();
  if (!term) notFound();

  const [predRes, maxCasova, termTypes, classrooms, termsInSlotRes] = await Promise.all([
    admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId),
    getMaxCasovaPoTerminu(),
    getTermTypes(),
    getClassrooms(),
    admin.from('terms').select('classroom_id').eq('date', term.date).eq('slot_index', term.slot_index).neq('id', termId),
  ]);
  const currentCount = predRes.count ?? 0;
  const takenClassroomIds = (termsInSlotRes.data ?? [])
    .map((t: { classroom_id: string | null }) => t.classroom_id)
    .filter((id: string | null): id is string => id != null);

  const { data: allClients } = await admin.from('clients').select('id, ime, prezime, godiste, datum_testiranja').order('prezime').order('ime');
  const clients = (allClients ?? []).map((c) => ({
    id: c.id,
    ime: c.ime ?? '',
    prezime: c.prezime ?? '',
    godiste: c.godiste ?? null,
    datumTestiranja: c.datum_testiranja ?? null,
  }));

  const instructorId = (term as { instructor_id?: string }).instructor_id;
  const [stanjeMap, completedMap] = await Promise.all([
    instructorId
      ? getStanjePoVrstamaZaKlijenteBatch(clients.map((c) => c.id), instructorId)
      : Promise.resolve(new Map<string, StanjeVrstaRow[]>()),
    getAllClientsCompletedProgramIds(),
  ]);
  const clientStanjeList = clients.map((c) => ({ clientId: c.id, stanje: stanjeMap.get(c.id) ?? [] }));
  const completedProgramIdsByClient: Record<string, string[]> = {};
  for (const [clientId, set] of completedMap) completedProgramIdsByClient[clientId] = [...set];

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const termWithClassroom = term as { classroom_id?: string | null };
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Nova radionica – {term.date} {slotLabel}
      </h1>
      <AdminPredavanjeForm
        termId={termId}
        termDate={term.date}
        slotIndex={term.slot_index}
        slotLabel={slotLabel}
        clients={clients}
        termTypes={termTypes}
        maxCasova={maxCasova}
        currentCount={currentCount}
        classrooms={classrooms}
        initialClassroomId={termWithClassroom.classroom_id ?? null}
        takenClassroomIds={takenClassroomIds}
        clientStanjeList={clientStanjeList}
        completedProgramIdsByClient={completedProgramIdsByClient}
      />
      <p className="mt-4">
        <Link href={`/admin/termin/${termId}`} className="text-sm text-amber-700 hover:underline">← Nazad na termin</Link>
      </p>
    </div>
  );
}
