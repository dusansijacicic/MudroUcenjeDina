'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TermCategoryRow } from '@/lib/term-categories';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { INSTRUCTOR_COLORS, isTermInPast } from '@/lib/constants';
import { termMozeNovoPredavanje } from '@/lib/settings';
import { normalizeClientPol } from '@/lib/client-pol';

export async function createInstructorAsAdmin(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?reason=no_session');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login?reason=not_authorized');

  const email = (formData.get('email') as string)?.trim();
  const password = (formData.get('password') as string) ?? '';
  const ime = (formData.get('ime') as string)?.trim();
  const prezime = (formData.get('prezime') as string)?.trim();
  if (!email || !password || !ime || !prezime) {
    return { error: 'Popunite sva polja (email, lozinka, ime, prezime).' };
  }
  if (password.length < 6) {
    return { error: 'Lozinka mora imati najmanje 6 znakova.' };
  }

  let adminSupabase;
  try {
    adminSupabase = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server nije podešen za kreiranje korisnika.';
    console.error('[admin] createInstructor: createAdminClient failed', msg);
    return { error: msg };
  }

  console.log('[admin] createInstructor: creating auth user', email);
  const { data: newUser, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) {
    console.error('[admin] createInstructor: auth.admin.createUser failed', authError.message, authError.status);
    const msg = authError.message || 'Greška pri kreiranju naloga.';
    const hint = authError.status === 422 ? ' Email je možda već u upotrebi.' : '';
    return { error: msg + hint };
  }
  if (!newUser.user) {
    console.error('[admin] createInstructor: newUser.user is null');
    return { error: 'Korisnik nije kreiran.' };
  }
  console.log('[admin] createInstructor: auth user created', newUser.user.id);

  const { data: existingInstructors } = await adminSupabase.from('instructors').select('color');
  const usedColors = new Set((existingInstructors ?? []).map((r) => (r.color ?? '').toLowerCase()));
  const firstFreeColor =
    INSTRUCTOR_COLORS.find((c) => !usedColors.has(c.value.toLowerCase()))?.value ?? '#0d9488';

  console.log('[admin] createInstructor: inserting into instructors');
  const { error: insertError } = await adminSupabase.from('instructors').insert({
    user_id: newUser.user.id,
    ime,
    prezime,
    email,
    color: firstFreeColor,
  });
  if (insertError) {
    console.error('[admin] createInstructor: instructors insert failed', insertError.message, insertError.code);
    return { error: 'Profil instruktora: ' + (insertError.message || insertError.code || 'nepoznata greška.') };
  }

  console.log('[admin] createInstructor: success', email);
  revalidatePath('/admin');
  return { success: true };
}

/** Vraća ID-eve predavača i učionica koji su već zauzeti u datom slotu (date + slot_index). */
export async function getTakenForSlot(
  date: string,
  slotIndex: number
): Promise<{ takenInstructorIds: string[]; takenClassroomIds: string[] }> {
  const slot = Math.min(15, Math.max(0, slotIndex));
  const dateStr = date.slice(0, 10);
  const admin = createAdminClient();
  const { data: terms } = await admin
    .from('terms')
    .select('instructor_id, classroom_id')
    .eq('date', dateStr)
    .eq('slot_index', slot);
  const takenInstructorIds = [...new Set((terms ?? []).map((t) => t.instructor_id).filter(Boolean))] as string[];
  const takenClassroomIds = [
    ...new Set((terms ?? []).map((t) => t.classroom_id).filter((id): id is string => id != null)),
  ];
  return { takenInstructorIds, takenClassroomIds };
}

