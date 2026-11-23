import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sacuvajDnevniBekap } from '@/lib/bekap';

/**
 * Automatski dnevni bekap (Vercel Cron, vercel.json – svake noći). Ceo sadržaj baze kao gzip JSON u
 * privatnom Supabase Storage bucket-u „bekapi“; bekapi stariji od 90 dana se brišu.
 *
 * Zaštita: Vercel uz poziv šalje „Authorization: Bearer <CRON_SECRET>“ kad je CRON_SECRET postavljen u
 * Vercel → Settings → Environment Variables. Bez te promenljive ruta ne radi ništa.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const tajna = process.env.CRON_SECRET;
  if (!tajna) {
    console.error('[bekap] CRON_SECRET nije postavljen u Vercel → Settings → Environment Variables – dnevni bekap se ne pravi.');
    return NextResponse.json({ error: 'CRON_SECRET nije postavljen.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${tajna}`) {
    return NextResponse.json({ error: 'Nije dozvoljeno.' }, { status: 401 });
  }

  const t0 = Date.now();
  const res = await sacuvajDnevniBekap(createAdminClient(), 'automatski (cron)');
  const ms = Date.now() - t0;
  if (res.error) {
    console.error(`[bekap] NEUSPEH posle ${ms}ms: ${res.error}`);
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  const greske = Object.keys(res.greskeTabela ?? {});
  console.log(
    `[bekap] ${res.ime} · ${res.redova} redova · ${Math.round((res.velicina ?? 0) / 1024)} KB · obrisano starih: ${res.obrisano} · ${ms}ms` +
      (greske.length ? ` · tabele sa greškom: ${greske.join(', ')}` : '')
  );
  return NextResponse.json({ ok: true, ...res, ms });
}
