'use server';

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

export async function createClientAsInstructor(payload: ClientPayload, placeno_casova: number): Promise<{ error?: string; clientId?: string }> {
  console.log('[klijenti] createClientAsInstructor', payload.ime, payload.prezime);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[klijenti] createAdminClient failed', e);
    return { error: 'Server greška.' };
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
    instructor_id: instructor.id,
    client_id: newClient.id,
    placeno_casova: Math.max(0, placeno_casova),
  });
  if (linkErr && linkErr.code !== '23505') {
    console.error('[klijenti] instructor_clients insert', linkErr.message);
    return { error: linkErr.message };
  }
  revalidatePath('/dashboard/klijenti');
  revalidatePath('/dashboard');
  return { clientId: newClient.id };
}

export async function updateClientAsInstructor(
  clientId: string,
  payload: ClientPayload,
  placeno_casova: number
): Promise<{ error?: string }> {
  console.log('[klijenti] updateClientAsInstructor', clientId);
  const { instructor } = await getDashboardInstructor();
  if (!instructor) return { error: 'Niste predavač.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[klijenti] createAdminClient failed', e);
    return { error: 'Server greška.' };
  }
  const { error: updateErr } = await admin.from('clients').update(payload).eq('id', clientId);
  if (updateErr) {
    console.error('[klijenti] clients update', updateErr.message);
    return { error: updateErr.message };
  }
  const { error: linkErr } = await admin
    .from('instructor_clients')
    .update({ placeno_casova: Math.max(0, placeno_casova) })
    .eq('instructor_id', instructor.id)
    .eq('client_id', clientId);
  if (linkErr) {
    console.error('[klijenti] instructor_clients update', linkErr.message);
    return { error: linkErr.message };
  }
  revalidatePath('/dashboard/klijenti');
  revalidatePath(`/dashboard/klijenti/${clientId}`);
  return {};
}
