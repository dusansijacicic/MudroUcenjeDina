'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { termMozeNovoPredavanje } from '@/lib/settings';
import { SEEDED_TERM_CATEGORY_INDIVIDUAL_ID } from '@/lib/term-categories';
import { revalidatePath } from 'next/cache';

function getAdmin() {
  try {
    return createAdminClient();
  } catch (e) {
    console.error('[zahtevi actions] createAdminClient failed', e);
    return null;
  }
}

export async function preuzmiZahtev(zahtevId: string): Promise<{ error?: string }> {
  console.log('[zahtevi] preuzmiZahtev', zahtevId);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) {
    console.error('[zahtevi] preuzmiZahtev: no instructor');
    return { error: 'Niste instruktor.' };
  }
  const admin = getAdmin();
  if (!admin) return { error: 'Server greška (admin klijent).' };

  const { data: zahtev, error: fetchErr } = await admin
    .from('zahtevi_za_cas')
    .select('id, instructor_id, client_id, status')
    .eq('id', zahtevId)
    .single();
  if (fetchErr) {
    console.error('[zahtevi] preuzmiZahtev fetch', fetchErr.message);
    return { error: fetchErr.message || 'Zahtev nije pronađen.' };
  }
  if (!zahtev || zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  if (zahtev.instructor_id != null) return { error: 'Zahtev je već preuzet.' };

  const { data: link } = await admin
    .from('instructor_clients')
    .select('instructor_id')
    .eq('instructor_id', instructor.id)
    .eq('client_id', zahtev.client_id)
    .single();
  if (!link) return { error: 'Ovaj klijent nije kod vas.' };

  const { error } = await admin
    .from('zahtevi_za_cas')
    .update({ instructor_id: instructor.id })
    .eq('id', zahtevId);
  if (error) {
    console.error('[zahtevi] preuzmiZahtev update', error.message);
    return { error: error.message };
  }
  revalidatePath('/dashboard/zahtevi');
  return {};
}

