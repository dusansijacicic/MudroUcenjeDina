import type { createAdminClient } from '@/lib/supabase/admin';
import { slotsNeeded, TIME_SLOTS } from '@/lib/constants';
import { danUNedelji } from '@/lib/blokade';

/*
 * Čas bez instruktora (zahtev na čekanju) zauzima svoje vreme i – ako je vrsta duža od 45 min – i
 * sledeće vreme („Nastavak dužeg časa“), isto kao pravi termin: za svoje dete i za svoju učionicu.
 * Pravi termin to radi preko automatskog nastavka u bazi; zahtev nema red u terms, pa se ovde računa.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Koliko vremena unazad se gleda da li neki duži čas još traje (vrsta do 4,5 h). */
const UNAZAD = 6;

export function opisVremena(datum: string, slot: number): string {
  const [, m, d] = datum.split('-');
  return `${Number(d)}.${Number(m)}. ${TIME_SLOTS[slot] ?? ''}`.trim();
}

function jedan<T>(v: T | T[] | null | undefined): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export type ZahtevUVremenu = { id: string; clientId: string; classroomId: string | null; ime: string; odSlota: number; slotova: number };

/** Zahtevi na čekanju koji zauzimaju dato vreme – svojim početkom ili nastavkom dužeg časa. */
export async function zahteviUVremenu(admin: Admin, datum: string, slot: number): Promise<ZahtevUVremenu[]> {
  const { data } = await admin
    .from('zahtevi_za_cas')
    .select('id, client_id, classroom_id, requested_slot_index, term_type:term_types(trajanje_minuta), client:clients(ime, prezime)')
    .eq('status', 'pending')
    .eq('requested_date', datum)
    .gte('requested_slot_index', Math.max(0, slot - UNAZAD))
    .lte('requested_slot_index', slot);
  const lista: ZahtevUVremenu[] = [];
  for (const z of data ?? []) {
    const tt = jedan(z.term_type as { trajanje_minuta?: number | null } | { trajanje_minuta?: number | null }[] | null);
    const slotova = slotsNeeded(tt?.trajanje_minuta);
    const od = z.requested_slot_index as number;
    if (od + slotova - 1 < slot) continue;
    const c = jedan(z.client as { ime?: string; prezime?: string | null } | { ime?: string; prezime?: string | null }[] | null);
    lista.push({
      id: z.id as string,
      clientId: z.client_id as string,
      classroomId: (z.classroom_id as string | null) ?? null,
      ime: `${c?.ime ?? ''}${c?.prezime ? ` ${c.prezime}` : ''}`.trim() || 'dete',
      odSlota: od,
      slotova,
    });
  }
  return lista;
}

/** Učionica je u to vreme rezervisana za čas bez instruktora → poruka; inače null. */
export async function ucionicaRezervisana(
  admin: Admin,
  datum: string,
  slot: number,
  classroomId: string | null | undefined,
  osimZahteva: Iterable<string> = []
): Promise<string | null> {
  if (!classroomId) return null;
  const osim = new Set(osimZahteva);
  const z = (await zahteviUVremenu(admin, datum, slot)).find((x) => x.classroomId === classroomId && !osim.has(x.id));
  if (!z) return null;
  return `Učionica je u ${opisVremena(datum, slot)} rezervisana za čas bez instruktora (${z.ime}${z.odSlota < slot ? ', nastavak dužeg časa' : ''}).`;
}

/** Učionice rezervisane za časove bez instruktora u tom vremenu (za izbor u formi). */
export async function rezervisaneUcionice(admin: Admin, datum: string, slot: number): Promise<string[]> {
  return [...new Set((await zahteviUVremenu(admin, datum, slot)).map((z) => z.classroomId).filter((id): id is string => !!id))];
}

/** Dete u to vreme ima čas bez instruktora (ili njegov nastavak) → poruka; inače null. */
export async function deteImaZahtev(
  admin: Admin,
  clientId: string,
  datum: string,
  slot: number,
  osimZahteva: Iterable<string> = []
): Promise<string | null> {
  const osim = new Set(osimZahteva);
  const z = (await zahteviUVremenu(admin, datum, slot)).find((x) => x.clientId === clientId && !osim.has(x.id));
  if (!z) return null;
  return `${z.ime} u ${opisVremena(datum, slot)} već ima čas bez instruktora${z.odSlota < slot ? ' (nastavak dužeg časa)' : ''}.`;
}

/**
 * Da li dete u to vreme već ima čas – u nekom terminu (i nastavku dužeg termina) ili bez instruktora –
 * ne računajući navedene termine i zahteve.
 */
export async function deteZauzeto(
  admin: Admin,
  clientId: string,
  datum: string,
  slot: number,
  osim: { termIds?: Iterable<string>; zahtevIds?: Iterable<string> } = {}
): Promise<boolean> {
  const osimTermina = new Set(osim.termIds ?? []);
  const [{ data: termini }, zahtevPoruka] = await Promise.all([
    admin
      .from('terms')
      .select('id, slot_index, predavanja(client_id, term_type:term_types(trajanje_minuta))')
      .eq('date', datum)
      .gte('slot_index', Math.max(0, slot - UNAZAD))
      .lte('slot_index', slot),
    deteImaZahtev(admin, clientId, datum, slot, osim.zahtevIds ?? []),
  ]);
  if (zahtevPoruka) return true;
  type P = { client_id: string; term_type: { trajanje_minuta?: number | null } | { trajanje_minuta?: number | null }[] | null };
  for (const t of (termini ?? []) as { id: string; slot_index: number; predavanja: P[] | null }[]) {
    if (osimTermina.has(t.id)) continue;
    const preds = t.predavanja ?? [];
    if (!preds.some((p) => p.client_id === clientId)) continue;
    // Termin traje koliko njegov najduži čas (isto kao automatski nastavak u bazi).
    const slotova = Math.max(1, ...preds.map((p) => slotsNeeded(jedan(p.term_type)?.trajanje_minuta)));
    if (t.slot_index + slotova - 1 >= slot) return true;
  }
  return false;
}

