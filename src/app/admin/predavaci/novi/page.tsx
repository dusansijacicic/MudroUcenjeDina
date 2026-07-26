import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NoviPredavacForm from './NoviPredavacForm';

export default async function AdminNoviPredavacPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login?reason=no_session');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login?reason=not_authorized');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Novi instruktor</h1>
      <p className="text-stone-500 text-sm mb-6">
        Kreiraće se nalog za prijavu (email + lozinka) i profil instruktora. Instruktor može odmah da se uloguje.
      </p>
      <NoviPredavacForm />
      <p className="mt-4">
        <Link href="/admin/predavaci" className="text-sm text-amber-700 hover:underline">
          ← Nazad na listu instruktora
        </Link>
      </p>
    </div>
  );
}
