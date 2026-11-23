import 'server-only';

import { gzipSync } from 'node:zlib';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Sve tabele aplikacije (redosled: prvo osnovne, pa zavisne – lakše za ručno vraćanje).
 * Nalozi za prijavu (auth.users) nisu ovde – njih čuva Supabase Auth, nisu dostupni preko ovog API-ja.
 * Nova tabela u migracijama mora da se doda i ovde (test u tests/calendar.test.cjs to proverava).
 */
export const BEKAP_TABELE = [
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
  'instruktor_nedeljne_blokade',
  'terms',
  'predavanja',
  'potential_clients',
  'zahtevi_za_cas',
  'otkazani_termini',
  'placeni_paketi',
  'uplate',
  'blokirani_termini',
  'uvoz_imena',
  'activity_log',
] as const;

/** Privatni Supabase Storage bucket za automatske dnevne bekape. */
export const BEKAP_BUCKET = 'bekapi';
/** Koliko dana se čuvaju automatski bekapi. */
export const BEKAP_CUVA_DANA = 90;

const STRANA = 1000;
const IME = /^bekap-(\d{4}-\d{2}-\d{2})\.json\.gz$/;

export type BekapSadrzaj = {
  app: string;
  exported_at: string;
  exported_by: string;
  row_counts: Record<string, number>;
  errors: Record<string, string>;
  tables: Record<string, unknown[]>;
};

/** Pročita sve tabele (u stranama od 1000 redova – Supabase više ne vraća u jednom upitu). */
export async function procitajBazu(admin: Admin, ko: string): Promise<BekapSadrzaj> {
  const tables: Record<string, unknown[]> = {};
  const errors: Record<string, string> = {};
  for (const tabela of BEKAP_TABELE) {
    const redovi: unknown[] = [];
    for (let od = 0; ; od += STRANA) {
      const { data, error } = await admin.from(tabela).select('*').range(od, od + STRANA - 1);
      if (error) {
        errors[tabela] = error.message;
        break;
      }
      redovi.push(...(data ?? []));
      if (!data || data.length < STRANA) break;
    }
    if (!errors[tabela]) tables[tabela] = redovi;
  }
  return {
    app: 'Dina kalendar',
    exported_at: new Date().toISOString(),
    exported_by: ko,
    row_counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    errors,
    tables,
  };
}

/** Današnji datum po beogradskom vremenu (YYYY-MM-DD). */
function danas(kada: Date): string {
  return kada.toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
}

async function obezbediBucket(admin: Admin): Promise<string | null> {
  const { error } = await admin.storage.getBucket(BEKAP_BUCKET);
  if (!error) return null;
  const { error: e2 } = await admin.storage.createBucket(BEKAP_BUCKET, { public: false });
  if (e2 && !/already exists/i.test(e2.message)) return e2.message;
  return null;
}

export type DnevniBekap = { ime: string; datum: string; velicina: number | null };

/** Svi automatski bekapi, najnoviji prvi. */
export async function listaBekapa(admin: Admin): Promise<{ bekapi: DnevniBekap[]; greska?: string }> {
  const { data, error } = await admin.storage.from(BEKAP_BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  if (error) return { bekapi: [], greska: error.message };
  const bekapi = (data ?? [])
    .map((f) => {
      const m = IME.exec(f.name);
      if (!m) return null;
      const velicina = (f.metadata as { size?: number } | null)?.size ?? null;
      return { ime: f.name, datum: m[1], velicina };
    })
    .filter((b): b is DnevniBekap => b !== null)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  return { bekapi };
}

/**
 * Napravi bekap cele baze (gzip JSON) u Storage-u kao bekap-YYYY-MM-DD.json.gz (isti dan → zamena) i
 * obriše bekape starije od BEKAP_CUVA_DANA dana.
 */
export async function sacuvajDnevniBekap(
  admin: Admin,
  ko: string,
  kada = new Date()
): Promise<{ ime?: string; velicina?: number; redova?: number; obrisano?: number; greskeTabela?: Record<string, string>; error?: string }> {
  const greskaBucketa = await obezbediBucket(admin);
  if (greskaBucketa) return { error: `Storage: ${greskaBucketa}` };

  const sadrzaj = await procitajBazu(admin, ko);
  const gz = gzipSync(Buffer.from(JSON.stringify(sadrzaj)));
  const datum = danas(kada);
  const ime = `bekap-${datum}.json.gz`;
  const { error } = await admin.storage.from(BEKAP_BUCKET).upload(ime, gz, { contentType: 'application/gzip', upsert: true });
  if (error) return { error: `Upis bekapa: ${error.message}` };

  // Čuva se BEKAP_CUVA_DANA dana – stariji se brišu.
  const granica = new Date(`${datum}T12:00:00Z`);
  granica.setUTCDate(granica.getUTCDate() - BEKAP_CUVA_DANA);
  const granicaDatum = granica.toISOString().slice(0, 10);
  const { bekapi } = await listaBekapa(admin);
  const zaBrisanje = bekapi.filter((b) => b.datum < granicaDatum).map((b) => b.ime);
  let obrisano = 0;
  if (zaBrisanje.length > 0) {
    const { data } = await admin.storage.from(BEKAP_BUCKET).remove(zaBrisanje);
    obrisano = data?.length ?? 0;
  }

  return {
    ime,
    velicina: gz.length,
    redova: Object.values(sadrzaj.row_counts).reduce((a, b) => a + b, 0),
    obrisano,
    greskeTabela: sadrzaj.errors,
  };
}

/** Kratkotrajan link za preuzimanje jednog bekapa (samo za admina, preko rute). */
export async function linkZaBekap(admin: Admin, ime: string): Promise<{ url?: string; error?: string }> {
  if (!IME.test(ime)) return { error: 'Neispravno ime bekapa.' };
  const { data, error } = await admin.storage.from(BEKAP_BUCKET).createSignedUrl(ime, 60, { download: ime });
  if (error || !data?.signedUrl) return { error: error?.message ?? 'Link nije napravljen.' };
  return { url: data.signedUrl };
}
