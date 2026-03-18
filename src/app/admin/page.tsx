import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminFromDashboardToast from '@/components/AdminFromDashboardToast';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
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

  let instructors: { id: string; ime: string; prezime: string; email: string }[] | null = null;
  try {
    const adminSupabase = createAdminClient();
    const { data } = await adminSupabase
      .from('instructors')
      .select('id, ime, prezime, email')
      .order('prezime');
    instructors = data;
  } catch {
    const { data } = await supabase
      .from('instructors')
      .select('id, ime, prezime, email')
      .order('prezime');
    instructors = data;
  }

  return (
    <div>
      <AdminFromDashboardToast from={params?.from} />
      <h1 className="text-xl font-semibold text-stone-800 mb-2">
        Super admin
      </h1>
      <p className="text-stone-500 text-sm mb-6">
        Možete da dodate predavača, klijenta/djaka, da zakažete termin za bilo kog predavača, ili da kliknete na predavača da vidite njegov kalendar i klijente.
      </p>

      <div className="flex flex-wrap gap-3 mb-8">
        <Link
          href="/admin/predavaci/novi"
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + Novi predavač
        </Link>
        <Link
          href="/admin/klijenti"
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Svi klijenti
        </Link>
        <Link
          href="/admin/termin/novi"
          className="inline-flex items-center rounded-lg bg-stone-700 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          Zakaži termin za predavača
        </Link>
        <Link
          href="/admin/kalendar"
          className="inline-flex items-center rounded-lg bg-stone-600 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Kalendar (svi termini)
        </Link>
        <Link
          href="/admin/vrste-termina"
          className="inline-flex items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Vrste termina
        </Link>
        <Link
          href="/admin/ucionice"
          className="inline-flex items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Učionice
        </Link>
        <Link
          href="/admin/podesavanja"
          className="inline-flex items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Podešavanja
        </Link>
        <Link
          href="/admin/uplate"
          className="inline-flex items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Evidencija uplata
        </Link>
      </div>

      <p className="text-stone-500 text-sm mb-6">
        Možete da dodate predavača, da vidite i menjate sve klijente („Svi klijenti”), da zakažete termin za bilo kog predavača, ili da kliknete na predavača da vidite njegov kalendar i klijente.
      </p>

      <h2 className="text-sm font-medium text-stone-600 mb-2">Predavači (klik za statistiku i pregled)</h2>
      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(instructors ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">
            Nema predavača u bazi. Registruj predavača preko /login.
          </div>
        ) : (
          (instructors ?? []).map((inst) => (
            <Link
              key={inst.id}
              href={`/admin/view/${inst.id}`}
              className="flex items-center justify-between p-4 hover:bg-stone-50 gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 truncate">
                  {inst.ime} {inst.prezime}
                </div>
                <div className="text-sm text-stone-500 truncate">
                  {inst.email}
                </div>
              </div>
              <span className="text-xs text-stone-400 shrink-0">
                Statistika →
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
