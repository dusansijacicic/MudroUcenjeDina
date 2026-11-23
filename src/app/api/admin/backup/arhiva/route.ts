import { NextResponse } from 'next/server';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { linkZaBekap, sacuvajDnevniBekap } from '@/lib/bekap';

/**
 * Arhiva automatskih bekapa (Podešavanja):
 *  GET ?ime=bekap-YYYY-MM-DD.json.gz – preuzimanje (kratkotrajan potpisan link iz Storage-a);
 *  POST – odmah napravi današnji bekap u arhivi (isto što i noćni automatski).
 * Samo za admina.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function admin() {
  const { user } = await getAuthedUser();
  if (!user || !(await getIsAdmin())) return null;
  return user;
}

export async function GET(request: Request) {
  if (!(await admin())) return NextResponse.json({ error: 'Samo admin.' }, { status: 403 });
  const ime = new URL(request.url).searchParams.get('ime') ?? '';
  const res = await linkZaBekap(createAdminClient(), ime);
  if (!res.url) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.redirect(res.url);
}

export async function POST() {
  const user = await admin();
  if (!user) return NextResponse.json({ error: 'Samo admin.' }, { status: 403 });
  const res = await sacuvajDnevniBekap(createAdminClient(), user.email ?? user.id);
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, ime: res.ime, velicina: res.velicina, obrisano: res.obrisano, greskeTabela: res.greskeTabela });
}
