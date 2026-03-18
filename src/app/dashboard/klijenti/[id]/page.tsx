import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import ClientForm from '../ClientForm';
import type { Client, Predavanje } from '@/types/database';
import { TIME_SLOTS } from '@/lib/constants';

export default async function KlijentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('instructor_clients')
    .select('placeno_casova, client:clients(*)')
    .eq('instructor_id', instructor.id)
    .eq('client_id', id)
    .single();

  if (!link?.client) notFound();
  const client = { ...(link.client as unknown as Client), placeno_casova: link.placeno_casova };

  const { data: predavanja } = await admin
    .from('predavanja')
    .select('*, term:terms(date, slot_index, instructor_id)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const predavanjaForThisInstructor = (predavanja ?? []).filter(
    (p) => (p.term as { instructor_id?: string })?.instructor_id === instructor.id
  );
  const odrzanoCount = predavanjaForThisInstructor.filter((p) => p.odrzano).length;
  const placenoPaket = client.placeno_casova ?? 0;
  const ostalo = Math.max(0, placenoPaket - odrzanoCount);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-800">
          {client.ime} {client.prezime}
        </h1>
        <Link
          href="/dashboard/klijenti"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← Nazad na listu
        </Link>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 text-sm">
        <p className="font-medium text-stone-800 mb-1">Kako rade „plaćeno” i „održano”</p>
        <p className="text-stone-600 mb-2">
          <strong>Plaćeno (paket)</strong> = broj časova koje je klijent platio kod vas (unosite vi u formi ispod).{' '}
          <strong>Održano</strong> = broj časova koje ste održali (označavate „Održano” na svakom predavanju).{' '}
          <strong>Ostalo</strong> = koliko još časova iz paketa preostaje.
        </p>
        <p className="text-stone-700">
          Kod vas: plaćeno <strong>{placenoPaket}</strong> · održano <strong>{odrzanoCount}</strong> → ostalo <strong>{ostalo}</strong>
        </p>
      </div>

      <ClientForm instructorId={instructor.id} client={client} />

      <p className="text-stone-500 text-sm">
        „Plaćeno časova” je za vašu vezu sa ovim klijentom. Isti klijent može imati druge predavače.
      </p>

      <section>
        <h2 className="text-lg font-medium text-stone-800 mb-3">
          Istorija časova (šta je rađeno) – kod vas
        </h2>
        <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {predavanjaForThisInstructor.length === 0 ? (
            <div className="p-6 text-center text-stone-500">
              Nema zabeleženih predavanja za ovog klijenta (kod vas).
            </div>
          ) : (
            predavanjaForThisInstructor.map((p) => (
              <PredavanjeHistoryRow key={p.id} predavanje={p} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function PredavanjeHistoryRow({
  predavanje,
}: {
  predavanje: Predavanje & { term?: { date: string; slot_index: number } | null };
}) {
  const slot = predavanje.term
    ? TIME_SLOTS[predavanje.term.slot_index] ?? '—'
    : '—';
  const dateFormatted = predavanje.term
    ? new Date(predavanje.term.date + 'T12:00:00').toLocaleDateString(
        'sr-Latn-RS',
        { day: '2-digit', month: '2-digit', year: 'numeric' }
      )
    : '—';
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium text-stone-800">
          {dateFormatted} • {slot}
        </span>
        <div className="flex gap-2">
          {predavanje.odrzano && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
              Održano
            </span>
          )}
          {predavanje.placeno && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              Plaćeno
            </span>
          )}
        </div>
      </div>
      {predavanje.komentar && (
        <p className="mt-2 text-stone-600 text-sm whitespace-pre-wrap">
          {predavanje.komentar}
        </p>
      )}
      <Link
        href={`/dashboard/predavanje/${predavanje.id}`}
        className="mt-2 inline-block text-sm text-amber-600 hover:text-amber-700"
      >
        Izmeni predavanje →
      </Link>
    </div>
  );
}
