import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolvePostAuthPath } from '@/lib/resolve-post-auth-path';

/**
 * Nakon logina: uloga (admin / predavač / učenik) i preusmerenje.
 * Učenik: i kada je samo unešen login_email kod klijenta — poziva se link_client_to_user.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login?reason=no_session', request.url));
  }

  try {
    const path = await resolvePostAuthPath(user, supabase);
    return NextResponse.redirect(new URL(path, request.url));
  } catch (e) {
    console.error('[resolve-role]', e);
    return NextResponse.redirect(new URL('/login?reason=error_rls', request.url));
  }
}
