import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import { TIME_SLOTS } from '@/lib/constants';
import { jedanKlijentIzJoina, nazivKategorijeIzJoina } from '@/lib/term-categories';
import type { Predavanje } from '@/types/database';
import { deleteTermAsInstructor } from '@/app/dashboard/termin/actions';
import TermNapomenaEditor from '@/app/dashboard/termin/TermNapomenaEditor';

export default async function TerminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id: termId } = await params;
  const sp = await searchParams;
  const errorMessage = sp.message ? decodeURIComponent(sp.message) : (sp.error === 'max_predavanja' ? 'Ovaj termin već ima maksimalan broj časova.' : null);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: term } = await admin
    .from('terms')
    .select('*, term_categories(id, naziv, jedan_klijent_po_terminu)')
    .eq('id', termId)
    .eq('instructor_id', instructor.id)
    .single();

  if (!term) notFound();

  const { data: predavanja } = await admin
    .from('predavanja')
    .select('*, client:clients(id, ime, prezime)')
    .eq('term_id', termId)
    .order('created_at');

  const maxCasova = await getMaxCasovaPoTerminu();
  const currentCount = (predavanja ?? []).length;
  const tcRaw = (term as { term_categories?: unknown }).term_categories;
  const jedanOnly = jedanKlijentIzJoina(
    tcRaw as { jedan_klijent_po_terminu?: boolean } | { jedan_klijent_po_terminu?: boolean }[] | null
  );
  const categoryNaziv = nazivKategorijeIzJoina(tcRaw as { naziv?: string } | { naziv?: string }[] | null);
  const effectiveMax = jedanOnly ? 1 : maxCasova;
  const canAddMore = currentCount < effectiveMax;

  const { data: otherTerms } = await admin
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
      const { data: pred } = await admin
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
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-800 capitalize">
            {dateLabel}
          </h1>
          <p className="text-stone-500">{slotLabel}</p>
          <TermNapomenaEditor
            termId={termId}
            initialNapomena={(term as { napomena?: string | null }).napomena ?? null}
          />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            ← Kalendar
          </Link>
          <form
            action={async () => {
              'use server';
              const res = await deleteTermAsInstructor(termId);
              if (res.error) {
                // ako ima grešku, samo ne radimo redirect; greška će biti u logu
                return;
              }
              redirect('/dashboard');
            }}
          >
            <button
              type="submit"
              className="text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1"
            >
              Otkaži termin
            </button>
          </form>
        </div>
      </div>

      <div className="mb-6">
        {canAddMore ? (
          <Link
            href={`/dashboard/termin/${termId}/predavanje/novi`}
            className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Dodaj radionicu
          </Link>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 inline-block">
            {jedanOnly
              ? `Kategorija „${categoryNaziv}” – u terminu može biti samo jedno dete. Za grupu promenite kategoriju pri dodavanju radionice ili u formi za novu radionicu.`
              : `Maksimalan broj radionica u ovom terminu (${maxCasova}) je dostignut.`}
          </p>
        )}
        <span className="ml-2 text-stone-500 text-sm">
          {currentCount} / {effectiveMax} radionica · {categoryNaziv}
        </span>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(predavanja ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">
            Nema radionica u ovom terminu. Dodajte prvu radionicu.
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
            U istom terminu ({slotLabel}) drže čas i drugi instruktori
          </h2>
          <ul className="space-y-2 text-sm">
            {otherTermsWithPredavanja.map((ot) => (
              <li key={ot.id} className="text-stone-700">
                <span className="font-medium">
                  {ot.instructor ? `${ot.instructor.ime} ${ot.instructor.prezime}` : '—'}
                </span>
                {ot.predavanja.length > 0 ? (
                  <ul className="mt-1 ml-0 pl-4 list-disc text-stone-800 space-y-0.5">
                    {ot.predavanja.map((p) => (
                      <li
                        key={p.id}
                        className="text-sm leading-snug break-words antialiased marker:text-amber-600"
                      >
                        {p.client
                          ? `${p.client.ime ?? ''} ${p.client.prezime ?? ''}`.trim() || '—'
                          : '—'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-stone-500"> (nema radionica)</span>
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
    ? `${predavanje.client.ime ?? ''} ${predavanje.client.prezime ?? ''}`.trim() || '—'
    : '—';
  return (
    <div className="p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-stone-900 leading-snug break-words antialiased">
          {clientName}
        </p>
        <div className="flex gap-2 mt-1">
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
