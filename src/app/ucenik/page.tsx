import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TIME_SLOTS } from '@/lib/constants';
import type { Predavanje } from '@/types/database';

export default async function UcenikPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (!client) redirect('/login');

  const { data: predavanja } = await supabase
    .from('predavanja')
    .select('*, term:terms(date, slot_index)')
    .eq('client_id', client.id)
    .order('date', { ascending: false })
    .order('slot_index', { ascending: false });

  const list = (predavanja ?? []) as (Predavanje & {
    term?: { date: string; slot_index: number } | null;
  })[];
  const odrzanoCount = list.filter((p) => p.odrzano).length;
  const placenoCount = list.filter((p) => p.placeno).length;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-stone-800">
        Zdravo, {client.ime}!
      </h1>
      <p className="text-stone-500 text-sm">
        Ovde vidiš samo svoje zakazane časove i istoriju – nemaš pristup drugim podacima.
      </p>

      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-medium text-stone-800 mb-4">
          Pregled časova
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-amber-50 p-4">
            <p className="text-sm text-stone-500">Plaćeno časova (ukupno)</p>
            <p className="text-2xl font-semibold text-stone-800">
              {client.placeno_casova}
            </p>
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm text-stone-500">Održano</p>
            <p className="text-2xl font-semibold text-stone-800">
              {odrzanoCount}
            </p>
          </div>
          <div className="rounded-lg bg-stone-100 p-4">
            <p className="text-sm text-stone-500">Plaćeno (označeno)</p>
            <p className="text-2xl font-semibold text-stone-800">
              {placenoCount}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-500">
          „Ostalo” časova možeš proveriti kod predavača (razlika između plaćenog paketa i odrađenih).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium text-stone-800 mb-3">
          Moji časovi – šta je sve rađeno
        </h2>
        <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {list.length === 0 ? (
            <div className="p-6 text-center text-stone-500">
              Nema zabeleženih časova.
            </div>
          ) : (
            list.map((p) => (
              <div key={p.id} className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-stone-800">
                    {p.term
                      ? new Date(p.term.date + 'T12:00:00').toLocaleDateString(
                          'sr-Latn-RS',
                          {
                            weekday: 'short',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          }
                        )
                      : '—'}{' '}
                    • {p.term ? TIME_SLOTS[p.term.slot_index] ?? '—' : '—'}
                  </span>
                  <div className="flex gap-2">
                    {p.odrzano && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        Održano
                      </span>
                    )}
                    {p.placeno && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Plaćeno
                      </span>
                    )}
                  </div>
                </div>
                {p.komentar && (
                  <p className="mt-2 text-stone-600 text-sm whitespace-pre-wrap">
                    {p.komentar}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
