'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TermCategoryRow } from '@/lib/term-categories';
import { SEEDED_TERM_CATEGORY_INDIVIDUAL_ID } from '@/lib/term-categories';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { INSTRUCTOR_COLORS, isTermInPast, slotsNeeded, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
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

  // Novi termin nema "svoj" resurs koji bi mogao da ponudi u zamenu, pa se ovde – za razliku od
  // izmene postojećeg termina (updateTermClassroomAsAdmin, reassignPredavanjeInstructorAsAdmin) –
  // zauzet instruktor/učionica i dalje odbijaju, samo sa jasnom porukom umesto sirove DB greške
  // (terms ima UNIQUE(instructor_id, date, slot_index) i UNIQUE(classroom_id, date, slot_index)).
  const { data: existingSameInstructor } = await adminSupabase
    .from('terms')
    .select('id')
    .eq('instructor_id', instructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .maybeSingle();
  if (existingSameInstructor) {
    return { error: 'Ovaj instruktor već ima termin u ovom slotu. Dodajte radionicu u taj postojeći termin umesto novog.' };
  }
  if (classroomId) {
    const { data: existingSameClassroom } = await adminSupabase
      .from('terms')
      .select('id')
      .eq('date', dateStr)
      .eq('slot_index', slot)
      .eq('classroom_id', classroomId)
      .maybeSingle();
    if (existingSameClassroom) {
      return { error: 'Ova učionica je već zauzeta u ovom slotu. Zamena mesta je moguća samo kod izmene postojećeg termina, ne pri kreiranju novog.' };
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

/**
 * "Zakaži isti termin i narednih N dana" – SVE dane kreira u JEDNOM server pozivu (a ne klijent
 * poziva createTermAsAdmin/createPredavanjeAsAdmin N puta preko mreže). Svaki poziv sa klijenta je
 * pun HTTP round-trip do servera; kad se to uradi N puta (a svaki dan iznutra već ima nekoliko
 * sekvencijalnih upita), zbir kasni i po nekoliko sekundi po danu – vidljivo kao "visi na Kreiranje…".
 * Dani su nezavisni slotovi (različiti datumi), pa se ovde – već unutar jednog zahteva servera –
 * paralelizuju sa Promise.all bez rizika od sudara.
 */
export async function repeatTermAsAdmin(
  instructorId: string,
  baseDate: string,
  slotIndex: number,
  classroomId: string | null,
  termCategoryId: string,
  napomena: string | null,
  clientIds: string[],
  termTypeId: string | null,
  days: number
): Promise<{ failed: { date: string; error: string }[] }> {
  const { error: authErr } = await requireAdmin();
  if (authErr) {
    return { failed: [{ date: baseDate, error: authErr }] };
  }

  const results = await Promise.all(
    Array.from({ length: days }, (_, idx) => idx + 1).map(async (offset) => {
      const d = new Date(baseDate + 'T12:00:00');
      d.setDate(d.getDate() + offset);
      const dStr = d.toISOString().slice(0, 10);
      const res = await createTermAsAdmin(instructorId, dStr, slotIndex, classroomId, termCategoryId, napomena, null);
      if (res.error || !res.termId) return { date: dStr, error: res.error ?? 'Greška pri kreiranju termina.' };
      for (const cid of clientIds) {
        const pr = await createPredavanjeAsAdmin(res.termId, cid, false, false, null, termTypeId);
        if (pr.error) return { date: dStr, error: pr.error };
      }
      return { date: dStr, error: null as string | null };
    })
  );
  return { failed: results.filter((r): r is { date: string; error: string } => r.error !== null) };
}

/**
 * "Više termina" mod na admin kalendaru: masovno zakazivanje za JEDNO dete preko više slotova
 * odjednom, BEZ instruktora i učionice – admin ne bira kojim instruktorom, pa se za svaki izabrani
 * slot pravi zahtev (zahtevi_za_cas, isti mehanizam kao kad učenik zatraži čas) koji bilo koji
 * predavač vidi na svom Dashboard → Zahtevi i preuzima/potvrđuje. Ne dira terms/predavanja direktno.
 */
export async function createBulkZahteviAsAdmin(
  clientId: string,
  termTypeId: string | null,
  slots: { date: string; slotIndex: number }[]
): Promise<{ failed: { date: string; slotIndex: number; error: string }[] }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { failed: slots.map((s) => ({ ...s, error: authErr ?? 'Niste ovlašćeni.' })) };
  if (slots.length === 0) return { failed: [] };

  const { data: existing } = await admin
    .from('zahtevi_za_cas')
    .select('requested_date, requested_slot_index')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .in('requested_date', [...new Set(slots.map((s) => s.date))]);
  const existingKeys = new Set((existing ?? []).map((r) => `${r.requested_date}|${r.requested_slot_index}`));

  const toInsert = slots.filter((s) => !existingKeys.has(`${s.date}|${s.slotIndex}`));
  const skipped = slots
    .filter((s) => existingKeys.has(`${s.date}|${s.slotIndex}`))
    .map((s) => ({ ...s, error: 'Zahtev za ovo dete već postoji za taj termin.' }));

  if (toInsert.length === 0) return { failed: skipped };

  const { error } = await admin.from('zahtevi_za_cas').insert(
    toInsert.map((s) => ({
      client_id: clientId,
      instructor_id: null,
      requested_date: s.date,
      requested_slot_index: s.slotIndex,
      term_type_id: termTypeId,
      status: 'pending',
    }))
  );
  if (error) {
    return { failed: [...skipped, ...toInsert.map((s) => ({ ...s, error: error.message }))] };
  }
  revalidatePath('/dashboard/zahtevi');
  return { failed: skipped };
}

/**
 * "Dodeli instruktora" mod na kalendaru: selektuje se više PostOJEĆIH termina, pa se svima
 * odjednom dodeli isti instruktor. Termin koji ovaj instruktor već ima u tom datumu/slotu se
 * preskače (javlja se kao greška za taj termin) – bez svop logike, ovo je za popunjavanje/izmenu,
 * ne za zamenu mesta (za to postoji Swap).
 */
export async function assignInstructorToTermsAsAdmin(
  instructorId: string,
  termIds: string[]
): Promise<{ failed: { termId: string; error: string }[] }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { failed: termIds.map((termId) => ({ termId, error: authErr ?? 'Niste ovlašćeni.' })) };

  const results = await Promise.all(
    termIds.map(async (termId) => {
      const { data: term } = await admin.from('terms').select('date, slot_index, instructor_id').eq('id', termId).maybeSingle();
      if (!term) return { termId, error: 'Termin nije pronađen.' };
      if (term.instructor_id === instructorId) return { termId, error: null as string | null };
      const { data: conflict } = await admin
        .from('terms')
        .select('id')
        .eq('instructor_id', instructorId)
        .eq('date', term.date)
        .eq('slot_index', term.slot_index)
        .neq('id', termId)
        .maybeSingle();
      if (conflict) return { termId, error: 'Instruktor je već zauzet u tom terminu.' };
      const { error } = await admin.from('terms').update({ instructor_id: instructorId }).eq('id', termId);
      if (error) return { termId, error: error.message };
      // Automatski "blokirajući" slotovi dužeg časa prate instruktora roditeljskog termina.
      await admin.from('terms').update({ instructor_id: instructorId }).eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      return { termId, error: null as string | null };
    })
  );
  revalidatePath('/admin/kalendar');
  return { failed: results.filter((r): r is { termId: string; error: string } => r.error !== null) };
}

/** "Dodeli učionicu" mod – isto kao gore, za učionicu umesto instruktora. */
export async function assignClassroomToTermsAsAdmin(
  classroomId: string,
  termIds: string[]
): Promise<{ failed: { termId: string; error: string }[] }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { failed: termIds.map((termId) => ({ termId, error: authErr ?? 'Niste ovlašćeni.' })) };

  const results = await Promise.all(
    termIds.map(async (termId) => {
      const { data: term } = await admin.from('terms').select('date, slot_index, classroom_id').eq('id', termId).maybeSingle();
      if (!term) return { termId, error: 'Termin nije pronađen.' };
      if (term.classroom_id === classroomId) return { termId, error: null as string | null };
      const { data: conflict } = await admin
        .from('terms')
        .select('id')
        .eq('classroom_id', classroomId)
        .eq('date', term.date)
        .eq('slot_index', term.slot_index)
        .neq('id', termId)
        .maybeSingle();
      if (conflict) return { termId, error: 'Učionica je već zauzeta u tom terminu.' };
      const { error } = await admin.from('terms').update({ classroom_id: classroomId }).eq('id', termId);
      if (error) return { termId, error: error.message };
      await admin.from('terms').update({ classroom_id: classroomId }).eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      return { termId, error: null as string | null };
    })
  );
  revalidatePath('/admin/kalendar');
  return { failed: results.filter((r): r is { termId: string; error: string } => r.error !== null) };
}

/**
 * "Dodeli instruktora" primenjen na zahtev (a ne na postojeći termin) – ovo je zapravo isto što i
 * predavačevo potvrdiZahtev, samo pokreće admin i BIRA kog instruktora, umesto da instruktor
 * potvrđuje svoj sopstveni zahtev. Pretvara zahtev u pravi termin+radionicu (bez učionice – to se
 * dodeljuje posebno, "Dodeli učionicu").
 */
export async function assignInstructorToZahtevAsAdmin(zahtevId: string, instructorId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: zahtev } = await admin.from('zahtevi_za_cas').select('*').eq('id', zahtevId).single();
  if (!zahtev) return { error: 'Zahtev nije pronađen.' };
  if (zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };

  const dateStr = String(zahtev.requested_date).slice(0, 10);
  const slot = Math.min(15, Math.max(0, zahtev.requested_slot_index));

  let termId: string;
  const { data: existing } = await admin
    .from('terms')
    .select('id')
    .eq('instructor_id', instructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .maybeSingle();
  if (existing) {
    termId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('terms')
      .insert({ instructor_id: instructorId, date: dateStr, slot_index: slot, term_category_id: SEEDED_TERM_CATEGORY_INDIVIDUAL_ID })
      .select('id')
      .single();
    if (insErr || !inserted) return { error: insErr?.message ?? 'Termin nije kreiran.' };
    termId = inserted.id;
  }

  // Ako je zahtev unapred dobio učionicu (bilo kojim redosledom, pre ili posle instruktora) i termin
  // je nema, pokušaj da je prenese – tiho preskoči ako je u međuvremenu zauzeta (ne blokira potvrdu).
  if (zahtev.classroom_id) {
    const { data: termNow } = await admin.from('terms').select('classroom_id').eq('id', termId).single();
    if (termNow && !termNow.classroom_id) {
      const { data: roomConflict } = await admin
        .from('terms')
        .select('id')
        .eq('classroom_id', zahtev.classroom_id)
        .eq('date', dateStr)
        .eq('slot_index', slot)
        .neq('id', termId)
        .maybeSingle();
      if (!roomConflict) {
        await admin.from('terms').update({ classroom_id: zahtev.classroom_id }).eq('id', termId);
      }
    }
  }

  const limitCheck = await termMozeNovoPredavanje(termId);
  if (!limitCheck.ok) return { error: `Maksimalan broj časova (${limitCheck.max}) je već dostignut u tom terminu.` };

  const { data: predavanje, error: predErr } = await admin
    .from('predavanja')
    .insert({ term_id: termId, client_id: zahtev.client_id, odrzano: false, placeno: false, term_type_id: zahtev.term_type_id ?? null })
    .select('id')
    .single();
  if (predErr || !predavanje) return { error: predErr?.message ?? 'Radionica nije kreirana.' };

  await syncSpilloverForTerm(admin, termId);

  await admin
    .from('zahtevi_za_cas')
    .update({ status: 'confirmed', resolved_at: new Date().toISOString(), created_term_id: termId, created_predavanje_id: predavanje.id })
    .eq('id', zahtevId);

  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  return {};
}

/** Batch verzija gornje – jedan poziv serveru za sve selektovane zahteve. */
export async function assignInstructorToZahteviAsAdmin(
  instructorId: string,
  zahtevIds: string[]
): Promise<{ failed: { zahtevId: string; error: string }[] }> {
  const { error: authErr } = await requireAdmin();
  if (authErr) return { failed: zahtevIds.map((zahtevId) => ({ zahtevId, error: authErr })) };

  const results = await Promise.all(
    zahtevIds.map(async (zahtevId) => {
      const res = await assignInstructorToZahtevAsAdmin(zahtevId, instructorId);
      return { zahtevId, error: res.error ?? null };
    })
  );
  return { failed: results.filter((r): r is { zahtevId: string; error: string } => r.error !== null) };
}

/**
 * Dodeljuje učionicu zahtevu – nezavisno od redosleda, može i pre nego što zahtev dobije
 * instruktora. Ako zahtev već ima kreiran termin (već potvrđen), učionica se odmah prenosi tamo;
 * inače se samo pamti na zahtevu i prenosi kasnije kad se zahtev potvrdi (bilo kojim putem).
 */
export async function assignClassroomToZahtevAsAdmin(zahtevId: string, classroomId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: zahtev } = await admin
    .from('zahtevi_za_cas')
    .select('status, requested_date, requested_slot_index, created_term_id')
    .eq('id', zahtevId)
    .single();
  if (!zahtev) return { error: 'Zahtev nije pronađen.' };

  const dateStr = String(zahtev.requested_date).slice(0, 10);
  const slot = Math.min(15, Math.max(0, zahtev.requested_slot_index));
  const { data: conflict } = await admin
    .from('terms')
    .select('id')
    .eq('classroom_id', classroomId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .maybeSingle();
  if (conflict && conflict.id !== zahtev.created_term_id) {
    return { error: 'Učionica je već zauzeta u tom terminu.' };
  }

  const { error } = await admin.from('zahtevi_za_cas').update({ classroom_id: classroomId }).eq('id', zahtevId);
  if (error) return { error: error.message };

  if (zahtev.created_term_id) {
    await admin.from('terms').update({ classroom_id: classroomId }).eq('id', zahtev.created_term_id);
  }

  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  return {};
}

/** Batch verzija gornje. */
export async function assignClassroomToZahteviAsAdmin(
  classroomId: string,
  zahtevIds: string[]
): Promise<{ failed: { zahtevId: string; error: string }[] }> {
  const { error: authErr } = await requireAdmin();
  if (authErr) return { failed: zahtevIds.map((zahtevId) => ({ zahtevId, error: authErr })) };

  const results = await Promise.all(
    zahtevIds.map(async (zahtevId) => {
      const res = await assignClassroomToZahtevAsAdmin(zahtevId, classroomId);
      return { zahtevId, error: res.error ?? null };
    })
  );
  return { failed: results.filter((r): r is { zahtevId: string; error: string } => r.error !== null) };
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

export async function getTermsForNastavak(date: string, slotIndex: number): Promise<TermForNastavak[]> {
  if (slotIndex <= 0) return [];
  const admin = createAdminClient();

  const { data } = await admin
    .from('terms')
    .select('id, date, slot_index, instructor_id, instructor:instructors(ime, prezime), classroom_id, classroom:classrooms(naziv), predavanja(client_id, client:clients(ime, prezime))')
    .eq('date', date.slice(0, 10))
    .eq('slot_index', slotIndex - 1);

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

/**
 * Uskladi "blokirajuće" nastavak-termine za duže časove (dvočas i sl.) sa željenim brojem dodatnih slotova –
 * kreira ih ako fale, briše višak. Prazan termin (bez radionica), samo da niko drugi ne zakaže u tom slotu
 * dok traje duži čas. Prepoznaje se preko `nastavak_of_term_id` + fiksne napomene (AUTO_SPILLOVER_NAPOMENA),
 * za razliku od ručno kreiranog nastavka koji ima svoje radionice.
 */
export async function syncSpilloverSlots(
  admin: ReturnType<typeof createAdminClient>,
  originTermId: string,
  totalSlotsNeeded: number
): Promise<void> {
  // Origin i existing ne zavise jedno od drugog – paralelno umesto sekvencijalno (upola manje čekanja).
  const [{ data: origin }, { data: existing }] = await Promise.all([
    admin
      .from('terms')
      .select('instructor_id, classroom_id, date, slot_index, term_category_id')
      .eq('id', originTermId)
      .single(),
    admin
      .from('terms')
      .select('id, slot_index')
      .eq('nastavak_of_term_id', originTermId)
      .eq('napomena', AUTO_SPILLOVER_NAPOMENA),
  ]);
  if (!origin) return;

  const existingBySlot = new Map((existing ?? []).map((t) => [t.slot_index, t.id as string]));

  const desiredSlots: number[] = [];
  for (let i = 1; i < totalSlotsNeeded; i++) {
    const s = origin.slot_index + i;
    if (s > 15) break;
    desiredSlots.push(s);
  }

  const toDelete = [...existingBySlot.entries()].filter(([slotIdx]) => !desiredSlots.includes(slotIdx));
  const toInsert = desiredSlots.filter((slotIdx) => !existingBySlot.has(slotIdx));

  await Promise.all([
    ...toDelete.map(([, id]) => admin.from('terms').delete().eq('id', id)),
    ...toInsert.map(async (slotIdx) => {
      const { error: spilloverErr } = await admin.from('terms').insert({
        instructor_id: origin.instructor_id,
        classroom_id: origin.classroom_id,
        date: origin.date,
        slot_index: slotIdx,
        term_category_id: origin.term_category_id,
        nastavak_of_term_id: originTermId,
        napomena: AUTO_SPILLOVER_NAPOMENA,
      });
      if (spilloverErr) {
        // Instruktor ili učionica su već genuinely zauzeti u tom slotu nečim drugim – ne rušimo
        // čuvanje radionice zbog ovoga, samo beležimo da automatska blokada nije uspela.
        console.warn('[dvočas] spillover insert failed for slot', slotIdx, spilloverErr.message);
      }
    }),
  ]);
}

/**
 * Uzima najduže trajanje među SVIM radionicama u terminu (grupni termin može imati različite vrste
 * časa sa različitim trajanjem) i uskladi broj zauzetih slotova prema tome.
 */
export async function syncSpilloverForTerm(
  admin: ReturnType<typeof createAdminClient>,
  termId: string
): Promise<void> {
  // Jedan upit (embedded join) umesto dva sekvencijalna (prvo term_type_id pa onda term_types).
  const { data: preds } = await admin
    .from('predavanja')
    .select('term_type:term_types(trajanje_minuta)')
    .eq('term_id', termId);
  let maxMinutes = 45;
  for (const p of preds ?? []) {
    const tt = p.term_type as { trajanje_minuta?: number } | { trajanje_minuta?: number }[] | null;
    const trajanje = Array.isArray(tt) ? tt[0]?.trajanje_minuta : tt?.trajanje_minuta;
    if (trajanje) maxMinutes = Math.max(maxMinutes, trajanje);
  }
  await syncSpilloverSlots(admin, termId, slotsNeeded(maxMinutes));
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
  await syncSpilloverForTerm(admin, termId);
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
  await syncSpilloverForTerm(admin, termId);
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

  // If term has no more predavanja, delete the term (frees instructor + classroom) – i njegove
  // eventualne automatske "blokirajuće" slotove (nastavak_of_term_id nema CASCADE, brišemo ručno).
  const { count } = await admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId);
  if ((count ?? 0) === 0) {
    await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
    await admin.from('terms').delete().eq('id', termId);
  } else {
    await syncSpilloverForTerm(admin, termId);
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
    // Kreiramo novi termin za novog instruktora – prenosimo kategoriju/napomenu sa izvornog terma
    // (term_category_id je NOT NULL u bazi, ne sme se izostaviti). NE prenosimo učionicu ovde:
    // izvorni termin je u ISTOM datumu/slotu i još uvek je "drži", pa bi kopiranje odmah probilo
    // UNIQUE(classroom_id, date, slot_index). Učionicu eventualno preuzima novi termin ispod,
    // POSLE što se izvorni termin isprazni i obriše (oslobodi je).
    const { data: sourceTerm } = await admin
      .from('terms')
      .select('term_category_id, napomena')
      .eq('id', currentTermId)
      .single();
    if (!sourceTerm) return { error: 'Izvorni termin nije pronađen.' };
    const { data: inserted, error: insErr } = await admin
      .from('terms')
      .insert({
        instructor_id: newInstructorId,
        date: termDate.slice(0, 10),
        slot_index: slotIndex,
        term_category_id: sourceTerm.term_category_id,
        napomena: sourceTerm.napomena,
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

  // Ako je izvorni termin sad prazan, obriši ga (oslobađa instruktora i učionicu) – isti obrazac
  // kao deletePredavanjeAsAdmin. Ako je time oslobođena učionica, i novi termin je nema, preuzima je.
  const { count: remainingInSource } = await admin
    .from('predavanja')
    .select('*', { count: 'exact', head: true })
    .eq('term_id', currentTermId);
  if ((remainingInSource ?? 0) === 0) {
    const { data: freedTerm } = await admin.from('terms').select('classroom_id').eq('id', currentTermId).single();
    await admin.from('terms').delete().eq('nastavak_of_term_id', currentTermId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
    await admin.from('terms').delete().eq('id', currentTermId);
    if (freedTerm?.classroom_id) {
      const { data: targetTerm } = await admin.from('terms').select('classroom_id').eq('id', newTermId).single();
      if (targetTerm && !targetTerm.classroom_id) {
        await admin.from('terms').update({ classroom_id: freedTerm.classroom_id }).eq('id', newTermId);
      }
    }
  } else {
    await syncSpilloverForTerm(admin, currentTermId);
  }
  await syncSpilloverForTerm(admin, newTermId);

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

/** "Otkazivanje" – čuva istorijski trag u otkazani_termini (prikazuje se sivo na kalendaru) pre brisanja. */
export async function deleteTermAsAdmin(termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  // Save all predavanja in this term to history before deleting
  const { data: preds } = await admin.from('predavanja').select('id').eq('term_id', termId);
  for (const p of preds ?? []) {
    await savePredavanjeToHistory(admin, p.id);
  }

  // Briše i eventualne automatske "blokirajuće" slotove dužeg časa (nastavak_of_term_id nema CASCADE).
  await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);

  const { error } = await admin.from('terms').delete().eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  return {};
}

/**
 * "Brisanje" (bez traga) – za razliku od deleteTermAsAdmin (Otkazivanje) NE upisuje u
 * otkazani_termini, pa posle ovoga na kalendaru ne ostaje ništa, ni sivi zapis. predavanja se brišu
 * automatski (ON DELETE CASCADE na predavanja.term_id).
 */
export async function permanentlyDeleteTermAsAdmin(termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
  const { error } = await admin.from('terms').delete().eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  return {};
}

/**
 * Briše više termina i/ili otkazanih (istorijskih) zapisa odjednom (Delete mod na kalendaru) – JEDAN
 * poziv serveru koji iznutra paralelizuje brisanje (nezavisni redovi), umesto da klijent zove
 * pojedinačne akcije N puta preko mreže (isti problem kao kod repeatTermAsAdmin). Termini se brišu
 * BEZ TRAGA (permanentlyDeleteTermAsAdmin) – ovo je namerno drugačije od "Otkaži termin".
 */
export async function deleteTermsAsAdmin(
  termIds: string[],
  otkazaniIds: string[] = []
): Promise<{ failed: { id: string; error: string }[] }> {
  const { error: authErr } = await requireAdmin();
  if (authErr) return { failed: [...termIds, ...otkazaniIds].map((id) => ({ id, error: authErr })) };

  const [termResults, otkazaniResults] = await Promise.all([
    Promise.all(
      termIds.map(async (id) => {
        const res = await permanentlyDeleteTermAsAdmin(id);
        return { id, error: res.error ?? null };
      })
    ),
    Promise.all(
      otkazaniIds.map(async (id) => {
        const res = await deleteOtkazaniTermin(id);
        return { id, error: res.error ?? null };
      })
    ),
  ]);
  return { failed: [...termResults, ...otkazaniResults].filter((r): r is { id: string; error: string } => r.error !== null) };
}

/**
 * Menja učionicu termina. Ako je izabrana učionica već zauzeta DRUGIM terminom u istom datumu/slotu
 * (baza ima UNIQUE ograničenje na (classroom_id, date, slot_index)), radi se prava zamena mesta:
 * onaj drugi termin dobija učionicu koju je ovaj termin do sad imao (privremeno se prolazi kroz NULL
 * da se ne prekrši ograničenje usred operacije).
 */
export async function updateTermClassroomAsAdmin(termId: string, classroomId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: term } = await admin.from('terms').select('classroom_id, date, slot_index').eq('id', termId).single();
  if (!term) return { error: 'Termin nije pronađen.' };
  if (term.classroom_id === classroomId) return {};

  const { data: conflict } = await admin
    .from('terms')
    .select('id')
    .eq('classroom_id', classroomId)
    .eq('date', term.date)
    .eq('slot_index', term.slot_index)
    .neq('id', termId)
    .maybeSingle();

  if (conflict) {
    const { error: freeErr } = await admin.from('terms').update({ classroom_id: null }).eq('id', termId);
    if (freeErr) return { error: freeErr.message };
    const { error: swapErr } = await admin.from('terms').update({ classroom_id: term.classroom_id }).eq('id', conflict.id);
    if (swapErr) return { error: swapErr.message };
    revalidatePath(`/admin/termin/${conflict.id}`);
  }

  const { error } = await admin.from('terms').update({ classroom_id: classroomId }).eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

/**
 * Eksplicitna zamena (swap) dva termina sa kalendara – bira se koje dimenzije se menjaju
 * (termin=datum/slot, instruktor, učionica, klijent=cela radionica). Cela logika i validacija
 * sudara je u Postgres funkciji swap_terms (037_swap_terms.sql), pošto zamena datuma/vremena
 * između dva termina istog instruktora zahteva odloženu (deferred) proveru UNIQUE ograničenja
 * unutar jedne transakcije – to nije izvodivo preko običnih .update() poziva iz JS-a.
 */
export async function swapTermsAsAdmin(
  termAId: string,
  termBId: string,
  opts: { termin: boolean; instruktor: boolean; ucionica: boolean; klijent: boolean }
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { error } = await admin.rpc('swap_terms', {
    p_term_a: termAId,
    p_term_b: termBId,
    p_swap_termin: opts.termin,
    p_swap_instruktor: opts.instruktor,
    p_swap_ucionica: opts.ucionica,
    p_swap_klijent: opts.klijent,
  });
  if (error) return { error: error.message || 'Greška pri zameni termina.' };

  await Promise.all([syncSpilloverForTerm(admin, termAId), syncSpilloverForTerm(admin, termBId)]);

  revalidatePath('/admin/kalendar');
  return {};
}

/**
 * Kopira termin (instruktor, učionica, kategorija, napomena) i sve njegove radionice (klijent,
 * vrsta časa, komentar) na prazan slot – odrzano/placeno se NE prenose (nova radionica se još nije
 * desala). Cilja samo prazne slotove (za razliku od swap-a nema šta da se zameni), pa se ponovo
 * koriste već validirane funkcije createTermAsAdmin/createPredavanjeAsAdmin umesto duplirane provere.
 */
export async function copyTermAsAdmin(
  sourceTermId: string,
  targetDate: string,
  targetSlot: number
): Promise<{ error?: string; termId?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: source } = await admin
    .from('terms')
    .select('instructor_id, classroom_id, term_category_id, napomena, nastavak_of_term_id')
    .eq('id', sourceTermId)
    .single();
  if (!source) return { error: 'Termin za kopiranje nije pronađen.' };
  if (source.nastavak_of_term_id) {
    return { error: 'Automatski blok (nastavak dužeg časa) nije moguće kopirati – izaberite pravi termin.' };
  }

  const { data: preds } = await admin
    .from('predavanja')
    .select('client_id, term_type_id, komentar')
    .eq('term_id', sourceTermId);
  if (!preds || preds.length === 0) {
    return { error: 'Ovaj termin nema nijednu radionicu za kopiranje.' };
  }

  const createRes = await createTermAsAdmin(
    source.instructor_id,
    targetDate,
    targetSlot,
    source.classroom_id,
    source.term_category_id,
    source.napomena
  );
  if (createRes.error || !createRes.termId) return { error: createRes.error ?? 'Greška pri kreiranju termina.' };
  const newTermId = createRes.termId;

  let firstError: string | null = null;
  let successCount = 0;
  for (const p of preds) {
    const res = await createPredavanjeAsAdmin(newTermId, p.client_id, false, false, p.komentar, p.term_type_id);
    if (res.error) firstError = firstError ?? res.error;
    else successCount += 1;
  }

  revalidatePath('/admin/kalendar');
  if (successCount === 0) return { error: firstError ?? 'Kopiranje nije uspelo.' };
  if (firstError) return { termId: newTermId, error: `Kopirano ${successCount}/${preds.length} – ${firstError}` };
  return { termId: newTermId };
}

export type TermTypeRow = { id: string; naziv: string; opis: string | null; cena_po_casu: number | null; program_id: string | null; trajanje_minuta: number };

export async function getTermTypes(): Promise<TermTypeRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('term_types').select('id, naziv, opis, cena_po_casu, program_id, trajanje_minuta').order('naziv');
  return (data ?? []) as TermTypeRow[];
}

export async function createTermTypeAsAdmin(
  naziv: string,
  opis: string | null,
  cena_po_casu: number | null,
  program_id: string | null,
  trajanje_minuta: number
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!program_id) return { error: 'Izaberite program.' };
  if (!Number.isFinite(trajanje_minuta) || trajanje_minuta <= 0) return { error: 'Trajanje mora biti pozitivan broj minuta.' };
  const { error } = await admin.from('term_types').insert({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    cena_po_casu: cena_po_casu != null && Number.isFinite(cena_po_casu) ? cena_po_casu : null,
    program_id,
    trajanje_minuta,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/vrste-termina');
  return {};
}

export async function updateTermTypeAsAdmin(
  id: string,
  naziv: string,
  opis: string | null,
  cena_po_casu: number | null,
  program_id: string | null,
  trajanje_minuta: number
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!program_id) return { error: 'Izaberite program.' };
  if (!Number.isFinite(trajanje_minuta) || trajanje_minuta <= 0) return { error: 'Trajanje mora biti pozitivan broj minuta.' };
  const { error } = await admin.from('term_types').update({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    cena_po_casu: cena_po_casu != null && Number.isFinite(cena_po_casu) ? cena_po_casu : null,
    program_id,
    trajanje_minuta,
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

export type ProgramRow = { id: string; naziv: string; opis: string | null };

export async function getPrograms(): Promise<ProgramRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('programi').select('id, naziv, opis').order('naziv');
  return (data ?? []) as ProgramRow[];
}

export async function createProgramAsAdmin(naziv: string, opis: string | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('programi').insert({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/programi');
  return {};
}

export async function updateProgramAsAdmin(id: string, naziv: string, opis: string | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('programi').update({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
  }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/programi');
  return {};
}

export async function deleteProgramAsAdmin(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { count } = await admin.from('term_types').select('*', { count: 'exact', head: true }).eq('program_id', id);
  if ((count ?? 0) > 0) {
    return { error: 'Program se koristi u vrstama termina; dodelite drugi program tim vrstama pre brisanja.' };
  }
  const { error } = await admin.from('programi').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/programi');
  return {};
}

/** Koje programe (npr. Čitanje, Matematika) dete pohađa – nezavisno od konkretnih vrsta termina + status. */
export type ClientProgramSelection = { program_id: string; zavrseno: boolean };

export async function getClientProgrami(clientId: string): Promise<ClientProgramSelection[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_programi')
    .select('program_id, zavrseno')
    .eq('client_id', clientId);
  return (data ?? []) as ClientProgramSelection[];
}

export async function saveClientProgrami(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  selections: ClientProgramSelection[]
): Promise<void> {
  await admin.from('client_programi').delete().eq('client_id', clientId);
  if (selections.length > 0) {
    await admin.from('client_programi').insert(
      selections.map((s) => ({ client_id: clientId, program_id: s.program_id, zavrseno: s.zavrseno }))
    );
  }
}

/**
 * Za sve klijente odjednom: koje programe su završili (zavrseno=true), grupisano po klijentu.
 * Koristi se za filtriranje "Pretraga klijenata" pri zakazivanju – deca koja su završila program
 * vezan za izabranu vrstu časa se podrazumevano ne prikazuju.
 */
export async function getAllClientsCompletedProgramIds(): Promise<Map<string, Set<string>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_programi')
    .select('client_id, program_id')
    .eq('zavrseno', true);
  const out = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = out.get(row.client_id) ?? new Set<string>();
    set.add(row.program_id);
    out.set(row.client_id, set);
  }
  return out;
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

/** Koje vrste termina (konkretne, sa cenom) dete pohađa + da li je svaka od njih završena. */
export type ClientProgramStatus = { term_type_id: string; zavrseno: boolean };

/** Vrati trenutne vrste termina klijenta (za prefill u formi). */
export async function getClientTermTypeStatuses(clientId: string): Promise<ClientProgramStatus[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_term_type_status')
    .select('term_type_id, zavrseno')
    .eq('client_id', clientId);
  return (data ?? []) as ClientProgramStatus[];
}

/** Zameni čitavu listu programa klijenta novom (potpuna zamena – brisanje pa upis). */
export async function saveClientTermTypeStatuses(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  statuses: ClientProgramStatus[]
): Promise<void> {
  await admin.from('client_term_type_status').delete().eq('client_id', clientId);
  if (statuses.length > 0) {
    await admin.from('client_term_type_status').insert(
      statuses.map((s) => ({ client_id: clientId, term_type_id: s.term_type_id, zavrseno: s.zavrseno }))
    );
  }
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
    program_statuses?: ClientProgramStatus[];
    programi?: ClientProgramSelection[];
  }
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!payload.kontakt_telefon?.trim()) {
    return { error: 'Kontakt telefon je obavezan.' };
  }
  const { program_statuses, programi, ...rest } = payload;
  const row = { ...rest, pol: normalizeClientPol(rest.pol) };
  const { error } = await admin.from('clients').update(row).eq('id', clientId);
  if (error) return { error: error.message };
  if (program_statuses) await saveClientTermTypeStatuses(admin, clientId, program_statuses);
  if (programi) await saveClientProgrami(admin, clientId, programi);
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
  program_statuses?: ClientProgramStatus[];
  programi?: ClientProgramSelection[];
  instructorId?: string | null;
}): Promise<{ error?: string; clientId?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!payload.kontakt_telefon?.trim()) return { error: 'Kontakt telefon je obavezan.' };

  const { instructorId, program_statuses, programi, ...rest } = payload;
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

  if (program_statuses && program_statuses.length > 0) {
    await saveClientTermTypeStatuses(admin, newClient.id, program_statuses);
  }
  if (programi && programi.length > 0) {
    await saveClientProgrami(admin, newClient.id, programi);
  }

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

/**
 * Stanje po vrstama za više klijenata odjednom (3 round-trip-a umesto 3*N). Vraća Map<clientId, stanje[]>.
 * Ako je instructorId dat, uplate i održana predavanja se filtriraju samo za tog predavača
 * (isto ponašanje kao getStanjePoVrstamaZaKlijenta po jednom klijentu).
 */
export async function getStanjePoVrstamaZaKlijenteBatch(
  clientIds: string[],
  instructorId?: string
): Promise<Map<string, StanjeVrstaRow[]>> {
  const out = new Map<string, StanjeVrstaRow[]>();
  if (clientIds.length === 0) return out;

  const admin = createAdminClient();
  const ids = [...new Set(clientIds)];

  let uplateQuery = admin.from('uplate').select('client_id, term_type_id, broj_casova').in('client_id', ids);
  if (instructorId) uplateQuery = uplateQuery.eq('instructor_id', instructorId);

  const [uplateRes, predavanjaRes, termTypesRes] = await Promise.all([
    uplateQuery,
    admin.from('predavanja').select('client_id, term_type_id, odrzano, term:terms(instructor_id, category:term_categories(is_nastavak))').in('client_id', ids).eq('odrzano', true),
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
    if (instructorId && (term as { instructor_id?: string } | null)?.instructor_id !== instructorId) continue;
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
  const [{ data: predavanja }, { data: termTypes }] = await Promise.all([
    admin
      .from('predavanja')
      .select('term_type_id, term:terms!inner(instructor_id)')
      .eq('odrzano', true)
      .eq('term.instructor_id', instructorId),
    admin.from('term_types').select('id, naziv').order('naziv'),
  ]);
  const countByType = new Map<string, number>();
  for (const p of predavanja ?? []) {
    const tid = p.term_type_id ?? '__bez_vrste__';
    countByType.set(tid, (countByType.get(tid) ?? 0) + 1);
  }
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

/** Dodaje više potencijalnih klijenata odjednom (npr. braća/sestre) na već kreiran termin testiranja,
 * u jednom upitu – koristi se pri kreiranju termina umesto naknadnog dodavanja jedan-po-jedan. */
export async function addPotentialClientsAsAdmin(
  termId: string,
  list: { ime: string; prezime: string | null; ime_roditelja: string | null; mobilni_roditelja: string | null; razred: string | null }[]
): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (list.length === 0) return {};
  const { error } = await admin.from('potential_clients').insert(list.map((p) => ({ term_id: termId, ...p })));
  if (error) return { error: error.message };
  revalidatePath(`/admin/termin/${termId}`);
  return {};
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

export async function deleteOtkazaniTermin(id: string, clientId?: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { error } = await admin.from('otkazani_termini').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  if (clientId) revalidatePath(`/admin/klijenti/${clientId}`);
  return {};
}
