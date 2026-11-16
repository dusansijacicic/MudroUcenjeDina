'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { logActivity, type Actor } from '@/lib/audit';
import { jeIsoDatum } from '@/lib/datum';
import { AUTO_SPILLOVER_NAPOMENA, slotsNeeded } from '@/lib/constants';
import { getMaxTerminaPoSlotu } from '@/lib/settings';
import { syncSpilloverForTerm } from '@/app/admin/actions';
import {
  deteZauzeto,
  instruktorSlobodanZaNastavak,
  opisVremena,
  proveriMestoZahteva,
  trajanjeVrste,
  ucionicaRezervisana,
} from '@/lib/zauzetost-zahteva';

/*
 * Časovi bez instruktora (zahtevi na čekanju, narandžasti na kalendaru) u modovima Premesti, Copy i
 * Swap – isto kao pravi termini. Duži čas bez instruktora zauzima i sledeće vreme (za svoje dete i
 * svoju učionicu), pa se i to proverava.
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

function ispravnoMesto(datum: string, slot: number): boolean {
  return jeIsoDatum(datum) && Number.isInteger(slot) && slot >= 0 && slot <= 15;
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

  const greska = await proveriMestoZahteva(
    admin,
    { clientId: z.client_id, classroomId: z.classroom_id, termTypeId: z.term_type_id, datum, slot: newSlotIndex, seli: true },
    { zahtevIds: [z.id] }
  );
  if (greska) return { error: greska };

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
  const vrsta = termTypeId !== undefined ? termTypeId : z.term_type_id;
  const ucionica = opts.ucionica ? z.classroom_id : null;

  // Redom, ne paralelno: dve kopije jedna do druge ne smeju da se preklope (duži čas).
  const failed: { date: string; slotIndex: number; error: string }[] = [];
  let uneto = 0;
  for (const t of [...targets].sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex)) {
    const datum = String(t.date).slice(0, 10);
    if (!ispravnoMesto(datum, t.slotIndex)) {
      failed.push({ ...t, error: 'Neispravan datum ili vreme.' });
      continue;
    }
    const greska = await proveriMestoZahteva(
      admin,
      { clientId: z.client_id, classroomId: ucionica, termTypeId: vrsta, datum, slot: t.slotIndex, seli: true },
      {}
    );
    if (greska) {
      failed.push({ ...t, error: greska });
      continue;
    }
    const { error: insErr } = await admin.from('zahtevi_za_cas').insert({
      client_id: z.client_id,
      instructor_id: null,
      requested_date: datum,
      requested_slot_index: t.slotIndex,
      term_type_id: vrsta,
      classroom_id: ucionica,
      status: 'pending',
    });
    if (insErr) failed.push({ ...t, error: insErr.message });
    else uneto++;
  }

  osvezi();
  if (actor) {
    logActivity(actor, 'zahtev.copy', `Kopiran čas bez instruktora na ${uneto}/${targets.length} vremena.`, {
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
 * Swap kad je bar jedna strana čas bez instruktora. Termin = datum/vreme, Učionica, Klijent = deca sa
 * vrstom časa, Instruktor = ko ima instruktora (časovi bez instruktora ga dobijaju, a deca iz termina
 * postaju časovi bez instruktora).
 */
