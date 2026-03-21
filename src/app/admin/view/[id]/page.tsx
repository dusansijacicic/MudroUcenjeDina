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

  let klijenti: { id: string; ime: string; prezime: string }[] = [];

  if (termIds.length > 0) {
    const { data: predRows } = await adminSupabase
      .from('predavanja')
      .select('id, term_id, client:clients(id, ime, prezime)')
      .in('term_id', termIds);

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
    <div className="space-y-6 animate-in">
      <header className="flex items-center justify-between gap-4 animate-in-delay-1">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">
            {instructor.ime} {instructor.prezime}
          </h1>
          <p className="text-sm text-stone-500">{instructor.email}</p>
        </div>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-2">
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <h2 className="text-sm font-medium text-stone-700">
            Klijenti ovog instruktora
          </h2>
          <span className="text-xs text-stone-400">
            {klijenti.length} klijenata (na osnovu termina)
          </span>
        </div>
        {klijenti.length === 0 ? (
          <div className="p-4 text-sm text-stone-500">
            Još uvek nema časova za ovog instruktora, pa nema ni klijenata u statistici.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 stagger-children">
            {klijenti.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm text-stone-800 ui-transition hover:bg-stone-50">
                {c.ime} {c.prezime}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
