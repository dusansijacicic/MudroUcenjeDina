import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * Nakon logina: proveri ulogu preko service role (zaobilazi RLS) i preusmeri na admin/dashboard/ucenik.
 * Klijent ne šalje upite na instructors/clients pa nema 500 u konzoli.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login?reason=no_session', request.url));
  }

  let target = '/dashboard';
  try {
    const admin = createAdminClient();
    const [admRes, instRes, clRes] = await Promise.all([
      admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
      admin.from('instructors').select('id').eq('user_id', user.id).maybeSingle(),
      admin.from('clients').select('id').eq('user_id', user.id).maybeSingle(),
    ]);
    if (admRes.data) target = '/admin';
    else if (instRes.data) target = '/dashboard';
    else if (clRes.data) target = '/ucenik';
  } catch {
    // nema SUPABASE_SERVICE_ROLE_KEY ili greška – ostani na dashboard
  }

  return NextResponse.redirect(new URL(target, request.url));
}
