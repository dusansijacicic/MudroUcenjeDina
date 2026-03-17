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
        Super admin – izaberi predavača
      </h1>
      <p className="text-stone-500 text-sm mb-6">
        Kao admin vidiš sve predavače. Klikni da vidiš kalendar i klijente tog predavača.
      </p>
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
              className="flex items-center justify-between p-4 hover:bg-stone-50"
            >
              <span className="font-medium text-stone-800">
                {inst.ime} {inst.prezime}
              </span>
              <span className="text-sm text-stone-500">{inst.email}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
