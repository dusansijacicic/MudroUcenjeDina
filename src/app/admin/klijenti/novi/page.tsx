import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getTermTypes } from '@/app/admin/actions';
import AdminNoviKlijentForm from './AdminNoviKlijentForm';

export default async function AdminNoviKlijentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!adminRow) redirect('/login');

  const termTypes = await getTermTypes();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Novi klijent</h1>
      <p className="text-stone-500 text-sm mb-6">
        Unesite podatke učenika. Instruktora i uplatu možete dodeliti naknadno kroz profil klijenta.
      </p>
      <AdminNoviKlijentForm termTypes={termTypes} />
      <p className="mt-4">
        <Link href="/admin/klijenti" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve klijente
        </Link>
      </p>
    </div>
  );
}
