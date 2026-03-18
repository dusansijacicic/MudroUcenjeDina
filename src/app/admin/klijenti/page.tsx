import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminSviKlijentiPage() {
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

  const { data: links } = await supabase
    .from('instructor_clients')
    .select('instructor_id, client_id, placeno_casova, client:clients(id, ime, prezime, login_email, godiste, razred, skola, kontakt_telefon), instructor:instructors(id, ime, prezime)')
    .order('client_id');

  const byClient = new Map<
    string,
    { client: { id: string; ime: string; prezime: string; login_email?: string | null; godiste?: number; razred?: string; skola?: string; kontakt_telefon?: string }; instructors: { id: string; ime: string; prezime: string; placeno_casova: number }[] }
  >();
  for (const row of links ?? []) {
    const c = row.client as unknown as { id: string; ime: string; prezime: string; login_email?: string; godiste?: number; razred?: string; skola?: string; kontakt_telefon?: string };
    const i = row.instructor as unknown as { id: string; ime: string; prezime: string };
    if (!c?.id) continue;
    const existing = byClient.get(c.id);
    if (!existing) {
      byClient.set(c.id, {
        client: { ...c, login_email: c.login_email ?? null },
        instructors: [{ id: i.id, ime: i.ime, prezime: i.prezime, placeno_casova: row.placeno_casova }],
      });
    } else {
      existing.instructors.push({ id: i.id, ime: i.ime, prezime: i.prezime, placeno_casova: row.placeno_casova });
    }
  }
  const list = Array.from(byClient.values()).sort(
    (a, b) => (a.client.prezime ?? '').localeCompare(b.client.prezime ?? '') || (a.client.ime ?? '').localeCompare(b.client.ime ?? '')
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Svi klijenti</h1>
          <p className="text-stone-500 text-sm mt-1">
            Pregled i izmena svih učenika u sistemu. Klik na red vodi na izmenu kod izabranog predavača.
          </p>
        </div>
        <Link
          href="/admin/klijenti/novi"
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + Novi klijent
        </Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Email za prijavu</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište / Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Predavači</th>
              <th className="text-right p-3 font-medium text-stone-600">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ client, instructors: instrs }) => (
              <tr key={client.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="p-3 font-medium text-stone-800">
                  {client.ime} {client.prezime}
                </td>
                <td className="p-3 text-stone-600">{client.login_email ?? '—'}</td>
                <td className="p-3 text-stone-600">
                  {client.godiste ?? '—'} {client.razred ? ` / ${client.razred}` : ''}
                </td>
                <td className="p-3 text-stone-600">
                  {instrs.map((i) => (
                    <span key={i.id} className="inline-block mr-2">
                      {i.ime} {i.prezime}
                    </span>
                  ))}
                </td>
                <td className="p-3 text-right">
                  {instrs.length > 0 && (
                    <Link
                      href={`/admin/view/${instrs[0].id}/klijenti/${client.id}`}
                      className="text-amber-600 hover:text-amber-700 font-medium"
                    >
                      Izmeni
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="p-8 text-center text-stone-500">
            Nema klijenata. Dodajte predavača, pa „Novi klijent” ili unesite klijenta kod predavača (Predavači → + Klijent).
          </div>
        )}
      </div>

      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">
          ← Nazad na admin
        </Link>
      </p>
    </div>
  );
}
