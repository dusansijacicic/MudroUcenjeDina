import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Prijava preko servera: Set-Cookie u HTTP odgovoru (radi pouzdano u Firefoxu/Safari-ju).
 * Klijentski signInWithPassword + document.cookie često ne stigne da se pošalje na sledeći zahtev.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neispravan zahtev.' }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: 'Unesite email i lozinku.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) {
    return NextResponse.json({ error: 'Nedostaju env promenljive za Supabase.' }, { status: 500 });
  }

  let response = NextResponse.json({
    ok: true as const,
    next: '/api/auth/resolve-role',
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Pogrešan email ili lozinka.' },
      { status: 401 }
    );
  }

  return response;
}
