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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
