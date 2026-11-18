import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchedulingAccess } from '@/lib/scheduling-access';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminTerminForm from '@/app/admin/termin/novi/AdminTerminForm';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getTakenForSlot, getTermCategories, getAllClientsCompletedProgramIds } from '@/app/admin/actions';
import { getMaxTerminaPoSlotu } from '@/lib/settings';

export default async function TermBookingPage({
  searchParams,
  mode,
}: {
  mode: 'admin' | 'instructor';
  searchParams: Promise<{ date?: string; slot?: string; cat?: string }>;
}) {
  const { error, actor } = await requireSchedulingAccess();
  if (error || !actor) redirect('/login');
  if (mode === 'admin' && actor.role !== 'admin') redirect('/dashboard');
  const calendarHref = mode === 'admin' ? '/admin/kalendar' : '/dashboard';

  const params = await searchParams;
  const dateFromUrl = params.date?.slice(0, 10);
  const slotFromUrl = params.slot != null ? Math.min(15, Math.max(0, parseInt(params.slot, 10) || 0)) : undefined;

  const adminSupabase = createAdminClient();
  const [{ data: instructors }, { data: clients }, { data: classrooms }, termTypes, termCategories, completedMap] = await Promise.all([
    adminSupabase.from('instructors').select('id, ime, prezime').eq('aktivan', true).order('prezime').order('ime'),
    adminSupabase.from('clients').select('id, ime, prezime, godiste, datum_testiranja').order('prezime').order('ime'),
    adminSupabase.from('classrooms').select('id, naziv').order('naziv'),
    getTermTypes(), getTermCategories(), getAllClientsCompletedProgramIds(),
  ]);
  const completedProgramIdsByClient: Record<string, string[]> = {};
  for (const [cid, set] of completedMap) completedProgramIdsByClient[cid] = [...set];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = dateFromUrl ?? tomorrow.toISOString().slice(0, 10);
  const defaultSlot = slotFromUrl ?? 0;

  const [{ takenInstructorIds, takenClassroomIds, blocked, blockedInstructorIds }, maxTerminaPoSlotu] = await Promise.all([
    getTakenForSlot(defaultDate, defaultSlot),
    getMaxTerminaPoSlotu(),
  ]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Zakaži termin</h1>
      <AdminTerminForm
        calendarHref={calendarHref}
        helpHref={mode === 'admin' ? '/admin/uputstvo?deo=zakazivanje-termina' : '/dashboard/uputstvo?deo=termin'}
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
        initialBlockedInstructorIds={blockedInstructorIds}
        initialTakenClassroomIds={takenClassroomIds}
        initialBlocked={blocked}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
        initialCategoryIsTesting={params.cat === 'testing'}
        completedProgramIdsByClient={completedProgramIdsByClient}
      />
      <p className="mt-4">
        <Link href={calendarHref} className="text-sm text-amber-700 hover:underline">← Nazad na kalendar</Link>
      </p>
    </div>
  );
}