export async function potvrdiZahtev(zahtevId: string): Promise<{ error?: string }> {
  console.log('[zahtevi] potvrdiZahtev', zahtevId);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  const admin = getAdmin();
  if (!admin) return { error: 'Server greška (admin klijent).' };

  const { data: zahtev, error: fetchErr } = await admin
    .from('zahtevi_za_cas')
    .select('*')
    .eq('id', zahtevId)
    .single();
  if (fetchErr || !zahtev) {
    console.error('[zahtevi] potvrdiZahtev fetch', fetchErr?.message);
    return { error: fetchErr?.message ?? 'Zahtev nije pronađen.' };
  }
  if (zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  const targetInstructorId = zahtev.instructor_id ?? instructor.id;
  if (targetInstructorId !== instructor.id) return { error: 'Niste ovlašćeni.' };

  const dateStr = String(zahtev.requested_date).slice(0, 10);
  const slot = Math.min(12, Math.max(0, zahtev.requested_slot_index));

  let termId: string;
  const { data: existing } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', targetInstructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .single();
  if (existing) {
    termId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('terms')
      .insert({
        instructor_id: targetInstructorId,
        date: dateStr,
        slot_index: slot,
        term_category_id: SEEDED_TERM_CATEGORY_INDIVIDUAL_ID,
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('[zahtevi] potvrdiZahtev terms insert', insErr?.message);
      return { error: insErr?.message ?? 'Termin nije kreiran.' };
    }
    termId = inserted.id;
  }

  const limitCheck = await termMozeNovoPredavanje(termId);
  if (!limitCheck.ok) {
    return { error: `U ovom terminu je već dostignut maksimalan broj časova (${limitCheck.max}). Trenutno: ${limitCheck.count}.` };
  }

  const { data: predavanje, error: predErr } = await admin
    .from('predavanja')
    .insert({ term_id: termId, client_id: zahtev.client_id, odrzano: false, placeno: false })
    .select('id')
    .single();
  if (predErr || !predavanje) {
    console.error('[zahtevi] potvrdiZahtev predavanje insert', predErr?.message);
    return { error: predErr?.message ?? 'Radionica nije kreirana.' };
  }

  const { error: upErr } = await admin
    .from('zahtevi_za_cas')
    .update({
      status: 'confirmed',
      resolved_at: new Date().toISOString(),
      resolved_by: instructor.id,
      created_term_id: termId,
      created_predavanje_id: predavanje.id,
    })
    .eq('id', zahtevId);
  if (upErr) {
    console.error('[zahtevi] potvrdiZahtev update zahtev', upErr.message);
    return { error: upErr.message };
  }
  revalidatePath('/dashboard/zahtevi');
  revalidatePath('/ucenik');
  return {};
}

export async function promeniTerminZahtev(
  zahtevId: string,
  newDate: string,
  newSlotIndex: number,
  note?: string
): Promise<{ error?: string }> {
  console.log('[zahtevi] promeniTerminZahtev', zahtevId, newDate, newSlotIndex);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  const admin = getAdmin();
  if (!admin) return { error: 'Server greška (admin klijent).' };

  const { data: zahtev, error: fetchErr } = await admin
    .from('zahtevi_za_cas')
    .select('*')
    .eq('id', zahtevId)
    .single();
  if (fetchErr || !zahtev) {
    console.error('[zahtevi] promeniTerminZahtev fetch', fetchErr?.message);
    return { error: fetchErr?.message ?? 'Zahtev nije pronađen.' };
  }
  if (zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  const targetInstructorId = zahtev.instructor_id ?? instructor.id;
  if (targetInstructorId !== instructor.id) return { error: 'Niste ovlašćeni.' };

  const dateStr = newDate.slice(0, 10);
  const slot = Math.min(12, Math.max(0, newSlotIndex));

  let termId: string;
  const { data: existing } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', targetInstructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .single();
  if (existing) {
    termId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('terms')
      .insert({
        instructor_id: targetInstructorId,
        date: dateStr,
        slot_index: slot,
        term_category_id: SEEDED_TERM_CATEGORY_INDIVIDUAL_ID,
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('[zahtevi] promeniTerminZahtev terms insert', insErr?.message);
      return { error: insErr?.message ?? 'Termin nije kreiran.' };
    }
    termId = inserted.id;
  }

  const limitCheck = await termMozeNovoPredavanje(termId);
  if (!limitCheck.ok) {
    return { error: `U ovom terminu je već dostignut maksimalan broj časova (${limitCheck.max}). Trenutno: ${limitCheck.count}.` };
  }

  const { data: predavanje, error: predErr } = await admin
    .from('predavanja')
    .insert({ term_id: termId, client_id: zahtev.client_id, odrzano: false, placeno: false })
    .select('id')
    .single();
  if (predErr || !predavanje) {
    console.error('[zahtevi] promeniTerminZahtev predavanje insert', predErr?.message);
    return { error: predErr?.message ?? 'Radionica nije kreirana.' };
  }

  const { error: upErr } = await admin
    .from('zahtevi_za_cas')
    .update({
      status: 'changed',
      resolved_at: new Date().toISOString(),
      resolved_by: instructor.id,
      created_term_id: termId,
      created_predavanje_id: predavanje.id,
      note_from_instructor: note?.trim() || null,
    })
    .eq('id', zahtevId);
  if (upErr) {
    console.error('[zahtevi] promeniTerminZahtev update', upErr.message);
    return { error: upErr.message };
  }
  revalidatePath('/dashboard/zahtevi');
  revalidatePath('/ucenik');
  return {};
}

export async function odbijZahtev(zahtevId: string, note?: string): Promise<{ error?: string }> {
  console.log('[zahtevi] odbijZahtev', zahtevId);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  const admin = getAdmin();
  if (!admin) return { error: 'Server greška (admin klijent).' };

  const { data: zahtev, error: fetchErr } = await admin
    .from('zahtevi_za_cas')
    .select('id, instructor_id, status')
    .eq('id', zahtevId)
    .single();
  if (fetchErr || !zahtev) {
    console.error('[zahtevi] odbijZahtev fetch', fetchErr?.message);
    return { error: fetchErr?.message ?? 'Zahtev nije pronađen.' };
  }
  if (zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  const targetInstructorId = zahtev.instructor_id ?? instructor.id;
  if (targetInstructorId !== instructor.id) return { error: 'Niste ovlašćeni.' };

  const { error } = await admin
    .from('zahtevi_za_cas')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: instructor.id,
      note_from_instructor: note?.trim() || null,
    })
    .eq('id', zahtevId);
  if (error) {
    console.error('[zahtevi] odbijZahtev update', error.message);
    return { error: error.message };
  }
  revalidatePath('/dashboard/zahtevi');
  return {};
}
