'use server';

import { buildStanjeFromMaps, type StanjeVrstaRow } from '@/lib/stanje';
import { getStanjePlacanja } from '@/lib/stanje-svih';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TermCategoryRow } from '@/lib/term-categories';
import { SEEDED_TERM_CATEGORY_INDIVIDUAL_ID, SEEDED_TERM_CATEGORY_GRUPNI_ID } from '@/lib/term-categories';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { INSTRUCTOR_COLORS, isTermInPast, slotsNeeded, AUTO_SPILLOVER_NAPOMENA, TIME_SLOTS, NASTAVAK_ZAUZET_PORUKA } from '@/lib/constants';
import { termMozeNovoPredavanje } from '@/lib/settings';
import { normalizeClientPol } from '@/lib/client-pol';
import { logActivity, type Actor } from '@/lib/audit';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { requireSchedulingAccess } from '@/lib/scheduling-access';
import { deletePaymentStarts } from '@/lib/payment-starts';
import { beogradIso, danasBeograd, datumBeograd, jeIsoDatum } from '@/lib/datum';
import { danUNedelji, mapBlokada, sacuvajNedeljneBlokade, upisiBlokade } from '@/lib/blokade';
import {
  deteImaZahtev,
  instruktorSlobodanZaNastavak,
  proveriMestoZahteva,
  rezervisaneUcionice,
  trajanjeVrste,
  ucionicaRezervisana,
} from '@/lib/zauzetost-zahteva';
import { ocistiNapomenu, dodajNapomenuTerminu, spojiNapomene } from '@/lib/napomena-termina';

export async function createInstructorAsAdmin(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const { supabase, user } = await getAuthedUser();
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

/** Vraća ID-eve predavača i učionica koji su već zauzeti u datom slotu (date + slot_index), da li je
 * ceo slot blokiran za sve (blocked = null ako nije; napomena može biti prazna i kad jeste) i koji su
 * instruktori blokirani samo za sebe u tom slotu (ne mogu se izabrati). */
export async function getTakenForSlot(
  date: string,
  slotIndex: number
): Promise<{
  takenInstructorIds: string[];
  takenClassroomIds: string[];
  blocked: { napomena: string | null } | null;
  blockedInstructorIds: string[];
}> {
  const slot = Math.min(15, Math.max(0, slotIndex));
  const dateStr = date.slice(0, 10);
  const admin = createAdminClient();
  const [{ data: terms }, { data: blockRows }, { data: nedeljneRows }, rezervisane] = await Promise.all([
    admin.from('terms').select('instructor_id, classroom_id').eq('date', dateStr).eq('slot_index', slot),
    // select('*') – radi i pre migracije 048 (tada nema instructor_id = sve blokade su "za sve").
    admin.from('blokirani_termini').select('*').eq('date', dateStr).eq('slot_index', slot),
    // Stalne nedeljne blokade (048); pre migracije upit vraća grešku → data null → nema ih.
    admin.from('instruktor_nedeljne_blokade').select('instructor_id').eq('dan', danUNedelji(dateStr)).eq('slot_index', slot),
    // Učionice časova bez instruktora (i nastavaka dužih) u ovom vremenu su zauzete.
    rezervisaneUcionice(admin, dateStr, slot),
  ]);
  const blokade = (blockRows ?? []).map(mapBlokada);
  const block = blokade.find((b) => b.instructor_id === null) ?? null;
  const blockedInstructorIds = [
    ...new Set([
      ...blokade.filter((b) => b.instructor_id !== null).map((b) => b.instructor_id as string),
      ...(nedeljneRows ?? []).map((r) => r.instructor_id as string),
    ]),
  ];
  const takenInstructorIds = [...new Set((terms ?? []).map((t) => t.instructor_id).filter(Boolean))] as string[];
  const takenClassroomIds = [
    ...new Set([...(terms ?? []).map((t) => t.classroom_id).filter((id): id is string => id != null), ...rezervisane]),
  ];
  return { takenInstructorIds, takenClassroomIds, blocked: block ? { napomena: block.napomena ?? null } : null, blockedInstructorIds };
}

/** Pravila za slot (datum + vreme): max N termina (iz podešavanja); svaki termin ima JEDINSTVENOG predavača i JEDINSTVENU učionicu u tom slotu. */
export async function createTermAsAdmin(
  instructorId: string,
  date: string,
  slotIndex: number,
  classroomId: string | null,
  termCategoryId: string,
  napomena: string | null = null,
  nastavakOfTermId: string | null = null,
  bookingId: string | null = null,
  /** Izuzetak „dupliranje predavača“ (migracija 062): sme još jedan čas istog predavača u ovom bloku. */
  dozvoliPreklapanje = false
): Promise<{ termId?: string; instructorId?: string; error?: string }> {
  const { admin: adminSupabase, error: authErr, actor } = await requireSchedulingAccess();
  if (authErr || !adminSupabase) return { error: authErr ?? 'Niste ovlašćeni.' };

  const slot = Math.min(15, Math.max(0, slotIndex));
  const dateStr = date.slice(0, 10);
  if (bookingId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) return { error: 'Neispravan zahtev za zakazivanje.' };
    const { data: saved } = await adminSupabase.from('terms').select('id, instructor_id, date, slot_index').eq('id', bookingId).maybeSingle();
    if (saved) {
      if (saved.instructor_id !== instructorId || saved.date !== dateStr || saved.slot_index !== slot) return { error: 'Ovo zakazivanje je već sačuvano u drugom vremenu.' };
      return { termId: saved.id, instructorId };
    }
  }

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
    .limit(1);
  if (!dozvoliPreklapanje && (existingSameInstructor ?? []).length > 0) {
    return {
      error:
        'Ovaj instruktor već ima termin u ovom slotu. Dodajte radionicu u taj postojeći termin, ili čekirajte „Izuzetak: dupliranje predavača“.',
    };
  }
  if (classroomId) {
    // Izuzetak sme da deli učionicu samo sa časom (ili nastavkom) istog predavača.
    const { data: uUcionici } = await adminSupabase
      .from('terms')
      .select('id, instructor_id')
      .eq('date', dateStr)
      .eq('slot_index', slot)
      .eq('classroom_id', classroomId);
    const zauzima = (uUcionici ?? []).filter((t) => !dozvoliPreklapanje || t.instructor_id !== instructorId);
    if (zauzima.length > 0) {
      return { error: 'Ova učionica je već zauzeta u ovom slotu. Zamena mesta je moguća samo kod izmene postojećeg termina, ne pri kreiranju novog.' };
    }
    const rezervisana = await ucionicaRezervisana(adminSupabase, dateStr, slot, classroomId);
    if (rezervisana) return { error: rezervisana };
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
      ...(bookingId ? { id: bookingId } : {}),
      instructor_id: instructorId,
      date: dateStr,
      slot_index: slot,
      classroom_id: classroomId,
      term_category_id: termCategoryId.trim(),
      napomena: napomena?.trim() || null,
      nastavak_of_term_id: nastavakOfTermId ?? null,
      ...(dozvoliPreklapanje ? { dozvoli_preklapanje: true } : {}),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23P01') return { error: 'Ovaj instruktor već ima termin u ovom slotu.' };
    if (dozvoliPreklapanje && /dozvoli_preklapanje/i.test(error.message)) {
      return { error: 'Prvo pokrenite migraciju 062_izuzetak_dupliranje_predavaca.sql u Supabase SQL Editoru.' };
    }
    return { error: error.message };
  }
  if (!inserted) return { error: 'Termin nije kreiran.' };
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard');
  logActivity(
    actor,
    'term.create',
    `Kreiran termin ${dateStr} ${TIME_SLOTS[slot] ?? `slot ${slot}`}.`,
    { entityType: 'term', entityId: inserted.id, metadata: { instructorId, classroomId, termCategoryId, dateStr, slot } }
  );
  return { termId: inserted.id, instructorId };
}

/** Cela forma se čuva jednim pozivom; ponovljeni klik nastavlja isti termin umesto novog. */
export async function bookTermWithLessons(payload: {
  bookingId: string;
  instructorId: string;
  date: string;
  slotIndex: number;
  classroomId: string | null;
  termCategoryId: string;
  napomena: string | null;
  nastavakOfTermId: string | null;
  clientIds: string[];
  termTypeId: string | null;
  potentialClients: { ime: string; prezime: string | null; ime_roditelja: string | null; mobilni_roditelja: string | null; razred: string | null }[];
  repeatDays: number;
  /** Izuzetak „dupliranje predavača“ (062). */
  dozvoliPreklapanje?: boolean;
}): Promise<{ termId?: string; error?: string; failed?: { date: string; error: string }[] }> {
  const { admin, error } = await requireSchedulingAccess();
  if (error || !admin) return { error: error ?? 'Niste ovlašćeni.' };
  if (!jeIsoDatum(payload.date) || !Number.isInteger(payload.slotIndex) || payload.slotIndex < 0 || payload.slotIndex >= TIME_SLOTS.length) return { error: 'Neispravan datum ili vreme.' };
  const { data: category, error: categoryError } = await admin.from('term_categories').select('is_testing, is_nastavak, jedan_klijent_po_terminu').eq('id', payload.termCategoryId).maybeSingle();
  if (categoryError || !category) return { error: 'Kategorija termina nije pronađena.' };
  const clientIds = [...new Set(payload.clientIds.filter(Boolean))];
  if (!category.is_testing && clientIds.length === 0) return { error: 'Izaberite bar jedno dete.' };
  if (!category.is_testing && category.jedan_klijent_po_terminu && clientIds.length > 1) return { error: 'Ovaj termin dozvoljava samo jedno dete.' };
  const result = await createTermAsAdmin(
    payload.instructorId,
    payload.date,
    payload.slotIndex,
    payload.classroomId,
    payload.termCategoryId,
    payload.napomena,
    payload.nastavakOfTermId,
    payload.bookingId,
    payload.dozvoliPreklapanje === true
  );
  if (result.error || !result.termId) return result;
  const termId = result.termId;
  if (category.is_testing) {
    const { count } = await admin.from('potential_clients').select('id', { count: 'exact', head: true }).eq('term_id', termId);
    if (!count && payload.potentialClients.length > 0) {
      const added = await addPotentialClientsAsAdmin(termId, payload.potentialClients);
      if (added.error) return { termId, error: added.error };
    }
  } else {
    const { data: existing } = await admin.from('predavanja').select('client_id').eq('term_id', termId);
    const booked = new Set((existing ?? []).map((p) => p.client_id));
    for (const clientId of clientIds) {
      if (booked.has(clientId)) continue;
      const added = await createPredavanjeAsAdmin(termId, clientId, false, false, null, payload.termTypeId);
      if (added.error) return { termId, error: added.error };
    }
  }
  const days = !category.is_testing && !category.is_nastavak ? Math.min(60, Math.max(0, Math.floor(payload.repeatDays || 0))) : 0;
  const repeated = days ? await repeatTermAsAdmin(payload.instructorId, payload.date, payload.slotIndex, payload.classroomId, payload.termCategoryId, payload.napomena, clientIds, payload.termTypeId, days) : { failed: [] };
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard');
  return { termId, failed: repeated.failed };
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
  const { error: authErr } = await requireSchedulingAccess();
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
  slots: { date: string; slotIndex: number }[],
  classroomId: string | null = null,
  /** Napomena za sve ove časove – na kalendaru se vidi tek u oblačiću (prelaz mišem). */
  napomena: string | null = null
): Promise<{ failed: { date: string; slotIndex: number; error: string }[] }> {
  const cistaNapomena = ocistiNapomenu(napomena);
  const { admin, error: authErr, actor } = await requireSchedulingAccess();
  if (authErr || !admin) return { failed: slots.map((s) => ({ ...s, error: authErr ?? 'Niste ovlašćeni.' })) };
  if (slots.length === 0) return { failed: [] };

  const { data: existing } = await admin
    .from('zahtevi_za_cas')
    .select('requested_date, requested_slot_index')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .in('requested_date', [...new Set(slots.map((s) => s.date))]);
  const existingKeys = new Set((existing ?? []).map((r) => `${r.requested_date}|${r.requested_slot_index}`));

  const kandidati = slots.filter((s) => !existingKeys.has(`${s.date}|${s.slotIndex}`));
  const skipped = slots
    .filter((s) => existingKeys.has(`${s.date}|${s.slotIndex}`))
    .map((s) => ({ ...s, error: 'Zahtev za ovo dete već postoji za taj termin.' }));

  // Celo trajanje časa (i nastavak dužeg): dete i učionica moraju biti slobodni, vreme ne sme biti blokirano.
  const provere = await Promise.all(
    kandidati.map(async (s) => ({
      s,
      greska: await proveriMestoZahteva(
        admin,
        { clientId, classroomId, termTypeId, datum: s.date.slice(0, 10), slot: s.slotIndex, seli: true },
        {}
      ),
    }))
  );
  const slotova = slotsNeeded(await trajanjeVrste(admin, termTypeId));
  const toInsert: typeof slots = [];
  for (const { s, greska } of provere.sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.slotIndex - b.s.slotIndex)) {
    if (greska) {
      skipped.push({ ...s, error: greska });
      continue;
    }
    // Dva izabrana vremena jedno do drugog za duži čas bi se preklopila – drugo se preskače.
    const preklapa = toInsert.some((x) => x.date === s.date && s.slotIndex - x.slotIndex < slotova && s.slotIndex >= x.slotIndex);
    if (preklapa) {
      skipped.push({ ...s, error: 'preklapa se sa prethodnim (dužim) časom istog deteta.' });
      continue;
    }
    toInsert.push(s);
  }

  if (toInsert.length === 0) return { failed: skipped };

  const redovi = toInsert.map((s) => ({
    client_id: clientId,
    instructor_id: null,
    classroom_id: classroomId,
    requested_date: s.date,
    requested_slot_index: s.slotIndex,
    term_type_id: termTypeId,
    status: 'pending',
    ...(cistaNapomena ? { napomena: cistaNapomena } : {}),
  }));
  let { error } = await admin.from('zahtevi_za_cas').insert(redovi);
  // Pre migracije 060 (nema kolone napomena) – zakaži bez napomene.
  if (error && cistaNapomena && /napomena/i.test(error.message)) {
    ({ error } = await admin.from('zahtevi_za_cas').insert(redovi.map((r) => ({ ...r, napomena: undefined }))));
  }
  if (error) {
    return { failed: [...skipped, ...toInsert.map((s) => ({ ...s, error: error.message }))] };
  }
  revalidatePath('/dashboard/zahtevi');
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard');
  if (actor) {
    logActivity(
      actor,
      'zahtev.bulk_create',
      `Kreirano ${toInsert.length} zahtev(a) za čas (bez instruktora) za dete.`,
      { entityType: 'client', entityId: clientId, metadata: { slots: toInsert, termTypeId, classroomId } }
    );
  }
  return { failed: skipped };
}

/**
 * "Zakaži više časova" SA izabranim instruktorom (i opciono učionicom) – umesto zahteva koje bilo
 * koji predavač preuzima (createBulkZahteviAsAdmin), odmah kreira prave termine: za svaki izabrani
 * slot pronalazi POSTOJEĆI termin tog instruktora u tom datumu/slotu (ako ga ima) ili pravi nov, pa
 * dodaje radionicu za dete – isti instruktor/učionica/vrsta časa za sve slotove odjednom.
 */
