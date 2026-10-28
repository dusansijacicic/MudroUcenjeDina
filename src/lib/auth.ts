import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Ulogovani korisnik + supabase klijent za ovaj request.
 * cache() deduplicira: layout i stranica koji je oboje pozovu unutar
 * istog renderovanja dele isti (jedan) mrežni poziv ka Supabase Auth-u.
 */
export const getAuthedUser = cache(async function getAuthedUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
}> {
  const supabase = await createClient();
  // getClaims() proverava potpis JWT-a lokalno (projekat koristi ES256 ključeve, javni ključ se
  // preuzme jednom i kešira) – bez mrežnog poziva ka Supabase Auth-u na svakom renderu stranice,
  // što je ranije radio getUser(). Aplikacija od korisnika koristi samo id i email.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user = claims?.sub
    ? ({ id: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined } as User)
    : null;
  return { supabase, user };
});

/** Da li je trenutni korisnik admin. Deduplicirano po requestu preko getAuthedUser(). */
export const getIsAdmin = cache(async function getIsAdmin(): Promise<boolean> {
  const { supabase, user } = await getAuthedUser();
  if (!user) return false;
  const { data } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  return !!data;
});