/** Trajanje vrste časa u minutima (null = bez vrste / nepoznato). */
export async function trajanjeVrste(admin: Admin, termTypeId: string | null | undefined): Promise<number | null> {
  if (!termTypeId) return null;
  const { data } = await admin.from('term_types').select('trajanje_minuta').eq('id', termTypeId).maybeSingle();
  return (data?.trajanje_minuta as number | null | undefined) ?? null;
}

/**
 * Duži čas sa instruktorom zauzima i sledeća vremena – instruktor mora tada biti slobodan i ne sme biti
 * blokiran (inače se nastavak ne može upisati i niko ne bi video da je zauzet). Vraća poruku ili null.
 */
export async function instruktorSlobodanZaNastavak(
  admin: Admin,
  instructorId: string,
  datum: string,
  odSlota: number,
  slotova: number,
  osimTermina: Iterable<string> = []
): Promise<string | null> {
  if (slotova <= 1) return null;
  const nastavci: number[] = [];
  for (let i = 1; i < slotova && odSlota + i <= 15; i++) nastavci.push(odSlota + i);
  if (nastavci.length === 0) return null;
  const osim = new Set(osimTermina);
  const [{ data: termini }, { data: blokade }, { data: nedeljne }] = await Promise.all([
    admin.from('terms').select('id, slot_index, nastavak_of_term_id').eq('instructor_id', instructorId).eq('date', datum).in('slot_index', nastavci),
    admin.from('blokirani_termini').select('*').eq('date', datum).in('slot_index', nastavci),
    admin.from('instruktor_nedeljne_blokade').select('slot_index').eq('instructor_id', instructorId).eq('dan', danUNedelji(datum)).in('slot_index', nastavci),
  ]);
  const zauzet = (termini ?? []).find((t) => !osim.has(t.id as string) && !osim.has((t.nastavak_of_term_id as string | null) ?? ''));
  if (zauzet) {
    return `Čas traje duže, a instruktor u ${opisVremena(datum, zauzet.slot_index as number)} već ima drugi termin.`;
  }
  const blok = (blokade ?? []).find((b) => !b.instructor_id || b.instructor_id === instructorId);
  if (blok) return `Čas traje duže, a ${opisVremena(datum, blok.slot_index as number)} je blokirano.`;
  const ned = (nedeljne ?? [])[0];
  if (ned) return `Čas traje duže, a instruktor u ${opisVremena(datum, ned.slot_index as number)} ne radi (stalna nedeljna blokada).`;
  return null;
}

/** Blokada za sve instruktore u tom vremenu → poruka; inače null. */
export async function blokiranoZaSve(admin: Admin, datum: string, slot: number): Promise<string | null> {
  const { data } = await admin.from('blokirani_termini').select('*').eq('date', datum).eq('slot_index', slot);
  const b = ((data ?? []) as { instructor_id?: string | null; napomena?: string | null }[]).find((x) => !x.instructor_id);
  if (!b) return null;
  return `Termin ${opisVremena(datum, slot)} je blokiran${b.napomena ? ` (${b.napomena})` : ''}.`;
}

export type Osim = { termIds?: Iterable<string>; zahtevIds?: Iterable<string> };

/**
 * Može li čas bez instruktora (dete, vrsta, učionica) da stoji u ovo vreme – kroz celo trajanje:
 * vreme nije blokirano (kad se seli), dete tada nema drugi čas, učionica nije zauzeta ni rezervisana.
 */
export async function proveriMestoZahteva(
  admin: Admin,
  m: { clientId: string; classroomId: string | null; termTypeId: string | null; datum: string; slot: number; seli: boolean },
  osim: Osim
): Promise<string | null> {
  const slotova = slotsNeeded(await trajanjeVrste(admin, m.termTypeId));
  const osimTermina = new Set(osim.termIds ?? []);
  const osimZahteva = [...(osim.zahtevIds ?? [])];
  for (let i = 0; i < slotova && m.slot + i <= 15; i++) {
    const s = m.slot + i;
    const nastavak = i > 0 ? ' (nastavak dužeg časa)' : '';
    if (m.seli) {
      const blokada = await blokiranoZaSve(admin, m.datum, s);
      if (blokada) return blokada;
    }
    if (await deteZauzeto(admin, m.clientId, m.datum, s, { termIds: osimTermina, zahtevIds: osimZahteva })) {
      return `Dete već ima čas u ${opisVremena(m.datum, s)}${nastavak}.`;
    }
    if (m.classroomId) {
      const { data: uSobi } = await admin.from('terms').select('id').eq('date', m.datum).eq('slot_index', s).eq('classroom_id', m.classroomId);
      if ((uSobi ?? []).some((t) => !osimTermina.has(t.id as string))) return `Učionica je zauzeta u ${opisVremena(m.datum, s)}${nastavak}.`;
      const rez = await ucionicaRezervisana(admin, m.datum, s, m.classroomId, osimZahteva);
      if (rez) return rez;
    }
  }
  return null;
}
