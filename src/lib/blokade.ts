import { createAdminClient } from '@/lib/supabase/admin';

/** Blokada vremena: instructor_id = null → važi za SVE (ceo slot zatvoren); inače samo za tog instruktora. */
export type BlokiranTermin = {
  id: string;
  date: string;
  slot_index: number;
  napomena: string | null;
  instructor_id: string | null;
  /** Ime instruktora za prikaz (popunjava stranica koja ima listu instruktora). */
  instructor_naziv?: string | null;
  /** Izvedeno iz stalne nedeljne blokade instruktora (ne briše se za jedan dan). */
  nedeljna?: boolean;
};

/** Red iz baze → BlokiranTermin. Radi i pre migracije 048 (tada kolone nema = blokada za sve). */
export function mapBlokada(r: Record<string, unknown>): BlokiranTermin {
  return {
    id: String(r.id),
    date: String(r.date).slice(0, 10),
    slot_index: Number(r.slot_index),
    napomena: (r.napomena as string | null) ?? null,
    instructor_id: (r.instructor_id as string | null | undefined) ?? null,
  };
}

/**
 * Upisuje blokade za izabrane slotove – za sve (instructorId = null) ili za jednog instruktora.
 * Već postojeća ista blokada samo dobija novu napomenu. Bez upsert-a, jer jedinstvenost posle 048
 * čuvaju delimični indeksi (posebno "za sve", posebno po instruktoru), a pre 048 stari UNIQUE.
 */
export async function upisiBlokade(
  slots: { date: string; slotIndex: number }[],
  napomena: string | null,
  instructorId: string | null,
  createdBy: string | null
): Promise<{ error?: string }> {
  if (slots.length === 0) return {};
  const admin = createAdminClient();
  const note = napomena?.trim() || null;
  const trazeni = slots.map((s) => ({ date: s.date.slice(0, 10), slot_index: s.slotIndex }));
  const dates = [...new Set(trazeni.map((s) => s.date))];

  const { data, error: selErr } = await admin.from('blokirani_termini').select('*').in('date', dates);
  if (selErr) return { error: selErr.message };
  const postojece = (data ?? []).map(mapBlokada);
  const ista = (b: BlokiranTermin, s: { date: string; slot_index: number }) =>
    b.date === s.date && b.slot_index === s.slot_index && b.instructor_id === instructorId;

  const zaIzmenu = postojece.filter((b) => trazeni.some((s) => ista(b, s)));
  const nove = trazeni.filter((s) => !postojece.some((b) => ista(b, s)));

  if (zaIzmenu.length > 0) {
    const { error } = await admin.from('blokirani_termini').update({ napomena: note }).in('id', zaIzmenu.map((b) => b.id));
    if (error) return { error: error.message };
  }
  if (nove.length > 0) {
    const { error } = await admin.from('blokirani_termini').insert(
      nove.map((s) => ({
        ...s,
        napomena: note,
        created_by: createdBy,
        ...(instructorId ? { instructor_id: instructorId } : {}),
      }))
    );
    if (error) {
      if (instructorId && error.message.includes('instructor_id')) {
        return { error: 'Blokada samo za jednog instruktora traži migraciju 048_blokade_po_instruktoru.sql – pokrenite je u Supabase SQL Editoru.' };
      }
      return { error: error.message };
    }
  }
  return {};
}

// ── Stalne nedeljne blokade instruktora (migracija 048) ───────────────────────

/** "Ne radim utorkom u 9:00" – važi svake nedelje dok se ne ukloni. dan: 1 = ponedeljak … 7 = nedelja. */
export type NedeljnaBlokada = { id: string; instructor_id: string; dan: number; slot_index: number; napomena: string | null };

export const DANI_U_NEDELJI = ['Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota', 'Nedelja'] as const;

