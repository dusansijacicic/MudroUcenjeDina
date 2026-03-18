'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { termMozeNovoPredavanje, getMaxTerminaPoSlotu } from '@/lib/settings';
import { revalidatePath } from 'next/cache';

export async function createPredavanje(
  termId: string,
  clientId: string,
  odrzano: boolean,
  placeno: boolean,
  komentar: string | null,
  termTypeId: string | null = null
): Promise<{ error?: string }> {
  console.log('[termin] createPredavanje', { termId, clientId });
  const { instructor } = await getDashboardInstructor();
  if (!instructor) {
    console.error('[termin] createPredavanje: no instructor');
    return { error: 'Niste predavač.' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[termin] createPredavanje: createAdminClient failed', e);
    return { error: 'Server greška (admin klijent).' };
  }

  const { data: term, error: termErr } = await admin
    .from('terms')
    .select('id, instructor_id')
    .eq('id', termId)
    .single();
  if (termErr || !term) {
    console.error('[termin] createPredavanje: term fetch', termErr?.message);
    return { error: termErr?.message ?? 'Termin nije pronađen.' };
  }
  if (term.instructor_id !== instructor.id) {
    return { error: 'Niste ovlašćeni za ovaj termin.' };
  }

  const check = await termMozeNovoPredavanje(termId);
  if (!check.ok) {
    return {
      error: `Maksimalan broj časova u ovom terminu je ${check.max}. Trenutno ima ${check.count}. Podešavanja može da menja superadmin.`,
    };
  }

  const { error: insErr } = await admin.from('predavanja').insert({
    term_id: termId,
    client_id: clientId,
    odrzano,
    placeno,
    komentar: komentar?.trim() || null,
    term_type_id: termTypeId || null,
  });
  if (insErr) {
    console.error('[termin] createPredavanje: predavanja insert', insErr.message);
    return { error: insErr.message };
  }

  const { error: icErr } = await admin
    .from('instructor_clients')
    .insert({ instructor_id: instructor.id, client_id: clientId, placeno_casova: 0 });
  if (icErr && icErr.code !== '23505') {
    console.warn('[termin] instructor_clients insert (non-fatal)', icErr.message);
  }
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/klijenti');
  console.log('[termin] createPredavanje success');
  return {};
}

export async function updatePredavanje(
  predavanjeId: string,
  termId: string,
  clientId: string,
  odrzano: boolean,
  placeno: boolean,
  komentar: string | null,
  termTypeId: string | null = null
): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: 'Server greška.' };
  }
  const { data: term } = await admin.from('terms').select('instructor_id').eq('id', termId).single();
  if (!term || term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni.' };
  const { error } = await admin
    .from('predavanja')
    .update({
      term_id: termId,
      client_id: clientId,
      odrzano,
      placeno,
      komentar: komentar?.trim() || null,
      term_type_id: termTypeId || null,
    })
    .eq('id', predavanjeId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/klijenti');
  revalidatePath(`/dashboard/predavanje/${predavanjeId}`);
  return {};
}

export async function deletePredavanje(predavanjeId: string, termId: string): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: 'Server greška.' };
  }
  const { data: pred } = await admin.from('predavanja').select('term_id').eq('id', predavanjeId).single();
  if (!pred) return { error: 'Predavanje nije pronađeno.' };
  const { data: term } = await admin.from('terms').select('instructor_id').eq('id', pred.term_id).single();
  if (!term || term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni.' };
  const { error } = await admin.from('predavanja').delete().eq('id', predavanjeId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/klijenti');
  return {};
}

/** Ista pravila kao za admin: u ciljnom slotu max termina, jedinstven predavač, jedinstvena učionica. */
export async function moveTermAsInstructor(
  termId: string,
  newDate: string,
  newSlotIndex: number
): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: 'Server greška.' };
  }
  const slot = Math.min(12, Math.max(0, newSlotIndex));
  const dateStr = newDate.slice(0, 10);

  const { data: term } = await admin
    .from('terms')
    .select('instructor_id, classroom_id, date, slot_index')
    .eq('id', termId)
    .single();
  if (!term || term.instructor_id !== instructor.id) {
    return { error: 'Niste ovlašćeni za ovaj termin.' };
  }

  const isSameSlot = term.date === dateStr && term.slot_index === slot;
  if (isSameSlot) return {};

  const [maxTerminaPoSlotu, { count: termCount }] = await Promise.all([
    getMaxTerminaPoSlotu(),
    admin.from('terms').select('*', { count: 'exact', head: true }).eq('date', dateStr).eq('slot_index', slot),
  ]);
  if ((termCount ?? 0) >= maxTerminaPoSlotu) {
    return { error: `U izabranom terminu je već ${maxTerminaPoSlotu} termina (maksimum). Izaberite drugi datum ili vreme.` };
  }

  const { data: existingInstructor } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', term.instructor_id)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .maybeSingle();
  if (existingInstructor) {
    return { error: 'Već imate termin u izabranom slotu.' };
  }

  if (term.classroom_id) {
    const { data: existingClassroom } = await admin
      .from('terms')
      .select('id')
      .eq('classroom_id', term.classroom_id)
      .eq('date', dateStr)
      .eq('slot_index', slot)
      .maybeSingle();
    if (existingClassroom) {
      return { error: 'Vaša učionica je već zauzeta u izabranom terminu. Izaberite drugi datum/vreme.' };
    }
  }

  const { error } = await admin
    .from('terms')
    .update({ date: dateStr, slot_index: slot })
    .eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/termin/${termId}`);
  return {};
}

export async function deleteTermAsInstructor(termId: string): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Server greška.' };
  }
  const { data: term } = await admin
    .from('terms')
    .select('instructor_id')
    .eq('id', termId)
    .maybeSingle();
  if (!term || term.instructor_id !== instructor.id) {
    return { error: 'Niste ovlašćeni za ovaj termin.' };
  }
  const { error } = await admin.from('terms').delete().eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return {};
}

/** Postavlja učionicu za termin. Proverava da ista učionica nije već u drugom terminu u istom slotu (pravilo B). */
export async function updateTermClassroom(
  termId: string,
  classroomId: string
): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Server greška.' };
  }
  const { data: term } = await admin
    .from('terms')
    .select('instructor_id, date, slot_index')
    .eq('id', termId)
    .single();
  if (!term || term.instructor_id !== instructor.id) {
    return { error: 'Niste ovlašćeni za ovaj termin.' };
  }
  const { data: existingSameClassroom } = await admin
    .from('terms')
    .select('id')
    .eq('date', term.date)
    .eq('slot_index', term.slot_index)
    .eq('classroom_id', classroomId)
    .neq('id', termId)
    .maybeSingle();
  if (existingSameClassroom) {
    return { error: 'Ova učionica je već zauzeta u ovom terminu (datum + vreme). Izaberite drugu učionicu.' };
  }
  const { error } = await admin
    .from('terms')
    .update({ classroom_id: classroomId })
    .eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/termin/${termId}`);
  return {};
}
