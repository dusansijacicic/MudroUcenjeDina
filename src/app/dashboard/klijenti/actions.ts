'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { revalidatePath } from 'next/cache';

type ClientPayload = {
  ime: string;
  prezime: string;
  godiste: number | null;
  razred: string | null;
  skola: string | null;
  roditelj: string | null;
  kontakt_telefon: string | null;
  login_email: string | null;
};

/**
 * @param linkInstructorId – Predavač kojem se klijent veže (iz stranice / forme). Admin može bilo kog; predavač samo sebe.
 */
export async function createClientAsInstructor(
  payload: ClientPayload,
  placeno_casova: number,
  linkInstructorId: string
): Promise<{ error?: string; clientId?: string }> {
  console.log('[klijenti] createClientAsInstructor', payload.ime, payload.prezime, linkInstructorId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[klijenti] createAdminClient failed', e);
    return { error: 'Server greška.' };
  }

  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();

  let effectiveInstructorId: string;
  if (adminRow) {
    const { data: inst, error: instErr } = await admin.from('instructors').select('id').eq('id', linkInstructorId).maybeSingle();
    if (instErr || !inst) {
      return { error: 'Izabrani predavač nije pronađen.' };
    }
    effectiveInstructorId = linkInstructorId;
  } else {
    const { instructor } = await getDashboardInstructor();
    if (!instructor || instructor.id !== linkInstructorId) {
      return { error: 'Niste ovlašćeni da dodate klijenta za ovog predavača.' };
    }
    effectiveInstructorId = instructor.id;
  }

  const { data: newClient, error: insertErr } = await admin
    .from('clients')
    .insert(payload)
    .select('id')
    .single();
  if (insertErr || !newClient) {
    console.error('[klijenti] clients insert', insertErr?.message);
    return { error: insertErr?.message ?? 'Klijent nije kreiran.' };
  }
  // Veza predavač–klijent: bilo koji klijent može kasnije dobiti bilo kog predavača u terminu.
  // Ovde odmah dodeljujemo ovog predavača da klijent uđe u "Moji klijenti" (paket = placeno_casova).
  const { error: linkErr } = await admin.from('instructor_clients').insert({
    instructor_id: effectiveInstructorId,
    client_id: newClient.id,
    placeno_casova: Math.max(0, placeno_casova),
  });
  if (linkErr && linkErr.code !== '23505') {
    console.error('[klijenti] instructor_clients insert', linkErr.message);
    return { error: linkErr.message };
  }
  revalidatePath('/dashboard/klijenti');
  revalidatePath('/dashboard');
  revalidatePath('/admin/klijenti');
  revalidatePath(`/admin/view/${effectiveInstructorId}/klijenti`);
  return { clientId: newClient.id };
}

/** Ažurira samo podatke klijenta (ime, prezime, itd.). Stanje časova (koliko kojih ima na raspolaganju) vodi se kroz Evidenciju uplata. */
export async function updateClientAsInstructor(
  clientId: string,
  payload: ClientPayload
): Promise<{ error?: string }> {
  console.log('[klijenti] updateClientAsInstructor', clientId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[klijenti] createAdminClient failed', e);
    return { error: 'Server greška.' };
  }

  const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();

  if (!adminRow) {
    const { instructor } = await getDashboardInstructor();
    if (!instructor) return { error: 'Niste predavač.' };
    const { data: link } = await admin
      .from('instructor_clients')
      .select('client_id')
      .eq('instructor_id', instructor.id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (!link) return { error: 'Niste ovlašćeni da menjate ovog klijenta.' };
  }

  const { error: updateErr } = await admin.from('clients').update(payload).eq('id', clientId);
  if (updateErr) {
    console.error('[klijenti] clients update', updateErr.message);
    return { error: updateErr.message };
  }
  revalidatePath('/dashboard/klijenti');
  revalidatePath(`/dashboard/klijenti/${clientId}`);
  revalidatePath('/admin/klijenti');
  return {};
}