export async function swapSaZahtevomAsAdmin(a: StavkaZaZamenu, b: StavkaZaZamenu, opts: PoljaZamene): Promise<{ error?: string }> {
  const { admin, error, actor } = await requireAdmin();
  if (error || !admin) return { error: error ?? 'Niste ovlašćeni.' };
  if (a.vrsta === 'termin' && b.vrsta === 'termin') return { error: 'Izaberite bar jedan čas bez instruktora.' };
  if (a.vrsta === b.vrsta && a.id === b.id) return { error: 'Izaberite dva različita časa.' };

  const [zStavka, druga] = a.vrsta === 'zahtev' ? [a, b] : [b, a];
  if (druga.vrsta === 'zahtev' && !opts.termin && !opts.ucionica && !opts.klijent) {
    return { error: 'Časovi bez instruktora nemaju instruktora – čekirajte Termin, Učionicu ili Klijenta.' };
  }
  if (!opts.termin && !opts.ucionica && !opts.klijent && !opts.instruktor) return { error: 'Čekirajte šta se menja.' };

  const z = await ucitajZahtev(admin, zStavka.id);
  if (!z) return { error: NEMA_ZAHTEVA };

  const res = druga.vrsta === 'zahtev' ? await zameniDvaZahteva(admin, z, druga.id, opts) : await zameniZahtevITermin(admin, z, druga.id, opts);
  if (res.error) return res;

  osvezi(druga.vrsta === 'termin' ? [druga.id] : []);
  if (actor) {
    const polja = [opts.termin && 'termin', opts.instruktor && 'instruktor', opts.ucionica && 'učionica', opts.klijent && 'klijent']
      .filter(Boolean)
      .join(', ');
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

  const istoVreme = novi1.requested_date === novi2.requested_date && novi1.requested_slot_index === novi2.requested_slot_index;
  if (istoVreme && novi1.classroom_id && novi1.classroom_id === novi2.classroom_id) {
    return { error: 'Oba časa bi imala istu učionicu u isto vreme.' };
  }

  for (const [stari, novi] of [
    [z1, novi1],
    [z2, novi2],
  ] as const) {
    const seli = novi.requested_date !== stari.requested_date || novi.requested_slot_index !== stari.requested_slot_index;
    const menjaSe = seli || novi.client_id !== stari.client_id || novi.classroom_id !== stari.classroom_id || novi.term_type_id !== stari.term_type_id;
    if (!menjaSe) continue;
    const greska = await proveriMestoZahteva(
      admin,
      {
        clientId: novi.client_id,
        classroomId: novi.classroom_id,
        termTypeId: novi.term_type_id,
        datum: novi.requested_date,
        slot: novi.requested_slot_index,
        seli,
      },
      { zahtevIds: [z1.id, z2.id] }
    );
    if (greska) return { error: greska };
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

type Pred = {
  id: string;
  term_id: string;
  client_id: string;
  term_type_id: string | null;
  odrzano: boolean | null;
  placeno: boolean | null;
  komentar: string | null;
  term_type: { trajanje_minuta?: number | null } | { trajanje_minuta?: number | null }[] | null;
};

type TerminZaZamenu = {
  id: string;
  instructor_id: string;
  classroom_id: string | null;
  date: string;
  slot_index: number;
  napomena: string | null;
  nastavak_of_term_id: string | null;
  term_category: { is_testing?: boolean } | { is_testing?: boolean }[] | null;
  predavanja: Pred[] | null;
  potential_clients: { id: string }[] | null;
};

function trajanjePred(p: Pred): number | null {
  const tt = Array.isArray(p.term_type) ? p.term_type[0] : p.term_type;
  return tt?.trajanje_minuta ?? null;
}

/**
 * Zahtev Z ↔ termin T. Posle zamene jedna strana ima instruktora T (ostaje red u terms), druga je
 * čas(ovi) bez instruktora (redovi u zahtevi_za_cas):
 *  – strana Z: vreme Z (ili T ako Termin), učionica Z (ili T ako Učionica), dete Z (ili deca T ako Klijent)
 *  – strana T: obrnuto
 *  – Instruktor određuje koja strana zadržava instruktora (bez njega strana T, sa njim strana Z).
 */
async function zameniZahtevITermin(admin: Admin, z: Zahtev, termId: string, opts: PoljaZamene): Promise<{ error?: string }> {
  const { data } = await admin
    .from('terms')
    .select(
      'id, instructor_id, classroom_id, date, slot_index, napomena, nastavak_of_term_id, term_category:term_categories(is_testing), predavanja(id, term_id, client_id, term_type_id, odrzano, placeno, komentar, term_type:term_types(trajanje_minuta)), potential_clients(id)'
    )
    .eq('id', termId)
    .maybeSingle();
  const t = data as TerminZaZamenu | null;
  if (!t) return { error: 'Termin nije pronađen.' };
  const preds = t.predavanja ?? [];
  if (t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA && preds.length === 0) {
    return { error: 'Automatski blok (nastavak dužeg časa) nije moguće menjati – izaberite pravi termin.' };
  }
  const kat = Array.isArray(t.term_category) ? t.term_category[0] : t.term_category;
  const testiranje = kat?.is_testing === true || (t.potential_clients ?? []).length > 0;
  // Da li deca termina i dete zahteva menjaju stranu (Klijent i Instruktor zajedno = deca ostaju).
  const deluSeDeca = opts.klijent !== opts.instruktor;
  if (testiranje && deluSeDeca) {
    return {
      error:
        'Deca sa testiranja nisu klijenti i ne mogu da čekaju bez instruktora – sa testiranjem se ovde menjaju Termin i Učionica (ili Klijent i Instruktor zajedno).',
    };
  }
  if (deluSeDeca && preds.length === 0) return { error: 'U terminu nema dece za zamenu.' };
  if (deluSeDeca && preds.some((p) => p.odrzano)) return { error: 'Čas u terminu je već održan – deca se ne menjaju.' };

  const tDatum = String(t.date).slice(0, 10);
  const stranaZ = {
    datum: opts.termin ? tDatum : z.requested_date,
    slot: opts.termin ? t.slot_index : z.requested_slot_index,
    soba: opts.ucionica ? t.classroom_id : z.classroom_id,
  };
  const stranaT = {
    datum: opts.termin ? z.requested_date : tDatum,
    slot: opts.termin ? z.requested_slot_index : t.slot_index,
    soba: opts.ucionica ? z.classroom_id : t.classroom_id,
  };
  // Strana sa instruktorom (red termina) i strana bez njega (zahtevi).
  const uTermin = opts.instruktor ? stranaZ : stranaT;
  const uZahtev = opts.instruktor ? stranaT : stranaZ;
  // Deca u terminu posle zamene: ista (deluSeDeca=false) ili dete zahteva.
  const decaZahteva = deluSeDeca
    ? preds.map((p) => ({ clientId: p.client_id, termTypeId: p.term_type_id }))
    : [{ clientId: z.client_id, termTypeId: z.term_type_id }];
  const novaDecaTermina = deluSeDeca ? [z.client_id] : preds.map((p) => p.client_id);

  if (uTermin.datum === uZahtev.datum && uTermin.slot === uZahtev.slot) {
    if (uTermin.soba && uTermin.soba === uZahtev.soba) return { error: 'Termin i čas bez instruktora bi imali istu učionicu u isto vreme.' };
    if (decaZahteva.some((d) => novaDecaTermina.includes(d.clientId))) return { error: 'Isto dete bi imalo dva časa u isto vreme.' };
  }

  const terminSeSeli = uTermin.datum !== tDatum || uTermin.slot !== t.slot_index;
  const terminSeMenja = terminSeSeli || uTermin.soba !== t.classroom_id;
  const { data: nastavciRaw } = await admin.from('terms').select('id').eq('nastavak_of_term_id', t.id).eq('napomena', AUTO_SPILLOVER_NAPOMENA);
  const nastavci = (nastavciRaw ?? []).map((n) => n.id as string);
  const svoji = new Set([t.id, ...nastavci]);
  const osim = { termIds: svoji, zahtevIds: [z.id] };

  // Termin na novom mestu / sa novom decom.
  const slotovaTermina = deluSeDeca
    ? slotsNeeded(await trajanjeVrste(admin, z.term_type_id))
    : Math.max(1, ...preds.map((p) => slotsNeeded(trajanjePred(p))));
  if (terminSeMenja) {
    const { data: uCilju } = await admin.from('terms').select('id, instructor_id, classroom_id').eq('date', uTermin.datum).eq('slot_index', uTermin.slot);
    const drugi = (uCilju ?? []).filter((x) => !svoji.has(x.id as string));
    if (terminSeSeli) {
      const max = await getMaxTerminaPoSlotu();
      if (drugi.length >= max) return { error: `U vremenu ${opisVremena(uTermin.datum, uTermin.slot)} je već ${max} termina (maksimum).` };
      if (drugi.some((x) => x.instructor_id === t.instructor_id)) return { error: 'Instruktor je već zauzet u tom terminu.' };
    }
    if (uTermin.soba) {
      if (drugi.some((x) => x.classroom_id === uTermin.soba)) return { error: 'Učionica je već zauzeta u tom terminu.' };
      const rez = await ucionicaRezervisana(admin, uTermin.datum, uTermin.slot, uTermin.soba, [z.id]);
      if (rez) return { error: rez };
    }
  }
  if (terminSeSeli || deluSeDeca) {
    const nastavakGreska = await instruktorSlobodanZaNastavak(admin, t.instructor_id, uTermin.datum, uTermin.slot, slotovaTermina, svoji);
    if (nastavakGreska) return { error: nastavakGreska };
    for (const clientId of novaDecaTermina) {
      for (let i = 0; i < slotovaTermina && uTermin.slot + i <= 15; i++) {
        if (await deteZauzeto(admin, clientId, uTermin.datum, uTermin.slot + i, osim)) {
          return { error: `Dete već ima čas u ${opisVremena(uTermin.datum, uTermin.slot + i)}.` };
        }
      }
    }
  }

  // Časovi bez instruktora na svom (novom) mestu.
  const zahtevSeSeli = uZahtev.datum !== z.requested_date || uZahtev.slot !== z.requested_slot_index;
  if (zahtevSeSeli || deluSeDeca || uZahtev.soba !== z.classroom_id) {
    for (const d of decaZahteva) {
      const greska = await proveriMestoZahteva(
        admin,
        { clientId: d.clientId, classroomId: uZahtev.soba, termTypeId: d.termTypeId, datum: uZahtev.datum, slot: uZahtev.slot, seli: zahtevSeSeli },
        osim
      );
      if (greska) return { error: greska };
    }
  }

  // Upis: termin → deca u terminu → zahtevi; ako nešto ne uspe, prethodno se vraća.
  const vratiTermin = async () => {
    if (terminSeMenja) {
      await admin.from('terms').update({ date: tDatum, slot_index: t.slot_index, classroom_id: t.classroom_id }).eq('id', t.id);
    }
    await syncSpilloverForTerm(admin, t.id);
  };
  if (nastavci.length > 0 && (terminSeMenja || deluSeDeca)) await admin.from('terms').delete().in('id', nastavci);
  if (terminSeMenja) {
    const { error: tErr } = await admin
      .from('terms')
      .update({ date: uTermin.datum, slot_index: uTermin.slot, classroom_id: uTermin.soba })
      .eq('id', t.id);
    if (tErr) {
      await syncSpilloverForTerm(admin, t.id);
      return { error: tErr.message };
    }
  }

  // Deca termina: jedno dete se menja na istom redu (čuva se red), grupa se zamenjuje jednim detetom.
  let vratiDecu = async () => {};
  if (deluSeDeca) {
    if (preds.length === 1) {
      const p = preds[0];
      const { error: pErr } = await admin
        .from('predavanja')
        .update({ client_id: z.client_id, term_type_id: z.term_type_id, placeno: false, komentar: null })
        .eq('id', p.id);
      if (pErr) {
        await vratiTermin();
        return { error: pErr.message };
      }
      vratiDecu = async () => {
        await admin.from('predavanja').update({ client_id: p.client_id, term_type_id: p.term_type_id, placeno: p.placeno, komentar: p.komentar }).eq('id', p.id);
      };
    } else {
      const { error: delErr } = await admin.from('predavanja').delete().in('id', preds.map((p) => p.id));
      if (delErr) {
        await vratiTermin();
        return { error: delErr.message };
      }
      const stari = preds.map((p) => ({
        id: p.id,
        term_id: p.term_id,
        client_id: p.client_id,
        term_type_id: p.term_type_id,
        odrzano: p.odrzano ?? false,
        placeno: p.placeno ?? false,
        komentar: p.komentar,
      }));
      vratiDecu = async () => {
        await admin.from('predavanja').delete().eq('term_id', t.id).eq('client_id', z.client_id);
        await admin.from('predavanja').insert(stari);
      };
      const { error: insErr } = await admin
        .from('predavanja')
        .insert({ term_id: t.id, client_id: z.client_id, odrzano: false, placeno: false, term_type_id: z.term_type_id });
      if (insErr) {
        await vratiDecu();
        await vratiTermin();
        return { error: insErr.message };
      }
    }
    // Novo dete i instruktor – kao pri dodavanju deteta u termin (veza već može postojati).
    await admin.from('instructor_clients').insert({ instructor_id: t.instructor_id, client_id: z.client_id, placeno_casova: 0 });
  }

  // Zahtevi: red Z se zadržava (za prvo dete), ostala deca grupe dobijaju nove redove.
  const [prvo, ...ostala] = decaZahteva;
  const { error: zErr } = await admin
    .from('zahtevi_za_cas')
    .update({
      requested_date: uZahtev.datum,
      requested_slot_index: uZahtev.slot,
      classroom_id: uZahtev.soba,
      client_id: prvo.clientId,
      term_type_id: prvo.termTypeId,
    })
    .eq('id', z.id)
    .eq('status', 'pending');
  if (zErr) {
    await vratiDecu();
    await vratiTermin();
    return { error: zErr.message };
  }
  if (ostala.length > 0) {
    const { error: insZErr } = await admin.from('zahtevi_za_cas').insert(
      ostala.map((d) => ({
        client_id: d.clientId,
        instructor_id: null,
        requested_date: uZahtev.datum,
        requested_slot_index: uZahtev.slot,
        classroom_id: uZahtev.soba,
        term_type_id: d.termTypeId,
        status: 'pending',
      }))
    );
    if (insZErr) {
      await admin
        .from('zahtevi_za_cas')
        .update({
          requested_date: z.requested_date,
          requested_slot_index: z.requested_slot_index,
          classroom_id: z.classroom_id,
          client_id: z.client_id,
          term_type_id: z.term_type_id,
        })
        .eq('id', z.id);
      await vratiDecu();
      await vratiTermin();
      return { error: insZErr.message };
    }
  }

  // Duži čas (nova vrsta ili novo mesto) zauzima i sledeće vreme.
  await syncSpilloverForTerm(admin, t.id);
  return {};
}
