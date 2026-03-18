import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

export default async function AdminViewKlijentiPage({
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
    .select('id, ime, prezime')
    .eq('id', id)
    .single();
  if (!instructor) notFound();

  const { data: links } = await adminSupabase
    .from('instructor_clients')
    .select('client_id, placeno_casova, client:clients(*)')
    .eq('instructor_id', id);
  type Row = { id: string; ime: string; prezime: string; godiste?: number; razred?: string; skola?: string; kontakt_telefon?: string; placeno_casova: number };
  const rows = (links ?? []).map((l) => ({
    ...(l.client as unknown as Record<string, unknown>),
    placeno_casova: l.placeno_casova,
  })) as Row[];
  rows.sort((a, b) => (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? ''));

  const listHref = `/admin/view/${id}/klijenti`;

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Klijenti – {instructor.ime} {instructor.prezime}
      </h1>
      <div className="mb-4">
        <Link
          href={`/admin/view/${id}/klijenti/novi`}
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + Novi polaznik
        </Link>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište</th>
              <th className="text-left p-3 font-medium text-stone-600">Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Škola</th>
              <th className="text-left p-3 font-medium text-stone-600">Kontakt</th>
              <th className="text-right p-3 font-medium text-stone-600">Plaćeno časova</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="p-3 font-medium text-stone-800">
                  <Link href={`/admin/view/${id}/klijenti/${c.id}`} className="hover:text-amber-600">
                    {c.ime} {c.prezime}
                  </Link>
                </td>
                <td className="p-3 text-stone-600">{c.godiste ?? '—'}</td>
                <td className="p-3 text-stone-600">{c.razred ?? '—'}</td>
                <td className="p-3 text-stone-600">{c.skola ?? '—'}</td>
                <td className="p-3 text-stone-600">{c.kontakt_telefon ?? '—'}</td>
                <td className="p-3 text-right">
                  <Link
                    href={`/admin/view/${id}/klijenti/${c.id}`}
                    className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                  >
                    Izmeni
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-6 text-center text-stone-500">Nema klijenata.</div>
        )}
      </div>
    </div>
  );
}
