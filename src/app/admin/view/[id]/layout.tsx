import { createClient } from '@/lib/supabase/server';
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
