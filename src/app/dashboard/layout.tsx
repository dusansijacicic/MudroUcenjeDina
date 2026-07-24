import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Instructor } from '@/types/database';
import DashboardNav from './DashboardNav';
import { getDashboardInstructor } from '@/lib/dashboard';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthedUser();
  if (!user) {
    redirect('/login?reason=no_session');
  }

  const { instructor, isAdminView } = await getDashboardInstructor();

  if (!instructor) {
    const isAdmin = await getIsAdmin();
    if (isAdmin) {
      redirect('/admin?from=dashboard');
    }
    redirect('/login?reason=no_instructor');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav instructor={instructor} isAdminView={isAdminView} />
      <main className="w-full px-4 py-6 animate-fade-in">{children}</main>
    </div>
  );
}
