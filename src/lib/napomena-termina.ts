import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

/** Napomena časa: prazno → null, najviše 500 znakova, bez praznih redova na krajevima. */
export function ocistiNapomenu(napomena: string | null | undefined): string | null {
  const n = (napomena ?? '').replace(/\r\n/g, '\n').trim().slice(0, 500);
  return n || null;
}

/** Spaja postojeću napomenu termina sa novom (nova ide u novi red; ista se ne ponavlja). */
export function spojiNapomene(stara: string | null | undefined, nova: string | null | undefined): string | null {
  const n = ocistiNapomenu(nova);
  const s = ocistiNapomenu(stara);
  if (!n) return s;
  if (!s) return n;
  if (s.includes(n)) return s;
  return `${s}\n${n}`.slice(0, 1000);
}

/**
 * Dopiše napomenu u termin (npr. kad čas bez instruktora sa napomenom dobije instruktora, ili kad se
 * više časova zakazuje u već postojeći termin). Ne dira automatske nastavke dužih časova.
 */
export async function dodajNapomenuTerminu(admin: Admin, termId: string, napomena: string | null | undefined): Promise<void> {
  const n = ocistiNapomenu(napomena);
  if (!n) return;
  const { data } = await admin.from('terms').select('napomena').eq('id', termId).maybeSingle();
  const spojeno = spojiNapomene((data as { napomena?: string | null } | null)?.napomena, n);
  if (spojeno !== ((data as { napomena?: string | null } | null)?.napomena ?? null)) {
    await admin.from('terms').update({ napomena: spojeno }).eq('id', termId);
  }
}
