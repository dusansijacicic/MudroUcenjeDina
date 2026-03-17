import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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
    redirect('/login');
  }

  const { data: instructor } = await supabase
    .from('instructors')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!instructor) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav instructor={instructor as Instructor} />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
