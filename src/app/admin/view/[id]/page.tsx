import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

export default async function AdminViewPage({
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

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();

  const { data: instructor } = await adminSupabase
    .from('instructors')
    .select('id, ime, prezime, email')
    .eq('id', id)
    .single();
  if (!instructor) notFound();

  const { data: termRows } = await adminSupabase
    .from('terms')
    .select('id')
    .eq('instructor_id', id);
  const termIds = (termRows ?? []).map((t) => t.id as string);

  let ukupnoTermina = termIds.length;
  let ukupnoCasova = 0;
  let odrzanihCasova = 0;
  let zakazanihUBuducnosti = 0;

  let klijenti: { id: string; ime: string; prezime: string }[] = [];

  if (termIds.length > 0) {
    const { data: predRows } = await adminSupabase
      .from('predavanja')
      .select('id, term_id, odrzano, client:clients(id, ime, prezime)')
      .in('term_id', termIds);

    const now = new Date().toISOString().slice(0, 10);
    ukupnoCasova = predRows?.length ?? 0;
    odrzanihCasova = (predRows ?? []).filter((p) => p.odrzano).length;

    const termById = new Map<string, { date: string }>();
    if (termRows) {
      for (const t of termRows as Array<{ id: string; date: string }>) {
        termById.set(t.id, { date: t.date });
      }
    }
    zakazanihUBuducnosti = (predRows ?? []).filter((p) => {
      const t = termById.get(p.term_id as string);
      return t && t.date >= now && !p.odrzano;
    }).length;

    const clientMap = new Map<string, { id: string; ime: string; prezime: string }>();
    for (const p of predRows ?? []) {
      const c = (p as unknown as { client?: { id: string; ime: string; prezime: string } }).client;
      if (c && !clientMap.has(c.id)) {
        clientMap.set(c.id, { id: c.id, ime: c.ime ?? '', prezime: c.prezime ?? '' });
      }
    }
    klijenti = Array.from(clientMap.values()).sort(
      (a, b) =>
        (a.prezime ?? '').localeCompare(b.prezime ?? '') ||
        (a.ime ?? '').localeCompare(b.ime ?? '')
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">
            {instructor.ime} {instructor.prezime}
          </h1>
          <p className="text-sm text-stone-500">{instructor.email}</p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
            Slotova u kalendaru
          </p>
          <p className="text-2xl font-semibold text-stone-800">{ukupnoTermina}</p>
          <p className="text-xs text-stone-500 mt-1">
            Broj termina (datum + vreme) koje predavač ima u kalendaru
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
            Predavanja (časovi)
          </p>
          <p className="text-2xl font-semibold text-stone-800">{ukupnoCasova}</p>
          <p className="text-xs text-stone-500 mt-1">
            <strong>{odrzanihCasova}</strong> održano · {ukupnoCasova - odrzanihCasova} još nije označeno kao održano
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
            Zakazani u budućnosti
          </p>
          <p className="text-2xl font-semibold text-stone-800">
            {zakazanihUBuducnosti}
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Budući termini gde čas nije označen kao održan
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white">
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <h2 className="text-sm font-medium text-stone-700">
            Klijenti ovog predavača
          </h2>
          <span className="text-xs text-stone-400">
            {klijenti.length} klijenata (na osnovu termina)
          </span>
        </div>
        {klijenti.length === 0 ? (
          <div className="p-4 text-sm text-stone-500">
            Još uvek nema časova za ovog predavača, pa nema ni klijenata u statistici.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {klijenti.map((c) => (
              <li key={c.id} className="px-4 py-2 text-sm text-stone-800">
                {c.ime} {c.prezime}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
