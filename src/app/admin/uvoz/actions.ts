'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { logActivity, type Actor } from '@/lib/audit';
import { jeIsoDatum } from '@/lib/datum';
import { createBulkTermsAsAdmin } from '@/app/admin/actions';

async function requireAdmin() {
  const { user } = await getAuthedUser();
  if (!user) return { error: 'Niste ulogovani.', admin: null, actor: null };
  if (!(await getIsAdmin())) return { error: 'Samo admin.', admin: null, actor: null };
  const actor: Actor = { id: user.id, email: user.email ?? null, name: null, role: 'admin' };
  return { admin: createAdminClient(), error: null, actor };
}

/** "clientId|datum|slot" za časove i zahteve na čekanju koje ova deca već imaju u tim danima. */
async function postojeciKljucevi(
  admin: ReturnType<typeof createAdminClient>,
  clientIds: string[],
  datumi: string[]
): Promise<Set<string>> {
  const kljucevi = new Set<string>();
  if (clientIds.length === 0 || datumi.length === 0) return kljucevi;
  const deca = new Set(clientIds);
  const [{ data: termini }, { data: zahtevi }] = await Promise.all([
    admin.from('terms').select('date, slot_index, predavanja(client_id)').in('date', datumi).range(0, 9999),
    admin
      .from('zahtevi_za_cas')
      .select('client_id, requested_date, requested_slot_index')
      .eq('status', 'pending')
      .in('client_id', clientIds)
      .in('requested_date', datumi),
  ]);
  for (const t of (termini ?? []) as { date: string; slot_index: number; predavanja: { client_id: string }[] | null }[]) {
    for (const p of t.predavanja ?? []) {
      if (deca.has(p.client_id)) kljucevi.add(`${p.client_id}|${t.date}|${t.slot_index}`);
    }
  }
  for (const z of (zahtevi ?? []) as { client_id: string; requested_date: string; requested_slot_index: number }[]) {
    kljucevi.add(`${z.client_id}|${String(z.requested_date).slice(0, 10)}|${z.requested_slot_index}`);
  }
  return kljucevi;
}

/** Probni prolaz: koji od termina iz spiska već postoje u kalendaru (da se ne uvezu dvaput). */
export async function postojeciTerminiZaUvoz(clientIds: string[], datumi: string[]): Promise<{ kljucevi: string[]; error?: string }> {
  const { admin, error } = await requireAdmin();
  if (error || !admin) return { kljucevi: [], error: error ?? 'Niste ovlašćeni.' };
  const dobriDatumi = [...new Set(datumi)].filter(jeIsoDatum);
  return { kljucevi: [...(await postojeciKljucevi(admin, [...new Set(clientIds)], dobriDatumi))] };
}

export type UvozStavka = {
  kljuc: string;
  clientId: string;
  datum: string;
  slot: number;
  termTypeId: string | null;
  instructorId: string | null;
  classroomId: string | null;
};

export type UvozRezultat = { kljuc: string; status: 'uneto' | 'postoji' | 'greska'; poruka?: string };

/**
 * Upis uvezenog rasporeda. Bez instruktora → zahtevi na čekanju (narandžasti na kalendaru, instruktor se
 * dodeljuje modom Dodeli); sa instruktorom → pravi termini (isto kao "Zakaži više časova"). Termin koji
 * dete već ima u to vreme (čas ili zahtev) se preskače, pa ponovljen uvoz ne pravi duplikate.
 * imena: koje ime sa papira je koje dete – pamti se za sledeći uvoz (migracija 053; bez nje se preskače).
 */
