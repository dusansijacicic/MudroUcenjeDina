import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      let target = next;
      if (user && next === '/dashboard') {
        // Provera uloge: prvo običan klijent; ako 500 (RLS rekurzija), koristi service role
        let adm: { user_id: string } | null = null;
        let inst: { id: string } | null = null;
        let cl: { id: string } | null = null;
        const admRes = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
        adm = admRes.data ?? null;
        if (!adm) {
          const instRes = await supabase.from('instructors').select('id').eq('user_id', user.id).maybeSingle();
          const clRes = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle();
          if (instRes.error?.code === '42P17' || (instRes.error && String(instRes.error.message).includes('recursion'))) {
            try {
              const adminSupabase = createAdminClient();
              const [i, c] = await Promise.all([
                adminSupabase.from('instructors').select('id').eq('user_id', user.id).maybeSingle(),
                adminSupabase.from('clients').select('id').eq('user_id', user.id).maybeSingle(),
              ]);
              inst = i.data ?? null;
              cl = c.data ?? null;
            } catch {
              // ostavi inst/cl null
            }
          } else {
            inst = instRes.data ?? null;
            cl = clRes.data ?? null;
          }
        }
        if (adm) target = '/admin';
        else if (cl && !inst) target = '/ucenik';
      }
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
