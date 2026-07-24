import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAppSettings } from '@/app/admin/actions';
import PodesavanjaForm from './PodesavanjaForm';

export default async function AdminPodesavanjaPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const settings = await getAppSettings();
  const maxCasovaPoTerminu = settings.max_casova_po_terminu ?? '4';
  const maxTerminaPoSlotu = settings.max_termina_po_slotu ?? '4';

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Podešavanja aplikacije</h1>
      <p className="text-stone-500 text-sm mb-6">
        Ova podešavanja važe za celu aplikaciju. Maksimalni broj radionica po terminu ograničava koliko učenika može biti u jednom terminu; maksimalan broj termina po slotu ograničava koliko različitih instruktora/učionica može biti u istom vremenskom slotu (npr. u 10:00).
      </p>

      <PodesavanjaForm
        maxCasovaPoTerminu={maxCasovaPoTerminu}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
      />

      <p className="mt-6">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
