'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser } from '@/lib/auth';
import { getDashboardInstructor } from '@/lib/dashboard';
import { logActivity, type Actor } from '@/lib/audit';
import { sacuvajNedeljneBlokade, upisiBlokade } from '@/lib/blokade';

/** Predavač (ili admin koji ga gleda) – blokade se uvek odnose samo na TOG predavača. */
async function trenutniPredavac(): Promise<{ instructorId: string; actor: Actor } | { error: string }> {
  const [{ user }, { instructor }] = await Promise.all([getAuthedUser(), getDashboardInstructor()]);
  if (!user) return { error: 'Niste ulogovani.' };
  if (!instructor) return { error: 'Niste instruktor.' };
  return {
    instructorId: instructor.id,
    actor: { id: user.id, email: user.email ?? null, name: `${instructor.ime} ${instructor.prezime}`, role: 'instruktor' },
  };
}

function osvezi() {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/blokade');
  revalidatePath('/admin/kalendar');
  revalidatePath('/admin/blokirani');
}

/** Blokira izabrana vremena za konkretne datume – samo za sebe. */
export async function blokirajMojaVremena(
  slots: { date: string; slotIndex: number }[],
  napomena: string | null
): Promise<{ error?: string }> {
  const ja = await trenutniPredavac();
  if ('error' in ja) return { error: ja.error };
  const { error } = await upisiBlokade(slots, napomena, ja.instructorId, ja.actor.id);
  if (error) return { error };
  osvezi();
  logActivity(ja.actor, 'slot.block_self', `Instruktor blokirao ${slots.length} svoja vremena${napomena ? ` – ${napomena}` : ''}.`, {
    entityType: 'blokiran_termin',
    metadata: { slots, napomena },
  });
  return {};
}

/** Uklanja SVOJU blokadu za datum (tuđe i blokade "za sve" ne može). */
export async function ukloniMojuBlokadu(id: string): Promise<{ error?: string }> {
  const ja = await trenutniPredavac();
  if ('error' in ja) return { error: ja.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from('blokirani_termini').select('*').eq('id', id).maybeSingle();
  if (!row || row.instructor_id !== ja.instructorId) return { error: 'Možete ukloniti samo svoju blokadu.' };
  const { error } = await admin.from('blokirani_termini').delete().eq('id', id);
  if (error) return { error: error.message };
  osvezi();
  logActivity(ja.actor, 'slot.unblock_self', `Instruktor uklonio svoju blokadu ${row.date}.`, {
    entityType: 'blokiran_termin',
    entityId: id,
    metadata: row,
  });
  return {};
}

/** Stalni nedeljni raspored: kada predavač NE radi (svake nedelje, dok ne promeni). */
export async function sacuvajMojNedeljniRaspored(
  polja: { dan: number; slotIndex: number }[],
  napomena: string | null
): Promise<{ error?: string }> {
  const ja = await trenutniPredavac();
  if ('error' in ja) return { error: ja.error };
  const { error } = await sacuvajNedeljneBlokade(ja.instructorId, polja, napomena, ja.actor.id);
  if (error) return { error };
  osvezi();
  logActivity(ja.actor, 'slot.weekly_block_self', `Instruktor izmenio stalni nedeljni raspored (${polja.length} vremena kada ne radi).`, {
    entityType: 'instruktor',
    entityId: ja.instructorId,
    metadata: { polja, napomena },
  });
  return {};
}