export async function uveziRasporedAsAdmin(
  stavke: UvozStavka[],
  imena: { imeKljuc: string; clientId: string }[]
): Promise<{ rezultati: UvozRezultat[]; error?: string }> {
  const { admin, error, actor } = await requireAdmin();
  if (error || !admin) return { rezultati: [], error: error ?? 'Niste ovlašćeni.' };
  if (stavke.length > 2000) return { rezultati: [], error: 'Previše termina odjednom (najviše 2000).' };

  const rezultati: UvozRezultat[] = [];
  const ispravne = stavke.filter((s) => {
    const ok = !!s.clientId && jeIsoDatum(s.datum) && Number.isInteger(s.slot) && s.slot >= 0 && s.slot <= 15;
    if (!ok) rezultati.push({ kljuc: s.kljuc, status: 'greska', poruka: 'Neispravan datum, vreme ili dete.' });
    return ok;
  });

  const postoji = await postojeciKljucevi(
    admin,
    [...new Set(ispravne.map((s) => s.clientId))],
    [...new Set(ispravne.map((s) => s.datum))]
  );
  const zaUpis: UvozStavka[] = [];
  for (const s of ispravne) {
    const k = `${s.clientId}|${s.datum}|${s.slot}`;
    if (postoji.has(k)) {
      rezultati.push({ kljuc: s.kljuc, status: 'postoji', poruka: 'Dete već ima čas u to vreme.' });
      continue;
    }
    postoji.add(k); // isto dete dvaput u istom vremenu u spisku – drugo se preskače
    zaUpis.push(s);
  }

  // Bez instruktora: svi zahtevi jednim upisom.
  const zahtevi = zaUpis.filter((s) => !s.instructorId);
  if (zahtevi.length > 0) {
    const { error: insErr } = await admin.from('zahtevi_za_cas').insert(
      zahtevi.map((s) => ({
        client_id: s.clientId,
        instructor_id: null,
        classroom_id: s.classroomId,
        requested_date: s.datum,
        requested_slot_index: s.slot,
        term_type_id: s.termTypeId,
        status: 'pending',
      }))
    );
    for (const s of zahtevi) {
      rezultati.push(insErr ? { kljuc: s.kljuc, status: 'greska', poruka: insErr.message } : { kljuc: s.kljuc, status: 'uneto' });
    }
  }

  // Sa instruktorom: po grupama (dete + instruktor + učionica + vrsta) kroz postojeće masovno zakazivanje.
  const grupe = new Map<string, UvozStavka[]>();
  for (const s of zaUpis.filter((x) => x.instructorId)) {
    const g = `${s.clientId}|${s.instructorId}|${s.classroomId ?? ''}|${s.termTypeId ?? ''}`;
    grupe.set(g, [...(grupe.get(g) ?? []), s]);
  }
  for (const lista of grupe.values()) {
    const prva = lista[0];
    const { failed } = await createBulkTermsAsAdmin(
      [prva.clientId],
      prva.instructorId as string,
      prva.classroomId,
      prva.termTypeId,
      lista.map((s) => ({ date: s.datum, slotIndex: s.slot }))
    );
    const greske = new Map(failed.map((f) => [`${f.date}|${f.slotIndex}`, f.error]));
    for (const s of lista) {
      const poruka = greske.get(`${s.datum}|${s.slot}`);
      rezultati.push(poruka ? { kljuc: s.kljuc, status: 'greska', poruka } : { kljuc: s.kljuc, status: 'uneto' });
    }
  }

  // Zapamti ko je ko (bez migracije 053 upis tiho ne uspe).
  const zaPamcenje = imena.filter((i) => i.imeKljuc && i.clientId);
  if (zaPamcenje.length > 0) {
    await admin.from('uvoz_imena').upsert(
      zaPamcenje.map((i) => ({ ime_sa_papira: i.imeKljuc, client_id: i.clientId, updated_at: new Date().toISOString() })),
      { onConflict: 'ime_sa_papira' }
    );
  }

  const uneto = rezultati.filter((r) => r.status === 'uneto').length;
  if (uneto > 0) {
    revalidatePath('/admin/kalendar');
    revalidatePath('/dashboard/zahtevi');
    revalidatePath('/admin/klijenti', 'layout');
  }
  if (actor) {
    logActivity(actor, 'raspored.uvoz', `Uvoz rasporeda: uneto ${uneto}/${stavke.length} termina.`, {
      metadata: {
        uneto,
        postoji: rezultati.filter((r) => r.status === 'postoji').length,
        greske: rezultati.filter((r) => r.status === 'greska').length,
      },
    });
  }
  return { rezultati };
}
