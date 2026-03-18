'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { INSTRUCTOR_COLORS } from '@/lib/constants';

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
    return { error: 'Profil predavača: ' + (insertError.message || insertError.code || 'nepoznata greška.') };
  }

  console.log('[admin] createInstructor: success', email);
  revalidatePath('/admin');
  return { success: true };
}

export async function createTermAsAdmin(instructorId: string, date: string, slotIndex: number): Promise<{ termId?: string; instructorId?: string; error?: string }> {
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
  if (!admin) return { error: 'Samo admin može da zakazuje termine za predavače.' };

  const slot = Math.min(12, Math.max(0, slotIndex));
  const dateStr = date.slice(0, 10);
  const adminSupabase = createAdminClient();

  const { data: existing } = await adminSupabase
    .from('terms')
    .select('id')
    .eq('instructor_id', instructorId)
    .eq('date', dateStr)
    .eq('slot_index', slot)
    .single();

  if (existing) {
    return { termId: existing.id, instructorId };
  }

  const { data: inserted, error } = await adminSupabase
    .from('terms')
    .insert({ instructor_id: instructorId, date: dateStr, slot_index: slot })
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

export async function deletePredavanjeAsAdmin(predavanjeId: string, termId: string): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Niste ovlašćeni.' };
  const { error } = await admin.from('predavanja').delete().eq('id', predavanjeId);
  if (error) return { error: error.message };
  revalidatePath('/admin/kalendar');
  revalidatePath(`/admin/termin/${termId}`);
  return {};
}

export type TermTypeRow = { id: string; naziv: string; opis: string | null };

export async function getTermTypes(): Promise<TermTypeRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('term_types').select('id, naziv, opis').order('naziv');
  return (data ?? []) as TermTypeRow[];
}

export async function createTermTypeAsAdmin(naziv: string, opis: string | null): Promise<{ error?: string }> {
  const { admin, error: authErr } = await requireAdmin();
  if (authErr || !admin) return { error: authErr ?? 'Samo admin.' };
  const { error } = await admin.from('term_types').insert({ naziv: naziv.trim(), opis: opis?.trim() || null });
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
