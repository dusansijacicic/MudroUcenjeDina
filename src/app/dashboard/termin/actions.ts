'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { termMozeNovoPredavanje, getMaxTerminaPoSlotu, jedanDeteMaksimalnoPoTerminu } from '@/lib/settings';
import { revalidatePath } from 'next/cache';
import { syncSpilloverForTerm } from '@/app/admin/actions';
import { AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import { SEEDED_TERM_CATEGORY_INDIVIDUAL_ID } from '@/lib/term-categories';

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
    return { error: 'Niste instruktor.' };
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
      error:
        check.max === 1
          ? 'Ovaj termin je za jedno dete – u njemu može biti samo jedna radionica. Za više dece u istom vremenu koristite kategoriju koja dozvoljava grupu (Admin → Kategorije termina).'
          : `Maksimalan broj radionica u ovom terminu je ${check.max}. Trenutno ima ${check.count}. Podešavanja može da menja superadmin.`,
    };
  }

  const { data: dup } = await admin
    .from('predavanja')
    .select('id')
    .eq('term_id', termId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (dup) {
    return { error: 'Ovo dete je već uključeno u ovaj termin.' };
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
  await syncSpilloverForTerm(admin, termId);
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/klijenti');
  console.log('[termin] createPredavanje success');
  return {};
}

/** Više radionica odjednom (grupni termin). Svi isti term_type_id. */
export async function createPredavanjaBatch(
  termId: string,
  clientIds: string[],
  termTypeId: string | null,
  komentar: string | null
): Promise<{ error?: string }> {
  const unique = [...new Set(clientIds.filter(Boolean))];
  if (unique.length === 0) return { error: 'Izaberite bar jedno dete.' };

  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Server greška.' };
  }
  const { data: term, error: termErr } = await admin
    .from('terms')
    .select('id, instructor_id, term_category_id, term_categories(jedan_klijent_po_terminu)')
    .eq('id', termId)
    .single();
  if (termErr || !term) return { error: 'Termin nije pronađen.' };
  if (term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni za ovaj termin.' };
  const jedanOnly = await jedanDeteMaksimalnoPoTerminu(admin, term);
  if (jedanOnly && unique.length > 1) {
    return { error: 'Ova kategorija termina dozvoljava samo jedno dete. Izaberite drugu kategoriju ili jedno dete.' };
  }

  const { data: existingPreds } = await admin.from('predavanja').select('client_id').eq('term_id', termId);
  const alreadyIn = new Set((existingPreds ?? []).map((r: { client_id: string }) => r.client_id));
  for (const cid of unique) {
    if (alreadyIn.has(cid)) {
      return { error: 'Jedno ili više izabranih dece je već u ovom terminu.' };
    }
  }

  for (const clientId of unique) {
    const check = await termMozeNovoPredavanje(termId);
    if (!check.ok) {
      return {
        error:
          check.max === 1
            ? 'Individualni termin već ima dete.'
            : `Dostignut je maksimalan broj radionica u terminu (${check.max}).`,
      };
    }
    const { error: insErr } = await admin.from('predavanja').insert({
      term_id: termId,
      client_id: clientId,
      odrzano: false,
      placeno: false,
      komentar: komentar?.trim() || null,
      term_type_id: termTypeId || null,
    });
    if (insErr) return { error: insErr.message };
    const { error: icErr } = await admin
      .from('instructor_clients')
      .insert({ instructor_id: instructor.id, client_id: clientId, placeno_casova: 0 });
    if (icErr && icErr.code !== '23505') {
      console.warn('[termin] instructor_clients batch', icErr.message);
    }
  }
  await syncSpilloverForTerm(admin, termId);
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/klijenti');
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
  if (!instructor) return { error: 'Niste instruktor.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: 'Server greška.' };
  }
  const { data: term } = await admin.from('terms').select('instructor_id').eq('id', termId).single();
  if (!term || term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni.' };
  const { data: dupOther } = await admin
    .from('predavanja')
    .select('id')
    .eq('term_id', termId)
    .eq('client_id', clientId)
    .neq('id', predavanjeId)
    .maybeSingle();
  if (dupOther) {
    return { error: 'Ovo dete je već uključeno u ovaj termin (druga radionica).' };
  }
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
  await syncSpilloverForTerm(admin, termId);
  revalidatePath(`/dashboard/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/klijenti');
  revalidatePath(`/dashboard/predavanje/${predavanjeId}`);
  return {};
}

export async function deletePredavanje(predavanjeId: string, termId: string): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: 'Server greška.' };
  }
  const { data: pred } = await admin.from('predavanja').select('term_id').eq('id', predavanjeId).single();
  if (!pred) return { error: 'Radionica nije pronađena.' };
  const { data: term } = await admin.from('terms').select('instructor_id').eq('id', pred.term_id).single();
  if (!term || term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni.' };

  // Save to history before deleting
  const { data: fullPred } = await admin
    .from('predavanja')
    .select('client_id, placeno, term:terms(date, slot_index, instructor_id, instructor:instructors(id, ime, prezime), classroom:classrooms(naziv)), term_type:term_types(naziv), client:clients(ime, prezime)')
    .eq('id', predavanjeId)
    .single();
  if (fullPred) {
    const t = Array.isArray(fullPred.term) ? fullPred.term[0] : fullPred.term;
    const instr = t?.instructor && Array.isArray(t.instructor) ? t.instructor[0] : t?.instructor;
    const classroom = t?.classroom && Array.isArray(t.classroom) ? t.classroom[0] : t?.classroom;
    const termType = Array.isArray(fullPred.term_type) ? fullPred.term_type[0] : fullPred.term_type;
    const client = Array.isArray(fullPred.client) ? fullPred.client[0] : fullPred.client;
    await admin.from('otkazani_termini').insert({
      client_id: fullPred.client_id,
      client_ime: (client as { ime?: string } | null)?.ime ?? '',
      client_prezime: (client as { prezime?: string } | null)?.prezime ?? null,
      instructor_id: (instr as { id?: string } | null)?.id ?? null,
      instructor_ime: (instr as { ime?: string } | null)?.ime ?? null,
      instructor_prezime: (instr as { prezime?: string } | null)?.prezime ?? null,
      classroom_naziv: (classroom as { naziv?: string } | null)?.naziv ?? null,
      term_date: t?.date,
      slot_index: t?.slot_index,
      term_type_naziv: (termType as { naziv?: string } | null)?.naziv ?? null,
      placeno: fullPred.placeno ?? false,
    });
  }

  const { error } = await admin.from('predavanja').delete().eq('id', predavanjeId);
  if (error) return { error: error.message };

  // If term is now empty, delete it (frees instructor + classroom) – i njegove eventualne
  // automatske "blokirajuće" slotove (nastavak_of_term_id nema CASCADE, brišemo ručno).
  const { count } = await admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId);
  if ((count ?? 0) === 0) {
    await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
    await admin.from('terms').delete().eq('id', termId);
  } else {
    await syncSpilloverForTerm(admin, termId);
  }

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
  if (!instructor) return { error: 'Niste instruktor.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: 'Server greška.' };
  }
  const slot = Math.min(15, Math.max(0, newSlotIndex));
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

/** Kategorija termina i napomena. */
export async function updateTermMetaAsInstructor(
  termId: string,
  payload: { term_category_id: string; napomena: string | null }
): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Server greška.' };
  }
  const { data: term } = await admin.from('terms').select('instructor_id').eq('id', termId).single();
  if (!term || term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni za ovaj termin.' };
  const cid = payload.term_category_id?.trim();
  if (!cid) return { error: 'Izaberite kategoriju termina.' };
  const { data: cat } = await admin
    .from('term_categories')
    .select('id, jedan_klijent_po_terminu')
    .eq('id', cid)
    .maybeSingle();
  if (!cat) return { error: 'Kategorija nije pronađena.' };
  if (cat.jedan_klijent_po_terminu) {
    const { count } = await admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId);
    if ((count ?? 0) > 1) {
      return { error: 'Ova kategorija dozvoljava samo jedno dete u terminu. Prvo uklonite višak radionica.' };
    }
  }
  const { error } = await admin
    .from('terms')
    .update({ term_category_id: cid, napomena: payload.napomena?.trim() || null })
    .eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/termin/${termId}`);
  return {};
}

/** Samo napomena termina (bez menjanja kategorije). */
export async function updateTermNapomenaAsInstructor(
  termId: string,
  napomena: string | null
): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Server greška.' };
  }
  const { data: term } = await admin.from('terms').select('instructor_id').eq('id', termId).single();
  if (!term || term.instructor_id !== instructor.id) return { error: 'Niste ovlašćeni za ovaj termin.' };
  const { error } = await admin
    .from('terms')
    .update({ napomena: napomena?.trim() || null })
    .eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/termin/${termId}`);
  return {};
}

export async function deleteTermAsInstructor(termId: string): Promise<{ error?: string }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste instruktor.' };
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
  // Briše i eventualne automatske "blokirajuće" slotove dužeg časa (nastavak_of_term_id nema CASCADE).
  await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);

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
  if (!instructor) return { error: 'Niste instruktor.' };
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

/**
 * "Više termina" mod na predavačevom kalendaru: masovno zakazivanje za JEDNO dete preko više
 * slotova odjednom. Za razliku od admin varijante (koja pravi zahteve jer ne zna kog instruktora
 * dodeliti), ovde je instruktor već poznat (sam predavač), pa se prave PRAVI termini/radionice
 * direktno – bez učionice (dodaje se naknadno po potrebi, isto kao svugde).
 */
export async function createBulkTermsAsInstructor(
  clientId: string,
  termTypeId: string | null,
  slots: { date: string; slotIndex: number }[]
): Promise<{ failed: { date: string; slotIndex: number; error: string }[] }> {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { failed: slots.map((s) => ({ ...s, error: 'Niste instruktor.' })) };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { failed: slots.map((s) => ({ ...s, error: 'Server greška.' })) };
  }
  if (slots.length === 0) return { failed: [] };

  const results = await Promise.all(
    slots.map(async (s) => {
      let termId: string;
      const { data: existingTerm } = await admin
        .from('terms')
        .select('id')
        .eq('instructor_id', instructor.id)
        .eq('date', s.date)
        .eq('slot_index', s.slotIndex)
        .maybeSingle();
      if (existingTerm) {
        termId = existingTerm.id;
      } else {
        const { data: inserted, error: insErr } = await admin
          .from('terms')
          .insert({
            instructor_id: instructor.id,
            date: s.date,
            slot_index: s.slotIndex,
            term_category_id: SEEDED_TERM_CATEGORY_INDIVIDUAL_ID,
          })
          .select('id')
          .single();
        if (insErr || !inserted) return { ...s, error: insErr?.message ?? 'Greška pri kreiranju termina.' };
        termId = inserted.id;
      }

      const limitCheck = await termMozeNovoPredavanje(termId);
      if (!limitCheck.ok) return { ...s, error: `Maksimalan broj časova (${limitCheck.max}) je već dostignut u tom terminu.` };

      const { data: dup } = await admin.from('predavanja').select('id').eq('term_id', termId).eq('client_id', clientId).maybeSingle();
      if (dup) return { ...s, error: 'Ovo dete je već u tom terminu.' };

      const { error: predErr } = await admin
        .from('predavanja')
        .insert({ term_id: termId, client_id: clientId, odrzano: false, placeno: false, term_type_id: termTypeId });
      if (predErr) return { ...s, error: predErr.message };

      await syncSpilloverForTerm(admin, termId);
      return { ...s, error: null as string | null };
    })
  );
  revalidatePath('/dashboard');
  return { failed: results.filter((r): r is { date: string; slotIndex: number; error: string } => r.error !== null) };
}
