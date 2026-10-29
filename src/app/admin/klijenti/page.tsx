import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getStanjePoVrstamaZaKlijenteBatch } from '@/app/admin/actions';
import { buildStanjeFromMaps, type StanjeVrstaRow } from '@/lib/stanje';
import AdminKlijentiTable, { type AdminKlijentRow } from './AdminKlijentiTable';

/** [client_id, term_type_id, uplaceno, odrzano] – red iz baze funkcije stanje_svih_klijenata (migracija 046). */
type StanjeTuple = [string, string | null, number, number];

export default async function AdminSviKlijentiPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  // Direktno iz clients (ne preko instructor_clients join-a) – tako se ne gube klijenti
  // koji još nemaju dodeljenog instruktora.
  // Sve u JEDNOM krugu upita: klijenti, instruktori i već sabrano stanje (baza sabira, ne app).
  const [{ data: clients }, { data: links }, stanjeRpc, { data: termTypes }] = await Promise.all([
    adminSupabase
      .from('clients')
      .select('id, ime, prezime, godiste, razred, skola, kontakt_telefon, datum_testiranja')
      .order('ime')
      .order('prezime')
      .limit(2000),
    adminSupabase
      .from('instructor_clients')
      .select('instructor_id, client_id, instructor:instructors(id, ime, prezime)')
      .limit(2000),
    adminSupabase.rpc('stanje_svih_klijenata'),
    adminSupabase.from('term_types').select('id, naziv').order('naziv'),
  ]);

  const instructorsByClientId = new Map<string, { id: string; ime: string; prezime: string }[]>();
  for (const row of links ?? []) {
    const i = row.instructor as unknown as { id: string; ime: string; prezime: string } | null;
    if (!i) continue;
    const list = instructorsByClientId.get(row.client_id) ?? [];
    list.push({ id: i.id, ime: i.ime, prezime: i.prezime });
    instructorsByClientId.set(row.client_id, list);
  }

  let stanjeMap: Map<string, StanjeVrstaRow[]>;
  if (!stanjeRpc.error && Array.isArray(stanjeRpc.data)) {
    const uplate = new Map<string, Map<string, number>>();
    const odrzano = new Map<string, Map<string, number>>();
    for (const [cid, tid, upl, odr] of stanjeRpc.data as StanjeTuple[]) {
      const key = tid ?? '__bez_vrste__';
      if (!uplate.has(cid)) {
        uplate.set(cid, new Map());
        odrzano.set(cid, new Map());
      }
      uplate.get(cid)!.set(key, upl);
      odrzano.get(cid)!.set(key, odr);
    }
    stanjeMap = new Map(
      [...uplate.keys()].map((cid) => [cid, buildStanjeFromMaps(uplate.get(cid)!, odrzano.get(cid)!, termTypes ?? [])])
    );
  } else {
    // Migracija 046 još nije pokrenuta – stari (sporiji) način.
    stanjeMap = await getStanjePoVrstamaZaKlijenteBatch((clients ?? []).map((c) => c.id));
  }

  const rows: AdminKlijentRow[] = (clients ?? []).map((c) => {
    const stanjeAll = stanjeMap.get(c.id) ?? [];
    return {
      id: c.id,
      ime: c.ime ?? '',
      prezime: c.prezime ?? '',
      godiste: c.godiste ?? null,
      razred: c.razred ?? null,
      skola: c.skola ?? null,
      kontaktTelefon: c.kontakt_telefon ?? null,
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
