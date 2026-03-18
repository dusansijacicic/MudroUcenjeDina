import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?reason=no_session');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (admin) {
    redirect('/admin');
  }

  const adminSupabase = createAdminClient();
  const { data: instructor } = await adminSupabase
    .from('instructors')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (instructor) {
    redirect('/dashboard');
  }

  const { data: client } = await adminSupabase
    .from('clients')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (client) {
    redirect('/ucenik');
  }

  redirect('/login?reason=no_instructor');
}
