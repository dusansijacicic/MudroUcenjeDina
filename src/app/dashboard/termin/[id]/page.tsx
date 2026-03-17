import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getDashboardInstructor } from '@/lib/dashboard';
import { TIME_SLOTS } from '@/lib/constants';
import type { Predavanje } from '@/types/database';

export default async function TerminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: termId } = await params;
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const { data: term } = await supabase
    .from('terms')
    .select('*')
    .eq('id', termId)
    .eq('instructor_id', instructor.id)
    .single();

  if (!term) notFound();

  const { data: predavanja } = await supabase
    .from('predavanja')
    .select('*, client:clients(id, ime, prezime)')
    .eq('term_id', termId)
    .order('created_at');

  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const dateLabel = new Date(term.date + 'T12:00:00').toLocaleDateString(
    'sr-Latn-RS',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  );

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-800 capitalize">
            {dateLabel}
          </h1>
          <p className="text-stone-500">{slotLabel}</p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← Kalendar
        </Link>
      </div>

      <div className="mb-6">
        <Link
          href={`/dashboard/termin/${termId}/predavanje/novi`}
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + Dodaj predavanje
        </Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(predavanja ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">
            Nema predavanja u ovom terminu. Dodajte prvo predavanje.
          </div>
        ) : (
          (predavanja ?? []).map((p) => (
            <PredavanjeRow key={p.id} predavanje={p} />
          ))
        )}
      </div>
    </div>
  );
}

function PredavanjeRow({
  predavanje,
}: {
  predavanje: Predavanje & {
    client?: { id: string; ime: string; prezime: string } | null;
  };
}) {
  const clientName = predavanje.client
    ? `${predavanje.client.ime} ${predavanje.client.prezime}`
    : '—';
  return (
    <div className="p-4 flex items-start justify-between gap-4">
      <div>
        <p className="font-medium text-stone-800">{clientName}</p>
        <div className="flex gap-2 mt-1">
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
        {predavanje.komentar && (
          <p className="mt-2 text-sm text-stone-600 whitespace-pre-wrap">
            {predavanje.komentar}
          </p>
        )}
      </div>
      <Link
        href={`/dashboard/predavanje/${predavanje.id}`}
        className="text-sm text-amber-600 hover:text-amber-700 shrink-0"
      >
        Izmeni
      </Link>
    </div>
  );
}
