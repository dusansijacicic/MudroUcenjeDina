'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function createInstructorAsAdmin(formData: FormData) {
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
  if (!admin) redirect('/login?reason=not_authorized');

  const email = (formData.get('email') as string)?.trim();
  const password = (formData.get('password') as string) ?? '';
  const ime = (formData.get('ime') as string)?.trim();
  const prezime = (formData.get('prezime') as string)?.trim();
  if (!email || !password || !ime || !prezime) {
    return { error: 'Popunite sva polja (email, lozinka, ime, prezime).' };
  }
  if (password.length < 6) {
    return { error: 'Lozinka mora imati najmanje 6 znakova.' };
  }

  const adminSupabase = createAdminClient();
  const { data: newUser, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) {
    return { error: authError.message };
  }
  if (!newUser.user) {
    return { error: 'Korisnik nije kreiran.' };
  }

  const { error: insertError } = await adminSupabase.from('instructors').insert({
    user_id: newUser.user.id,
    ime,
    prezime,
    email,
  });
  if (insertError) {
    return { error: insertError.message };
  }

  redirect('/admin');
}
