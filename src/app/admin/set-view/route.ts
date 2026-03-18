import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) return NextResponse.redirect(new URL('/login', request.url));

  const instructorId = request.nextUrl.searchParams.get('instructor');
  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/admin';
  const url = new URL(redirectTo.startsWith('/') ? redirectTo : `/${redirectTo}`, request.url);

  const res = NextResponse.redirect(url);
  if (instructorId) {
    res.cookies.set('view_as_instructor', instructorId, { path: '/', maxAge: 60 * 60 * 24 });
  }
  return res;
}
