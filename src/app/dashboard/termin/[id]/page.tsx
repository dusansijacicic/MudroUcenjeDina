import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
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

  const [maxCasova] = await Promise.all([
    getMaxCasovaPoTerminu(),
  ]);
  const currentCount = (predavanja ?? []).length;
  const canAddMore = currentCount < maxCasova;

  const { data: otherTerms } = await supabase
    .from('terms')
    .select('id, instructor_id, instructor:instructors(ime, prezime)')
    .eq('date', term.date)
    .eq('slot_index', term.slot_index)
    .neq('instructor_id', instructor.id);

  const otherTermsWithPredavanja: Array<{
    id: string;
    instructor: { ime: string; prezime: string } | null;
    predavanja: Array<{ id: string; client?: { ime: string; prezime: string } | null }>;
  }> = [];
  if (otherTerms?.length) {
    for (const t of otherTerms) {
      const { data: pred } = await supabase
        .from('predavanja')
        .select('id, client:clients(ime, prezime)')
        .eq('term_id', t.id);
      otherTermsWithPredavanja.push({
        id: t.id,
        instructor: (t as unknown as { instructor?: { ime: string; prezime: string } | null }).instructor ?? null,
        predavanja: (pred ?? []).map((p) => ({ id: p.id, client: (p as unknown as { client?: { ime: string; prezime: string } | null }).client })),
      });
    }
  }

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
        {canAddMore ? (
          <Link
            href={`/dashboard/termin/${termId}/predavanje/novi`}
            className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Dodaj predavanje
          </Link>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 inline-block">
            Maksimalan broj časova u ovom terminu ({maxCasova}) je dostignut. Superadmin može da poveća limit u Podešavanjima.
          </p>
        )}
        <span className="ml-2 text-stone-500 text-sm">{currentCount} / {maxCasova} časova</span>
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

      {otherTermsWithPredavanja.length > 0 && (
        <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50/80 p-4">
          <h2 className="text-sm font-medium text-stone-600 mb-3">
            U istom terminu ({slotLabel}) drže čas i drugi predavači
          </h2>
          <ul className="space-y-2 text-sm">
            {otherTermsWithPredavanja.map((ot) => (
              <li key={ot.id} className="text-stone-700">
                <span className="font-medium">
                  {ot.instructor ? `${ot.instructor.ime} ${ot.instructor.prezime}` : '—'}
                </span>
                {ot.predavanja.length > 0 ? (
                  <span className="text-stone-600">
                    {' '}: {ot.predavanja.map((p) => p.client ? `${p.client.ime} ${p.client.prezime}` : '—').join(', ')}
                  </span>
                ) : (
                  <span className="text-stone-500"> (nema predavanja)</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
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
