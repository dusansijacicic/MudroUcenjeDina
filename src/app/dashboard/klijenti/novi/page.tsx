import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Samo super admin može da dodaje klijente; koristi Admin → Svi klijenti → Novi klijent. */
export default async function NoviKlijentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (admin) redirect('/admin/klijenti/novi');
  redirect('/dashboard/klijenti?reason=only_admin_adds_clients');
}
