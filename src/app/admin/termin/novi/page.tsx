import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminTerminForm from './AdminTerminForm';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getTakenForSlot, getTermCategories } from '@/app/admin/actions';
import { getMaxTerminaPoSlotu } from '@/lib/settings';

export default async function AdminTerminNoviPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; slot?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const params = await searchParams;
  const dateFromUrl = params.date?.slice(0, 10);
  const slotFromUrl = params.slot != null ? Math.min(12, Math.max(0, parseInt(params.slot, 10) || 0)) : undefined;

  const adminSupabase = createAdminClient();
  const { data: instructors } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime')
    .order('prezime')
    .order('ime');
  const { data: clients } = await adminSupabase
    .from('clients')
    .select('id, ime, prezime')
    .order('prezime')
    .order('ime');
  const { data: classrooms } = await adminSupabase
    .from('classrooms')
    .select('id, naziv')
    .order('naziv');
  const [termTypes, termCategories] = await Promise.all([getTermTypes(), getTermCategories()]);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = dateFromUrl ?? tomorrow.toISOString().slice(0, 10);
  const defaultSlot = slotFromUrl ?? 0;

  const [{ takenInstructorIds, takenClassroomIds }, maxTerminaPoSlotu] = await Promise.all([
    getTakenForSlot(defaultDate, defaultSlot),
    getMaxTerminaPoSlotu(),
  ]);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Zakaži termin za instruktora</h1>
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 mb-6">
        <p className="font-medium mb-1">Paralelni termini u istom vremenu (slotu):</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            U istom slotu (npr. 9:00) može biti <strong>do {maxTerminaPoSlotu} termina odjednom</strong> — kao u podešavanjima (Admin → Podešavanja). To su paralelne radionice: različiti predavači, različite učionice.
          </li>
          <li>
            Svaki od tih termina može biti <strong>individualni</strong> (jedno dete) ili <strong>grupni</strong> (više dece u tom terminu), prema izabranoj kategoriji.
          </li>
          <li>
            <strong>A)</strong> Isti predavač: najviše <strong>jedan</strong> termin u tom slotu.
          </li>
          <li>
            <strong>B)</strong> Ista učionica: najviše <strong>jedan</strong> termin u tom slotu.
          </li>
          <li>U formi redosled: <strong>vrsta časa</strong> → <strong>kategorija</strong> → <strong>deca</strong>.</li>
        </ul>
        <p className="mt-2 text-stone-600">
          U padajućim listama vide se samo predavači i učionice koji su još slobodni u izabranom slotu. Iz kalendara koristite „+“ ili „Dodaj još termin u ovom slotu“.
        </p>
      </div>
      <AdminTerminForm
        instructors={(instructors ?? []) as { id: string; ime: string; prezime: string }[]}
        clients={(clients ?? []) as { id: string; ime: string; prezime: string }[]}
        classrooms={(classrooms ?? []) as { id: string; naziv: string }[]}
        termTypes={termTypes}
        termCategories={termCategories}
        defaultDate={defaultDate}
        defaultSlotIndex={defaultSlot}
        slotLabels={TIME_SLOTS}
        initialTakenInstructorIds={takenInstructorIds}
        initialTakenClassroomIds={takenClassroomIds}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
      />
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
