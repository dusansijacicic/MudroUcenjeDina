import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAppSettings } from '@/app/admin/actions';
import PodesavanjaForm from './PodesavanjaForm';

export default async function AdminPodesavanjaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const settings = await getAppSettings();
  const maxCasovaPoTerminu = settings.max_casova_po_terminu ?? '4';
  const maxTerminaPoSlotu = settings.max_termina_po_slotu ?? '4';

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Podešavanja aplikacije</h1>
      <p className="text-stone-500 text-sm mb-6">
        Ova podešavanja važe za celu aplikaciju. Maksimalni broj časova po terminu ograničava koliko predavanja (učenika) može biti u jednom terminu; maksimalan broj termina po slotu ograničava koliko različitih predavača/učionica može biti u istom vremenskom slotu (npr. u 10:00).
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
