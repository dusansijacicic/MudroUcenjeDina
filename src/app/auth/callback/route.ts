import { createClient } from '@/lib/supabase/server';
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
        const { data: adm } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
        if (adm) target = '/admin';
        else {
          const { data: inst } = await supabase.from('instructors').select('id').eq('user_id', user.id).single();
          const { data: cl } = await supabase.from('clients').select('id').eq('user_id', user.id).single();
          if (cl && !inst) target = '/ucenik';
        }
      }
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
