import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getTermTypes, getClassrooms } from '@/app/admin/actions';
import { termMozeNovoPredavanje } from '@/lib/settings';
import PredavanjeForm from '@/app/dashboard/termin/PredavanjeForm';
import { TIME_SLOTS } from '@/lib/constants';

async function movePredavanjeToAnotherTerm(formData: FormData) {
  'use server';

  const predavanjeId = String(formData.get('predavanje_id') ?? '');
  const currentTermId = String(formData.get('current_term_id') ?? '');
  const targetDateRaw = String(formData.get('target_date') ?? '');
  const targetSlotRaw = String(formData.get('target_slot') ?? '');

  const targetDate = targetDateRaw.slice(0, 10);
  const targetSlot = Math.min(12, Math.max(0, Number.isNaN(Number(targetSlotRaw)) ? 0 : Number(targetSlotRaw)));

  const { instructor } = await getDashboardInstructor();
  if (!instructor) {
    redirect('/login?reason=no_instructor');
  }

  const admin = createAdminClient();

  const { data: predavanje, error: predErr } = await admin
    .from('predavanja')
    .select('id, term:terms(id, instructor_id)')
    .eq('id', predavanjeId)
    .single();

  if (predErr || !predavanje || (predavanje.term as { instructor_id?: string | null })?.instructor_id !== instructor.id) {
    notFound();
  }

  let targetTermId: string | null = null;
  const { data: existingTarget } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', instructor.id)
    .eq('date', targetDate)
    .eq('slot_index', targetSlot)
    .maybeSingle();

  if (existingTarget) {
    targetTermId = existingTarget.id as string;
  } else {
    const { data: insertedTarget, error: insertErr } = await admin
      .from('terms')
      .insert({
        instructor_id: instructor.id,
        date: targetDate,
        slot_index: targetSlot,
      })
      .select('id')
      .single();

    if (insertErr || !insertedTarget) {
      throw insertErr ?? new Error('Greška pri kreiranju ciljnog termina.');
    }
    targetTermId = insertedTarget.id as string;
  }

  const check = await termMozeNovoPredavanje(targetTermId);
  if (!check.ok) {
    redirect(
      `/dashboard/predavanje/${predavanjeId}?error=${encodeURIComponent(
        `Maksimalan broj časova u odabranom terminu je ${check.max}.`
      )}`
    );
  }

  const { error: updErr } = await admin
    .from('predavanja')
    .update({ term_id: targetTermId })
    .eq('id', predavanjeId);

  if (updErr) {
    redirect(
      `/dashboard/predavanje/${predavanjeId}?error=${encodeURIComponent('Greška pri premeštanju predavanja.')}`
    );
  }

  revalidatePath('/dashboard');
  if (currentTermId) {
    revalidatePath(`/dashboard/termin/${currentTermId}`);
  }
  revalidatePath(`/dashboard/termin/${targetTermId}`);
  revalidatePath(`/dashboard/predavanje/${predavanjeId}`);

  redirect(`/dashboard/termin/${targetTermId}`);
}

export default async function EditPredavanjePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: predavanje } = await admin
    .from('predavanja')
    .select('*, term:terms(*)')
    .eq('id', id)
    .single();

  if (!predavanje || (predavanje.term as { instructor_id?: string })?.instructor_id !== instructor.id) {
    notFound();
  }

  const term = predavanje.term as { id: string; date: string; slot_index: number; classroom_id?: string | null };
  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';

  const { data: linkRows } = await admin
    .from('instructor_clients')
    .select('client:clients(id, ime, prezime)')
    .eq('instructor_id', instructor.id);
  const clients = (linkRows ?? []).map((r) => r.client).filter(Boolean) as unknown as {
    id: string;
    ime: string;
    prezime: string;
  }[];
  clients.sort(
    (a, b) =>
      (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? '')
  );
  const [termTypes, classrooms] = await Promise.all([getTermTypes(), getClassrooms()]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-800 mb-4">Izmena predavanja</h1>
        <PredavanjeForm
          termId={term.id}
          termDate={term.date}
          slotLabel={slotLabel}
          clients={clients ?? []}
          termTypes={termTypes}
          classrooms={classrooms}
          initialClassroomId={term.classroom_id ?? null}
          predavanje={{
            ...predavanje,
            term_type_id: (predavanje as { term_type_id?: string | null }).term_type_id,
          }}
        />
      </div>

      <section className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
        <h2 className="text-sm font-medium text-stone-700 mb-3">
          Premesti ovog đaka u drugi termin
        </h2>
        <p className="text-xs text-stone-500 mb-3">
          Koristi ovo kada želiš da prebaciš čas u neki drugi dan ili nedelju (npr. sledeću), posebno kada drag &amp; drop ne pomaže.
        </p>
        <form action={movePredavanjeToAnotherTerm} className="space-y-3">
          <input type="hidden" name="predavanje_id" value={predavanje.id as string} />
          <input type="hidden" name="current_term_id" value={term.id as string} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Novi datum
              </label>
              <input
                type="date"
                name="target_date"
                defaultValue={term.date}
                className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Novi termin
              </label>
              <select
                name="target_slot"
                defaultValue={term.slot_index}
                className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800"
              >
                {TIME_SLOTS.map((label, idx) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Premesti u izabrani termin
          </button>
        </form>
      </section>
    </div>
  );
}

