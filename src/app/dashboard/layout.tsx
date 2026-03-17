import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Instructor } from '@/types/database';
import DashboardNav from './DashboardNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?reason=no_session');
  }

  const cookieStore = await cookies();
  const viewAsId = cookieStore.get('view_as_instructor')?.value;

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  let instructor: unknown = null;

  if (admin && viewAsId) {
    const { data } = await supabase
      .from('instructors')
      .select('*')
      .eq('id', viewAsId)
      .single();
    instructor = data;
  }

  if (!instructor) {
    const { data } = await supabase
      .from('instructors')
      .select('*')
      .eq('user_id', user.id)
      .single();
    instructor = data;
  }

  if (!instructor) {
    if (admin) {
      redirect('/admin?from=dashboard');
    }
    redirect('/login?reason=no_instructor');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav instructor={instructor as Instructor} isAdminView={!!(admin && viewAsId)} />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