/** Dan u nedelji datuma (YYYY-MM-DD): 1 = ponedeljak … 7 = nedelja. */
export function danUNedelji(date: string): number {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mapNedeljna(r: Record<string, unknown>): NedeljnaBlokada {
  return {
    id: String(r.id),
    instructor_id: String(r.instructor_id),
    dan: Number(r.dan),
    slot_index: Number(r.slot_index),
    napomena: (r.napomena as string | null) ?? null,
  };
}

/**
 * Nedeljne blokade razvijene u blokade po datumu za opseg [from, to] – za prikaz u kalendaru uz
 * blokade za konkretan datum. id je izveden ("n:<id>:<datum>"), a nedeljna = true (ne briše se
 * dugmetom Odblokiraj na jednom danu, nego u nedeljnom rasporedu instruktora).
 */
export function nedeljneUDatume(nedeljne: NedeljnaBlokada[], from: string, to: string): BlokiranTermin[] {
  const out: BlokiranTermin[] = [];
  if (nedeljne.length === 0) return out;
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const dan = danUNedelji(date);
    for (const n of nedeljne) {
      if (n.dan !== dan) continue;
      out.push({ id: `n:${n.id}:${date}`, date, slot_index: n.slot_index, napomena: n.napomena, instructor_id: n.instructor_id, nedeljna: true });
    }
  }
  return out;
}

/**
 * Zamenjuje ceo nedeljni raspored blokada jednog instruktora izabranim poljima (dan + vreme).
 * Polja koja ostaju zadržavaju svoju napomenu; nova dobijaju datu napomenu.
 */
export async function sacuvajNedeljneBlokade(
  instructorId: string,
  polja: { dan: number; slotIndex: number }[],
  napomena: string | null,
  createdBy: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data, error: selErr } = await admin.from('instruktor_nedeljne_blokade').select('*').eq('instructor_id', instructorId);
  if (selErr) {
    return { error: selErr.message.includes('instruktor_nedeljne_blokade') ? 'Nedeljne blokade traže migraciju 048_blokade_po_instruktoru.sql – pokrenite je u Supabase SQL Editoru.' : selErr.message };
  }
  const postojece = (data ?? []).map(mapNedeljna);
  const kljuc = (dan: number, slot: number) => `${dan}|${slot}`;
  const zeljena = new Set(polja.filter((p) => p.dan >= 1 && p.dan <= 7 && p.slotIndex >= 0 && p.slotIndex <= 15).map((p) => kljuc(p.dan, p.slotIndex)));
  const zaBrisanje = postojece.filter((n) => !zeljena.has(kljuc(n.dan, n.slot_index)));
  const vec = new Set(postojece.map((n) => kljuc(n.dan, n.slot_index)));
  const nova = [...zeljena].filter((k) => !vec.has(k));

  if (zaBrisanje.length > 0) {
    const { error } = await admin.from('instruktor_nedeljne_blokade').delete().in('id', zaBrisanje.map((n) => n.id));
    if (error) return { error: error.message };
  }
  if (nova.length > 0) {
    const { error } = await admin.from('instruktor_nedeljne_blokade').insert(
      nova.map((k) => {
        const [dan, slot] = k.split('|').map(Number);
        return { instructor_id: instructorId, dan, slot_index: slot, napomena: napomena?.trim() || null, created_by: createdBy };
      })
    );
    if (error) return { error: error.message };
  }
  return {};
}

/** Podaci za „Kada ne radi“ jednog instruktora: stalni nedeljni raspored i blokade od danas nadalje. */
export async function ucitajBlokadeInstruktora(instructorId: string, odDatuma: string): Promise<{
  nedeljne: NedeljnaBlokada[];
  blokade: BlokiranTermin[];
  migracijaPokrenuta: boolean;
}> {
  const admin = createAdminClient();
  const [nedeljneRes, blokadeRes] = await Promise.all([
    admin.from('instruktor_nedeljne_blokade').select('*').eq('instructor_id', instructorId),
    admin.from('blokirani_termini').select('*').eq('instructor_id', instructorId).gte('date', odDatuma).order('date'),
  ]);
  // Pre migracije 048 tabela/kolona ne postoje → oba upita vraćaju grešku.
  const migracijaPokrenuta = !nedeljneRes.error && !blokadeRes.error;
  return {
    nedeljne: (nedeljneRes.data ?? []).map(mapNedeljna),
    blokade: (blokadeRes.data ?? []).map(mapBlokada),
    migracijaPokrenuta,
  };
}