export async function createBulkTermsAsAdmin(
  clientIds: string[],
  instructorId: string,
  classroomId: string | null,
  termTypeId: string | null,
  slots: { date: string; slotIndex: number }[],
  /** Kategorija termina za NOVE termine – grupna kategorija ako ima više od jednog deteta, inače individualna. */
  termCategoryId: string | null = null,
  /** Napomena za sve ove časove (napomena termina) – na kalendaru se vidi tek u oblačiću. */
  napomena: string | null = null
): Promise<{ failed: { date: string; slotIndex: number; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { failed: slots.map((s) => ({ ...s, error: authErr ?? 'Niste ovlašćeni.' })) };
  if (slots.length === 0 || clientIds.length === 0) return { failed: [] };
  const effectiveCategoryId =
    termCategoryId || (clientIds.length > 1 ? SEEDED_TERM_CATEGORY_GRUPNI_ID : SEEDED_TERM_CATEGORY_INDIVIDUAL_ID);
  const slotovaVrste = slotsNeeded(await trajanjeVrste(admin, termTypeId));

  const results = await Promise.all(
    slots.map(async (s) => {
      const slot = Math.min(15, Math.max(0, s.slotIndex));
      const dateStr = s.date.slice(0, 10);

      // Običan termin predavača u tom bloku; termin-izuzetak (dupliranje predavača, 062) se preskače.
      const { data: existingSvi } = await admin
        .from('terms')
        .select('*')
        .eq('instructor_id', instructorId)
        .eq('date', dateStr)
        .eq('slot_index', slot)
        .limit(5);
      const existing = ((existingSvi ?? []) as { id: string; classroom_id: string | null; napomena: string | null; dozvoli_preklapanje?: boolean }[]).find(
        (t) => !t.dozvoli_preklapanje
      ) ?? null;
      // Automatski nastavak tuđeg dužeg časa nije mesto za drugo dete (posle bi se obrisao sa njim).
      if (existing?.napomena === AUTO_SPILLOVER_NAPOMENA) return { ...s, error: NASTAVAK_ZAUZET_PORUKA };

      // Duži čas: instruktor mora biti slobodan i u sledećem vremenu (pre nego što se napravi prazan termin).
      const nastavakGreska = await instruktorSlobodanZaNastavak(admin, instructorId, dateStr, slot, slotovaVrste, existing ? [existing.id] : []);
      if (nastavakGreska) return { ...s, error: nastavakGreska };
      const ucionicaRez = classroomId ? await ucionicaRezervisana(admin, dateStr, slot, classroomId) : null;

      let termId: string;
      if (existing) {
        termId = existing.id;
        await dodajNapomenuTerminu(admin, termId, napomena);
        if (classroomId && !existing.classroom_id && !ucionicaRez) {
          const { data: roomConflict } = await admin
            .from('terms')
            .select('id')
            .eq('classroom_id', classroomId)
            .eq('date', dateStr)
            .eq('slot_index', slot)
            .neq('id', termId)
            .maybeSingle();
          if (!roomConflict) {
            await admin.from('terms').update({ classroom_id: classroomId }).eq('id', termId);
          }
        }
      } else {
        if (classroomId) {
          const { data: roomConflict } = await admin
            .from('terms')
            .select('id')
            .eq('classroom_id', classroomId)
            .eq('date', dateStr)
            .eq('slot_index', slot)
            .maybeSingle();
          if (roomConflict) return { ...s, error: 'Učionica je već zauzeta u tom terminu.' };
          if (ucionicaRez) return { ...s, error: ucionicaRez };
        }
        const { data: inserted, error: insErr } = await admin
          .from('terms')
          .insert({
            instructor_id: instructorId,
            date: dateStr,
            slot_index: slot,
            classroom_id: classroomId,
            term_category_id: effectiveCategoryId,
            napomena: ocistiNapomenu(napomena),
          })
          .select('id')
          .single();
        if (insErr || !inserted) return { ...s, error: insErr?.message ?? 'Termin nije kreiran.' };
        termId = inserted.id;
      }

      const clientErrors: string[] = [];
      for (const clientId of clientIds) {
        const predRes = await createPredavanjeAsAdmin(termId, clientId, false, false, null, termTypeId);
        if (predRes.error) clientErrors.push(predRes.error);
      }
      if (clientErrors.length > 0) return { ...s, error: [...new Set(clientErrors)].join(' ') };
      return { ...s, error: null as string | null };
    })
  );
  const failed = results.filter((r): r is { date: string; slotIndex: number; error: string } => r.error !== null);
  if (failed.length < slots.length) revalidatePath('/admin/kalendar');
  if (actor) {
    logActivity(
      actor,
      'term.bulk_create',
      `Zakazano ${slots.length - failed.length}/${slots.length} termin(a) za ${clientIds.length > 1 ? `grupu od ${clientIds.length} dece` : '1 dete'}.`,
      { entityType: 'instructor', entityId: instructorId, metadata: { clientIds, classroomId, termTypeId, slots } }
    );
  }
  return { failed };
}

/**
 * "Dodeli instruktora" mod na kalendaru: selektuje se više PostOJEĆIH termina, pa se svima
 * odjednom dodeli isti instruktor. Termin koji ovaj instruktor već ima u tom datumu/slotu se
 * preskače (javlja se kao greška za taj termin) – bez svop logike, ovo je za popunjavanje/izmenu,
 * ne za zamenu mesta (za to postoji Swap).
 */
export async function assignInstructorToTermsAsAdmin(
  instructorId: string,
  termIds: string[],
  /** Izuzetak „dupliranje predavača“ (062): sme i kad instruktor u tom bloku već ima čas. */
  dozvoliPreklapanje = false
): Promise<{ failed: { termId: string; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { failed: termIds.map((termId) => ({ termId, error: authErr ?? 'Niste ovlašćeni.' })) };

  const results = await Promise.all(
    termIds.map(async (termId) => {
      const { data: term } = await admin.from('terms').select('date, slot_index, instructor_id').eq('id', termId).maybeSingle();
      if (!term) return { termId, error: 'Termin nije pronađen.' };
      if (term.instructor_id === instructorId && !dozvoliPreklapanje) return { termId, error: null as string | null };
      if (!dozvoliPreklapanje) {
        const { data: conflict } = await admin
          .from('terms')
          .select('id')
          .eq('instructor_id', instructorId)
          .eq('date', term.date)
          .eq('slot_index', term.slot_index)
          .neq('id', termId)
          .limit(1);
        if ((conflict ?? []).length > 0) {
          return { termId, error: 'Instruktor je već zauzet u tom terminu (za dva časa u istom bloku čekirajte „Izuzetak: dupliranje predavača“).' };
        }
        const nastavakGreska = await instruktorSlobodanZaNastavak(
          admin,
          instructorId,
          String(term.date).slice(0, 10),
          term.slot_index,
          await slotovaTermina(admin, termId),
          [termId]
        );
        if (nastavakGreska) return { termId, error: nastavakGreska };
      }
      const izmena = { instructor_id: instructorId, ...(dozvoliPreklapanje ? { dozvoli_preklapanje: true } : {}) };
      const { error } = await admin.from('terms').update(izmena).eq('id', termId);
      if (error) {
        if (error.code === '23P01') return { termId, error: 'Instruktor je već zauzet u tom terminu.' };
        if (dozvoliPreklapanje && /dozvoli_preklapanje/i.test(error.message)) {
          return { termId, error: 'Prvo pokrenite migraciju 062_izuzetak_dupliranje_predavaca.sql u Supabase SQL Editoru.' };
        }
        return { termId, error: error.message };
      }
      // Automatski "blokirajući" slotovi dužeg časa prate instruktora (i izuzetak) roditeljskog termina.
      await admin.from('terms').update(izmena).eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      if (dozvoliPreklapanje) await syncSpilloverForTerm(admin, termId);
      return { termId, error: null as string | null };
    })
  );
  revalidatePath('/admin/kalendar');
  const failed = results.filter((r): r is { termId: string; error: string } => r.error !== null);
  if (actor && termIds.length > failed.length) {
    logActivity(
      actor,
      'term.assign_instructor',
      `Dodeljen instruktor na ${termIds.length - failed.length}/${termIds.length} termin(a).`,
      { entityType: 'instructor', entityId: instructorId, metadata: { termIds } }
    );
  }
  return { failed };
}

/** "Dodeli učionicu" mod – isto kao gore, za učionicu umesto instruktora. */
export async function assignClassroomToTermsAsAdmin(
  classroomId: string,
  termIds: string[]
): Promise<{ failed: { termId: string; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
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
      const rez = await ucionicaRezervisana(admin, String(term.date).slice(0, 10), term.slot_index, classroomId);
      if (rez) return { termId, error: rez };
      const { error } = await admin.from('terms').update({ classroom_id: classroomId }).eq('id', termId);
      if (error) return { termId, error: error.message };
      await admin.from('terms').update({ classroom_id: classroomId }).eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      return { termId, error: null as string | null };
    })
  );
  revalidatePath('/admin/kalendar');
  const failed = results.filter((r): r is { termId: string; error: string } => r.error !== null);
  if (actor && termIds.length > failed.length) {
    logActivity(
      actor,
      'term.assign_classroom',
      `Dodeljena učionica na ${termIds.length - failed.length}/${termIds.length} termin(a).`,
      { entityType: 'classroom', entityId: classroomId, metadata: { termIds } }
    );
  }
  return { failed };
}

/**
 * "Dodeli instruktora" primenjen na zahtev (a ne na postojeći termin) – ovo je zapravo isto što i
 * predavačevo potvrdiZahtev, samo pokreće admin i BIRA kog instruktora, umesto da instruktor
 * potvrđuje svoj sopstveni zahtev. Pretvara zahtev u pravi termin+radionicu (bez učionice – to se
 * dodeljuje posebno, "Dodeli učionicu").
 */
export async function assignInstructorToZahtevAsAdmin(
  zahtevId: string,
  instructorId: string,
  /** Izuzetak „dupliranje predavača“ (062): nov, zaseban termin i kad instruktor u tom bloku već ima čas. */
  dozvoliPreklapanje = false
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: zahtev } = await admin.from('zahtevi_za_cas').select('*').eq('id', zahtevId).single();
  if (!zahtev) return { error: 'Zahtev nije pronađen.' };
  if (zahtev.status !== 'pending') return { error: 'Zahtev nije na čekanju.' };

  const dateStr = String(zahtev.requested_date).slice(0, 10);
  const slot = Math.min(15, Math.max(0, zahtev.requested_slot_index));

  let termId: string;
  // Običan termin predavača u tom bloku; termin-izuzetak (dupliranje predavača, 062) se preskače.
  const { data: existingSvi } = await admin
    .from('terms')
    .select('*')
    .eq('instructor_id', instructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .limit(5);
  const existing = ((existingSvi ?? []) as { id: string; classroom_id: string | null; napomena: string | null; dozvoli_preklapanje?: boolean }[]).find(
    (t) => !t.dozvoli_preklapanje
  ) ?? null;
  // Automatski nastavak tuđeg dužeg časa nije mesto za drugo dete (posle bi se obrisao sa njim).
  if (!dozvoliPreklapanje && existing?.napomena === AUTO_SPILLOVER_NAPOMENA) {
    return { error: `${NASTAVAK_ZAUZET_PORUKA} (Ili čekirajte „Izuzetak: dupliranje predavača“.)` };
  }
  // Duži čas bez instruktora zauzima i sledeće vreme – instruktor tada mora biti slobodan, inače bi
  // nastavak nestao a čas se preklopio sa drugim. Izuzetak sme da se preklopi.
  const nastavakGreska = dozvoliPreklapanje
    ? null
    : await instruktorSlobodanZaNastavak(
        admin,
        instructorId,
        dateStr,
        slot,
        slotsNeeded(await trajanjeVrste(admin, zahtev.term_type_id)),
        existing ? [existing.id] : []
      );
  if (nastavakGreska) return { error: nastavakGreska };
  if (existing && !dozvoliPreklapanje) {
    termId = existing.id;
  } else {
    // Izuzetak: uvek zaseban termin (pored časa ili nastavka koji instruktor već ima u tom bloku).
    const { data: inserted, error: insErr } = await admin
      .from('terms')
      .insert({
        instructor_id: instructorId,
        date: dateStr,
        slot_index: slot,
        term_category_id: SEEDED_TERM_CATEGORY_INDIVIDUAL_ID,
        ...(dozvoliPreklapanje ? { dozvoli_preklapanje: true } : {}),
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      if (insErr?.code === '23P01') return { error: 'Instruktor je već zauzet u tom terminu.' };
      if (dozvoliPreklapanje && insErr && /dozvoli_preklapanje/i.test(insErr.message)) {
        return { error: 'Prvo pokrenite migraciju 062_izuzetak_dupliranje_predavaca.sql u Supabase SQL Editoru.' };
      }
      return { error: insErr?.message ?? 'Termin nije kreiran.' };
    }
    termId = inserted.id;
  }

  // Ako je zahtev unapred dobio učionicu (bilo kojim redosledom, pre ili posle instruktora) i termin
  // je nema, pokušaj da je prenese – tiho preskoči ako je u međuvremenu zauzeta (ne blokira potvrdu).
  if (zahtev.classroom_id) {
    const { data: termNow } = await admin.from('terms').select('classroom_id').eq('id', termId).single();
    if (termNow && !termNow.classroom_id) {
      const { data: uSobi } = await admin
        .from('terms')
        .select('id, instructor_id')
        .eq('classroom_id', zahtev.classroom_id)
        .eq('date', dateStr)
        .eq('slot_index', slot)
        .neq('id', termId);
      // Izuzetak sme da deli učionicu samo sa časom istog instruktora.
      const zauzeta = (uSobi ?? []).some((t) => !dozvoliPreklapanje || t.instructor_id !== instructorId);
      if (!zauzeta) {
        await admin.from('terms').update({ classroom_id: zahtev.classroom_id }).eq('id', termId);
      }
    }
  }

  // Napomena časa bez instruktora prelazi na termin (migracija 060).
  await dodajNapomenuTerminu(admin, termId, (zahtev as { napomena?: string | null }).napomena);

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
  if (actor) {
    logActivity(
      actor,
      'zahtev.assign_instructor',
      `Dodeljen instruktor zahtevu za ${dateStr} ${TIME_SLOTS[slot] ?? `slot ${slot}`} – potvrđen kao termin.`,
      { entityType: 'zahtev', entityId: zahtevId, metadata: { instructorId, termId, dateStr, slot } }
    );
  }
  return {};
}

/** Batch verzija gornje – jedan poziv serveru za sve selektovane zahteve. */
export async function assignInstructorToZahteviAsAdmin(
  instructorId: string,
  zahtevIds: string[],
  dozvoliPreklapanje = false
): Promise<{ failed: { zahtevId: string; error: string }[] }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { failed: zahtevIds.map((zahtevId) => ({ zahtevId, error: authErr ?? 'Niste ovlašćeni.' })) };

  // Redom po vremenu, ne istovremeno: raniji duži čas prvo zauzme svoj nastavak, pa sledeći čas istog
  // instruktora dobije jasnu poruku umesto da se tiho preklope (ili da se jedan izgubi).
  const { data: redosled } = await admin
    .from('zahtevi_za_cas')
    .select('id, requested_date, requested_slot_index')
    .in('id', zahtevIds);
  const poVremenu = [...(redosled ?? [])]
    .sort((a, b) => String(a.requested_date).localeCompare(String(b.requested_date)) || (a.requested_slot_index as number) - (b.requested_slot_index as number))
    .map((z) => z.id as string);
  const ids = [...poVremenu, ...zahtevIds.filter((id) => !poVremenu.includes(id))];
  const failed: { zahtevId: string; error: string }[] = [];
  for (const zahtevId of ids) {
    const res = await assignInstructorToZahtevAsAdmin(zahtevId, instructorId, dozvoliPreklapanje);
    if (res.error) failed.push({ zahtevId, error: res.error });
  }
  return { failed };
}

