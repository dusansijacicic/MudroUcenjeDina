import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import ClientForm from '../ClientForm';
import type { Client, Predavanje } from '@/types/database';
import { TIME_SLOTS } from '@/lib/constants';

export default async function KlijentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!instructor) redirect('/login');

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('instructor_id', instructor.id)
    .single();

  if (!client) notFound();

  const { data: predavanja } = await supabase
    .from('predavanja')
    .select('*, term:terms(date, slot_index)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

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

      <ClientForm instructorId={instructor.id} client={client as Client} />

      <section>
        <h2 className="text-lg font-medium text-stone-800 mb-3">
          Istorija časova (šta je rađeno)
        </h2>
        <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {(predavanja ?? []).length === 0 ? (
            <div className="p-6 text-center text-stone-500">
              Nema zabeleženih predavanja za ovog klijenta.
            </div>
          ) : (
            (predavanja ?? []).map((p) => (
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
