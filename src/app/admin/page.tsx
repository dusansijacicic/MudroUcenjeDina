import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';

/** Početna admin stranica je kalendar. Instruktori su premešteni na /admin/predavaci. */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const params = await searchParams;
  redirect(params?.from ? `/admin/kalendar?from=${encodeURIComponent(params.from)}` : '/admin/kalendar');
}
