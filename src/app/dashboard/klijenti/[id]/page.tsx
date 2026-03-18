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
  const { data: clientRow, error } = await admin.from('clients').select('*').eq('id', id).single();
  if (error || !clientRow) notFound();

  const { data: myLink } = await admin
    .from('instructor_clients')
    .select('placeno_casova')
    .eq('instructor_id', instructor.id)
    .eq('client_id', id)
    .maybeSingle();
  const client = { ...(clientRow as Client), placeno_casova: myLink?.placeno_casova ?? 0 };

  const { data: allLinks } = await admin
    .from('instructor_clients')
    .select('instructor_id, placeno_casova')
    .eq('client_id', id);

  const { data: predavanja } = await admin
    .from('predavanja')
    .select('*, term:terms(date, slot_index, instructor_id)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const allLessons = predavanja ?? [];
  const predavanjaForThisInstructor = allLessons.filter(
    (p) => (p.term as { instructor_id?: string })?.instructor_id === instructor.id
  );

  const odrzanoUkupno = allLessons.filter((p) => p.odrzano).length;
  const odrzanoKodMene = predavanjaForThisInstructor.filter((p) => p.odrzano).length;
  const placenoKodMene = predavanjaForThisInstructor.filter((p) => p.placeno).length;

  const placenoUkupno = (allLinks ?? []).reduce(
    (sum, row) => sum + (row.placeno_casova ?? 0),
    0
  );
  const preostaloUkupno = placenoUkupno - odrzanoUkupno;
  const duguje = preostaloUkupno < 0 ? Math.abs(preostaloUkupno) : 0;

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

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Statistika časova za ovog klijenta</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Plaćeno (škola) = ukupno plaćeno preko svih predavača. Održano = kod svih predavača. Preostalo = plaćeno − održano.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3">
              <p className="text-xs text-stone-500 uppercase tracking-wide">Plaćeno (škola)</p>
              <p className="text-xl font-bold text-stone-800 mt-0.5">{placenoUkupno}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
              <p className="text-xs text-emerald-700 uppercase tracking-wide">Održano ukupno</p>
              <p className="text-xl font-bold text-emerald-800 mt-0.5">{odrzanoUkupno}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
              <p className="text-xs text-sky-700 uppercase tracking-wide">Preostalo</p>
              <p className="text-xl font-bold text-sky-800 mt-0.5">{preostaloUkupno}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-amber-50/80 px-4 py-3">
              <p className="text-xs text-amber-700 uppercase tracking-wide">Održano kod vas</p>
              <p className="text-xl font-bold text-amber-800 mt-0.5">{odrzanoKodMene}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-blue-50/80 px-4 py-3">
              <p className="text-xs text-blue-700 uppercase tracking-wide">Plaćeno kod vas</p>
              <p className="text-xl font-bold text-blue-800 mt-0.5">{placenoKodMene}</p>
            </div>
          </div>
          {duguje > 0 && (
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              Duguje novac za <strong>{duguje}</strong> termina (više održanih nego plaćenih).
            </p>
          )}
        </div>
      </section>

      <ClientForm instructorId={instructor.id} client={client} />

      <p className="text-stone-500 text-sm">
        „Plaćeno časova (škola)” dobija se sabiranjem plaćenih paketa kod svih predavača. U formi ispod i dalje menjate paket za vašu vezu sa klijentom.
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
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
              Održano
            </span>
          )}
          {predavanje.placeno && (
            <span className="text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-medium">
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
