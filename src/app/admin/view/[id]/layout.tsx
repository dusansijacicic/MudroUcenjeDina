import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import type { Instructor } from '@/types/database';
import AdminViewNav from './AdminViewNav';

/** Cookie view_as_instructor se postavlja u middleware kada admin uđe u /admin/view/[id]. */

export default async function AdminViewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: instructor } = await adminSupabase
    .from('instructors')
    .select('*')
    .eq('id', id)
    .single();

  if (!instructor) notFound();

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminViewNav instructor={instructor as Instructor} />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