/**
 * Dodeljuje učionicu zahtevu – nezavisno od redosleda, može i pre nego što zahtev dobije
 * instruktora. Ako zahtev već ima kreiran termin (već potvrđen), učionica se odmah prenosi tamo;
 * inače se samo pamti na zahtevu i prenosi kasnije kad se zahtev potvrdi (bilo kojim putem).
 */
export async function assignClassroomToZahtevAsAdmin(zahtevId: string, classroomId: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: zahtev } = await admin
    .from('zahtevi_za_cas')
    .select('status, requested_date, requested_slot_index, created_term_id, term_type_id')
    .eq('id', zahtevId)
    .single();
  if (!zahtev) return { error: 'Zahtev nije pronađen.' };

  const dateStr = String(zahtev.requested_date).slice(0, 10);
  const slot = Math.min(15, Math.max(0, zahtev.requested_slot_index));
  // Čas na čekanju drži učionicu celo svoje trajanje (i nastavak dužeg časa).
  const slotova = zahtev.status === 'pending' ? slotsNeeded(await trajanjeVrste(admin, zahtev.term_type_id)) : 1;
  for (let i = 0; i < slotova && slot + i <= 15; i++) {
    const { data: uSobi } = await admin.from('terms').select('id, nastavak_of_term_id').eq('classroom_id', classroomId).eq('date', dateStr).eq('slot_index', slot + i);
    const svoj = zahtev.created_term_id as string | null;
    const drugi = (uSobi ?? []).filter((t) => !svoj || (t.id !== svoj && t.nastavak_of_term_id !== svoj));
    if (drugi.length > 0) {
      return { error: i === 0 ? 'Učionica je već zauzeta u tom terminu.' : `Čas traje duže, a učionica je zauzeta u ${TIME_SLOTS[slot + i]}.` };
    }
    if (zahtev.status === 'pending') {
      const rez = await ucionicaRezervisana(admin, dateStr, slot + i, classroomId, [zahtevId]);
      if (rez) return { error: rez };
    }
  }

  const { error } = await admin.from('zahtevi_za_cas').update({ classroom_id: classroomId }).eq('id', zahtevId);
  if (error) return { error: error.message };

  if (zahtev.created_term_id) {
    await admin.from('terms').update({ classroom_id: classroomId }).eq('id', zahtev.created_term_id);
  }

  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  if (actor) {
    logActivity(actor, 'zahtev.assign_classroom', `Dodeljena učionica zahtevu za ${dateStr} ${TIME_SLOTS[slot] ?? `slot ${slot}`}.`, {
      entityType: 'zahtev',
      entityId: zahtevId,
      metadata: { classroomId },
    });
  }
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

/**
 * "Dodeli vrstu časa" mod – isto kao instruktor/učionica gore, samo menja term_type_id na SVIM
 * radionicama (predavanja) unutar svakog izabranog termina odjednom (bez provere konflikta – vrsta
 * časa se ne "zauzima").
 */
