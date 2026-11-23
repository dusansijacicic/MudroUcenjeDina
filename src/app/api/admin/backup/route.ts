import { NextResponse } from 'next/server';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { procitajBazu } from '@/lib/bekap';

// Ručni bekap: sve tabele (lib/bekap.ts) u jedan JSON fajl za preuzimanje.
// Automatski dnevni bekap: api/cron/bekap (čuva se 90 dana u Supabase Storage-u).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const { user } = await getAuthedUser();
  if (!user || !(await getIsAdmin())) {
    return NextResponse.json({ error: 'Samo admin.' }, { status: 403 });
  }

  const body = await procitajBazu(createAdminClient(), user.email ?? user.id);
  const stamp = body.exported_at.slice(0, 16).replace('T', '_').replace(':', '-');
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="dina-bekap-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
