import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAppSettings } from '@/app/admin/actions';
import PodesavanjaForm from './PodesavanjaForm';
import SacuvajBekapDugme from './SacuvajBekapDugme';
import { createAdminClient } from '@/lib/supabase/admin';
import { BEKAP_CUVA_DANA, listaBekapa } from '@/lib/bekap';

export default async function AdminPodesavanjaPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const [settings, arhiva] = await Promise.all([getAppSettings(), listaBekapa(createAdminClient())]);
  const bekapi = arhiva.bekapi;
  const danas = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
  const juceDan = new Date(`${danas}T12:00:00Z`);
  juceDan.setUTCDate(juceDan.getUTCDate() - 1);
  const juce = juceDan.toISOString().slice(0, 10);
  // Noćni bekap radi ako postoji bekap od danas ili juče.
  const radiAutomatski = bekapi.some((b) => b.datum === danas || b.datum === juce);
  const formatDatum = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
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

      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Automatski dnevni bekap</h2>
        <p className="text-sm text-stone-500 mt-1">
          Svake noći (oko 3 h) ceo sadržaj baze se sam sačuva ovde, u privatnoj arhivi aplikacije (Supabase Storage). Čuva se{' '}
          {BEKAP_CUVA_DANA} dana, stariji se sami brišu. Fajl je JSON spakovan u .gz (otvara se npr. sa 7-Zip).
        </p>
        {arhiva.greska ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Arhiva još ne postoji – kliknite „Sačuvaj bekap sada u arhivu“ da se napravi. ({arhiva.greska})
          </p>
        ) : !radiAutomatski ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {bekapi.length === 0 ? 'Još nema nijednog automatskog bekapa.' : `Poslednji bekap je od ${formatDatum(bekapi[0].datum)} – noćni bekap ne radi.`}{' '}
            Proverite da je u Vercel → Settings → Environment Variables postavljen <code className="rounded bg-white px-1">CRON_SECRET</code>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-emerald-700">✓ Noćni bekap radi – poslednji je od {formatDatum(bekapi[0].datum)}.</p>
        )}
        <div className="mt-3">
          <SacuvajBekapDugme />
        </div>
        {bekapi.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-stone-700">
              Sačuvani bekapi ({bekapi.length})
            </summary>
            <ul className="mt-2 divide-y divide-stone-100 text-sm">
              {bekapi.map((b) => (
                <li key={b.ime} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="tabular-nums text-stone-700">{formatDatum(b.datum)}</span>
                  <span className="ml-auto tabular-nums text-stone-400">{b.velicina ? `${Math.max(1, Math.round(b.velicina / 1024))} KB` : ''}</span>
                  <a href={`/api/admin/backup/arhiva?ime=${encodeURIComponent(b.ime)}`} className="font-medium text-amber-700 hover:text-amber-800">
                    Preuzmi
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <p className="mt-6">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}
