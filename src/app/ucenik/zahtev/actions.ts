'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function createZahtevAsClient(
  clientId: string,
  instructorId: string | null,
  requestedDate: string,
  requestedSlotIndex: number
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Niste ulogovani.' };
  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('id').eq('user_id', user.id).single();
  if (!client || client.id !== clientId) return { error: 'Niste ovlašćeni.' };
  const { error } = await admin.from('zahtevi_za_cas').insert({
    client_id: clientId,
    instructor_id: instructorId,
    requested_date: requestedDate.slice(0, 10),
    requested_slot_index: Math.min(12, Math.max(0, requestedSlotIndex)),
    status: 'pending',
  });
  if (error) return { error: error.message };
  revalidatePath('/ucenik');
  revalidatePath('/dashboard/zahtevi');
  return {};
}

export async function getOccupiedSlotsServer(pDate: string): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('get_occupied_slots', { p_date: pDate.slice(0, 10) });
  return (data ?? []) as number[];
}

export async function getInstructorAvailableSlotsServer(
  instructorId: string,
  pDate: string
): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('get_instructor_available_slots', {
    p_instructor_id: instructorId,
    p_date: pDate.slice(0, 10),
  });
  return (data ?? []) as number[];
}
