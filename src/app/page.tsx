import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { resolvePostAuthPath } from '@/lib/resolve-post-auth-path';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?reason=no_session');

  const path = await resolvePostAuthPath(user, supabase);
  redirect(path);
}
