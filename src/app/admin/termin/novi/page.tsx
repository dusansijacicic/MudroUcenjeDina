import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminTerminForm from './AdminTerminForm';
import { TIME_SLOTS } from '@/lib/constants';
import { getTermTypes, getTakenForSlot } from '@/app/admin/actions';

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
  const termTypes = await getTermTypes();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = dateFromUrl ?? tomorrow.toISOString().slice(0, 10);
  const defaultSlot = slotFromUrl ?? 0;

  const { takenInstructorIds, takenClassroomIds } = await getTakenForSlot(defaultDate, defaultSlot);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Zakaži termin za predavača</h1>
      <p className="text-stone-500 text-sm mb-6">
        Izaberite predavača i klijenta. U izboru su samo predavači i učionice slobodni u ovom terminu (jedan predavač / jedna učionica po slotu).
      </p>
      <AdminTerminForm
        instructors={(instructors ?? []) as { id: string; ime: string; prezime: string }[]}
        clients={(clients ?? []) as { id: string; ime: string; prezime: string }[]}
        classrooms={(classrooms ?? []) as { id: string; naziv: string }[]}
        termTypes={termTypes}
        defaultDate={defaultDate}
        defaultSlotIndex={defaultSlot}
        slotLabels={TIME_SLOTS}
        initialTakenInstructorIds={takenInstructorIds}
        initialTakenClassroomIds={takenClassroomIds}
      />
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
