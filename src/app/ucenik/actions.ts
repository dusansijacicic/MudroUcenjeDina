'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { normalizeClientPol } from '@/lib/client-pol';

export async function updateUcenikProfil(payload: {
  pol: string | null;
  datum_testiranja: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' };

  const pol = normalizeClientPol(payload.pol);
  const raw = payload.datum_testiranja?.trim();
  const datum = raw ? raw.slice(0, 10) : null;

  const { error } = await supabase.rpc('ucenik_update_own_profile', {
    p_pol: pol,
    p_datum_testiranja: datum,
  });
  if (error) return { error: error.message };

  revalidatePath('/ucenik');
  revalidatePath('/ucenik/profil');
  return {};
}
