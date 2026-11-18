import type { SupabaseClient } from '@supabase/supabase-js';

let retryAfter = 0;

/** Sačekaj minut pre nove provere nedostajuće migracije; greške veze se ne keširaju. */
export async function readCalendarRpc(admin: SupabaseClient, from: string, to: string) {
  if (Date.now() < retryAfter) return { data: null, error: { code: 'PGRST202', message: 'Funkcija kalendara još nije dostupna.' } };
  const result = await admin.rpc('kalendar_podaci', { p_from: from, p_to: to });
  if (result.error?.code === 'PGRST202') retryAfter = Date.now() + 60_000;
  else retryAfter = 0;
  return result;
}
