import { createClient } from '@/lib/supabase/server';
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

  const { data: instructors } = await supabase
    .from('instructors')
    .select('id, ime, prezime, email')
    .order('prezime');

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
      </div>

      <p className="text-stone-500 text-sm mb-6">
        Možete da dodate predavača, da vidite i menjate sve klijente („Svi klijenti”), da zakažete termin za bilo kog predavača, ili da kliknete na predavača da vidite njegov kalendar i klijente.
      </p>

      <h2 className="text-sm font-medium text-stone-600 mb-2">Predavači (klik za kalendar i klijente)</h2>
      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(instructors ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">
            Nema predavača u bazi. Registruj predavača preko /login.
          </div>
        ) : (
          (instructors ?? []).map((inst) => (
            <div key={inst.id} className="flex items-center justify-between p-4 hover:bg-stone-50 gap-2">
              <Link href={`/admin/view/${inst.id}`} className="flex-1 flex items-center justify-between min-w-0">
                <span className="font-medium text-stone-800">
                  {inst.ime} {inst.prezime}
                </span>
                <span className="text-sm text-stone-500 shrink-0 ml-2">{inst.email}</span>
              </Link>
              <Link
                href={`/admin/view/${inst.id}/klijenti/novi`}
                className="text-sm text-amber-600 hover:text-amber-700 shrink-0"
              >
                + Klijent
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
