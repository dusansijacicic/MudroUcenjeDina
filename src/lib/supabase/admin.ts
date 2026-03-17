import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client sa service_role ključem.
 * Koristi samo u Server Actions / API rute za admin operacije (npr. kreiranje korisnika).
 * Nikad ne šalji service_role na klijent.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nije postavljen. Dodaj ga u .env.local (Supabase → Project Settings → API → service_role).');
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
