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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Predavači</h1>
          <p className="text-stone-500 text-sm mt-0.5">
            Klik na predavača otvara pregled: kalendar, statistiku (slotovi, održani časovi) i klijente.
          </p>
        </div>
        <Link
          href="/admin/predavaci/novi"
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          + Novi predavač
        </Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 shadow-sm">
        {(instructors ?? []).length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            Nema predavača u bazi. Dodaj predavača preko „Novi predavač” ili registracije na /login.
          </div>
        ) : (
          (instructors ?? []).map((inst) => (
            <Link
              key={inst.id}
              href={`/admin/view/${inst.id}`}
              className="flex items-center justify-between p-4 hover:bg-amber-50/50 gap-4 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 truncate">
                  {inst.ime} {inst.prezime}
                </div>
                <div className="text-sm text-stone-500 truncate">
                  {inst.email}
                </div>
              </div>
              <span className="text-sm text-amber-600 shrink-0">
                Pregled i statistika →
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