export async function assignTermTypeToTermsAsAdmin(
  termTypeId: string | null,
  termIds: string[]
): Promise<{ failed: { termId: string; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { failed: termIds.map((termId) => ({ termId, error: authErr ?? 'Niste ovlašćeni.' })) };
  if (termIds.length === 0) return { failed: [] };

  // Duža vrsta zauzima i sledeće vreme – termin čiji instruktor tada nije slobodan se ne menja.
  const failed: { termId: string; error: string }[] = [];
  const slotova = slotsNeeded(await trajanjeVrste(admin, termTypeId));
  let zaIzmenu = termIds;
  if (slotova > 1) {
    const { data: termini } = await admin.from('terms').select('id, instructor_id, date, slot_index').in('id', termIds);
    const provere = await Promise.all(
      (termini ?? []).map(async (t) => ({
        termId: t.id as string,
        error: await instruktorSlobodanZaNastavak(admin, t.instructor_id as string, String(t.date).slice(0, 10), t.slot_index as number, slotova, [t.id as string]),
      }))
    );
    for (const p of provere) if (p.error) failed.push({ termId: p.termId, error: p.error });
    zaIzmenu = termIds.filter((id) => !failed.some((f) => f.termId === id));
  }
  if (zaIzmenu.length === 0) return { failed };

  const { error } = await admin.from('predavanja').update({ term_type_id: termTypeId }).in('term_id', zaIzmenu);
  if (error) return { failed: termIds.map((termId) => ({ termId, error: error.message })) };
  // Nova vrsta časa može imati drugo trajanje – uskladi "blokirajuće" slotove dužeg časa za svaki termin.
  await Promise.all(zaIzmenu.map((termId) => syncSpilloverForTerm(admin, termId)));
  revalidatePath('/admin/kalendar');
  if (actor) {
    logActivity(actor, 'term.assign_term_type', `Promenjena vrsta časa na ${zaIzmenu.length} termin(a).`, {
      entityType: 'term_type',
      entityId: termTypeId,
      metadata: { termIds: zaIzmenu },
    });
  }
  return { failed };
}

/** Batch verzija za zahteve – menja term_type_id direktno na zahtevu na čekanju. */
export async function assignTermTypeToZahteviAsAdmin(
  termTypeId: string | null,
  zahtevIds: string[]
): Promise<{ failed: { zahtevId: string; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { failed: zahtevIds.map((zahtevId) => ({ zahtevId, error: authErr ?? 'Niste ovlašćeni.' })) };
  if (zahtevIds.length === 0) return { failed: [] };

  // Duža vrsta: čas bez instruktora zauzima i sledeće vreme (dete i učionica tada moraju biti slobodni).
  const failed: { zahtevId: string; error: string }[] = [];
  let zaIzmenu = zahtevIds;
  if (slotsNeeded(await trajanjeVrste(admin, termTypeId)) > 1) {
    const { data: zahtevi } = await admin
      .from('zahtevi_za_cas')
      .select('id, client_id, classroom_id, requested_date, requested_slot_index, status')
      .in('id', zahtevIds);
    for (const z of zahtevi ?? []) {
      if (z.status !== 'pending') continue;
      const greska = await proveriMestoZahteva(
        admin,
        {
          clientId: z.client_id as string,
          classroomId: (z.classroom_id as string | null) ?? null,
          termTypeId,
          datum: String(z.requested_date).slice(0, 10),
          slot: z.requested_slot_index as number,
          seli: false,
        },
        { zahtevIds: [z.id as string] }
      );
      if (greska) failed.push({ zahtevId: z.id as string, error: greska });
    }
    zaIzmenu = zahtevIds.filter((id) => !failed.some((f) => f.zahtevId === id));
  }
  if (zaIzmenu.length === 0) return { failed };

  const { error } = await admin.from('zahtevi_za_cas').update({ term_type_id: termTypeId }).in('id', zaIzmenu);
  if (error) return { failed: zahtevIds.map((zahtevId) => ({ zahtevId, error: error.message })) };
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  if (actor) {
    logActivity(actor, 'zahtev.assign_term_type', `Promenjena vrsta časa na ${zaIzmenu.length} zahtev(a).`, {
      entityType: 'term_type',
      entityId: termTypeId,
      metadata: { zahtevIds: zaIzmenu },
    });
  }
  return { failed };
}

export async function getAdminInstructorsList(): Promise<{ id: string; ime: string; prezime: string }[]> {
  const { supabase, user } = await getAuthedUser();
  if (!user) return [];
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!admin) return [];
  const adminSupabase = createAdminClient();
  const { data } = await adminSupabase.from('instructors').select('id, ime, prezime').eq('aktivan', true).order('prezime').order('ime');
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

/**
 * "Suspenduje" instruktora – ne briše ga niti dira postojeće termine/istoriju, samo ga uklanja iz
 * lista za dodelu NOVOG posla (zakazivanje, dodela instruktora, nova uplata). Prikazuje se i dalje
 * u Admin → Instruktori (sa oznakom) i u filterima/legendi kalendara (da se ne izgubi istorija).
 */
export async function setInstructorAktivanAsAdmin(instructorId: string, aktivan: boolean): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { data: instr } = await admin.from('instructors').select('ime, prezime').eq('id', instructorId).maybeSingle();
  const { error } = await admin.from('instructors').update({ aktivan }).eq('id', instructorId);
  if (error) return { error: error.message };
  revalidatePath('/admin/predavaci');
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/termin/novi');
  revalidatePath('/admin/uplate/novi');
  if (actor) {
    logActivity(
      actor,
      aktivan ? 'instructor.activate' : 'instructor.suspend',
      `${aktivan ? 'Aktiviran' : 'Suspendovan'} instruktor ${instr?.ime ?? ''} ${instr?.prezime ?? ''}`.trim() + '.',
      { entityType: 'instructor', entityId: instructorId }
    );
  }
  return {};
}

async function requireAdmin() {
  // getAuthedUser/getIsAdmin su keširani po zahtevu i proveravaju JWT lokalno (bez poziva Auth-u).
  const { user } = await getAuthedUser();
  if (!user) return { error: 'Niste ulogovani.' as const, admin: null, actor: null };
  if (!(await getIsAdmin())) return { error: 'Samo admin.' as const, admin: null, actor: null };
  const actor: Actor = { id: user.id, email: user.email ?? null, name: null, role: 'admin' };
  return { admin: createAdminClient(), error: null, actor };
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
): Promise<number[]> {
  // Origin i existing ne zavise jedno od drugog – paralelno umesto sekvencijalno (upola manje čekanja).
  const [{ data: origin }, { data: existing }] = await Promise.all([
    admin
      .from('terms')
      // '*': i dozvoli_preklapanje (062) – nastavak termina-izuzetka je takođe izuzetak.
      .select('*')
      .eq('id', originTermId)
      .single(),
    admin
      .from('terms')
      .select('id, slot_index, date, instructor_id, classroom_id, predavanja(id)')
      .eq('nastavak_of_term_id', originTermId)
      .eq('napomena', AUTO_SPILLOVER_NAPOMENA),
  ]);
  if (!origin) return [];

  // Nastavak koji više ne prati čas (čas premešten na drugi dan, promenjen instruktor ili učionica) se
  // briše i pravi ponovo uz čas – inače bi ostao da zauzima staro mesto.
  const originDatum = String(origin.date).slice(0, 10);
  const prati = (t: { date: string; instructor_id: string | null; classroom_id: string | null }) =>
    String(t.date).slice(0, 10) === originDatum && t.instructor_id === origin.instructor_id && t.classroom_id === origin.classroom_id;
  // Nastavak u kome je dete (stari podaci – dete upisano u nastavak tuđeg dužeg časa) nikad se ne briše:
  // to je pravi čas tog deteta.
  const prazni = (existing ?? []).filter((t) => ((t as { predavanja?: unknown[] }).predavanja ?? []).length === 0);
  const zastareli = prazni.filter((t) => !prati(t)).map((t) => t.id as string);
  const existingBySlot = new Map(prazni.filter(prati).map((t) => [t.slot_index, t.id as string]));

  const desiredSlots: number[] = [];
  for (let i = 1; i < totalSlotsNeeded; i++) {
    const s = origin.slot_index + i;
    if (s > 15) break;
    desiredSlots.push(s);
  }

  const toDelete = [
    ...zastareli,
    ...[...existingBySlot.entries()].filter(([slotIdx]) => !desiredSlots.includes(slotIdx)).map(([, id]) => id),
  ];
  const toInsert = desiredSlots.filter((slotIdx) => !existingBySlot.has(slotIdx));

  // Prvo brisanje, pa upis – stari nastavak ne sme da smeta novom (isti instruktor/učionica).
  if (toDelete.length > 0) await admin.from('terms').delete().in('id', toDelete);
  const neUpisano: number[] = [];
  await Promise.all([
    ...toInsert.map(async (slotIdx) => {
      const { error: spilloverErr } = await admin.from('terms').insert({
        instructor_id: origin.instructor_id,
        classroom_id: origin.classroom_id,
        date: origin.date,
        slot_index: slotIdx,
        term_category_id: origin.term_category_id,
        nastavak_of_term_id: originTermId,
        napomena: AUTO_SPILLOVER_NAPOMENA,
        ...((origin as { dozvoli_preklapanje?: boolean }).dozvoli_preklapanje ? { dozvoli_preklapanje: true } : {}),
      });
      if (spilloverErr) {
        // Instruktor ili učionica su već genuinely zauzeti u tom slotu nečim drugim – ne rušimo
        // čuvanje radionice zbog ovoga, samo beležimo da automatska blokada nije uspela.
        console.warn('[dvočas] spillover insert failed for slot', slotIdx, spilloverErr.message);
        neUpisano.push(slotIdx);
      }
    }),
  ]);
  return neUpisano;
}

/** Koliko vremena termin zauzima – po najdužoj vrsti časa među decom (kao automatski nastavak). */
async function slotovaTermina(admin: ReturnType<typeof createAdminClient>, termId: string): Promise<number> {
  const { data: preds } = await admin.from('predavanja').select('term_type:term_types(trajanje_minuta)').eq('term_id', termId);
  let max = 1;
  for (const p of preds ?? []) {
    const tt = p.term_type as { trajanje_minuta?: number } | { trajanje_minuta?: number }[] | null;
    max = Math.max(max, slotsNeeded(Array.isArray(tt) ? tt[0]?.trajanje_minuta : tt?.trajanje_minuta));
  }
  return max;
}

/**
 * Uzima najduže trajanje među SVIM radionicama u terminu (grupni termin može imati različite vrste
 * časa sa različitim trajanjem) i uskladi broj zauzetih slotova prema tome.
 */
export async function syncSpilloverForTerm(
  admin: ReturnType<typeof createAdminClient>,
  termId: string
): Promise<number[]> {
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
  return syncSpilloverSlots(admin, termId, slotsNeeded(maxMinutes));
}

export async function createPredavanjeAsAdmin(
  termId: string,
  clientId: string,
  odrzano: boolean,
  placeno: boolean,
  komentar: string | null,
  termTypeId: string | null = null
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireSchedulingAccess();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  // '*': i dozvoli_preklapanje (062), a radi i pre te migracije.
  const { data: term } = await admin.from('terms').select('*').eq('id', termId).single();
  if (!term) return { error: 'Termin nije pronađen.' };
  const termDatum = String(term.date).slice(0, 10);
  const izuzetak = (term as { dozvoli_preklapanje?: boolean }).dozvoli_preklapanje === true;
  // Dete u to vreme već ima čas bez instruktora (ili nastavak dužeg) – ne pravi se drugi čas preko njega.
  const [zahtevPoruka, { data: ostali }, trajanje, check, { data: dup }] = await Promise.all([
    deteImaZahtev(admin, clientId, termDatum, term.slot_index),
    admin.from('predavanja').select('term_type:term_types(trajanje_minuta)').eq('term_id', termId),
    trajanjeVrste(admin, termTypeId),
    termMozeNovoPredavanje(termId),
    admin.from('predavanja').select('id').eq('term_id', termId).eq('client_id', clientId).maybeSingle(),
  ]);
  if (zahtevPoruka) return { error: `${zahtevPoruka} Dodelite instruktora tom času (Dodeli) ili ga premestite.` };
  // Duži čas zauzima i sledeće vreme – instruktor tada mora biti slobodan.
  const slotova = Math.max(
    slotsNeeded(trajanje),
    ...(ostali ?? []).map((p) => {
      const tt = p.term_type as { trajanje_minuta?: number } | { trajanje_minuta?: number }[] | null;
      return slotsNeeded(Array.isArray(tt) ? tt[0]?.trajanje_minuta : tt?.trajanje_minuta);
    })
  );
  // Termin-izuzetak (dupliranje predavača) sme da se preklopi i svojim nastavkom.
  const nastavakGreska = izuzetak ? null : await instruktorSlobodanZaNastavak(admin, term.instructor_id, termDatum, term.slot_index, slotova, [termId]);
  if (nastavakGreska) return { error: nastavakGreska };
  if (!check.ok) {
    return {
      error: `U ovom terminu nije moguće dodati još jedno dete (${check.count}/${check.max}). Za termin sa jednim detetom dozvoljena je samo jedna radionica; za grupu izaberite odgovarajuću kategoriju pri kreiranju termina.`,
    };
  }
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
  const [{ error: icErr }] = await Promise.all([
    admin.from('instructor_clients').insert({ instructor_id: term.instructor_id, client_id: clientId, placeno_casova: 0 }),
    syncSpilloverSlots(admin, termId, slotova),
  ]);
  if (icErr && icErr.code !== '23505') {
    console.warn('[admin] instructor_clients insert (non-fatal)', icErr.message);
  }
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/termin/${termId}`);
  if (actor) {
    logActivity(actor, 'predavanje.create', `Dodata radionica (dete) u termin.`, {
      entityType: 'predavanje',
      entityId: termId,
      metadata: { termId, clientId, odrzano, placeno, termTypeId },
    });
  }
  return {};
}

/** Kategorija i napomena termina (admin). */
export async function updateTermMetaAsAdmin(
  termId: string,
  payload: { term_category_id: string; napomena: string | null; dozvoli_preklapanje?: boolean }
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
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
  const izuzetak = payload.dozvoli_preklapanje;
  const { error } = await admin
    .from('terms')
    .update({
      term_category_id: cid,
      napomena: payload.napomena?.trim() || null,
      ...(izuzetak !== undefined ? { dozvoli_preklapanje: izuzetak } : {}),
    })
    .eq('id', termId);
  if (error) {
    if (error.code === '23P01' || error.code === '23505') {
      return {
        error: 'Izuzetak ne može da se isključi: predavač (ili učionica) u tom bloku ima još jedan čas. Prvo premestite jedan od njih.',
      };
    }
    if (izuzetak !== undefined && /dozvoli_preklapanje/i.test(error.message)) {
      return { error: 'Prvo pokrenite migraciju 062_izuzetak_dupliranje_predavaca.sql u Supabase SQL Editoru.' };
    }
    return { error: error.message };
  }
  if (izuzetak !== undefined) {
    // Nastavci dužeg časa nose isti izuzetak kao čas.
    await admin
      .from('terms')
      .update({ dozvoli_preklapanje: izuzetak })
      .eq('nastavak_of_term_id', termId)
      .eq('napomena', AUTO_SPILLOVER_NAPOMENA);
    if (izuzetak) await syncSpilloverForTerm(admin, termId);
  }
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  revalidatePath('/dashboard');
  if (actor) {
    logActivity(actor, 'term.update_meta', `Izmenjena kategorija/napomena termina.`, {
      entityType: 'term',
      entityId: termId,
      metadata: payload,
    });
  }
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
  const { admin, error: authErr, actor } = await requireAdmin();
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
  if (actor) {
    logActivity(actor, 'predavanje.update', `Izmenjena radionica u terminu.`, {
      entityType: 'predavanje',
      entityId: predavanjeId,
      metadata: { termId, clientId, odrzano, placeno, termTypeId },
    });
  }
  return {};
}

/** Razlog otkazivanja: prazno → null, najviše 300 znakova. */
function ocistiRazlog(razlog: string | null | undefined): string | null {
  const r = (razlog ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return r || null;
}

/** Upis otkazanog časa; pre migracije 059 (nema kolone razlog) upisuje se bez razloga. */
async function upisiOtkazan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  red: Record<string, unknown>
): Promise<{ error?: string }> {
  const { error } = await admin.from('otkazani_termini').insert(red);
  if (error && 'razlog' in red && /razlog/i.test(error.message)) {
    const bezRazloga = { ...red };
    delete bezRazloga.razlog;
    const { error: e2 } = await admin.from('otkazani_termini').insert(bezRazloga);
    return e2 ? { error: e2.message } : {};
  }
  return error ? { error: error.message } : {};
}

async function savePredavanjeToHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  predavanjeId: string,
  /** Pri otkazivanju na kalendaru: da li je otkazan čas naplaćen (računa se u plaćene) i zašto je otkazan. */
  dodatno: { placeno?: boolean; razlog?: string | null } = {}
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
  const razlog = ocistiRazlog(dodatno.razlog);
  await upisiOtkazan(admin, {
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
    placeno: dodatno.placeno ?? pred.placeno ?? false,
    ...(razlog ? { razlog } : {}),
  });
}

export async function deletePredavanjeAsAdmin(predavanjeId: string, termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
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
  if (actor) {
    logActivity(actor, 'predavanje.delete', `Obrisana radionica iz termina.`, {
      entityType: 'predavanje',
      entityId: predavanjeId,
      metadata: { termId },
    });
  }
  return {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

/** Supabase ugnježdeni join zna da vrati niz ili objekat – uzima prvi/jedini. */
function jedan<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function porukaTestiranja(message: string): string {
  return /potential_clients_status_check|datum_termina|slot_termina/.test(message)
    ? 'Pokrenite migraciju 052 (otkazivanje testiranja) u Supabase SQL Editoru.'
    : message;
}

/**
 * Otkazuje jedno dete sa testiranja: na kalendaru ostaje sivi zapis "otkazano" (otkazani_termini), a
 * dete dobija status 'otkazan', odvaja se od termina i pamti datum/vreme (za Istoriju testiranja).
 * Vraća termin sa kog je otkazano, da se posle sredi (prazan termin se briše).
 */
async function otkaziDeteSaTestiranja(admin: AdminDb, pcId: string): Promise<{ error?: string; termId?: string }> {
  const { data: pc } = await admin
    .from('potential_clients')
    .select(
      'id, ime, prezime, term_id, term:terms(date, slot_index, instructor:instructors(id, ime, prezime), classroom:classrooms(naziv), term_category:term_categories(naziv))'
    )
    .eq('id', pcId)
    .maybeSingle();
  if (!pc) return { error: 'Dete sa testiranja nije pronađeno.' };
  const term = jedan(pc.term) as {
    date: string;
    slot_index: number;
    instructor?: unknown;
    classroom?: unknown;
    term_category?: unknown;
  } | null;
  if (!pc.term_id || !term) return { error: `${pc.ime} više nije na terminu testiranja (možda je već otkazano).` };
  const instr = jedan(term.instructor as { id: string; ime: string; prezime: string } | null);
  // Prvo sivi zapis, pa status – ako status ne prođe (nema migracije 052), zapis se vraća.
  const { data: zapis, error: insErr } = await admin
    .from('otkazani_termini')
    .insert({
      client_id: null,
      client_ime: pc.ime ?? '',
      client_prezime: pc.prezime ?? null,
      instructor_id: instr?.id ?? null,
      instructor_ime: instr?.ime ?? null,
      instructor_prezime: instr?.prezime ?? null,
      classroom_naziv: jedan(term.classroom as { naziv: string } | null)?.naziv ?? null,
      term_date: term.date,
      slot_index: term.slot_index,
      term_type_naziv: jedan(term.term_category as { naziv: string } | null)?.naziv ?? 'Testiranje',
      placeno: false,
      napomena: 'testiranje',
    })
    .select('id')
    .single();
  if (insErr) return { error: insErr.message };
  const { error: updErr } = await admin
    .from('potential_clients')
    .update({ status: 'otkazan', term_id: null, datum_termina: term.date, slot_termina: term.slot_index })
    .eq('id', pcId);
  if (updErr) {
    await admin.from('otkazani_termini').delete().eq('id', zapis.id);
    return { error: porukaTestiranja(updErr.message) };
  }
  return { termId: pc.term_id as string };
}

/** Deci koja ostaju u Istoriji testiranja pamti datum/vreme termina pre nego što se termin obriše
 * (potential_clients.term_id je ON DELETE SET NULL). Bez migracije 052 se tiho preskače. */
async function zapamtiDatumTestiranja(admin: AdminDb, termId: string) {
  const { data: t } = await admin.from('terms').select('date, slot_index').eq('id', termId).maybeSingle();
  if (!t) return;
  await admin.from('potential_clients').update({ datum_termina: t.date, slot_termina: t.slot_index }).eq('term_id', termId);
}

/**
 * Pre brisanja termina testiranja: deca koja su samo zakazana se otkazuju (nacin 'otkazi' – sivi zapis
 * ostaje) ili brišu (nacin 'obrisi' – Delete bez traga). Deca sa upisanim ishodom (pojavio se / nije se
 * pojavio / prebačen u klijenta) ostaju u Istoriji testiranja sa zapamćenim datumom.
 */
async function srediDecuTestiranjaPreBrisanja(admin: AdminDb, termId: string, nacin: 'otkazi' | 'obrisi') {
  const { data: deca } = await admin.from('potential_clients').select('id, status').eq('term_id', termId);
  const lista = (deca ?? []) as { id: string; status: string }[];
  if (lista.length === 0) return;
  const zakazani = lista.filter((d) => d.status === 'zakazan').map((d) => d.id);
  if (nacin === 'otkazi') {
    for (const id of zakazani) await otkaziDeteSaTestiranja(admin, id);
  } else if (zakazani.length > 0) {
    await admin.from('potential_clients').delete().in('id', zakazani);
  }
  await zapamtiDatumTestiranja(admin, termId);
  revalidatePath('/admin/testiranja');
}

/**
 * Mod "Otkaži" na kalendaru: izabrani časovi dece (predavanja), zahtevi bez instruktora i deca sa
 * testiranja se otkazuju – za razliku od Delete ostaje trag: upis u otkazane termine (siv "otkazano" na
 * kalendaru i na profilu deteta / u Istoriji testiranja). Termin koji ostane bez dece se briše
 * (oslobađa instruktora i učionicu) – obrisaniTermini su njegovi id-jevi.
 */
export async function otkaziCasoveAsAdmin(
  predavanjeIds: string[],
  zahtevIds: string[] = [],
  testiranjeIds: string[] = [],
  /** naplaceno: otkazani časovi dece su naplaćeni (računaju se u plaćene časove, migracija 059); razlog: zašto. */
  opcije: { naplaceno?: boolean; razlog?: string | null } = {}
): Promise<{ failed: { id: string; error: string }[]; otkazano: number; obrisaniTermini: string[] }> {
  const dodatno = { placeno: opcije.naplaceno === true, razlog: ocistiRazlog(opcije.razlog) };
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) {
    return {
      failed: [...predavanjeIds, ...zahtevIds, ...testiranjeIds].map((id) => ({ id, error: authErr ?? 'Niste ovlašćeni.' })),
      otkazano: 0,
      obrisaniTermini: [],
    };
  }

  const failed: { id: string; error: string }[] = [];
  let otkazano = 0;
  const obrisaniTermini: string[] = [];
  const termIdsZaSredjivanje = new Set<string>();
  // Redom, ne paralelno: deca istog termina – prazan termin se briše tek na kraju.
  for (const predavanjeId of predavanjeIds) {
    const { data: pred } = await admin.from('predavanja').select('term_id').eq('id', predavanjeId).maybeSingle();
    if (!pred) {
      failed.push({ id: predavanjeId, error: 'Čas nije pronađen.' });
      continue;
    }
    await savePredavanjeToHistory(admin, predavanjeId, dodatno);
    const { error } = await admin.from('predavanja').delete().eq('id', predavanjeId);
    if (error) {
      failed.push({ id: predavanjeId, error: error.message });
      continue;
    }
    termIdsZaSredjivanje.add(pred.term_id as string);
    otkazano++;
  }
  for (const termId of termIdsZaSredjivanje) {
    const { count } = await admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId);
    if ((count ?? 0) === 0) {
      await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      await admin.from('terms').delete().eq('id', termId);
      obrisaniTermini.push(termId);
    } else {
      await syncSpilloverForTerm(admin, termId);
    }
    revalidatePath(`/admin/termin/${termId}`);
  }

  // Deca sa testiranja – redom; termin testiranja koji ostane prazan se briše na kraju.
  const terminiTestiranja = new Set<string>();
  for (const pcId of testiranjeIds) {
    const res = await otkaziDeteSaTestiranja(admin, pcId);
    if (res.error) {
      failed.push({ id: pcId, error: res.error });
      continue;
    }
    if (res.termId) terminiTestiranja.add(res.termId);
    otkazano++;
  }
  for (const termId of terminiTestiranja) {
    const [{ count: deca }, { count: casovi }] = await Promise.all([
      admin.from('potential_clients').select('*', { count: 'exact', head: true }).eq('term_id', termId),
      admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId),
    ]);
    if ((deca ?? 0) === 0 && (casovi ?? 0) === 0) {
      await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      await admin.from('terms').delete().eq('id', termId);
      obrisaniTermini.push(termId);
    }
    revalidatePath(`/admin/termin/${termId}`);
  }

  for (const zahtevId of zahtevIds) {
    const { data: z } = await admin
      .from('zahtevi_za_cas')
      .select('client_id, requested_date, requested_slot_index, client:clients(ime, prezime), term_type:term_types(naziv), classroom:classrooms(naziv)')
      .eq('id', zahtevId)
      .maybeSingle();
    if (!z) {
      failed.push({ id: zahtevId, error: 'Zahtev nije pronađen.' });
      continue;
    }
    const one = jedan;
    const client = one(z.client as { ime?: string; prezime?: string | null } | { ime?: string; prezime?: string | null }[] | null);
    const { error: insGreska } = await upisiOtkazan(admin, {
      client_id: z.client_id,
      client_ime: client?.ime ?? '',
      client_prezime: client?.prezime ?? null,
      instructor_id: null,
      instructor_ime: null,
      instructor_prezime: null,
      classroom_naziv: one(z.classroom as { naziv?: string } | { naziv?: string }[] | null)?.naziv ?? null,
      term_date: String(z.requested_date).slice(0, 10),
      slot_index: z.requested_slot_index,
      term_type_naziv: one(z.term_type as { naziv?: string } | { naziv?: string }[] | null)?.naziv ?? null,
      placeno: dodatno.placeno,
      ...(dodatno.razlog ? { razlog: dodatno.razlog } : {}),
    });
    if (insGreska) {
      failed.push({ id: zahtevId, error: insGreska });
      continue;
    }
    const { error: delErr } = await admin.from('zahtevi_za_cas').delete().eq('id', zahtevId);
    if (delErr) {
      failed.push({ id: zahtevId, error: delErr.message });
      continue;
    }
    otkazano++;
  }

  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/klijenti', 'layout');
  if (zahtevIds.length > 0) revalidatePath('/dashboard/zahtevi');
  if (testiranjeIds.length > 0) revalidatePath('/admin/testiranja');
  if (actor && otkazano > 0) {
    logActivity(actor, 'predavanje.otkazi', `Otkazano ${otkazano} čas(ova)/testiranja.`, {
      entityType: 'predavanje',
      metadata: { predavanjeIds, zahtevIds, testiranjeIds },
    });
  }
  return { failed, otkazano, obrisaniTermini };
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
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: pred } = await admin
    .from('predavanja')
    .select('id, client_id, term_id')
    .eq('id', predavanjeId)
    .single();
  if (!pred) return { error: 'Radionica nije pronađena.' };

  // Tražimo postojeći termin novog instruktora u istom slotu
  // Običan termin predavača u tom bloku; termin-izuzetak (dupliranje predavača, 062) se preskače.
  const { data: existingTermSvi } = await admin
    .from('terms')
    .select('*')
    .eq('instructor_id', newInstructorId)
    .eq('date', termDate.slice(0, 10))
    .eq('slot_index', slotIndex)
    .limit(5);
  const existingTerm = ((existingTermSvi ?? []) as { id: string; classroom_id: string | null; napomena: string | null; dozvoli_preklapanje?: boolean }[]).find(
    (t) => !t.dozvoli_preklapanje
  ) ?? null;
  // Automatski nastavak tuđeg dužeg časa nije mesto za drugo dete (posle bi se obrisao sa njim).
  if (existingTerm?.napomena === AUTO_SPILLOVER_NAPOMENA) return { error: NASTAVAK_ZAUZET_PORUKA };

  let newTermId: string;
  if (existingTerm) {
    newTermId = existingTerm.id as string;
    // Instruktor u to vreme već ima čas – dete sme samo u njegovu grupu sa slobodnim mestom, nikad u
    // individualni čas sa drugim detetom (ranije se ovde tiho spajalo u jedan termin).
    const mesto = await termMozeNovoPredavanje(newTermId);
    if (!mesto.ok) {
      return { error: `Ovaj instruktor u to vreme već ima čas (${mesto.count}/${mesto.max} dece) – izaberite drugog instruktora.` };
    }
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
  if (actor) {
    logActivity(actor, 'predavanje.reassign_instructor', `Premeštena radionica kod drugog instruktora.`, {
      entityType: 'predavanje',
      entityId: predavanjeId,
      metadata: { currentTermId, newTermId, newInstructorId },
    });
  }
  return { newTermId };
}

/**
 * "Bez instruktora": čas (predavanje) se vraća u zahtev na čekanju – narandžasti čas koji čeka da ga
 * neki predavač preuzme, isti datum/vreme/vrsta/učionica. Termin koji ostane bez dece se briše
 * (oslobađa instruktora i učionicu). termIds = sva deca tih termina; zahtevIds = zahtevi kojima se
 * samo skida unapred izabrani instruktor. Održan čas se ne vraća.
 */
export async function vratiBezInstruktoraAsAdmin(izbor: {
  predavanjeIds?: string[];
  termIds?: string[];
  zahtevIds?: string[];
}): Promise<{ failed: { id: string; error: string }[]; vraceno: number }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) {
    const svi = [...(izbor.predavanjeIds ?? []), ...(izbor.termIds ?? []), ...(izbor.zahtevIds ?? [])];
    return { failed: svi.map((id) => ({ id, error: authErr ?? 'Niste ovlašćeni.' })), vraceno: 0 };
  }

  const failed: { id: string; error: string }[] = [];
  const predavanjeIds = new Set(izbor.predavanjeIds ?? []);
  if (izbor.termIds?.length) {
    const { data: uTerminima } = await admin.from('predavanja').select('id, term_id').in('term_id', izbor.termIds);
    for (const p of uTerminima ?? []) predavanjeIds.add(p.id);
    const saDecom = new Set((uTerminima ?? []).map((p) => p.term_id));
    for (const termId of izbor.termIds) {
      if (!saDecom.has(termId)) failed.push({ id: termId, error: 'Termin nema dece (testiranje ostaje kod instruktora).' });
    }
  }

  let vraceno = 0;
  const termIdsZaSredjivanje = new Set<string>();
  // Redom, ne paralelno: deca istog termina – prazan termin se briše tek na kraju.
  for (const predavanjeId of predavanjeIds) {
    const { data: pred } = await admin
      .from('predavanja')
      .select('id, client_id, term_id, odrzano, term_type_id, term:terms(date, slot_index, classroom_id)')
      .eq('id', predavanjeId)
      .maybeSingle();
    const term = (pred ? (Array.isArray(pred.term) ? pred.term[0] : pred.term) : null) as
      | { date: string; slot_index: number; classroom_id: string | null }
      | null;
    if (!pred || !term) {
      failed.push({ id: predavanjeId, error: 'Čas nije pronađen.' });
      continue;
    }
    if (pred.odrzano) {
      failed.push({ id: predavanjeId, error: 'Čas je već održan – ne vraća se bez instruktora.' });
      continue;
    }
    const datum = String(term.date).slice(0, 10);

    // Ako za to dete u to vreme već postoji zahtev, ne pravi se još jedan.
    const { data: postojeci } = await admin
      .from('zahtevi_za_cas')
      .select('id')
      .eq('client_id', pred.client_id)
      .eq('requested_date', datum)
      .eq('requested_slot_index', term.slot_index)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    let noviZahtevId: string | null = null;
    if (!postojeci) {
      const { data: z, error: zErr } = await admin
        .from('zahtevi_za_cas')
        .insert({
          client_id: pred.client_id,
          instructor_id: null,
          classroom_id: term.classroom_id,
          requested_date: datum,
          requested_slot_index: term.slot_index,
          term_type_id: pred.term_type_id ?? null,
          status: 'pending',
        })
        .select('id')
        .single();
      if (zErr || !z) {
        failed.push({ id: predavanjeId, error: zErr?.message ?? 'Zahtev nije kreiran.' });
        continue;
      }
      noviZahtevId = z.id as string;
    }

    const { error: delErr } = await admin.from('predavanja').delete().eq('id', predavanjeId);
    if (delErr) {
      if (noviZahtevId) await admin.from('zahtevi_za_cas').delete().eq('id', noviZahtevId);
      failed.push({ id: predavanjeId, error: delErr.message });
      continue;
    }
    termIdsZaSredjivanje.add(pred.term_id as string);
    vraceno++;
  }

  for (const termId of termIdsZaSredjivanje) {
    const { count } = await admin.from('predavanja').select('*', { count: 'exact', head: true }).eq('term_id', termId);
    if ((count ?? 0) === 0) {
      await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
      await admin.from('terms').delete().eq('id', termId);
    } else {
      await syncSpilloverForTerm(admin, termId);
    }
    revalidatePath(`/admin/termin/${termId}`);
  }

  if (izbor.zahtevIds?.length) {
    const { error } = await admin.from('zahtevi_za_cas').update({ instructor_id: null }).in('id', izbor.zahtevIds).eq('status', 'pending');
    if (error) failed.push(...izbor.zahtevIds.map((id) => ({ id, error: error.message })));
    else vraceno += izbor.zahtevIds.length;
  }

  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  if (actor && vraceno > 0) {
    logActivity(actor, 'predavanje.bez_instruktora', `Vraćeno bez instruktora (zahtev na čekanju): ${vraceno} čas(ova).`, {
      entityType: 'predavanje',
      metadata: { predavanjeIds: [...predavanjeIds], termIds: izbor.termIds ?? [], zahtevIds: izbor.zahtevIds ?? [] },
    });
  }
  return { failed, vraceno };
}

/** Premeštanje termina: ista pravila – u ciljnom slotu moraju biti jedinstveni predavač i učionica, i ne sme se premašiti max termina po slotu. */
export async function moveTermAsAdmin(
  termId: string,
  newDate: string,
  newSlotIndex: number
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const slot = Math.min(15, Math.max(0, newSlotIndex));
  const dateStr = newDate.slice(0, 10);

  const [{ data: term }, { data: nastavciRaw }] = await Promise.all([
    admin.from('terms').select('instructor_id, classroom_id, date, slot_index').eq('id', termId).single(),
    admin.from('terms').select('id').eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA),
  ]);
  if (!term) return { error: 'Termin nije pronađen.' };

  const isSameSlot = term.date === dateStr && term.slot_index === slot;
  if (isSameSlot) return {}; // nema pomeranja

  // Automatski nastavak ovog (dužeg) časa ne smeta premeštanju – seli se zajedno sa časom.
  const nastavci = (nastavciRaw ?? []).map((n) => n.id as string);
  const svoji = new Set([termId, ...nastavci]);
  const [{ data: uCilju }, { data: maxSetting }] = await Promise.all([
    admin.from('terms').select('id, instructor_id, classroom_id').eq('date', dateStr).eq('slot_index', slot),
    admin.from('app_settings').select('value').eq('key', 'max_termina_po_slotu').single(),
  ]);
  const drugi = (uCilju ?? []).filter((t) => !svoji.has(t.id as string));
  const maxTerminaPoSlotu = (maxSetting?.value && parseInt(maxSetting.value, 10)) || 4;
  if (drugi.length >= maxTerminaPoSlotu) {
    return { error: `U ciljnom slotu je već ${maxTerminaPoSlotu} termina (maksimum).` };
  }
  if (drugi.some((t) => t.instructor_id === term.instructor_id)) return { error: 'Ovaj instruktor već ima termin u ciljnom slotu.' };
  if (term.classroom_id && drugi.some((t) => t.classroom_id === term.classroom_id)) {
    return { error: 'Ova učionica je već zauzeta u ciljnom slotu.' };
  }
  // Časovi bez instruktora (i nastavci dužih) drže svoju učionicu i svoje dete.
  const rez = await ucionicaRezervisana(admin, dateStr, slot, term.classroom_id);
  if (rez) return { error: rez };
  const { data: decaTermina } = await admin.from('predavanja').select('client_id').eq('term_id', termId);
  for (const p of decaTermina ?? []) {
    const poruka = await deteImaZahtev(admin, p.client_id as string, dateStr, slot);
    if (poruka) return { error: poruka };
  }
  // Duži čas nosi svoj nastavak – instruktor mora biti slobodan i u sledećem vremenu.
  const nastavakGreska = await instruktorSlobodanZaNastavak(admin, term.instructor_id, dateStr, slot, await slotovaTermina(admin, termId), svoji);
  if (nastavakGreska) return { error: nastavakGreska };

  if (nastavci.length > 0) await admin.from('terms').delete().in('id', nastavci);
  const { error } = await admin.from('terms').update({ date: dateStr, slot_index: slot }).eq('id', termId);
  // I kad premeštanje ne uspe, nastavak se vraća (na staro mesto).
  await syncSpilloverForTerm(admin, termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  if (actor) {
    logActivity(actor, 'term.move', `Premešten termin na ${dateStr} ${TIME_SLOTS[slot] ?? `slot ${slot}`}.`, {
      entityType: 'term',
      entityId: termId,
      metadata: { from: { date: term.date, slot: term.slot_index }, to: { date: dateStr, slot } },
    });
  }
  return {};
}

/** "Otkazivanje" – čuva istorijski trag u otkazani_termini (prikazuje se sivo na kalendaru) pre brisanja. */
export async function deleteTermAsAdmin(termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  // Save all predavanja in this term to history before deleting
  const { data: preds } = await admin.from('predavanja').select('id').eq('term_id', termId);
  for (const p of preds ?? []) {
    await savePredavanjeToHistory(admin, p.id);
  }
  // Termin testiranja: zakazana deca se otkazuju (sivi zapis "otkazano"), ostalima se pamti datum.
  await srediDecuTestiranjaPreBrisanja(admin, termId, 'otkazi');

  // Briše i eventualne automatske "blokirajuće" slotove dužeg časa (nastavak_of_term_id nema CASCADE).
  await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);

  const { error } = await admin.from('terms').delete().eq('id', termId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  if (actor) {
    logActivity(actor, 'term.cancel', `Otkazan termin (ostaje istorijski trag).`, { entityType: 'term', entityId: termId });
  }
  return {};
}

/**
 * "Brisanje" (bez traga) – za razliku od deleteTermAsAdmin (Otkazivanje) NE upisuje u
 * otkazani_termini, pa posle ovoga na kalendaru ne ostaje ništa, ni sivi zapis. predavanja se brišu
 * automatski (ON DELETE CASCADE na predavanja.term_id).
 */
export async function permanentlyDeleteTermAsAdmin(termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: origin } = await admin.from('terms').select('date, slot_index, predavanja(client_id)').eq('id', termId).maybeSingle();

  // Termin testiranja: deca koja su bila samo zakazana nestaju sa njim; ona sa ishodom ostaju u istoriji.
  await srediDecuTestiranjaPreBrisanja(admin, termId, 'obrisi');
  await admin.from('terms').delete().eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
  const { error } = await admin.from('terms').delete().eq('id', termId);
  if (error) return { error: error.message };
  if (origin) {
    const cleanupError = await deletePaymentStarts(admin, (origin.predavanja ?? []).map((p) => ({ client_id: p.client_id, date: origin.date, slot_index: origin.slot_index })));
    if (cleanupError) return { error: `Termin je obrisan, ali oznake plaćanja nisu uklonjene: ${cleanupError}` };
  }
  revalidatePath('/admin/kalendar');
  if (actor) {
    logActivity(actor, 'term.delete', `Trajno obrisan termin (bez traga).`, { entityType: 'term', entityId: termId });
  }
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
  otkazaniIds: string[] = [],
  zahtevIds: string[] = []
): Promise<{ failed: { id: string; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { failed: [...termIds, ...otkazaniIds, ...zahtevIds].map((id) => ({ id, error: authErr ?? 'Niste ovlašćeni.' })) };

  const fast = await admin.rpc('delete_calendar_entries', { p_term_ids: termIds, p_request_ids: zahtevIds, p_cancelled_ids: otkazaniIds });
  if (!fast.error) {
    revalidatePath('/admin/kalendar');
    revalidatePath('/admin/klijenti');
    revalidatePath('/admin/testiranja');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/zahtevi');
    if (actor) logActivity(actor, 'calendar.delete', 'Trajno obrisane izabrane stavke i pripadajuće oznake plaćanja.', { entityType: 'term', metadata: { termIds, zahtevIds, otkazaniIds } });
    return { failed: [] };
  }
  if (fast.error.code !== 'PGRST202') return { failed: [...termIds, ...zahtevIds, ...otkazaniIds].map((id) => ({ id, error: fast.error.message })) };

  const [termResults, otkazaniResults, zahtevResults] = await Promise.all([
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
    Promise.all(
      zahtevIds.map(async (id) => {
        const { data: origin } = await admin.from('zahtevi_za_cas').select('client_id, requested_date, requested_slot_index').eq('id', id).maybeSingle();
        const { error } = await admin.from('zahtevi_za_cas').delete().eq('id', id);
        const cleanupError = !error && origin ? await deletePaymentStarts(admin, [{ client_id: origin.client_id, date: origin.requested_date, slot_index: origin.requested_slot_index }]) : null;
        return { id, error: error?.message ?? cleanupError };
      })
    ),
  ]);
  if (zahtevIds.length > 0) revalidatePath('/dashboard/zahtevi');
  // Odgovor odmah nosi osvežen kalendar – bez posebnog učitavanja posle brisanja.
  revalidatePath('/admin/kalendar');
  if (actor && zahtevIds.length > 0) {
    logActivity(actor, 'zahtev.bulk_delete', `Obrisano ${zahtevIds.length} zahtev(a) sa kalendara.`, { entityType: 'zahtev', metadata: { zahtevIds } });
  }
  return { failed: [...termResults, ...otkazaniResults, ...zahtevResults].filter((r): r is { id: string; error: string } => r.error !== null) };
}

/**
 * Menja učionicu termina. Ako je izabrana učionica već zauzeta DRUGIM terminom u istom datumu/slotu
 * (baza ima UNIQUE ograničenje na (classroom_id, date, slot_index)), radi se prava zamena mesta:
 * onaj drugi termin dobija učionicu koju je ovaj termin do sad imao (privremeno se prolazi kroz NULL
 * da se ne prekrši ograničenje usred operacije).
 */
export async function updateTermClassroomAsAdmin(termId: string, classroomId: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };

  const { data: term } = await admin.from('terms').select('classroom_id, date, slot_index').eq('id', termId).single();
  if (!term) return { error: 'Termin nije pronađen.' };
  if (term.classroom_id === classroomId) return {};
  const rez = await ucionicaRezervisana(admin, String(term.date).slice(0, 10), term.slot_index, classroomId);
  if (rez) return { error: rez };

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
  if (actor) {
    logActivity(actor, 'term.change_classroom', `Promenjena učionica termina.`, { entityType: 'term', entityId: termId, metadata: { classroomId } });
  }
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
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  if (termAId === termBId) return { error: 'Izaberite dva različita termina.' };

  type Red = {
    id: string;
    date: string;
    slot_index: number;
    instructor_id: string;
    classroom_id: string | null;
    napomena: string | null;
    nastavak_of_term_id: string | null;
    term_category_id: string | null;
    predavanja: { id: string; client_id: string }[] | null;
    potential_clients: { id: string }[] | null;
  };
  const { data: redovi } = await admin
    .from('terms')
    .select('id, date, slot_index, instructor_id, classroom_id, napomena, nastavak_of_term_id, term_category_id, predavanja(id, client_id), potential_clients(id)')
    .in('id', [termAId, termBId]);
  const a = ((redovi ?? []) as Red[]).find((t) => t.id === termAId);
  const b = ((redovi ?? []) as Red[]).find((t) => t.id === termBId);
  if (!a || !b) return { error: 'Termin nije pronađen.' };
  const jeNastavak = (t: Red) => !!t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA && (t.predavanja ?? []).length === 0;
  if (jeNastavak(a) || jeNastavak(b)) return { error: 'Automatski blok (nastavak dužeg časa) nije moguće menjati – izaberite pravi termin.' };

  const pa = a.predavanja ?? [];
  const pb = b.predavanja ?? [];
  const ta = a.potential_clients ?? [];
  const tb = b.potential_clients ?? [];
  // Klijent = cela radionica. Jedno dete ↔ jedno dete ide kroz bazu (swap_terms); grupa i deca sa
  // testiranja se menjaju ovde – zajedno sa vrstom termina (grupni/testiranje), da sve ostane ispravno.
  const klijentUBazi = opts.klijent && pa.length === 1 && pb.length === 1 && ta.length === 0 && tb.length === 0;
  const klijentOvde = opts.klijent && !klijentUBazi;
  if (klijentOvde) {
    if (pa.length + pb.length + ta.length + tb.length === 0) return { error: 'U ovim terminima nema dece za zamenu.' };
    const decaA = new Set(pa.map((p) => p.client_id));
    if (pb.some((p) => decaA.has(p.client_id))) return { error: 'Isto dete je u oba termina – zamena dece nije moguća.' };
  }

  // Časovi bez instruktora drže svoju učionicu i svoje dete – nova mesta ne smeju da ih preklope.
  const novo = (ovaj: Red, drugi: Red) => ({
    datum: String(opts.termin ? drugi.date : ovaj.date).slice(0, 10),
    slot: opts.termin ? drugi.slot_index : ovaj.slot_index,
    soba: opts.ucionica ? drugi.classroom_id : ovaj.classroom_id,
    instruktor: opts.instruktor ? drugi.instructor_id : ovaj.instructor_id,
    deca: (opts.klijent ? drugi.predavanja ?? [] : ovaj.predavanja ?? []).map((p) => p.client_id),
    slotovaOd: opts.klijent ? drugi.id : ovaj.id,
  });
  const svojiNastavci = async (termId: string) =>
    ((await admin.from('terms').select('id').eq('nastavak_of_term_id', termId).eq('napomena', AUTO_SPILLOVER_NAPOMENA)).data ?? []).map(
      (n) => n.id as string
    );
  const [nastavciA, nastavciB] = await Promise.all([svojiNastavci(a.id), svojiNastavci(b.id)]);
  const oba = [a.id, b.id, ...nastavciA, ...nastavciB];
  for (const [ovaj, n] of [
    [a, novo(a, b)],
    [b, novo(b, a)],
  ] as const) {
    const seli = n.datum !== String(ovaj.date).slice(0, 10) || n.slot !== ovaj.slot_index;
    if (seli || n.soba !== ovaj.classroom_id) {
      const rez = await ucionicaRezervisana(admin, n.datum, n.slot, n.soba);
      if (rez) return { error: rez };
    }
    if (seli || opts.klijent) {
      for (const clientId of n.deca) {
        const poruka = await deteImaZahtev(admin, clientId, n.datum, n.slot);
        if (poruka) return { error: poruka };
      }
    }
    if (seli || opts.klijent || opts.instruktor) {
      const nastavakGreska = await instruktorSlobodanZaNastavak(admin, n.instruktor, n.datum, n.slot, await slotovaTermina(admin, n.slotovaOd), oba);
      if (nastavakGreska) return { error: nastavakGreska };
    }
  }

  // Automatski nastavci oba termina se sklanjaju (ne smetaju zameni) i posle prave ponovo uz čas.
  if (nastavciA.length + nastavciB.length > 0) await admin.from('terms').delete().in('id', [...nastavciA, ...nastavciB]);
  const sinhronizuj = () => Promise.all([syncSpilloverForTerm(admin, termAId), syncSpilloverForTerm(admin, termBId)]);

  if (opts.termin || opts.instruktor || opts.ucionica || klijentUBazi) {
    const { error } = await admin.rpc('swap_terms', {
      p_term_a: termAId,
      p_term_b: termBId,
      p_swap_termin: opts.termin,
      p_swap_instruktor: opts.instruktor,
      p_swap_ucionica: opts.ucionica,
      p_swap_klijent: klijentUBazi,
    });
    if (error) {
      await sinhronizuj();
      return { error: error.message || 'Greška pri zameni termina.' };
    }
  }

  if (klijentOvde) {
    const premesti = async (tabela: 'predavanja' | 'potential_clients', ids: string[], uTermin: string) =>
      ids.length > 0 ? (await admin.from(tabela).update({ term_id: uTermin }).in('id', ids)).error : null;
    const greska =
      (await premesti('predavanja', pa.map((p) => p.id), b.id)) ??
      (await premesti('predavanja', pb.map((p) => p.id), a.id)) ??
      (await premesti('potential_clients', ta.map((p) => p.id), b.id)) ??
      (await premesti('potential_clients', tb.map((p) => p.id), a.id));
    if (greska) {
      await sinhronizuj();
      return { error: greska.message };
    }
    if (a.term_category_id !== b.term_category_id) {
      await admin.from('terms').update({ term_category_id: b.term_category_id }).eq('id', a.id);
      await admin.from('terms').update({ term_category_id: a.term_category_id }).eq('id', b.id);
    }
    // Deca i (novi) instruktori – kao pri dodavanju deteta u termin (veza već može postojati).
    const { data: posle } = await admin.from('terms').select('instructor_id, predavanja(client_id)').in('id', [a.id, b.id]);
    for (const t of posle ?? []) {
      for (const p of (t.predavanja ?? []) as { client_id: string }[]) {
        await admin.from('instructor_clients').insert({ instructor_id: t.instructor_id, client_id: p.client_id, placeno_casova: 0 });
      }
    }
    if (ta.length + tb.length > 0) revalidatePath('/admin/testiranja');
  }

  await sinhronizuj();

  revalidatePath('/admin/kalendar');
  if (actor) {
    logActivity(actor, 'term.swap', `Zamenjena dva termina (${[opts.termin && 'termin', opts.instruktor && 'instruktor', opts.ucionica && 'učionica', opts.klijent && 'klijent'].filter(Boolean).join(', ')}).`, {
      entityType: 'term',
      entityId: termAId,
      metadata: { termAId, termBId, opts },
    });
  }
  return {};
}

/**
 * Kopira termin na jedan ili više ciljnih slotova odjednom. Bira se šta tačno ide u kopiju
 * (instruktor/učionica/klijent(i)) – odrzano/placeno se NIKAD ne prenose (nova radionica se još nije
 * desala). Za svaki cilj se PROVERAVA da li su instruktor/učionica slobodni baš u tom slotu; ako
 * nisu (ili polje uopšte nije čekirano), kopija se ne odbija – samo se taj deo izostavi (termin bez
 * instruktora postaje zahtev, isto kao "Više termina"; učionica bez slobodnog mesta ostaje prazna).
 * Jedini pravi razlozi za neuspeh su npr. dete koje je već u tom terminu ili dostignut limit.
 */
export async function copyTermToSlotsAsAdmin(
  sourceTermId: string,
  targets: { date: string; slotIndex: number }[],
  fields: { instruktor: boolean; ucionica: boolean; klijent: boolean },
  termTypeId?: string | null
): Promise<{ failed: { date: string; slotIndex: number; error: string }[] }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { failed: targets.map((t) => ({ ...t, error: authErr ?? 'Niste ovlašćeni.' })) };
  if (targets.length === 0) return { failed: [] };

  const { data: source } = await admin
    .from('terms')
    .select('instructor_id, classroom_id, term_category_id, napomena, nastavak_of_term_id, term_category:term_categories(is_testing)')
    .eq('id', sourceTermId)
    .single();
  if (!source) return { failed: targets.map((t) => ({ ...t, error: 'Termin za kopiranje nije pronađen.' })) };
  const kat = source.term_category as { is_testing?: boolean } | { is_testing?: boolean }[] | null;
  const testiranje = (Array.isArray(kat) ? kat[0]?.is_testing : kat?.is_testing) === true;
  if (source.nastavak_of_term_id) {
    return { failed: targets.map((t) => ({ ...t, error: 'Automatski blok (nastavak dužeg časa) nije moguće kopirati.' })) };
  }

  let preds: { client_id: string; term_type_id: string | null; komentar: string | null }[] = [];
  // Testiranje: kopiraju se deca sa testiranja (nova, zakazana) – nisu klijenti, pa nemaju časove.
  let decaTestiranja: { ime: string; prezime: string | null; ime_roditelja: string | null; mobilni_roditelja: string | null; razred: string | null }[] = [];
  if (fields.klijent && testiranje) {
    const { data } = await admin
      .from('potential_clients')
      .select('ime, prezime, ime_roditelja, mobilni_roditelja, razred, status')
      .eq('term_id', sourceTermId);
    decaTestiranja = (data ?? [])
      .filter((p) => p.status !== 'otkazan')
      .map((p) => ({
        ime: (p.ime as string) ?? '',
        prezime: (p.prezime as string | null) ?? null,
        ime_roditelja: (p.ime_roditelja as string | null) ?? null,
        mobilni_roditelja: (p.mobilni_roditelja as string | null) ?? null,
        razred: (p.razred as string | null) ?? null,
      }));
  } else if (fields.klijent) {
    const { data } = await admin.from('predavanja').select('client_id, term_type_id, komentar').eq('term_id', sourceTermId);
    preds = data ?? [];
    if (preds.length === 0) {
      return { failed: targets.map((t) => ({ ...t, error: 'Ovaj termin nema nijednu radionicu za kopiranje.' })) };
    }
  }
  // termTypeId (ako je prosleđen, uključujući null = "bez vrste") važi za SVE kopirane radionice,
  // umesto da svaka nosi svoju originalnu vrstu – jednostavnije kad se bira jedna vrsta pri kopiranju.
  const effectiveTermType = (p: { term_type_id: string | null }) => (termTypeId !== undefined ? termTypeId : p.term_type_id);

  const results = await Promise.all(
    targets.map(async (t) => {
      // Instruktor se koristi samo ako je čekiran I slobodan baš u ovom danu/slotu.
      let useInstructor = false;
      if (fields.instruktor) {
        const { data: instrConflict } = await admin
          .from('terms')
          .select('id')
          .eq('instructor_id', source.instructor_id)
          .eq('date', t.date)
          .eq('slot_index', t.slotIndex)
          .maybeSingle();
        useInstructor = !instrConflict;
      }

      // Isto za učionicu – ako je zauzeta, kopija ide bez nje umesto da padne.
      let useClassroom = false;
      if (fields.ucionica && source.classroom_id) {
        const { data: roomConflict } = await admin
          .from('terms')
          .select('id')
          .eq('classroom_id', source.classroom_id)
          .eq('date', t.date)
          .eq('slot_index', t.slotIndex)
          .maybeSingle();
        // Rezervisana za čas bez instruktora (ili njegov nastavak) – kopija ide bez nje.
        useClassroom = !roomConflict && !(await ucionicaRezervisana(admin, t.date.slice(0, 10), t.slotIndex, source.classroom_id));
      }
      const classroomId = useClassroom ? source.classroom_id : null;

      if (useInstructor) {
        const createRes = await createTermAsAdmin(
          source.instructor_id,
          t.date,
          t.slotIndex,
          classroomId,
          source.term_category_id,
          source.napomena
        );
        if (createRes.error || !createRes.termId) return { ...t, error: createRes.error ?? 'Greška pri kreiranju termina.' };
        for (const p of preds) {
          const res = await createPredavanjeAsAdmin(createRes.termId, p.client_id, false, false, p.komentar, effectiveTermType(p));
          if (res.error) return { ...t, error: res.error };
        }
        if (decaTestiranja.length > 0) {
          const { error: pcErr } = await admin
            .from('potential_clients')
            .insert(decaTestiranja.map((d) => ({ ...d, term_id: createRes.termId, status: 'zakazan' })));
          if (pcErr) return { ...t, error: pcErr.message };
        }
        return { ...t, error: null as string | null };
      }
      if (testiranje) {
        return { ...t, error: 'Testiranje mora imati instruktora – instruktor je u to vreme zauzet (ili nije čekiran).' };
      }

      // Bez instruktora (nije čekiran ili je zauzet) – zahtev, ne pravi termin. Nema šta da se
      // kopira bez bar jednog klijenta.
      if (preds.length === 0) {
        return { ...t, error: 'Instruktor je zauzet (ili nije čekiran), a bez klijenta nema šta da se kopira kao zahtev.' };
      }
      for (const p of preds) {
        const greska = await proveriMestoZahteva(
          admin,
          { clientId: p.client_id, classroomId, termTypeId: effectiveTermType(p), datum: t.date.slice(0, 10), slot: t.slotIndex, seli: true },
          {}
        );
        if (greska) return { ...t, error: greska };
      }
      const { error } = await admin.from('zahtevi_za_cas').insert(
        preds.map((p) => ({
          client_id: p.client_id,
          instructor_id: null,
          requested_date: t.date,
          requested_slot_index: t.slotIndex,
          term_type_id: effectiveTermType(p),
          classroom_id: classroomId,
          status: 'pending',
        }))
      );
      if (error) return { ...t, error: error.message };
      return { ...t, error: null as string | null };
    })
  );
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  const failed = results.filter((r): r is { date: string; slotIndex: number; error: string } => r.error !== null);
  if (actor) {
    logActivity(actor, 'term.copy', `Kopiran termin na ${targets.length - failed.length}/${targets.length} slot(ova).`, {
      entityType: 'term',
      entityId: sourceTermId,
      metadata: { targets, fields, termTypeId },
    });
  }
  return { failed };
}

export type TermTypeRow ={ id: string; naziv: string; opis: string | null; cena_po_casu: number | null; program_id: string | null; trajanje_minuta: number };

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
): Promise<{ error?: string; upozorenje?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!program_id) return { error: 'Izaberite program.' };
  if (!Number.isFinite(trajanje_minuta) || trajanje_minuta <= 0) return { error: 'Trajanje mora biti pozitivan broj minuta.' };
  const { data: staro } = await admin.from('term_types').select('trajanje_minuta').eq('id', id).maybeSingle();
  const { error } = await admin.from('term_types').update({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    cena_po_casu: cena_po_casu != null && Number.isFinite(cena_po_casu) ? cena_po_casu : null,
    program_id,
    trajanje_minuta,
  }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/vrste-termina');
  // Promenjeno trajanje (npr. 45 → 55 min): već zakazani časovi te vrste dobijaju (ili gube) nastavak.
  if (slotsNeeded(staro?.trajanje_minuta as number | null | undefined) !== slotsNeeded(trajanje_minuta)) {
    const res = await obnoviNastavke(admin, id);
    revalidatePath('/admin/kalendar');
    revalidatePath('/dashboard', 'layout');
    if (res.sukobi.length > 0) {
      return {
        upozorenje: `Sačuvano. ${res.sukobi.length} budućih časova ove vrste nema mesta za nastavak (instruktor ili učionica je zauzeta u sledećem bloku): ${res.sukobi
          .slice(0, 8)
          .map((x) => `${x.datum} ${x.vreme} ${x.dete}`)
          .join('; ')}${res.sukobi.length > 8 ? ' …' : ''}`,
      };
    }
  }
  return {};
}

/**
 * Obnovi „Nastavak dužeg časa“ za buduće termine (od danas): posle promene trajanja vrste časa, ili
 * dugmetom na stranici Vrste časova. Vraća časove kojima nastavak ne može da se upiše jer instruktor ili
 * učionica u sledećem bloku već imaju drugi čas.
 */
async function obnoviNastavke(
  admin: ReturnType<typeof createAdminClient>,
  termTypeId: string | null
): Promise<{ obradjeno: number; sukobi: { termId: string; datum: string; vreme: string; dete: string }[] }> {
  const danas = danasBeograd();
  const termIds = new Set<string>();
  for (let od = 0; ; od += 1000) {
    let q = admin
      .from('predavanja')
      .select('term_id, term:terms!inner(date, napomena)')
      .gte('term.date', danas)
      .order('id')
      .range(od, od + 999);
    if (termTypeId) q = q.eq('term_type_id', termTypeId);
    const { data, error } = await q;
    if (error) break;
    for (const p of data ?? []) {
      const t = (Array.isArray(p.term) ? p.term[0] : p.term) as { napomena?: string | null } | null;
      if (t?.napomena === AUTO_SPILLOVER_NAPOMENA) continue;
      termIds.add(p.term_id as string);
    }
    if (!data || data.length < 1000) break;
  }
  const sukobi: { termId: string; datum: string; vreme: string; dete: string }[] = [];
  const lista = [...termIds];
  // Po 8 termina odjednom – dovoljno brzo, a ne zatrpava bazu.
  for (let i = 0; i < lista.length; i += 8) {
    const deo = lista.slice(i, i + 8);
    const rezultati = await Promise.all(deo.map(async (termId) => ({ termId, neUpisano: await syncSpilloverForTerm(admin, termId) })));
    for (const r of rezultati) {
      if (r.neUpisano.length === 0) continue;
      const { data: t } = await admin
        .from('terms')
        .select('date, slot_index, predavanja(client:clients(ime, prezime))')
        .eq('id', r.termId)
        .maybeSingle();
      const deca = ((t?.predavanja ?? []) as { client: { ime?: string; prezime?: string } | { ime?: string; prezime?: string }[] | null }[])
        .map((p) => (Array.isArray(p.client) ? p.client[0] : p.client))
        .map((c) => `${c?.ime ?? ''} ${c?.prezime ?? ''}`.trim())
        .filter(Boolean)
        .join(', ');
      sukobi.push({
        termId: r.termId,
        datum: String(t?.date ?? '').slice(0, 10),
        vreme: TIME_SLOTS[(t?.slot_index as number) ?? 0] ?? '',
        dete: deca || '—',
      });
    }
  }
  return { obradjeno: lista.length, sukobi };
}

/** Dugme „Obnovi nastavke dužih časova“ (Vrste časova): svi budući termini. */
export async function obnoviNastavkeAsAdmin(): Promise<{
  error?: string;
  obradjeno?: number;
  sukobi?: { termId: string; datum: string; vreme: string; dete: string }[];
}> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const res = await obnoviNastavke(admin, null);
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard', 'layout');
  if (actor) {
    logActivity(actor, 'term.spillover_repair', `Obnovljeni nastavci dužih časova: ${res.obradjeno} termina, ${res.sukobi.length} bez mesta.`, {
      entityType: 'term',
      metadata: { sukobi: res.sukobi },
    });
  }
  return res;
}

export async function deleteTermTypeAsAdmin(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('term_types').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/vrste-termina');
  return {};
}

export type ProgramRow = { id: string; naziv: string; opis: string | null; sort_order: number | null };

export async function getPrograms(): Promise<ProgramRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('programi').select('id, naziv, opis, sort_order').order('sort_order', { ascending: true, nullsFirst: false }).order('naziv');
  return (data ?? []) as ProgramRow[];
}

/** Novi program ide na kraj liste (max sort_order + 10) osim ako nije eksplicitno zadat redosled. */
export async function createProgramAsAdmin(naziv: string, opis: string | null, sortOrder?: number | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  let effectiveSortOrder = sortOrder ?? null;
  if (effectiveSortOrder == null) {
    const { data: maxRow } = await admin.from('programi').select('sort_order').order('sort_order', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    effectiveSortOrder = (maxRow?.sort_order ?? 0) + 10;
  }
  const { error } = await admin.from('programi').insert({
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
    sort_order: effectiveSortOrder,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/programi');
  return {};
}

export async function updateProgramAsAdmin(id: string, naziv: string, opis: string | null, sortOrder?: number | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const row: { naziv: string; opis: string | null; sort_order?: number | null } = {
    naziv: naziv.trim(),
    opis: opis?.trim() || null,
  };
  if (sortOrder !== undefined) row.sort_order = sortOrder;
  const { error } = await admin.from('programi').update(row).eq('id', id);
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
  const { admin, error: authErr, actor } = await requireAdmin();
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
  if (actor) {
    logActivity(actor, 'client.update', `Izmenjen klijent ${rest.ime} ${rest.prezime}.`, { entityType: 'client', entityId: clientId });
  }
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
  const { admin, error: authErr, actor } = await requireAdmin();
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
  if (actor) {
    logActivity(actor, 'client.create', `Kreiran klijent ${rest.ime} ${rest.prezime}.`, { entityType: 'client', entityId: newClient.id });
  }
  return { clientId: newClient.id };
}

/**
 * Trajno briše klijenta iz sistema (sve veze sa instruktorima, radionice, uplate, zahtevi – CASCADE u bazi).
 * Samo korisnik iz tabele admin_users (super admin u smislu aplikacije).
 */
export async function deleteClientAsAdmin(clientId: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo super admin može da briše klijente.' };

  const trimmedId = clientId?.trim();
  if (!trimmedId) return { error: 'Nedostaje ID klijenta.' };

  const { data: existing, error: fetchErr } = await admin.from('clients').select('id, ime, prezime').eq('id', trimmedId).maybeSingle();
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
  if (actor) {
    logActivity(actor, 'client.delete', `Trajno obrisan klijent ${existing.ime} ${existing.prezime}.`, { entityType: 'client', entityId: trimmedId });
  }
  return {};
}

export type { StanjeVrstaRow } from '@/lib/stanje';


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

  // Posle migracije 049 plaćeno = paketi iz moda „Označi plaćeno“ (po detetu, ne po instruktoru).
  const poPaketima = await getStanjePlacanja(clientIds);
  if (poPaketima) return poPaketima;

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
  const poPaketima = await getStanjePlacanja([clientId]);
  if (poPaketima) return poPaketima.get(clientId) ?? [];

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
  napomena: string | null,
  /** YYYY-MM-DD; prazno ili danas = sada, raniji dan = uplata primljena tog dana. */
  datum: string | null = null
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthedUser();
  if (!user) return { error: 'Niste ulogovani.' };
  const createdAt = createdAtZaDatumUplate(datum);
  if (createdAt.error) return { error: createdAt.error };
  const admin = createAdminClient();
  const [{ data: adminRow }, { data: instructor }] = await Promise.all([
    supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
    admin.from('instructors').select('id, ime, prezime').eq('user_id', user.id).maybeSingle(),
  ]);
  const isAdmin = !!adminRow;
  const isOwnInstructor = instructor?.id === instructorId;
  if (!isAdmin && !isOwnInstructor) return { error: 'Niste ovlašćeni da unesete uplatu za tog instruktora.' };
  const popust = popustPercent != null && Number.isFinite(popustPercent) && popustPercent >= 0 && popustPercent <= 100 ? popustPercent : null;
  const { data: inserted, error } = await admin
    .from('uplate')
    .insert({
      instructor_id: instructorId,
      client_id: clientId,
      iznos: iznos != null && Number.isFinite(iznos) ? iznos : null,
      term_type_id: termTypeId || null,
      broj_casova: Math.max(0, brojCasova),
      popust_percent: popust,
      napomena: napomena?.trim() || null,
      ...(createdAt.value ? { created_at: createdAt.value } : {}),
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/admin/uplate');
  revalidatePath('/admin/uplate/novi');
  revalidatePath('/dashboard/uplate');
  revalidatePath('/dashboard/uplate/novi');
  logActivity(
    {
      id: user.id,
      email: user.email ?? null,
      name: isAdmin ? null : instructor ? `${instructor.ime} ${instructor.prezime}` : null,
      role: isAdmin ? 'admin' : 'instruktor',
    },
    'uplata.create',
    `Uneta uplata (${brojCasova} čas(ova)${iznos != null ? `, ${iznos} din` : ''}).`,
    { entityType: 'uplata', entityId: inserted?.id ?? null, metadata: { instructorId, clientId, iznos, termTypeId, brojCasova, popust } }
  );
  return {};
}

/** Izmena unete uplate (samo admin). Menja broj plaćenih časova klijenta, pa se osvežavaju i kalendar i profil. */
export async function updateUplata(
  id: string,
  instructorId: string,
  clientId: string,
  iznos: number | null,
  termTypeId: string | null,
  brojCasova: number,
  popustPercent: number | null,
  napomena: string | null,
  /** YYYY-MM-DD; menja se samo ako se razlikuje od sačuvanog dana uplate. */
  datum: string | null = null
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (!instructorId || !clientId) return { error: 'Izaberite predavača i klijenta.' };
  const popust = popustPercent != null && Number.isFinite(popustPercent) && popustPercent >= 0 && popustPercent <= 100 ? popustPercent : null;
  const { data: before } = await admin.from('uplate').select('*').eq('id', id).maybeSingle();
  if (!before) return { error: 'Uplata nije pronađena (možda je obrisana).' };
  const datumPromenjen = !!datum && (!before.created_at || datum !== datumBeograd(before.created_at));
  const createdAt = datumPromenjen ? createdAtZaDatumUplate(datum) : {};
  if (createdAt.error) return { error: createdAt.error };
  const { error } = await admin
    .from('uplate')
    .update({
      instructor_id: instructorId,
      client_id: clientId,
      iznos: iznos != null && Number.isFinite(iznos) ? iznos : null,
      term_type_id: termTypeId || null,
      broj_casova: Math.max(0, brojCasova),
      popust_percent: popust,
      napomena: napomena?.trim() || null,
      ...(createdAt.value ? { created_at: createdAt.value } : {}),
    })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/uplate');
  revalidatePath('/dashboard/uplate');
  revalidatePath(`/admin/klijenti/${clientId}`);
  if (before.client_id !== clientId) revalidatePath(`/admin/klijenti/${before.client_id}`);
  if (actor) {
    logActivity(actor, 'uplata.update', `Izmenjena uplata (${brojCasova} čas(ova)${iznos != null ? `, ${iznos} din` : ''}).`, {
      entityType: 'uplata',
      entityId: id,
      metadata: { pre: before, posle: { instructorId, clientId, iznos, termTypeId, brojCasova, popust, napomena } },
    });
  }
  return {};
}

/**
 * Datum uplate iz forme → vrednost za created_at. Danas (ili prazno) → sada; raniji dan → u podne tog
 * dana (beogradsko vreme). Budući datum nije dozvoljen.
 */
function createdAtZaDatumUplate(datum: string | null): { value?: string; error?: string } {
  if (!datum) return {};
  if (!jeIsoDatum(datum)) return { error: 'Neispravan datum uplate.' };
  const danas = danasBeograd();
  if (datum > danas) return { error: 'Datum uplate ne može biti u budućnosti.' };
  return datum === danas ? { value: new Date().toISOString() } : { value: beogradIso(datum, '12:00') };
}

/** Brisanje uplate (samo admin). Ceo red se čuva u dnevniku aktivnosti, da se može ručno vratiti. */
export async function deleteUplata(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { data: before } = await admin.from('uplate').select('*').eq('id', id).maybeSingle();
  if (!before) return { error: 'Uplata nije pronađena (možda je već obrisana).' };
  const { error } = await admin.from('uplate').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/uplate');
  revalidatePath('/dashboard/uplate');
  revalidatePath(`/admin/klijenti/${before.client_id}`);
  if (actor) {
    logActivity(
      actor,
      'uplata.delete',
      `Obrisana uplata (${before.broj_casova} čas(ova)${before.iznos != null ? `, ${before.iznos} din` : ''}).`,
      { entityType: 'uplata', entityId: id, metadata: { obrisano: before } }
    );
  }
  return {};
}

// ─── Potencijalni klijenti (testiranje) ───────────────────────────────────────

export type PotentialClientStatus = 'zakazan' | 'pojavio_se' | 'nije_se_pojavio' | 'prebacen_u_klijenta' | 'otkazan';

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
  /** Datum/vreme testiranja zapamćeni na detetu (migracija 052) – kad više nije vezano za termin. */
  datum_termina?: string | null;
  slot_termina?: number | null;
  /** Testiranje plaćeno (migracija 054). */
  placeno?: boolean | null;
};

/** Označi plaćeno za decu sa testiranja (nisu klijenti, pa nemaju pakete – plaćanje je na detetu). */
export async function postaviPlacenoTestiranjaAsAdmin(izbor: { id: string; placeno: boolean }[]): Promise<{ error?: string; promenjeno: number }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.', promenjeno: 0 };
  if (izbor.length === 0) return { promenjeno: 0 };
  let promenjeno = 0;
  for (const placeno of [true, false]) {
    const ids = izbor.filter((x) => x.placeno === placeno).map((x) => x.id);
    if (ids.length === 0) continue;
    const { error } = await admin.from('potential_clients').update({ placeno }).in('id', ids);
    if (error) {
      return {
        error: /placeno/i.test(error.message)
          ? 'Plaćanje testiranja još nije omogućeno u bazi. Administrator treba da ažurira bazu.'
          : error.message,
        promenjeno,
      };
    }
    promenjeno += ids.length;
  }
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/testiranja');
  if (actor) {
    logActivity(actor, 'potential_client.placeno', `Plaćeno testiranje: ${izbor.filter((x) => x.placeno).length} označeno, ${izbor.filter((x) => !x.placeno).length} skinuto.`, {
      entityType: 'potential_client',
      metadata: { izbor },
    });
  }
  return { promenjeno };
}

/** Trajno briše decu sa testiranja (bez traga) – sa stranice termina ili iz Istorije testiranja.
 * Termin testiranja ostaje i kad ostane prazan (može se dodati drugo dete ili obrisati sam termin). */
export async function obrisiDecuSaTestiranjaAsAdmin(ids: string[]): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  if (ids.length === 0) return {};
  const { data: deca } = await admin.from('potential_clients').select('ime, prezime, term_id').in('id', ids);
  const { error } = await admin.from('potential_clients').delete().in('id', ids);
  if (error) return { error: error.message };
  for (const termId of new Set((deca ?? []).map((d: { term_id: string | null }) => d.term_id).filter(Boolean))) {
    revalidatePath(`/admin/termin/${termId}`);
  }
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/testiranja');
  if (actor) {
    const imena = (deca ?? []).map((d: { ime: string; prezime: string | null }) => `${d.ime}${d.prezime ? ` ${d.prezime}` : ''}`).join(', ');
    logActivity(actor, 'potential_client.delete', `Obrisano sa testiranja: ${imena || ids.length}.`, {
      entityType: 'potential_client',
      metadata: { ids },
    });
  }
  return {};
}

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
  const { admin, error: authErr } = await requireSchedulingAccess();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  if (list.length === 0) return {};
  const { error } = await admin.from('potential_clients').insert(list.map((p) => ({ term_id: termId, ...p })));
  if (error) return { error: error.message };
  revalidatePath(`/admin/termin/${termId}`);
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard');
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
  const { admin, error: authErr, actor } = await requireAdmin();
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
  if (actor) {
    logActivity(actor, 'potential_client.convert', `Prebačen potencijalni klijent ${pc.ime} ${pc.prezime ?? ''} u klijenta.`, {
      entityType: 'client',
      entityId: newClient.id,
      metadata: { potentialClientId: pcId },
    });
  }
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
  /** Zašto je čas otkazan (migracija 059). */
  razlog?: string | null;
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
  // Naplaćen otkazan čas se računa u plaćene časove (059) – menja i „x/6“ na kalendaru.
  revalidatePath('/admin/kalendar');
  return {};
}

/** Razlog otkazivanja (profil deteta). Prazno briše razlog. */
export async function postaviRazlogOtkazivanjaAsAdmin(id: string, razlog: string | null, clientId?: string | null): Promise<{ error?: string; razlog?: string | null }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const cist = ocistiRazlog(razlog);
  const { error } = await admin.from('otkazani_termini').update({ razlog: cist }).eq('id', id);
  if (error) {
    return { error: /razlog/i.test(error.message) ? 'Prvo pokrenite migraciju 059_otkazani_razlog_i_naplata.sql u Supabase SQL Editoru.' : error.message };
  }
  if (clientId) revalidatePath(`/admin/klijenti/${clientId}`);
  revalidatePath('/admin/kalendar');
  return { razlog: cist };
}

/**
 * Mod „Napomena“ na kalendaru: ista napomena za više izabranih termina i časova bez instruktora (naknadno).
 * zameni=false → dopisuje se ispod postojeće; zameni=true → postojeća se zamenjuje (prazno = briše).
 * U rasporedu se napomena ne ispisuje – vidi se u oblačiću (💬 na terminu).
 */
export async function postaviNapomenuAsAdmin(
  termIds: string[],
  zahtevIds: string[],
  napomena: string | null,
  zameni = false
): Promise<{ error?: string; promenjeno: number }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.', promenjeno: 0 };
  const cista = ocistiNapomenu(napomena);
  if (!cista && !zameni) return { error: 'Upišite napomenu.', promenjeno: 0 };
  let promenjeno = 0;

  // Termini (nikad automatski „nastavak dužeg časa“ – njegova napomena je oznaka za aplikaciju).
  const ids = [...new Set(termIds)];
  if (ids.length > 0) {
    const { data: termini, error } = await admin.from('terms').select('id, napomena').in('id', ids);
    if (error) return { error: error.message, promenjeno };
    for (const t of (termini ?? []) as { id: string; napomena: string | null }[]) {
      if (t.napomena === AUTO_SPILLOVER_NAPOMENA) continue;
      const nova = zameni ? cista : spojiNapomene(t.napomena, cista);
      if (nova === (t.napomena ?? null)) continue;
      const { error: upErr } = await admin.from('terms').update({ napomena: nova }).eq('id', t.id);
      if (upErr) return { error: upErr.message, promenjeno };
      promenjeno++;
    }
  }

  const zIds = [...new Set(zahtevIds)];
  if (zIds.length > 0) {
    const { data: zahtevi, error } = await admin.from('zahtevi_za_cas').select('*').in('id', zIds);
    if (error) return { error: error.message, promenjeno };
    for (const z of (zahtevi ?? []) as { id: string; napomena?: string | null }[]) {
      const nova = zameni ? cista : spojiNapomene(z.napomena, cista);
      if (nova === (z.napomena ?? null)) continue;
      const { error: upErr } = await admin.from('zahtevi_za_cas').update({ napomena: nova }).eq('id', z.id);
      if (upErr) {
        return {
          error: /napomena/i.test(upErr.message) ? 'Prvo pokrenite migraciju 060_napomena_casova.sql u Supabase SQL Editoru.' : upErr.message,
          promenjeno,
        };
      }
      promenjeno++;
    }
  }

  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard', 'layout');
  for (const id of ids) revalidatePath(`/admin/termin/${id}`);
  if (actor && promenjeno > 0) {
    logActivity(actor, 'napomena.bulk', `Napomena ${zameni ? 'postavljena' : 'dopisana'} za ${promenjeno} čas(ova).`, {
      entityType: 'term',
      metadata: { termIds: ids, zahtevIds: zIds, napomena: cista, zameni },
    });
  }
  return { promenjeno };
}

/** ✕ uz datum u žutoj traci „termini bez instruktora“: uklanja podsetnik za taj dan (časovi ostaju). */
export async function sakrijPodsetnikBezInstruktoraAsAdmin(datum: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  if (!jeIsoDatum(datum)) return { error: 'Neispravan datum.' };
  const { error } = await admin
    .from('zahtevi_za_cas')
    .update({ podsetnik_skriven: true })
    .eq('status', 'pending')
    .eq('requested_date', datum);
  if (error) {
    return {
      error: /podsetnik_skriven/i.test(error.message)
        ? 'Prvo pokrenite migraciju 055_podsetnik_bez_instruktora.sql u Supabase SQL Editoru.'
        : error.message,
    };
  }
  revalidatePath('/admin/kalendar');
  if (actor) {
    logActivity(actor, 'zahtev.podsetnik_skriven', `Uklonjen podsetnik „bez instruktora“ za ${datum}.`, {
      entityType: 'zahtev',
      metadata: { datum },
    });
  }
  return {};
}

/** Mod „Označi plaćeno“ na kalendaru: otkazani časovi koji su naplaćeni (ili skidanje te oznake). */
export async function postaviPlacenoOtkazanihAsAdmin(izbor: { id: string; placeno: boolean }[]): Promise<{ error?: string; promenjeno: number }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.', promenjeno: 0 };
  if (izbor.length === 0) return { promenjeno: 0 };
  let promenjeno = 0;
  for (const placeno of [true, false]) {
    const ids = izbor.filter((x) => x.placeno === placeno).map((x) => x.id);
    if (ids.length === 0) continue;
    const { error } = await admin.from('otkazani_termini').update({ placeno }).in('id', ids);
    if (error) return { error: error.message, promenjeno };
    promenjeno += ids.length;
  }
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/klijenti', 'layout');
  if (actor) {
    logActivity(actor, 'otkazani.placeno', `Naplaćeno otkazanih: ${izbor.filter((x) => x.placeno).length} označeno, ${izbor.filter((x) => !x.placeno).length} skinuto.`, {
      entityType: 'otkazani_termin',
      metadata: { izbor },
    });
  }
  return { promenjeno };
}

export async function deleteOtkazaniTermin(id: string, clientId?: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { data: origin } = await admin.from('otkazani_termini').select('client_id, term_date, slot_index').eq('id', id).maybeSingle();
  const { error } = await admin.from('otkazani_termini').delete().eq('id', id);
  if (error) return { error: error.message };
  if (origin?.client_id) {
    const cleanupError = await deletePaymentStarts(admin, [{ client_id: origin.client_id, date: origin.term_date, slot_index: origin.slot_index }]);
    if (cleanupError) return { error: cleanupError };
  }
  revalidatePath('/admin/kalendar');
  if (clientId) revalidatePath(`/admin/klijenti/${clientId}`);
  return {};
}

// ── Blokirani termini ────────────────────────────────────────────────────────

export type { BlokiranTermin } from '@/lib/blokade';

/** Blokira izabrane datume+vremena: za SVE (instructorId = null – ceo slot, sve učionice/predavači) ili
 * samo za jednog instruktora (on tada ne može dobiti čas u tom slotu, ostali mogu). Već blokiran slot
 * dobija novu napomenu. Termini koji su već zakazani ostaju – vide se u Admin → Blokirani termini. */
export async function blockSlotsAsAdmin(
  slots: { date: string; slotIndex: number }[],
  napomena: string | null,
  instructorId: string | null = null
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  if (slots.length === 0) return {};
  const note = napomena?.trim() || null;
  const { error } = await upisiBlokade(slots, note, instructorId, actor?.id ?? null);
  if (error) return { error };
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/blokirani');
  revalidatePath('/dashboard');
  if (actor) {
    logActivity(actor, 'slot.block', `Blokirano ${slots.length} termin(a)${instructorId ? ' za jednog instruktora' : ''}${note ? ` – ${note}` : ''}.`, {
      entityType: 'blokiran_termin',
      metadata: { slots, napomena: note, instructorId },
    });
  }
  return {};
}

/** Admin: stalni nedeljni raspored blokada za izabranog instruktora (zamenjuje prethodni). */
export async function sacuvajNedeljneBlokadeAsAdmin(
  instructorId: string,
  polja: { dan: number; slotIndex: number }[],
  napomena: string | null
): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  if (!instructorId) return { error: 'Izaberite instruktora.' };
  const { error } = await sacuvajNedeljneBlokade(instructorId, polja, napomena, actor?.id ?? null);
  if (error) return { error };
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/blokirani');
  revalidatePath('/dashboard');
  if (actor) {
    logActivity(actor, 'slot.weekly_block', `Izmenjene stalne nedeljne blokade instruktora (${polja.length} vremena).`, {
      entityType: 'instruktor',
      entityId: instructorId,
      metadata: { polja, napomena },
    });
  }
  return {};
}

export async function unblockSlotAsAdmin(id: string): Promise<{ error?: string }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { data: row } = await admin.from('blokirani_termini').select('date, slot_index, napomena').eq('id', id).maybeSingle();
  const { error } = await admin.from('blokirani_termini').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/blokirani');
  revalidatePath('/dashboard');
  if (actor && row) {
    logActivity(actor, 'slot.unblock', `Odblokiran termin ${row.date} ${TIME_SLOTS[row.slot_index] ?? `slot ${row.slot_index}`}.`, {
      entityType: 'blokiran_termin',
      entityId: id,
      metadata: row,
    });
  }
  return {};
}

/** Koliko časova pokriva jedna oznaka „plaćeno od ovog časa“ (taj čas + 5 sledećih). */
const CASOVA_U_PAKETU = 6;

export type PlaceniPaket = {
  id: string;
  client_id: string;
  term_type_id: string | null;
  od_datum: string;
  od_slot: number;
  broj_casova: number;
  created_at?: string | null;
};

/**
 * Mod „Označi plaćeno“ na kalendaru: dodaje pakete (od izabranog časa deteta te vrste plaćeno je 6 časova,
 * ili samo taj jedan čas – brojCasova 1) i uklanja izabrane postojeće. Jedini izvor „plaćeno / nije
 * plaćeno“ posle migracije 049.
 */
export async function postaviPlacenePakete(
  dodaj: { clientId: string; termTypeId: string | null; date: string; slotIndex: number; brojCasova?: number }[],
  ukloniIds: string[]
): Promise<{ error?: string; dodato?: number; uklonjeno?: number }> {
  const { admin, error: authErr, actor } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  if (dodaj.some((d) => !jeIsoDatum(d.date) || !Number.isInteger(d.slotIndex) || d.slotIndex < 0 || d.slotIndex >= TIME_SLOTS.length)) {
    return { error: 'Neispravan termin.' };
  }
  if (dodaj.some((d) => d.brojCasova !== undefined && (!Number.isInteger(d.brojCasova) || d.brojCasova < 1 || d.brojCasova > CASOVA_U_PAKETU))) {
    return { error: `Broj plaćenih časova mora biti od 1 do ${CASOVA_U_PAKETU}.` };
  }

  const nedostajeTabela = (msg: string) =>
    /placeni_paketi/.test(msg) && /does not exist|schema cache|not find/i.test(msg)
      ? 'Prvo pokrenite migraciju 049_placeni_paketi.sql u Supabase SQL Editoru.'
      : msg;

  let uklonjeno = 0;
  if (ukloniIds.length > 0) {
    const { data, error } = await admin.from('placeni_paketi').delete().in('id', ukloniIds).select('id');
    if (error) return { error: nedostajeTabela(error.message) };
    uklonjeno = data?.length ?? 0;
  }

  let dodato = 0;
  if (dodaj.length > 0) {
    const redovi = dodaj.map((d) => ({
      client_id: d.clientId,
      term_type_id: d.termTypeId,
      od_datum: d.date,
      od_slot: d.slotIndex,
      broj_casova: d.brojCasova ?? CASOVA_U_PAKETU,
      created_by: actor?.id ?? null,
    }));
    const { data, error } = await admin
      .from('placeni_paketi')
      .upsert(redovi, { onConflict: 'client_id,term_type_id,od_datum,od_slot', ignoreDuplicates: true })
      .select('id');
    if (error) return { error: nedostajeTabela(error.message) };
    dodato = data?.length ?? 0;
  }

  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/klijenti', 'layout');
  revalidatePath('/admin/view', 'layout');
  revalidatePath('/dashboard', 'layout');
  if (actor && (dodato > 0 || uklonjeno > 0)) {
    logActivity(actor, 'placeno.paket', `Označeno plaćeno: ${dodato} novih oznaka (paket od ${CASOVA_U_PAKETU} ili jedan čas), uklonjeno ${uklonjeno}.`, {
      entityType: 'placeni_paket',
      metadata: { dodaj, ukloniIds },
    });
  }
  return { dodato, uklonjeno };
}
