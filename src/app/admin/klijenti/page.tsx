import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getStanjePoVrstamaZaKlijenta } from '@/app/admin/actions';

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

  const adminSupabase = createAdminClient();
  const { data: links } = await adminSupabase
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

  const clientStanjeList = await Promise.all(
    list.map(async ({ client }) => {
      const stanje = await getStanjePoVrstamaZaKlijenta(client.id);
      const problemTypes = stanje.filter((s) => s.uplaceno < s.odrzano).map((s) => s.term_type_naziv);
      const samoPlaceni = stanje.filter((s) => s.uplaceno >= 1);
      return { clientId: client.id, problemTypes, stanje: samoPlaceni };
    })
  );
  const warningByClientId = new Map(clientStanjeList.map((w) => [w.clientId, w.problemTypes]));
  const stanjeByClientId = new Map(clientStanjeList.map((w) => [w.clientId, w.stanje]));

  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-6 animate-in-delay-1">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Svi klijenti</h1>
          <p className="text-stone-500 text-sm mt-1">
            Pregled i izmena svih učenika u sistemu. Klik na red vodi na izmenu kod izabranog predavača.
          </p>
        </div>
        <Link
          href="/admin/klijenti/novi"
          className="inline-flex items-center rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-500 ui-hover-lift shadow-md focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
        >
          + Novi klijent
        </Link>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm animate-in-delay-2">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Email za prijavu</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište / Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Kupljeno / Održano / Preostalo po vrsti</th>
              <th className="text-left p-3 font-medium text-stone-600">Predavači</th>
              <th className="text-right p-3 font-medium text-stone-600">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ client, instructors: instrs }) => {
              const problemTypes = warningByClientId.get(client.id) ?? [];
              const hasWarning = problemTypes.length > 0;
              const stanje = stanjeByClientId.get(client.id) ?? [];
              return (
              <tr key={client.id} className="border-b border-stone-100 hover:bg-amber-50/50 ui-transition">
                <td className="p-3 font-medium text-stone-800">
                  {client.ime} {client.prezime}
                  {hasWarning && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={`Nema dovoljno kupljenih časova za: ${problemTypes.join(', ')}`}>
                      Nema kupljenih časova ({problemTypes.join(', ')})
                    </span>
                  )}
                </td>
                <td className="p-3 text-stone-600">{client.login_email ?? '—'}</td>
                <td className="p-3 text-stone-600">
                  {client.godiste ?? '—'} {client.razred ? ` / ${client.razred}` : ''}
                </td>
                <td className="p-3 text-stone-600">
                  {stanje.length === 0 ? (
                    <span className="text-stone-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {stanje.map((s) => (
                        <span key={s.term_type_id ?? 'bez'} className="whitespace-nowrap">
                          <span className="font-medium text-stone-700">{s.term_type_naziv}:</span>{' '}
                          <span className="text-stone-600">{s.uplaceno} kupljeno</span>
                          <span className="text-stone-400 mx-0.5">/</span>
                          <span className="text-stone-600">{s.odrzano} održano</span>
                          <span className="text-stone-400 mx-0.5">/</span>
                          <span className="text-amber-700 font-medium">{s.ostalo} preostalo</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-3 text-stone-600">
                  {instrs.map((i) => (
                    <span key={i.id} className="inline-block mr-2">
                      {i.ime} {i.prezime}
                    </span>
                  ))}
                </td>
                <td className="p-3 text-right">
                  <Link
                    href={`/admin/klijenti/${client.id}`}
                    className="text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Izmeni
                  </Link>
                  {instrs.length > 0 && (
                    <span className="text-stone-400 mx-1">|</span>
                  )}
                  {instrs.length > 0 && (
                    <Link
                      href={`/admin/view/${instrs[0].id}/klijenti/${client.id}`}
                      className="text-stone-500 hover:text-stone-700 text-sm"
                    >
                      Kod predavača
                    </Link>
                  )}
                </td>
              </tr>
            );
            })}
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
