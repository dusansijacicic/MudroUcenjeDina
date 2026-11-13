'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { logActivity, type Actor } from '@/lib/audit';
import { jeIsoDatum } from '@/lib/datum';
import { AUTO_SPILLOVER_NAPOMENA, TIME_SLOTS } from '@/lib/constants';
import { getMaxTerminaPoSlotu } from '@/lib/settings';
import { syncSpilloverForTerm } from '@/app/admin/actions';

/*
 * Časovi bez instruktora (zahtevi na čekanju, narandžasti na kalendaru) u modovima Premesti, Copy i
 * Swap – isto kao pravi termini. Zahtev nema instruktora, pa se pri zameni menjaju samo vreme,
 * učionica i dete (sa vrstom časa).
 */

type Admin = ReturnType<typeof createAdminClient>;

async function requireAdmin() {
  const { user } = await getAuthedUser();
  if (!user) return { error: 'Niste ulogovani.', admin: null, actor: null };
  if (!(await getIsAdmin())) return { error: 'Samo admin.', admin: null, actor: null };
  const actor: Actor = { id: user.id, email: user.email ?? null, name: null, role: 'admin' };
  return { admin: createAdminClient(), error: null, actor };
}

type Zahtev = {
  id: string;
  client_id: string;
  requested_date: string;
  requested_slot_index: number;
  classroom_id: string | null;
  term_type_id: string | null;
};

const NEMA_ZAHTEVA = 'Čas bez instruktora nije pronađen – možda ga je u međuvremenu neko preuzeo. Osvežite kalendar.';

