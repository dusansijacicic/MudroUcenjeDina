import { NextResponse } from 'next/server';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// Sve tabele aplikacije (redosled: prvo osnovne, pa zavisne – lakše za ručno vraćanje).
// Nalozi za prijavu (auth.users) nisu ovde – njih čuva Supabase Auth, nisu dostupni preko ovog API-ja.
const TABLES = [
  'admin_users',
  'app_settings',
  'instructors',
  'classrooms',
  'programi',
  'term_categories',
  'term_types',
  'clients',
  'instructor_clients',
  'client_programi',
  'client_term_type_status',
  'instructor_weekly_availability',
  'instructor_availability_periods',
  'terms',
  'predavanja',
  'potential_clients',
  'zahtevi_za_cas',
  'otkazani_termini',
  'uplate',
  'blokirani_termini',
  'activity_log',
] as const;

const PAGE = 1000;

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user } = await getAuthedUser();
  if (!user || !(await getIsAdmin())) {
    return NextResponse.json({ error: 'Samo admin.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const tables: Record<string, unknown[]> = {};
  const errors: Record<string, string> = {};

  for (const table of TABLES) {
    const rows: unknown[] = [];
    // Supabase vraća najviše ~1000 redova po upitu – zato se čita u stranama dok se ne dođe do kraja.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.from(table).select('*').range(from, from + PAGE - 1);
      if (error) {
        errors[table] = error.message;
        break;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    if (!errors[table]) tables[table] = rows;
  }

  const now = new Date();
  const body = {
    app: 'Dina kalendar',
    exported_at: now.toISOString(),
    exported_by: user.email ?? user.id,
    row_counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    errors,
    tables,
  };

  const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="dina-bekap-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
