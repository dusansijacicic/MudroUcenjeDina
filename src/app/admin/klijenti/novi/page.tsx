import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { getTermTypes, getPrograms } from '@/app/admin/actions';
import AdminNoviKlijentForm from './AdminNoviKlijentForm';

export default async function AdminNoviKlijentPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const [termTypes, programs] = await Promise.all([getTermTypes(), getPrograms()]);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Novi klijent</h1>
      <p className="text-stone-500 text-sm mb-6">
        Unesite podatke učenika. Instruktora i uplatu možete dodeliti naknadno kroz profil klijenta.
      </p>
      <AdminNoviKlijentForm termTypes={termTypes} programs={programs} />
      <p className="mt-4">
        <Link href="/admin/klijenti" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve klijente
        </Link>
      </p>
    </div>
  );
}
