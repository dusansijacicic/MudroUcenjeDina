import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_VIEW_PREFIX = '/admin/view/';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  /** UUID iz /admin/view/[id] – postavi kolačić na kraju (posle Supabase refresha). */
  let viewAsInstructorId: string | null = null;
  if (pathname.startsWith(ADMIN_VIEW_PREFIX)) {
    const segment = pathname.slice(ADMIN_VIEW_PREFIX.length).split('/')[0];
    if (segment && UUID_REGEX.test(segment)) {
      viewAsInstructorId = segment;
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        /**
         * Zvanični Supabase SSR obrazac: prvo ažuriraj request kolačiće, pa NOVI
         * NextResponse.next({ request }). Safari/Firefox često ne primene sesiju ako
         * se odgovor ne napravi ponovo nakon setovanja (Chrome je ponekad „popustljiviji”).
         */
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  await supabase.auth.getUser();

  if (viewAsInstructorId) {
    supabaseResponse.cookies.set('view_as_instructor', viewAsInstructorId, {
      path: '/',
      maxAge: 60 * 60 * 24,
      sameSite: 'lax',
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
