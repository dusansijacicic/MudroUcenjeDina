import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolvePostAuthPath } from '@/lib/resolve-post-auth-path';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.redirect(`${origin}/login?error=auth`);
      }

      // Eksplicitni linkovi (npr. reset lozinke) — ne mešati sa ulogom
      if (next === '/promena-sifre' || next === '/registracija-ucenik') {
        return NextResponse.redirect(`${origin}${next}`);
      }

      const path = await resolvePostAuthPath(user, supabase);
      return NextResponse.redirect(`${origin}${path}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