async function ucitajZahtev(admin: Admin, id: string): Promise<Zahtev | null> {
  const { data } = await admin
    .from('zahtevi_za_cas')
    .select('id, client_id, requested_date, requested_slot_index, classroom_id, term_type_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.status !== 'pending') return null;
  return {
    id: data.id as string,
    client_id: data.client_id as string,
    requested_date: String(data.requested_date).slice(0, 10),
    requested_slot_index: data.requested_slot_index as number,
    classroom_id: (data.classroom_id as string | null) ?? null,
    term_type_id: (data.term_type_id as string | null) ?? null,
  };
}

function opisVremena(datum: string, slot: number): string {
  const [, m, d] = datum.split('-');
  return `${Number(d)}.${Number(m)}. ${TIME_SLOTS[slot] ?? ''}`.trim();
}

function ispravnoMesto(datum: string, slot: number): boolean {
  return jeIsoDatum(datum) && Number.isInteger(slot) && slot >= 0 && slot <= 15;
}

/** Blokada za sve instruktore u tom vremenu → poruka; inače null. */
async function blokiranoZaSve(admin: Admin, datum: string, slot: number): Promise<string | null> {
  const { data } = await admin
    .from('blokirani_termini')
    .select('napomena')
    .eq('date', datum)
    .eq('slot_index', slot)
    .is('instructor_id', null)
    .limit(1);
  const b = (data ?? [])[0] as { napomena?: string | null } | undefined;
  if (!b) return null;
  return `Termin ${opisVremena(datum, slot)} je blokiran${b.napomena ? ` (${b.napomena})` : ''}.`;
}

/** Da li dete u to vreme već ima čas (u nekom terminu) ili drugi čas bez instruktora – ne računajući navedene. */
async function deteZauzeto(
  admin: Admin,
  clientId: string,
  datum: string,
  slot: number,
  osim: { termIds?: Iterable<string>; zahtevIds?: Iterable<string> } = {}
): Promise<boolean> {
  const osimTermina = new Set(osim.termIds ?? []);
  const osimZahteva = new Set(osim.zahtevIds ?? []);
  const [{ data: termini }, { data: zahtevi }] = await Promise.all([
    admin.from('terms').select('id, predavanja(client_id)').eq('date', datum).eq('slot_index', slot),
    admin
      .from('zahtevi_za_cas')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .eq('requested_date', datum)
      .eq('requested_slot_index', slot),
  ]);
  const uTerminu = ((termini ?? []) as { id: string; predavanja: { client_id: string }[] | null }[]).some(
    (t) => !osimTermina.has(t.id) && (t.predavanja ?? []).some((p) => p.client_id === clientId)
  );
  return uTerminu || (zahtevi ?? []).some((z) => !osimZahteva.has(z.id as string));
}

function osvezi(termIds: string[] = []) {
  revalidatePath('/admin/kalendar');
  revalidatePath('/dashboard/zahtevi');
  for (const id of termIds) revalidatePath(`/admin/termin/${id}`);
}

/** Premesti (i prevlačenje mišem): čas bez instruktora dobija novi datum/vreme. */
export async function moveZahtevAsAdmin(zahtevId: string, newDate: string, newSlotIndex: number): Promise<{ error?: string }> {
  const { admin, error, actor } = await requireAdmin();
  if (error || !admin) return { error: error ?? 'Niste ovlašćeni.' };
  const datum = String(newDate).slice(0, 10);
  if (!ispravnoMesto(datum, newSlotIndex)) return { error: 'Neispravan datum ili vreme.' };

  const z = await ucitajZahtev(admin, zahtevId);
  if (!z) return { error: NEMA_ZAHTEVA };
  if (z.requested_date === datum && z.requested_slot_index === newSlotIndex) return {};

  const blokada = await blokiranoZaSve(admin, datum, newSlotIndex);
  if (blokada) return { error: blokada };
  if (await deteZauzeto(admin, z.client_id, datum, newSlotIndex, { zahtevIds: [z.id] })) {
    return { error: `Dete već ima čas u to vreme (${opisVremena(datum, newSlotIndex)}).` };
  }

  const { error: updErr } = await admin
    .from('zahtevi_za_cas')
    .update({ requested_date: datum, requested_slot_index: newSlotIndex })
    .eq('id', z.id)
    .eq('status', 'pending');
  if (updErr) return { error: updErr.message };

  osvezi();
  if (actor) {
    logActivity(actor, 'zahtev.move', `Premešten čas bez instruktora na ${opisVremena(datum, newSlotIndex)}.`, {
      entityType: 'zahtev',
      entityId: z.id,
      metadata: { from: { date: z.requested_date, slot: z.requested_slot_index }, to: { date: datum, slot: newSlotIndex } },
    });
  }
  return {};
}

/**
 * Copy: isto dete (i vrsta, i učionica ako je čekirana) u izabrana vremena – svaka kopija je opet čas
 * bez instruktora. termTypeId: undefined = zadrži vrstu originala.
 */
export async function copyZahtevToSlotsAsAdmin(
  zahtevId: string,
  targets: { date: string; slotIndex: number }[],
  opts: { ucionica: boolean },
  termTypeId?: string | null
): Promise<{ failed: { date: string; slotIndex: number; error: string }[] }> {
  const { admin, error, actor } = await requireAdmin();
  if (error || !admin) return { failed: targets.map((t) => ({ ...t, error: error ?? 'Niste ovlašćeni.' })) };
  if (targets.length === 0) return { failed: [] };

  const z = await ucitajZahtev(admin, zahtevId);
  if (!z) return { failed: targets.map((t) => ({ ...t, error: NEMA_ZAHTEVA })) };

  const results = await Promise.all(
    targets.map(async (t) => {
      const datum = String(t.date).slice(0, 10);
      if (!ispravnoMesto(datum, t.slotIndex)) return { ...t, error: 'Neispravan datum ili vreme.' };
      const blokada = await blokiranoZaSve(admin, datum, t.slotIndex);
      if (blokada) return { ...t, error: blokada };
      if (await deteZauzeto(admin, z.client_id, datum, t.slotIndex)) {
        return { ...t, error: 'dete već ima čas u to vreme' };
      }
      const { error: insErr } = await admin.from('zahtevi_za_cas').insert({
        client_id: z.client_id,
        instructor_id: null,
        requested_date: datum,
        requested_slot_index: t.slotIndex,
        term_type_id: termTypeId !== undefined ? termTypeId : z.term_type_id,
        classroom_id: opts.ucionica ? z.classroom_id : null,
        status: 'pending',
      });
      return { ...t, error: insErr ? insErr.message : null };
    })
  );
  const failed = results.filter((r): r is { date: string; slotIndex: number; error: string } => r.error !== null);

  osvezi();
  if (actor) {
    logActivity(actor, 'zahtev.copy', `Kopiran čas bez instruktora na ${targets.length - failed.length}/${targets.length} vremena.`, {
      entityType: 'zahtev',
      entityId: z.id,
      metadata: { targets, opts, termTypeId },
    });
  }
  return { failed };
}

export type StavkaZaZamenu = { vrsta: 'termin' | 'zahtev'; id: string };
type PoljaZamene = { termin: boolean; instruktor: boolean; ucionica: boolean; klijent: boolean };

/**
 * Swap kad je bar jedna strana čas bez instruktora. Termin = datum/vreme, Učionica, Klijent = dete sa
 * vrstom časa. Instruktor se ne menja (zahtev ga nema) – za to je mod Dodeli.
 */
export async function swapSaZahtevomAsAdmin(a: StavkaZaZamenu, b: StavkaZaZamenu, opts: PoljaZamene): Promise<{ error?: string }> {
  const { admin, error, actor } = await requireAdmin();
  if (error || !admin) return { error: error ?? 'Niste ovlašćeni.' };
  if (a.vrsta === 'termin' && b.vrsta === 'termin') return { error: 'Izaberite bar jedan čas bez instruktora.' };
  if (a.vrsta === b.vrsta && a.id === b.id) return { error: 'Izaberite dva različita časa.' };

  const [zStavka, druga] = a.vrsta === 'zahtev' ? [a, b] : [b, a];
  if (opts.instruktor && druga.vrsta === 'termin') {
    return {
      error: 'Čas bez instruktora nema instruktora za zamenu – odčekirajte „Instruktor“. Za dodelu instruktora koristite „Dodeli instruktora“.',
    };
  }
  if (!opts.termin && !opts.ucionica && !opts.klijent) {
    return { error: 'Časovi bez instruktora nemaju instruktora – čekirajte Termin, Učionicu ili Klijenta.' };
  }

  const z = await ucitajZahtev(admin, zStavka.id);
  if (!z) return { error: NEMA_ZAHTEVA };

  const res = druga.vrsta === 'zahtev' ? await zameniDvaZahteva(admin, z, druga.id, opts) : await zameniZahtevITermin(admin, z, druga.id, opts);
  if (res.error) return res;

  osvezi(druga.vrsta === 'termin' ? [druga.id] : []);
  if (actor) {
    const polja = [opts.termin && 'termin', opts.ucionica && 'učionica', opts.klijent && 'klijent'].filter(Boolean).join(', ');
    logActivity(actor, 'zahtev.swap', `Zamena sa časom bez instruktora (${polja}).`, {
      entityType: 'zahtev',
      entityId: z.id,
      metadata: { a, b, opts },
    });
  }
  return {};
}

async function zameniDvaZahteva(admin: Admin, z1: Zahtev, z2Id: string, opts: PoljaZamene): Promise<{ error?: string }> {
  const z2 = await ucitajZahtev(admin, z2Id);
  if (!z2) return { error: NEMA_ZAHTEVA };

  const nov = (ovaj: Zahtev, drugi: Zahtev) => ({
    requested_date: opts.termin ? drugi.requested_date : ovaj.requested_date,
    requested_slot_index: opts.termin ? drugi.requested_slot_index : ovaj.requested_slot_index,
    classroom_id: opts.ucionica ? drugi.classroom_id : ovaj.classroom_id,
    client_id: opts.klijent ? drugi.client_id : ovaj.client_id,
    term_type_id: opts.klijent ? drugi.term_type_id : ovaj.term_type_id,
  });
  const novi1 = nov(z1, z2);
  const novi2 = nov(z2, z1);

  for (const [stari, novi] of [
    [z1, novi1],
    [z2, novi2],
  ] as const) {
    const menjaSe =
      novi.client_id !== stari.client_id ||
      novi.requested_date !== stari.requested_date ||
      novi.requested_slot_index !== stari.requested_slot_index;
    if (!menjaSe) continue;
    if (novi.requested_date !== stari.requested_date || novi.requested_slot_index !== stari.requested_slot_index) {
      const blokada = await blokiranoZaSve(admin, novi.requested_date, novi.requested_slot_index);
      if (blokada) return { error: blokada };
    }
    if (await deteZauzeto(admin, novi.client_id, novi.requested_date, novi.requested_slot_index, { zahtevIds: [z1.id, z2.id] })) {
      return { error: `Dete već ima čas u to vreme (${opisVremena(novi.requested_date, novi.requested_slot_index)}).` };
    }
  }

  const { error: e1 } = await admin.from('zahtevi_za_cas').update(novi1).eq('id', z1.id).eq('status', 'pending');
  if (e1) return { error: e1.message };
  const { error: e2 } = await admin.from('zahtevi_za_cas').update(novi2).eq('id', z2.id).eq('status', 'pending');
  if (e2) {
    await admin
      .from('zahtevi_za_cas')
      .update({
        requested_date: z1.requested_date,
        requested_slot_index: z1.requested_slot_index,
        classroom_id: z1.classroom_id,
        client_id: z1.client_id,
        term_type_id: z1.term_type_id,
      })
      .eq('id', z1.id);
    return { error: e2.message };
  }
  return {};
}

type TerminZaZamenu = {
  id: string;
  instructor_id: string;
  classroom_id: string | null;
  date: string;
  slot_index: number;
  napomena: string | null;
  nastavak_of_term_id: string | null;
  predavanja: { id: string; client_id: string; term_type_id: string | null; odrzano: boolean | null }[] | null;
};

async function zameniZahtevITermin(admin: Admin, z: Zahtev, termId: string, opts: PoljaZamene): Promise<{ error?: string }> {
  const { data } = await admin
    .from('terms')
    .select('id, instructor_id, classroom_id, date, slot_index, napomena, nastavak_of_term_id, predavanja(id, client_id, term_type_id, odrzano)')
    .eq('id', termId)
    .maybeSingle();
  const t = data as TerminZaZamenu | null;
  if (!t) return { error: 'Termin nije pronađen.' };
  const preds = t.predavanja ?? [];
  if (t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA && preds.length === 0) {
    return { error: 'Automatski blok (nastavak dužeg časa) nije moguće menjati – izaberite pravi termin.' };
  }
  const tDatum = String(t.date).slice(0, 10);

  const pred = opts.klijent ? (preds.length === 1 ? preds[0] : null) : null;
  if (opts.klijent && !pred) return { error: 'Zamena klijenta je moguća samo kada termin ima tačno jedno dete (individualni čas).' };
  if (pred?.odrzano) return { error: 'Čas u terminu je već održan – dete se ne menja.' };

  const tNovo = {
    date: opts.termin ? z.requested_date : tDatum,
    slot_index: opts.termin ? z.requested_slot_index : t.slot_index,
    classroom_id: opts.ucionica ? z.classroom_id : t.classroom_id,
  };
  const zNovo = {
    requested_date: opts.termin ? tDatum : z.requested_date,
    requested_slot_index: opts.termin ? t.slot_index : z.requested_slot_index,
    classroom_id: opts.ucionica ? t.classroom_id : z.classroom_id,
    client_id: pred ? pred.client_id : z.client_id,
    term_type_id: pred ? pred.term_type_id : z.term_type_id,
  };
  const terminSeSeli = tNovo.date !== tDatum || tNovo.slot_index !== t.slot_index;
  const terminSeMenja = terminSeSeli || tNovo.classroom_id !== t.classroom_id;

  // Automatski nastavci ovog termina (duži čas) se ne računaju kao sudar – sklanjaju se i prave ponovo.
  const { data: nastavciRaw } = await admin.from('terms').select('id').eq('nastavak_of_term_id', t.id).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
  const nastavci = (nastavciRaw ?? []).map((n) => n.id as string);
  const svoji = new Set([t.id, ...nastavci]);

  if (terminSeMenja) {
    const { data: uCilju } = await admin.from('terms').select('id, instructor_id, classroom_id').eq('date', tNovo.date).eq('slot_index', tNovo.slot_index);
    const drugi = (uCilju ?? []).filter((x) => !svoji.has(x.id as string));
    if (terminSeSeli) {
      const max = await getMaxTerminaPoSlotu();
      if (drugi.length >= max) return { error: `U vremenu ${opisVremena(tNovo.date, tNovo.slot_index)} je već ${max} termina (maksimum).` };
      if (drugi.some((x) => x.instructor_id === t.instructor_id)) return { error: 'Instruktor je već zauzet u tom terminu.' };
    }
    if (tNovo.classroom_id && drugi.some((x) => x.classroom_id === tNovo.classroom_id)) {
      return { error: 'Učionica je već zauzeta u tom terminu.' };
    }
  }

  // Niko ne sme da dobije dva časa u isto vreme.
  const osim = { termIds: svoji, zahtevIds: [z.id] };
  const decaTermina = pred ? [z.client_id] : preds.map((p) => p.client_id);
  if (terminSeSeli || pred) {
    for (const clientId of decaTermina) {
      if (await deteZauzeto(admin, clientId, tNovo.date, tNovo.slot_index, osim)) {
        return { error: `Dete već ima čas u vreme ${opisVremena(tNovo.date, tNovo.slot_index)}.` };
      }
    }
  }
  const zahtevSeSeli = zNovo.requested_date !== z.requested_date || zNovo.requested_slot_index !== z.requested_slot_index;
  if (zahtevSeSeli) {
    const blokada = await blokiranoZaSve(admin, zNovo.requested_date, zNovo.requested_slot_index);
    if (blokada) return { error: blokada };
  }
  if (zahtevSeSeli || pred) {
    if (await deteZauzeto(admin, zNovo.client_id, zNovo.requested_date, zNovo.requested_slot_index, osim)) {
      return { error: `Dete već ima čas u vreme ${opisVremena(zNovo.requested_date, zNovo.requested_slot_index)}.` };
    }
  }

  // Upis: termin → dete u terminu → zahtev; ako nešto ne uspe, prethodno se vraća.
  const vratiTermin = async () => {
    if (terminSeMenja) {
      await admin.from('terms').update({ date: tDatum, slot_index: t.slot_index, classroom_id: t.classroom_id }).eq('id', t.id);
    }
    await syncSpilloverForTerm(admin, t.id);
  };
  if (terminSeMenja) {
    if (nastavci.length > 0) await admin.from('terms').delete().in('id', nastavci);
    const { error: tErr } = await admin.from('terms').update(tNovo).eq('id', t.id);
    if (tErr) {
      await syncSpilloverForTerm(admin, t.id);
      return { error: tErr.message };
    }
  }
  if (pred) {
    const { error: pErr } = await admin
      .from('predavanja')
      .update({ client_id: z.client_id, term_type_id: z.term_type_id, placeno: false, komentar: null })
      .eq('id', pred.id);
    if (pErr) {
      await vratiTermin();
      return { error: pErr.message };
    }
    // Novo dete i instruktor – kao pri dodavanju deteta u termin (veza već može postojati).
    await admin.from('instructor_clients').insert({ instructor_id: t.instructor_id, client_id: z.client_id, placeno_casova: 0 });
  }
  const { error: zErr } = await admin.from('zahtevi_za_cas').update(zNovo).eq('id', z.id).eq('status', 'pending');
  if (zErr) {
    if (pred) await admin.from('predavanja').update({ client_id: pred.client_id, term_type_id: pred.term_type_id }).eq('id', pred.id);
    await vratiTermin();
    return { error: zErr.message };
  }
  // Duži čas (nova vrsta ili novo mesto) zauzima i sledeće vreme.
  await syncSpilloverForTerm(admin, t.id);
  return {};
}
