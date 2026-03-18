import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Instructor } from '@/types/database';
import DashboardNav from './DashboardNav';
import { getDashboardInstructor } from '@/lib/dashboard';

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

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  const { instructor, isAdminView } = await getDashboardInstructor();

  if (!instructor) {
    if (admin) {
      redirect('/admin?from=dashboard');
    }
    redirect('/login?reason=no_instructor');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav instructor={instructor} isAdminView={isAdminView} />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
