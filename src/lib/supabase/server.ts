import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { merenaFetch } from '@/lib/merenje';

export async function createClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return createServerClient(
    url,
    key,
    {
      // Spori pozivi ka bazi/auth-u se upisuju u log (Vercel → Logs, „[merenje]“).
      global: { fetch: merenaFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Server Components
          }
        },
      },
    }
  );
}
