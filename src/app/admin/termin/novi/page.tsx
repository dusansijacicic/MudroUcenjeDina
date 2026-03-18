import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminTerminForm from './AdminTerminForm';
import { TIME_SLOTS } from '@/lib/constants';

export default async function AdminTerminNoviPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: instructors } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime')
    .order('prezime')
    .order('ime');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Zakaži termin za predavača</h1>
      <p className="text-stone-500 text-sm mb-6">
        Izaberite predavača, datum i vremenski slot. Termin će biti kreiran (ako već ne postoji), pa možete dodati predavanje.
      </p>
      <AdminTerminForm
        instructors={instructors ?? []}
        defaultDate={defaultDate}
        slotLabels={TIME_SLOTS}
      />
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
