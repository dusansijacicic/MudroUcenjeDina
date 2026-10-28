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

      <section className="mt-10 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Bekap baze</h2>
        <p className="text-sm text-stone-500 mt-1">
          Preuzima sve podatke aplikacije (klijenti, termini, radionice, uplate, zahtevi, podešavanja…) u jedan JSON fajl.
          Čuvajte ga van računara (npr. Google Drive) – najbolje jednom dnevno.
        </p>
        <a
          href="/api/admin/backup"
          className="mt-3 inline-flex items-center rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900"
        >
          ⬇ Preuzmi bekap baze (JSON)
        </a>
        <p className="text-xs text-stone-400 mt-2">
          Nalozi za prijavu (email/lozinke) nisu u fajlu – njih čuva Supabase posebno.
        </p>
      </section>

      <p className="mt-6">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
