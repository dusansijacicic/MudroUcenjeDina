import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminNav from './AdminNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav />
      <main className="w-full px-4 py-6 animate-fade-in">{children}</main>
    </div>
  );
}
