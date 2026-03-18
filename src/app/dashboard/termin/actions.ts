'use server';

import { createClient } from '@/lib/supabase/server';
import { getDashboardInstructor } from '@/lib/dashboard';
import { termMozeNovoPredavanje } from '@/lib/settings';
import { revalidatePath } from 'next/cache';

export async function createPredavanje(
  termId: string,
  clientId: string,
  odrzano: boolean,
  placeno: boolean,
  komentar: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };

  const { data: term } = await supabase
    .from('terms')
    .select('id, instructor_id')
    .eq('id', termId)
    .single();
  if (!term || (term as { instructor_id: string }).instructor_id !== instructor.id) {
    return { error: 'Termin nije pronađen ili niste ovlašćeni.' };
  }

  const check = await termMozeNovoPredavanje(termId);
  if (!check.ok) {
    return {
      error: `Maksimalan broj časova u ovom terminu je ${check.max}. Trenutno ima ${check.count}. Podešavanja može da menja superadmin.`,
    };
  }

  const { error } = await supabase.from('predavanja').insert({
    term_id: termId,
    client_id: clientId,
    odrzano,
    placeno,
    komentar: komentar?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  return {};
}
