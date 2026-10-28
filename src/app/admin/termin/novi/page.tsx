import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminTerminForm from './AdminTerminForm';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getTakenForSlot, getTermCategories, getAllClientsCompletedProgramIds } from '@/app/admin/actions';
import { getMaxTerminaPoSlotu } from '@/lib/settings';

export default async function AdminTerminNoviPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; slot?: string; cat?: string }>;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const params = await searchParams;
  const dateFromUrl = params.date?.slice(0, 10);
  const slotFromUrl = params.slot != null ? Math.min(15, Math.max(0, parseInt(params.slot, 10) || 0)) : undefined;

  const adminSupabase = createAdminClient();
  const { data: instructors } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime')
    .eq('aktivan', true)
    .order('prezime')
    .order('ime');
  const { data: clients } = await adminSupabase
    .from('clients')
    .select('id, ime, prezime, godiste, datum_testiranja')
    .order('prezime')
    .order('ime');
  const { data: classrooms } = await adminSupabase
    .from('classrooms')
    .select('id, naziv')
    .order('naziv');
  const [termTypes, termCategories, completedMap] = await Promise.all([
    getTermTypes(),
    getTermCategories(),
    getAllClientsCompletedProgramIds(),
  ]);
  const completedProgramIdsByClient: Record<string, string[]> = {};
  for (const [cid, set] of completedMap) completedProgramIdsByClient[cid] = [...set];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = dateFromUrl ?? tomorrow.toISOString().slice(0, 10);
  const defaultSlot = slotFromUrl ?? 0;

  const [{ takenInstructorIds, takenClassroomIds }, maxTerminaPoSlotu] = await Promise.all([
    getTakenForSlot(defaultDate, defaultSlot),
    getMaxTerminaPoSlotu(),
  ]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Zakaži termin</h1>
      <AdminTerminForm
        instructors={(instructors ?? []) as { id: string; ime: string; prezime: string }[]}
        clients={(clients ?? []).map((c) => ({
          id: c.id,
          ime: c.ime ?? '',
          prezime: c.prezime ?? '',
          godiste: c.godiste ?? null,
          datumTestiranja: c.datum_testiranja ?? null,
        }))}
        classrooms={(classrooms ?? []) as { id: string; naziv: string }[]}
        termTypes={termTypes}
        termCategories={termCategories}
        defaultDate={defaultDate}
        defaultSlotIndex={defaultSlot}
        slotLabels={TIME_SLOTS}
        initialTakenInstructorIds={takenInstructorIds}
        initialTakenClassroomIds={takenClassroomIds}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
        initialCategoryIsTesting={params.cat === 'testing'}
        completedProgramIdsByClient={completedProgramIdsByClient}
      />
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
