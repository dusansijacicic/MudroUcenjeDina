import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NoviPredavacForm from './NoviPredavacForm';

export default async function AdminNoviPredavacPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?reason=no_session');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login?reason=not_authorized');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Novi predavač</h1>
      <p className="text-stone-500 text-sm mb-6">
        Kreiraće se nalog za prijavu (email + lozinka) i profil predavača. Predavač može odmah da se uloguje.
      </p>
      <NoviPredavacForm />
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">
          ← Nazad na listu predavača
        </Link>
      </p>
    </div>
  );
}
