import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getStanjePoVrstamaZaKlijenteBatch } from '@/app/admin/actions';
import { CLIENT_POL_OPTIONS } from '@/lib/client-pol';
import AdminKlijentiTable, { type AdminKlijentRow } from './AdminKlijentiTable';

function polLabel(pol: string | null | undefined): string {
  if (!pol) return '—';
  return CLIENT_POL_OPTIONS.find((o) => o.value === pol)?.label ?? pol;
}

export default async function AdminSviKlijentiPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  // Direktno iz clients (ne preko instructor_clients join-a) – tako se ne gube klijenti
  // koji još nemaju dodeljenog instruktora.
  const [{ data: clients }, { data: links }] = await Promise.all([
    adminSupabase
      .from('clients')
      .select('id, ime, prezime, pol, login_email, godiste, razred, skola, kontakt_telefon, datum_testiranja')
      .order('ime')
      .order('prezime')
      .limit(2000),
    adminSupabase
      .from('instructor_clients')
      .select('instructor_id, client_id, instructor:instructors(id, ime, prezime)')
      .limit(2000),
  ]);

  const instructorsByClientId = new Map<string, { id: string; ime: string; prezime: string }[]>();
  for (const row of links ?? []) {
    const i = row.instructor as unknown as { id: string; ime: string; prezime: string } | null;
    if (!i) continue;
    const list = instructorsByClientId.get(row.client_id) ?? [];
    list.push({ id: i.id, ime: i.ime, prezime: i.prezime });
    instructorsByClientId.set(row.client_id, list);
  }

  const clientIds = (clients ?? []).map((c) => c.id);
  const stanjeMap = await getStanjePoVrstamaZaKlijenteBatch(clientIds);

  const rows: AdminKlijentRow[] = (clients ?? []).map((c) => {
    const stanjeAll = stanjeMap.get(c.id) ?? [];
    return {
      id: c.id,
      ime: c.ime ?? '',
      prezime: c.prezime ?? '',
      pol: c.pol ?? null,
      polLabel: polLabel(c.pol),
      loginEmail: c.login_email ?? null,
      godiste: c.godiste ?? null,
      razred: c.razred ?? null,
      datumTestiranja: c.datum_testiranja ?? null,
      instructors: instructorsByClientId.get(c.id) ?? [],
      problemTypes: stanjeAll.filter((s) => s.uplaceno < s.odrzano).map((s) => s.term_type_naziv),
      stanje: stanjeAll.filter((s) => s.uplaceno >= 1),
    };
  });

  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-6 animate-in-delay-1">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Svi klijenti</h1>
          <p className="text-stone-500 text-sm mt-1">
            Pregled i izmena svih učenika u sistemu. Klik na red vodi na izmenu kod izabranog instruktora.
          </p>
        </div>
        <Link
          href="/admin/klijenti/novi"
          className="inline-flex items-center rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-500 ui-hover-lift shadow-md focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
        >
          + Novi klijent
        </Link>
      </div>

      <div className="animate-in-delay-2">
        <AdminKlijentiTable rows={rows} />
      </div>

      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">
          ← Nazad na admin
        </Link>
      </p>
    </div>
  );
}
