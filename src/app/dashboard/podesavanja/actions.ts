'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { revalidatePath } from 'next/cache';

export type SaveInstructorSettingsInput = {
  ime: string;
  prezime: string;
  telefon: string | null;
  color: string | null;
  availability: Array<{ day_of_week: number; slot_index: number }>;
};

/**
 * Čuva podešavanja predavača (profil + nedeljna dostupnost) preko service role da zaobiđe RLS 500.
 */
export async function saveInstructorSettings(
  instructorId: string,
  data: SaveInstructorSettingsInput
): Promise<{ error?: string }> {
  console.log('[podesavanja] saveInstructorSettings start', { instructorId });
  const { instructor } = await getDashboardInstructor();
  if (!instructor) {
    console.error('[podesavanja] no instructor');
    return { error: 'Niste ulogovani kao predavač.' };
  }
  if (instructor.id !== instructorId) {
    console.error('[podesavanja] instructor id mismatch', instructor.id, instructorId);
    return { error: 'Niste ovlašćeni da menjate ovog predavača.' };
  }

  let adminSupabase;
  try {
    adminSupabase = createAdminClient();
  } catch (e) {
    console.error('[podesavanja] createAdminClient failed', e);
    return { error: 'Server nije podešen (nedostaje SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const { error: updateErr } = await adminSupabase
    .from('instructors')
    .update({
      ime: data.ime.trim(),
      prezime: data.prezime.trim(),
      telefon: data.telefon?.trim() || null,
      color: data.color?.trim() || null,
    })
    .eq('id', instructorId);

  if (updateErr) {
    console.error('[podesavanja] instructors update failed', updateErr.message, updateErr.code);
    return { error: `Profil: ${updateErr.message}` };
  }
  console.log('[podesavanja] instructor profile updated');

  const { error: delErr } = await adminSupabase
    .from('instructor_weekly_availability')
    .delete()
    .eq('instructor_id', instructorId);
  if (delErr) {
    console.error('[podesavanja] availability delete failed', delErr.message);
    return { error: `Dostupnost (brisanje): ${delErr.message}` };
  }

  if (data.availability.length > 0) {
    const rows = data.availability.map((a) => ({
      instructor_id: instructorId,
      day_of_week: a.day_of_week,
      slot_index: a.slot_index,
    }));
    const { error: insErr } = await adminSupabase
      .from('instructor_weekly_availability')
      .insert(rows);
    if (insErr) {
      console.error('[podesavanja] availability insert failed', insErr.message);
      return { error: `Dostupnost: ${insErr.message}` };
    }
    console.log('[podesavanja] availability inserted', rows.length, 'rows');
  }

  revalidatePath('/dashboard/podesavanja');
  revalidatePath('/dashboard');
  console.log('[podesavanja] saveInstructorSettings success');
  return {};
}
