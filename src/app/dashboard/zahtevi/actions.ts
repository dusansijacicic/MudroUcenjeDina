'use server';

import { createClient } from '@/lib/supabase/server';
import { getDashboardInstructor } from '@/lib/dashboard';
import { termMozeNovoPredavanje } from '@/lib/settings';
import { revalidatePath } from 'next/cache';

export async function preuzmiZahtev(zahtevId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  const instructorId = instructor.id;

  const { data: zahtev } = await supabase
    .from('zahtevi_za_cas')
    .select('id, instructor_id, client_id, status')
    .eq('id', zahtevId)
    .single();
  if (!zahtev || (zahtev as { status?: string }).status !== 'pending') return { error: 'Zahtev nije pronađen ili nije na čekanju.' };
  if (zahtev.instructor_id != null) return { error: 'Zahtev je već preuzet.' };

  const { data: link } = await supabase
    .from('instructor_clients')
    .select('instructor_id')
    .eq('instructor_id', instructorId)
    .eq('client_id', zahtev.client_id)
    .single();
  if (!link) return { error: 'Ovaj klijent nije kod vas.' };

  const { error } = await supabase
    .from('zahtevi_za_cas')
    .update({ instructor_id: instructorId })
    .eq('id', zahtevId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/zahtevi');
  return {};
}

export async function potvrdiZahtev(zahtevId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  const instructorId = instructor.id;

  const { data: zahtev } = await supabase
    .from('zahtevi_za_cas')
    .select('*')
    .eq('id', zahtevId)
    .single();
  if (!zahtev || zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  const targetInstructorId = zahtev.instructor_id ?? instructorId;
  if (targetInstructorId !== instructorId) return { error: 'Niste ovlašćeni.' };

  const dateStr = String(zahtev.requested_date).slice(0, 10);
  const slot = Math.min(12, Math.max(0, zahtev.requested_slot_index));

  let termId: string;
  const { data: existing } = await supabase
    .from('terms')
    .select('id')
    .eq('instructor_id', targetInstructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .single();
  if (existing) {
    termId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('terms')
      .insert({ instructor_id: targetInstructorId, date: dateStr, slot_index: slot })
      .select('id')
      .single();
    if (insErr || !inserted) return { error: insErr?.message ?? 'Termin nije kreiran.' };
    termId = inserted.id;
  }

  const limitCheck = await termMozeNovoPredavanje(termId);
  if (!limitCheck.ok) {
    return { error: `U ovom terminu je već dostignut maksimalan broj časova (${limitCheck.max}). Trenutno: ${limitCheck.count}.` };
  }

  const { data: predavanje, error: predErr } = await supabase
    .from('predavanja')
    .insert({ term_id: termId, client_id: zahtev.client_id, odrzano: false, placeno: false })
    .select('id')
    .single();
  if (predErr || !predavanje) return { error: predErr?.message ?? 'Predavanje nije kreirano.' };

  const { error: upErr } = await supabase
    .from('zahtevi_za_cas')
    .update({
      status: 'confirmed',
      resolved_at: new Date().toISOString(),
      resolved_by: instructorId,
      created_term_id: termId,
      created_predavanje_id: predavanje.id,
    })
    .eq('id', zahtevId);
  if (upErr) return { error: upErr.message };
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
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  const instructorId = instructor.id;

  const { data: zahtev } = await supabase
    .from('zahtevi_za_cas')
    .select('*')
    .eq('id', zahtevId)
    .single();
  if (!zahtev || zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  const targetInstructorId = zahtev.instructor_id ?? instructorId;
  if (targetInstructorId !== instructorId) return { error: 'Niste ovlašćeni.' };

  const dateStr = newDate.slice(0, 10);
  const slot = Math.min(12, Math.max(0, newSlotIndex));

  let termId: string;
  const { data: existing } = await supabase
    .from('terms')
    .select('id')
    .eq('instructor_id', targetInstructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .single();
  if (existing) {
    termId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('terms')
      .insert({ instructor_id: targetInstructorId, date: dateStr, slot_index: slot })
      .select('id')
      .single();
    if (insErr || !inserted) return { error: insErr?.message ?? 'Termin nije kreiran.' };
    termId = inserted.id;
  }

  const limitCheck = await termMozeNovoPredavanje(termId);
  if (!limitCheck.ok) {
    return { error: `U ovom terminu je već dostignut maksimalan broj časova (${limitCheck.max}). Trenutno: ${limitCheck.count}.` };
  }

  const { data: predavanje, error: predErr } = await supabase
    .from('predavanja')
    .insert({ term_id: termId, client_id: zahtev.client_id, odrzano: false, placeno: false })
    .select('id')
    .single();
  if (predErr || !predavanje) return { error: predErr?.message ?? 'Predavanje nije kreirano.' };

  const { error: upErr } = await supabase
    .from('zahtevi_za_cas')
    .update({
      status: 'changed',
      resolved_at: new Date().toISOString(),
      resolved_by: instructorId,
      created_term_id: termId,
      created_predavanje_id: predavanje.id,
      note_from_instructor: note?.trim() || null,
    })
    .eq('id', zahtevId);
  if (upErr) return { error: upErr.message };
  revalidatePath('/dashboard/zahtevi');
  revalidatePath('/ucenik');
  return {};
}

export async function odbijZahtev(zahtevId: string, note?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  const instructorId = instructor.id;

  const { data: zahtev } = await supabase
    .from('zahtevi_za_cas')
    .select('id, instructor_id, status')
    .eq('id', zahtevId)
    .single();
  if (!zahtev || (zahtev as { status?: string }).status !== 'pending') return { error: 'Zahtev nije na čekanju.' };
  const targetInstructorId = zahtev.instructor_id ?? instructorId;
  if (targetInstructorId !== instructorId) return { error: 'Niste ovlašćeni.' };

  const { error } = await supabase
    .from('zahtevi_za_cas')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: instructorId,
      note_from_instructor: note?.trim() || null,
    })
    .eq('id', zahtevId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/zahtevi');
  return {};
}