/** Pravila za slot (datum + vreme): max N termina (iz podešavanja); svaki termin ima JEDINSTVENOG predavača i JEDINSTVENU učionicu u tom slotu. */
export async function createTermAsAdmin(
  instructorId: string,
  date: string,
  slotIndex: number,
  classroomId: string | null,
  termCategoryId: string,
  napomena: string | null = null,
  nastavakOfTermId: string | null = null
): Promise<{ termId?: string; instructorId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' };

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) return { error: 'Samo admin može da zakazuje termine za instruktore.' };

  const slot = Math.min(15, Math.max(0, slotIndex));
  const dateStr = date.slice(0, 10);
  const adminSupabase = createAdminClient();

  // 1) Max broj termina u slotu
  const [{ count: termCount }, { data: maxSetting }] = await Promise.all([
    adminSupabase.from('terms').select('*', { count: 'exact', head: true }).eq('date', dateStr).eq('slot_index', slot),
    adminSupabase.from('app_settings').select('value').eq('key', 'max_termina_po_slotu').single(),
  ]);
  const maxTerminaPoSlotu = (maxSetting?.value && parseInt(maxSetting.value, 10)) || 4;
  if ((termCount ?? 0) >= maxTerminaPoSlotu) {
    return { error: `Maksimalan broj termina u ovom slotu je ${maxTerminaPoSlotu}. Podešavanje u Admin → Podešavanja.` };
  }

  // 2) Jedan predavač = jedan termin u slotu (A)
  const { data: existingSameInstructor } = await adminSupabase
    .from('terms')
    .select('id')
    .eq('instructor_id', instructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .maybeSingle();

  if (existingSameInstructor) {
    return { error: 'Ovaj instruktor već ima termin u ovom slotu. Jedan instruktor može imati samo jedan termin u istom vremenu.' };
  }

  // 3) Jedna učionica = jedan termin u slotu (B)
  if (classroomId) {
    const { data: existingSameClassroom } = await adminSupabase
      .from('terms')
      .select('id')
      .eq('date', dateStr)
      .eq('slot_index', slot)
      .eq('classroom_id', classroomId)
      .maybeSingle();
    if (existingSameClassroom) {
      return { error: 'Ova učionica je već zauzeta u ovom slotu. Jedna učionica može biti samo u jednom terminu u istom vremenu.' };
    }
  }

  if (!termCategoryId?.trim()) {
    return { error: 'Izaberite kategoriju termina.' };
  }
  const { data: catOk } = await adminSupabase.from('term_categories').select('id').eq('id', termCategoryId.trim()).maybeSingle();
  if (!catOk) {
    return { error: 'Kategorija termina nije pronađena.' };
  }
  const { data: inserted, error } = await adminSupabase
    .from('terms')
    .insert({
      instructor_id: instructorId,
      date: dateStr,
      slot_index: slot,
      classroom_id: classroomId,
      term_category_id: termCategoryId.trim(),
      napomena: napomena?.trim() || null,
      nastavak_of_term_id: nastavakOfTermId ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  if (!inserted) return { error: 'Termin nije kreiran.' };
  return { termId: inserted.id, instructorId };
}

export async function getAdminInstructorsList(): Promise<{ id: string; ime: string; prezime: string }[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!admin) return [];
  const adminSupabase = createAdminClient();
  const { data } = await adminSupabase.from('instructors').select('id, ime, prezime').order('prezime').order('ime');
  return data ?? [];
}

export type TermForNastavak = {
  id: string;
  date: string;
  slot_index: number;
  instructor_id: string | null;
  instructor_ime: string | null;
  instructor_prezime: string | null;
  classroom_id: string | null;
  classroom_naziv: string | null;
  client_ids: string[];
  client_names: string[];
};

export async function getTermsForNastavak(): Promise<TermForNastavak[]> {
  const admin = createAdminClient();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const fromDate = sixtyDaysAgo.toISOString().slice(0, 10);

  const { data } = await admin
    .from('terms')
    .select('id, date, slot_index, instructor_id, instructor:instructors(ime, prezime), classroom_id, classroom:classrooms(naziv), predavanja(client_id, client:clients(ime, prezime))')
    .gte('date', fromDate)
    .order('date', { ascending: false })
    .order('slot_index', { ascending: false })
    .limit(300);

  return (data ?? [])
    .filter((t) => ((t as { predavanja?: unknown[] }).predavanja ?? []).length > 0)
    .map((t) => {
      const instrRaw = (t as { instructor?: unknown }).instructor;
      const instr = Array.isArray(instrRaw) ? instrRaw[0] : instrRaw;
      const clRaw = (t as { classroom?: unknown }).classroom;
      const cl = Array.isArray(clRaw) ? clRaw[0] : clRaw;
      type PredRow = { client_id: string; client: { ime?: string; prezime?: string } | { ime?: string; prezime?: string }[] | null };
      const preds = ((t as { predavanja?: PredRow[] }).predavanja ?? []);
      return {
        id: t.id,
        date: t.date,
        slot_index: t.slot_index,
        instructor_id: t.instructor_id ?? null,
        instructor_ime: (instr as { ime?: string } | null)?.ime ?? null,
        instructor_prezime: (instr as { prezime?: string } | null)?.prezime ?? null,
        classroom_id: (t as { classroom_id?: string | null }).classroom_id ?? null,
        classroom_naziv: (cl as { naziv?: string } | null)?.naziv ?? null,
        client_ids: preds.map((p) => p.client_id),
        client_names: preds.map((p) => {
          const c = Array.isArray(p.client) ? p.client[0] : p.client;
          return `${(c as { ime?: string } | null)?.ime ?? ''} ${(c as { prezime?: string } | null)?.prezime ?? ''}`.trim();
        }),
      };
    });
}

export async function updateInstructorAsAdmin(
  instructorId: string,
  payload: { ime: string; prezime: string; telefon: string | null; color: string | null }
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin
    .from('instructors')
    .update({ ime: payload.ime, prezime: payload.prezime, telefon: payload.telefon, color: payload.color })
    .eq('id', instructorId);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  revalidatePath(`/admin/predavaci/${instructorId}`);
  revalidatePath(`/admin/view/${instructorId}`);
  revalidatePath('/admin/kalendar');
  return {};
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' as const, admin: null };
  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!adminRow) return { error: 'Samo admin.' as const, admin: null };
  return { admin: createAdminClient(), error: null };
}

export async function createPredavanjeAsAdmin(
  termId: string,
  clientId: string,
  odrzano: boolean,
  placeno: boolean,
  komentar: string | null,
  termTypeId: string | null = null
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { data: term } = await admin.from('terms').select('id, instructor_id').eq('id', termId).single();
  if (!term) return { error: 'Termin nije pronađen.' };
  const check = await termMozeNovoPredavanje(termId);
  if (!check.ok) {
    return {
      error: `U ovom terminu nije moguće dodati još jedno dete (${check.count}/${check.max}). Za termin sa jednim detetom dozvoljena je samo jedna radionica; za grupu izaberite odgovarajuću kategoriju pri kreiranju termina.`,
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
  if (insErr) return { error: insErr.message };
  const { error: icErr } = await admin.from('instructor_clients').insert({
    instructor_id: term.instructor_id,
    client_id: clientId,
    placeno_casova: 0,
  });
  if (icErr && icErr.code !== '23505') {
    console.warn('[admin] instructor_clients insert (non-fatal)', icErr.message);
  }
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

/** Kategorija i napomena termina (admin). */
export async function updateTermMetaAsAdmin(
  termId: string,
  payload: { term_category_id: string; napomena: string | null }
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
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
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  revalidatePath('/dashboard');
  return {};
}

export async function updatePredavanjeAsAdmin(
  predavanjeId: string,
  termId: string,
  clientId: string,
  odrzano: boolean,
  placeno: boolean,
  komentar: string | null,
  termTypeId: string | null = null
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { data: dupOther } = await admin
    .from('predavanja')
    .select('id')
    .eq('term_id', termId)
    .eq('client_id', clientId)
    .neq('id', predavanjeId)
    .maybeSingle();
  if (dupOther) {
    return { error: 'Ovo dete je već uključeno u ovaj termin.' };
  }
  const { error } = await admin
    .from('predavanja')
    .update({
      client_id: clientId,
      odrzano,
      placeno,
      komentar: komentar?.trim() || null,
      term_type_id: termTypeId || null,
    })
    .eq('id', predavanjeId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

async function savePredavanjeToHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  predavanjeId: string
) {
  const { data: pred } = await admin
    .from('predavanja')
    .select('client_id, placeno, term:terms(date, slot_index, instructor_id, instructor:instructors(id, ime, prezime), classroom:classrooms(naziv)), term_type:term_types(naziv), client:clients(ime, prezime)')
    .eq('id', predavanjeId)
    .single();
  if (!pred) return;
  const term = Array.isArray(pred.term) ? pred.term[0] : pred.term;
  const instr = term?.instructor && Array.isArray(term.instructor) ? term.instructor[0] : term?.instructor;
  const classroom = term?.classroom && Array.isArray(term.classroom) ? term.classroom[0] : term?.classroom;
  const termType = Array.isArray(pred.term_type) ? pred.term_type[0] : pred.term_type;
  const client = Array.isArray(pred.client) ? pred.client[0] : pred.client;
  await admin.from('otkazani_termini').insert({
    client_id: pred.client_id,
    client_ime: (client as { ime?: string } | null)?.ime ?? '',
    client_prezime: (client as { prezime?: string } | null)?.prezime ?? null,
    instructor_id: (instr as { id?: string } | null)?.id ?? null,
    instructor_ime: (instr as { ime?: string } | null)?.ime ?? null,
    instructor_prezime: (instr as { prezime?: string } | null)?.prezime ?? null,
    classroom_naziv: (classroom as { naziv?: string } | null)?.naziv ?? null,
    term_date: term?.date,
    slot_index: term?.slot_index,
    term_type_naziv: (termType as { naziv?: string } | null)?.naziv ?? null,
    placeno: pred.placeno ?? false,
  });
}

export async function deletePredavanjeAsAdmin(predavanjeId: string, termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  await savePredavanjeToHistory(admin, predavanjeId);

  const { error } = await admin.from('predavanja').delete().eq('id', predavanjeId);
  if (error) return { error: error.message };

  // If term has no more predavanja, delete the term (frees instructor + classroom)
  const { count } = await admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId);
  if ((count ?? 0) === 0) {
    await admin.from('terms').delete().eq('id', termId);
  }

  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

/**
 * Menja instruktora za jedno predavanje (administratorska operacija).
 * Pronalazi ili kreira termin novog instruktora na istom datumu i slotu,
 * zatim premešta predavanje u taj termin.
 */
export async function reassignPredavanjeInstructorAsAdmin(
  predavanjeId: string,
  currentTermId: string,
  newInstructorId: string,
  termDate: string,
  slotIndex: number
): Promise<{ error?: string; newTermId?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: pred } = await admin
    .from('predavanja')
    .select('id, client_id, term_id')
    .eq('id', predavanjeId)
    .single();
  if (!pred) return { error: 'Radionica nije pronađena.' };

  // Tražimo postojeći termin novog instruktora u istom slotu
  const { data: existingTerm } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', newInstructorId)
    .eq('date', termDate.slice(0, 10))
    .eq('slot_index', slotIndex)
    .maybeSingle();

  let newTermId: string;
  if (existingTerm) {
    newTermId = existingTerm.id as string;
  } else {
    // Kreiramo novi termin za novog instruktora
    const { data: inserted, error: insErr } = await admin
      .from('terms')
      .insert({
        instructor_id: newInstructorId,
        date: termDate.slice(0, 10),
        slot_index: slotIndex,
      })
      .select('id')
      .single();
    if (insErr || !inserted) return { error: insErr?.message ?? 'Greška pri kreiranju termina.' };
    newTermId = inserted.id as string;
  }

  // Proveravamo da ovo dete nije već u novom terminu
  const { data: dup } = await admin
    .from('predavanja')
    .select('id')
    .eq('term_id', newTermId)
    .eq('client_id', pred.client_id)
    .maybeSingle();
  if (dup) return { error: 'Ovo dete je već u terminu novog instruktora.' };

  // Premešta predavanje
  const { error: updErr } = await admin
    .from('predavanja')
    .update({ term_id: newTermId })
    .eq('id', predavanjeId);
  if (updErr) return { error: updErr.message };

  // Osigurava link instruktor–klijent za novog instruktora
  const { error: icErr } = await admin
    .from('instructor_clients')
    .insert({ instructor_id: newInstructorId, client_id: pred.client_id, placeno_casova: 0 });
  if (icErr && icErr.code !== '23505') {
    console.warn('[admin] instructor_clients upsert (non-fatal)', icErr.message);
  }

  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${currentTermId}`);
  revalidatePath(`/admin/termin/${newTermId}`);
  return { newTermId };
}

/** Premeštanje termina: ista pravila – u ciljnom slotu moraju biti jedinstveni predavač i učionica, i ne sme se premašiti max termina po slotu. */
export async function moveTermAsAdmin(
  termId: string,
  newDate: string,
  newSlotIndex: number
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const slot = Math.min(15, Math.max(0, newSlotIndex));
  const dateStr = newDate.slice(0, 10);

  const { data: term } = await admin.from('terms').select('instructor_id, classroom_id, date, slot_index').eq('id', termId).single();
  if (!term) return { error: 'Termin nije pronađen.' };

  const isSameSlot = term.date === dateStr && term.slot_index === slot;
  if (isSameSlot) return {}; // nema pomeranja

  const [{ count: termCount }, { data: maxSetting }] = await Promise.all([
    admin.from('terms').select('*', { count: 'exact', head: true }).eq('date', dateStr).eq('slot_index', slot),
    admin.from('app_settings').select('value').eq('key', 'max_termina_po_slotu').single(),
  ]);
  const maxTerminaPoSlotu = (maxSetting?.value && parseInt(maxSetting.value, 10)) || 4;
  if ((termCount ?? 0) >= maxTerminaPoSlotu) {
    return { error: `U ciljnom slotu je već ${maxTerminaPoSlotu} termina (maksimum).` };
  }

  const { data: existingInstructor } = await admin.from('terms').select('id').eq('instructor_id', term.instructor_id).eq('date', dateStr).eq('slot_index', slot).maybeSingle();
  if (existingInstructor) return { error: 'Ovaj instruktor već ima termin u ciljnom slotu.' };

  if (term.classroom_id) {
    const { data: existingClassroom } = await admin.from('terms').select('id').eq('classroom_id', term.classroom_id).eq('date', dateStr).eq('slot_index', slot).maybeSingle();
    if (existingClassroom) return { error: 'Ova učionica je već zauzeta u ciljnom slotu.' };
  }

  const { error } = await admin.from('terms').update({ date: dateStr, slot_index: slot }).eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

export async function deleteTermAsAdmin(termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  // Save all predavanja in this term to history before deleting
  const { data: preds } = await admin.from('predavanja').select('id').eq('term_id', termId);
  for (const p of preds ?? []) {
    await savePredavanjeToHistory(admin, p.id);
  }

  const { error } = await admin.from('terms').delete().eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  return {};
}

export async function updateTermClassroomAsAdmin(termId: string, classroomId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { error } = await admin.from('terms').update({ classroom_id: classroomId }).eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

export type TermTypeRow = { id: string; naziv: string; opis: string | null; cena_po_casu: number | null };

export async function getTermTypes(): Promise<TermTypeRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('term_types').select('id, naziv, opis, cena_po_casu').order('naziv');
  return (data ?? []) as TermTypeRow[];
}

export async function createTermTypeAsAdmin(naziv: string, opis: string | null, cena_po_casu: number | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('term_types').insert({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    cena_po_casu: cena_po_casu != null && Number.isFinite(cena_po_casu) ? cena_po_casu : null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/vrste-termina');
  return {};
}

export async function updateTermTypeAsAdmin(id: string, naziv: string, opis: string | null, cena_po_casu: number | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('term_types').update({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    cena_po_casu: cena_po_casu != null && Number.isFinite(cena_po_casu) ? cena_po_casu : null,
  }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/vrste-termina');
  return {};
}

export async function deleteTermTypeAsAdmin(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('term_types').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/vrste-termina');
  return {};
}

export async function getTermCategories(): Promise<TermCategoryRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('term_categories')
    .select('id, naziv, opis, jedan_klijent_po_terminu, is_testing, is_nastavak')
    .order('naziv');
  return (data ?? []) as TermCategoryRow[];
}

export async function createTermCategoryAsAdmin(
  naziv: string,
  opis: string | null,
  jedan_klijent_po_terminu: boolean
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('term_categories').insert({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    jedan_klijent_po_terminu: Boolean(jedan_klijent_po_terminu),
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/kategorije-termina');
  return {};
}

export async function updateTermCategoryAsAdmin(
  id: string,
  naziv: string,
  opis: string | null,
  jedan_klijent_po_terminu: boolean
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin
    .from('term_categories')
    .update({
      naziv: naziv.trim(),
      opis: opis?.trim() || null,
      jedan_klijent_po_terminu: Boolean(jedan_klijent_po_terminu),
    })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/kategorije-termina');
  return {};
}

export async function deleteTermCategoryAsAdmin(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { count } = await admin.from('terms').select('*', { count: 'exact', head: true }).eq('term_category_id', id);
  if ((count ?? 0) > 0) {
    return { error: 'Kategorija se koristi u terminima; dodelite drugu kategoriju tim terminima pre brisanja.' };
  }
  const { error } = await admin.from('term_categories').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/kategorije-termina');
  return {};
}

export type ClassroomRow = { id: string; naziv: string; color: string | null };

export async function getClassrooms(): Promise<ClassroomRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('classrooms').select('id, naziv, color').order('naziv');
  return (data ?? []) as ClassroomRow[];
}

export async function upsertClassroom(id: string | null, naziv: string, color: string | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const payload = {
    naziv: naziv.trim(),
    color: color?.trim() || null,
  };
  let error;
  if (id) {
    ({ error } = await admin.from('classrooms').update(payload).eq('id', id));
  } else {
    ({ error } = await admin.from('classrooms').insert(payload));
  }
  if (error) return { error: error.message };
  revalidatePath('/admin/ucionice');
  revalidatePath('/admin/kalendar');
  return {};
}

export async function deleteClassroom(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('classrooms').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/ucionice');
  revalidatePath('/admin/kalendar');
  return {};
}

/** Čitanje vrednosti iz app_settings (za admin podešavanja). */
export async function getAppSettings(): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin.from('app_settings').select('key, value');
  const out: Record<string, string> = {};
  (data ?? []).forEach((r: { key: string; value: string }) => { out[r.key] = r.value; });
  return out;
}

/** Ažuriranje jednog ključa u app_settings. Samo admin. */
export async function updateAppSetting(key: string, value: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const trimmed = value.trim();
  if (!trimmed) return { error: 'Vrednost ne sme biti prazna.' };
  const { error } = await admin.from('app_settings').upsert({ key, value: trimmed }, { onConflict: 'key' });
  if (error) return { error: error.message };
  revalidatePath('/admin/podesavanja');
  revalidatePath('/admin/termin/novi');
  return {};
}

/** Izmena klijenta (samo podaci iz tabele clients). Samo admin. */
export async function updateClientAsAdmin(
  clientId: string,
  payload: {
    ime: string;
    prezime: string;
    pol: string | null;
    godiste: number | null;
    razred: string | null;
    skola: string | null;
    roditelj: string | null;
    kontakt_telefon: string | null;
    login_email: string | null;
    napomena: string | null;
    popust_percent: number | null;
    datum_testiranja: string | null;
    accessible_term_type_ids?: string[];
  }
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!payload.kontakt_telefon?.trim()) {
    return { error: 'Kontakt telefon je obavezan.' };
  }
  const row = { ...payload, pol: normalizeClientPol(payload.pol) };
  const { error } = await admin.from('clients').update(row).eq('id', clientId);
  if (error) return { error: error.message };
  revalidatePath('/admin/klijenti');
  revalidatePath(`/admin/klijenti/${clientId}`);
  return {};
}

/**
 * Admin kreira klijenta bez dodele instruktora (instruktor se dodaje kasnije kroz edit ili pri prvom zakazivanju).
 */
export async function createClientAsAdminDirect(payload: {
  ime: string;
  prezime: string;
  pol: string | null;
  godiste: number | null;
  razred: string | null;
  skola: string | null;
  roditelj: string | null;
  kontakt_telefon: string | null;
  login_email: string | null;
  napomena: string | null;
  datum_testiranja: string | null;
  accessible_term_type_ids?: string[];
  instructorId?: string | null;
}): Promise<{ error?: string; clientId?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!payload.kontakt_telefon?.trim()) return { error: 'Kontakt telefon je obavezan.' };

  const { instructorId, ...rest } = payload;
  const row = {
    ...rest,
    pol: normalizeClientPol(rest.pol),
    accessible_term_type_ids: rest.accessible_term_type_ids ?? [],
  };
  const { data: newClient, error: insErr } = await admin
    .from('clients')
    .insert(row)
    .select('id')
    .single();
  if (insErr || !newClient) return { error: insErr?.message ?? 'Klijent nije kreiran.' };

  if (instructorId) {
    const { error: linkErr } = await admin.from('instructor_clients').insert({
      instructor_id: instructorId,
      client_id: newClient.id,
      placeno_casova: 0,
    });
    if (linkErr && linkErr.code !== '23505') {
      console.warn('[admin] instructor_clients insert (non-fatal)', linkErr.message);
    }
  }

  revalidatePath('/admin/klijenti');
  revalidatePath('/admin/kalendar');
  if (instructorId) revalidatePath(`/admin/view/${instructorId}/klijenti`);
  return { clientId: newClient.id };
}

/**
 * Trajno briše klijenta iz sistema (sve veze sa instruktorima, radionice, uplate, zahtevi – CASCADE u bazi).
 * Samo korisnik iz tabele admin_users (super admin u smislu aplikacije).
 */
export async function deleteClientAsAdmin(clientId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo super admin može da briše klijente.' };

  const trimmedId = clientId?.trim();
  if (!trimmedId) return { error: 'Nedostaje ID klijenta.' };

  const { data: existing, error: fetchErr } = await admin.from('clients').select('id').eq('id', trimmedId).maybeSingle();
  if (fetchErr) return { error: fetchErr.message };
  if (!existing) return { error: 'Klijent nije pronađen.' };

  const { data: links } = await admin.from('instructor_clients').select('instructor_id').eq('client_id', trimmedId);

  const { error: delErr } = await admin.from('clients').delete().eq('id', trimmedId);
  if (delErr) return { error: delErr.message };

  revalidatePath('/admin/klijenti');
  revalidatePath('/admin/kalendar');
  for (const row of links ?? []) {
    const iid = (row as { instructor_id?: string }).instructor_id;
    if (iid) revalidatePath(`/admin/view/${iid}/klijenti`);
  }
  // Instruktorski dashboardi / kalendar mogu keširati termine sa ovim klijentom
  revalidatePath('/dashboard', 'layout');
  return {};
}

export type StanjeVrstaRow = { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number };

function buildStanjeFromMaps(
  uplateByType: Map<string, number>,
  odrzanoByType: Map<string, number>,
  termTypes: { id: string; naziv: string | null }[]
): StanjeVrstaRow[] {
  const result: StanjeVrstaRow[] = [];
  for (const tt of termTypes) {
    const uplaceno = uplateByType.get(tt.id) ?? 0;
    const odrzano = odrzanoByType.get(tt.id) ?? 0;
    if (uplaceno === 0 && odrzano === 0) continue;
    result.push({
      term_type_id: tt.id,
      term_type_naziv: tt.naziv ?? '',
      uplaceno,
      odrzano,
      ostalo: Math.max(0, uplaceno - odrzano),
    });
  }
  const bezVrsteUpl = uplateByType.get('__bez_vrste__') ?? 0;
  const bezVrsteOdrz = odrzanoByType.get('__bez_vrste__') ?? 0;
  if (bezVrsteUpl > 0 || bezVrsteOdrz > 0) {
    result.push({
      term_type_id: null,
      term_type_naziv: 'Bez vrste',
      uplaceno: bezVrsteUpl,
      odrzano: bezVrsteOdrz,
      ostalo: Math.max(0, bezVrsteUpl - bezVrsteOdrz),
    });
  }
  return result;
}

/** Stanje po vrstama za više klijenata odjednom (1 round-trip umesto N). Vraća Map<clientId, stanje[]>. */
export async function getStanjePoVrstamaZaKlijenteBatch(
  clientIds: string[]
): Promise<Map<string, StanjeVrstaRow[]>> {
  const out = new Map<string, StanjeVrstaRow[]>();
  if (clientIds.length === 0) return out;

  const admin = createAdminClient();
  const ids = [...new Set(clientIds)];

  const [uplateRes, predavanjaRes, termTypesRes] = await Promise.all([
    admin.from('uplate').select('client_id, term_type_id, broj_casova').in('client_id', ids),
    admin.from('predavanja').select('client_id, term_type_id, odrzano, term:terms(category:term_categories(is_nastavak))').in('client_id', ids).eq('odrzano', true),
    admin.from('term_types').select('id, naziv').order('naziv'),
  ]);

  const termTypes = termTypesRes.data ?? [];

  const uplateByClient = new Map<string, Map<string, number>>();
  const odrzanoByClient = new Map<string, Map<string, number>>();

  for (const cid of ids) {
    uplateByClient.set(cid, new Map());
    odrzanoByClient.set(cid, new Map());
  }

  for (const u of uplateRes.data ?? []) {
    const cid = u.client_id;
    const map = uplateByClient.get(cid);
    if (!map) continue;
    const tid = u.term_type_id ?? '__bez_vrste__';
    map.set(tid, (map.get(tid) ?? 0) + (u.broj_casova ?? 0));
  }

  for (const p of predavanjaRes.data ?? []) {
    const cid = p.client_id;
    const map = odrzanoByClient.get(cid);
    if (!map) continue;
    const termRaw = (p as { term?: unknown }).term;
    const term = Array.isArray(termRaw) ? termRaw[0] : termRaw;
    const catRaw = (term as { category?: unknown } | null)?.category;
    const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
    if ((cat as { is_nastavak?: boolean } | null)?.is_nastavak) continue;
    const tid = p.term_type_id ?? '__bez_vrste__';
    map.set(tid, (map.get(tid) ?? 0) + 1);
  }

  for (const cid of ids) {
    const uplateByType = uplateByClient.get(cid)!;
    const odrzanoByType = odrzanoByClient.get(cid)!;
    out.set(cid, buildStanjeFromMaps(uplateByType, odrzanoByType, termTypes));
  }
  return out;
}

/** Stanje po vrstama časova za jednog klijenta. Ako je instructorId dat, samo za tog predavača. */
export async function getStanjePoVrstamaZaKlijenta(
  clientId: string,
  instructorId?: string
): Promise<StanjeVrstaRow[]> {
  const admin = createAdminClient();
  let uplateRows: { term_type_id: string | null; broj_casova: number }[];
  if (instructorId) {
    const { data } = await admin.from('uplate').select('term_type_id, broj_casova').eq('client_id', clientId).eq('instructor_id', instructorId);
    uplateRows = data ?? [];
  } else {
    const { data } = await admin.from('uplate').select('term_type_id, broj_casova').eq('client_id', clientId);
    uplateRows = data ?? [];
  }
  const { data: predRows } = await admin
    .from('predavanja')
    .select('term_type_id, odrzano, term:terms(instructor_id, category:term_categories(is_nastavak))')
    .eq('client_id', clientId);
  const uplateByType = new Map<string, number>();
  for (const u of uplateRows) {
    const tid = u.term_type_id ?? '__bez_vrste__';
    uplateByType.set(tid, (uplateByType.get(tid) ?? 0) + (u.broj_casova ?? 0));
  }
  const odrzanoByType = new Map<string, number>();
  for (const p of predRows ?? []) {
    const term = Array.isArray(p.term) ? p.term[0] : p.term;
    if (instructorId && (term as { instructor_id?: string })?.instructor_id !== instructorId) continue;
    if (!p.odrzano) continue;
    const catRaw = (term as { category?: unknown } | null)?.category;
    const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
    if ((cat as { is_nastavak?: boolean } | null)?.is_nastavak) continue;
    const tid = p.term_type_id ?? '__bez_vrste__';
    odrzanoByType.set(tid, (odrzanoByType.get(tid) ?? 0) + 1);
  }
  const { data: termTypes } = await admin.from('term_types').select('id, naziv').order('naziv');
  return buildStanjeFromMaps(uplateByType, odrzanoByType, termTypes ?? []);
}

/** Označi predavanja klijenta kao održana ako je vreme termina (datum + kraj slota) već prošlo. */
export async function markPastPredavanjaAsOdrzano(clientId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('predavanja')
    .select('id, odrzano, term:terms(date, slot_index)')
    .eq('client_id', clientId)
    .eq('odrzano', false);
  const ids: string[] = [];
  for (const p of rows ?? []) {
    const term = Array.isArray(p.term) ? p.term[0] : p.term;
    if (term && typeof term === 'object' && 'date' in term && 'slot_index' in term) {
      const date = (term as { date: string }).date;
      const slotIndex = (term as { slot_index: number }).slot_index;
      if (date && isTermInPast(date, slotIndex)) ids.push(p.id);
    }
  }
  if (ids.length > 0) {
    await admin.from('predavanja').update({ odrzano: true }).in('id', ids);
  }
}

/** Broj održanih časova po vrstama za predavača (za prikaz na dashboardu). */
export async function getOdrzanoPoVrstamaZaPredavaca(
  instructorId: string
): Promise<{ term_type_id: string | null; term_type_naziv: string; count: number }[]> {
  const admin = createAdminClient();
  const { data: termIds } = await admin.from('terms').select('id').eq('instructor_id', instructorId);
  const ids = (termIds ?? []).map((t) => t.id);
  if (ids.length === 0) return [];
  const { data: predavanja } = await admin
    .from('predavanja')
    .select('term_type_id')
    .in('term_id', ids)
    .eq('odrzano', true);
  const countByType = new Map<string, number>();
  for (const p of predavanja ?? []) {
    const tid = p.term_type_id ?? '__bez_vrste__';
    countByType.set(tid, (countByType.get(tid) ?? 0) + 1);
  }
  const { data: termTypes } = await admin.from('term_types').select('id, naziv').order('naziv');
  const result: { term_type_id: string | null; term_type_naziv: string; count: number }[] = [];
  for (const tt of termTypes ?? []) {
    const count = countByType.get(tt.id) ?? 0;
    if (count > 0) result.push({ term_type_id: tt.id, term_type_naziv: tt.naziv ?? '', count });
  }
  const bezVrste = countByType.get('__bez_vrste__') ?? 0;
  if (bezVrste > 0) result.push({ term_type_id: null, term_type_naziv: 'Bez vrste', count: bezVrste });
  return result;
}

/** Unos uplate (evidencija: ko je primio, kada, koliko, za koga). Admin ili predavač (samo svoje). popust_percent = popust za ovu uplatu (npr. 10). */
export async function createUplata(
  instructorId: string,
  clientId: string,
  iznos: number | null,
  termTypeId: string | null,
  brojCasova: number,
  popustPercent: number | null,
  napomena: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' };
  const admin = createAdminClient();
  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  const { data: instructor } = await admin.from('instructors').select('id').eq('user_id', user.id).single();
  const isAdmin = !!adminRow;
  const isOwnInstructor = instructor?.id === instructorId;
  if (!isAdmin && !isOwnInstructor) return { error: 'Niste ovlašćeni da unesete uplatu za tog instruktora.' };
  const popust = popustPercent != null && Number.isFinite(popustPercent) && popustPercent >= 0 && popustPercent <= 100 ? popustPercent : null;
  const { error } = await admin.from('uplate').insert({
    instructor_id: instructorId,
    client_id: clientId,
    iznos: iznos != null && Number.isFinite(iznos) ? iznos : null,
    term_type_id: termTypeId || null,
    broj_casova: Math.max(0, brojCasova),
    popust_percent: popust,
    napomena: napomena?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/uplate');
  revalidatePath('/admin/uplate/novi');
  revalidatePath('/dashboard/uplate');
  revalidatePath('/dashboard/uplate/novi');
  return {};
}

// ─── Potencijalni klijenti (testiranje) ───────────────────────────────────────

export type PotentialClientStatus = 'zakazan' | 'pojavio_se' | 'nije_se_pojavio' | 'prebacen_u_klijenta';

export type PotentialClientRow = {
  id: string;
  term_id: string | null;
  ime: string;
  prezime: string | null;
  ime_roditelja: string | null;
  mobilni_roditelja: string | null;
  razred: string | null;
  status: PotentialClientStatus;
  komentar: string | null;
  converted_client_id: string | null;
  created_at: string;
};

export async function addPotentialClient(
  termId: string,
  payload: { ime: string; prezime: string | null; ime_roditelja: string | null; mobilni_roditelja: string | null; razred: string | null }
): Promise<{ error?: string; id?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { data, error } = await admin
    .from('potential_clients')
    .insert({ term_id: termId, ...payload })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Greška.' };
  revalidatePath(`/admin/termin/${termId}`);
  return { id: data.id };
}

export async function updatePotentialClient(
  id: string,
  payload: { ime?: string; prezime?: string | null; ime_roditelja?: string | null; mobilni_roditelja?: string | null; razred?: string | null; status?: PotentialClientStatus; komentar?: string | null }
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { data: pc } = await admin.from('potential_clients').select('term_id').eq('id', id).single();
  const { error } = await admin.from('potential_clients').update(payload).eq('id', id);
  if (error) return { error: error.message };
  if (pc?.term_id) revalidatePath(`/admin/termin/${pc.term_id}`);
  revalidatePath(`/admin/testiranja`);
  return {};
}

export async function convertPotentialClientToClient(
  pcId: string
): Promise<{ error?: string; clientId?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };

  const { data: pc } = await admin.from('potential_clients').select('*').eq('id', pcId).single();
  if (!pc) return { error: 'Potencijalni klijent nije pronađen.' };
  if (pc.converted_client_id) return { error: 'Već je prebačen u klijenta.', clientId: pc.converted_client_id };

  const { data: newClient, error: insErr } = await admin
    .from('clients')
    .insert({ ime: pc.ime, prezime: pc.prezime ?? '', razred: pc.razred ?? null, roditelj: pc.ime_roditelja ?? null, kontakt_telefon: pc.mobilni_roditelja ?? null })
    .select('id')
    .single();
  if (insErr || !newClient) return { error: insErr?.message ?? 'Greška pri kreiranju klijenta.' };

  await admin.from('potential_clients').update({ status: 'prebacen_u_klijenta', converted_client_id: newClient.id }).eq('id', pcId);
  if (pc.term_id) revalidatePath(`/admin/termin/${pc.term_id}`);
  revalidatePath('/admin/klijenti');
  revalidatePath('/admin/testiranja');
  return { clientId: newClient.id };
}

export async function getAllPotentialClients(): Promise<PotentialClientRow[]> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return [];
  const { data } = await admin
    .from('potential_clients')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as PotentialClientRow[];
}

// ── Otkazani termini ─────────────────────────────────────────────────────────

export type OtkazaniTerminRow = {
  id: string;
  client_id: string | null;
  client_ime: string;
  client_prezime: string | null;
  instructor_id: string | null;
  instructor_ime: string | null;
  instructor_prezime: string | null;
  classroom_naziv: string | null;
  term_date: string;
  slot_index: number;
  term_type_naziv: string | null;
  placeno: boolean;
  napomena: string | null;
  otkazano_at: string;
};

export async function getOtkazaneTermineZaKlijenta(clientId: string): Promise<OtkazaniTerminRow[]> {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('otkazani_termini')
    .select('*')
    .eq('client_id', clientId)
    .order('term_date', { ascending: false })
    .order('slot_index', { ascending: false });
  return (data ?? []) as OtkazaniTerminRow[];
}

export async function updateOtkazaniTerminPlaceno(id: string, placeno: boolean, clientId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { error } = await admin.from('otkazani_termini').update({ placeno }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/klijenti/${clientId}`);
  return {};
}

export async function deleteOtkazaniTermin(id: string, clientId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { error } = await admin.from('otkazani_termini').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/klijenti/${clientId}`);
  return {};
}
