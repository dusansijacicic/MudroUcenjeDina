import { createClient } from '@/lib/supabase/server';
import { jedanKlijentIzJoina } from '@/lib/term-categories';

const DEFAULT_MAX_CASOVA_PO_TERMINU = 4;
const DEFAULT_MAX_TERMINA_PO_SLOTU = 4;

/** Maksimalan broj časova (predavanja) u jednom terminu. Superadmin može da menja u /admin/podesavanja. */
export async function getMaxCasovaPoTerminu(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'max_casova_po_terminu')
    .single();
  if (!data?.value) return DEFAULT_MAX_CASOVA_PO_TERMINU;
  const n = parseInt(data.value, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_CASOVA_PO_TERMINU;
}

/** Maksimalan broj termina (predavač+učionica) u jednom vremenskom slotu (npr. 10:00). Superadmin menja u /admin/podesavanja. */
export async function getMaxTerminaPoSlotu(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'max_termina_po_slotu')
    .single();
  if (!data?.value) return DEFAULT_MAX_TERMINA_PO_SLOTU;
  const n = parseInt(data.value, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_TERMINA_PO_SLOTU;
}

/** Da li termin sme da primi još jedno predavanje. Individualni termin = max 1 dete; grupni = max iz podešavanja. */
export async function termMozeNovoPredavanje(termId: string): Promise<{ ok: boolean; count: number; max: number; error?: string }> {
  const maxSetting = await getMaxCasovaPoTerminu();
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data: term, error: termErr } = await admin
      .from('terms')
      .select('id, term_categories(jedan_klijent_po_terminu)')
      .eq('id', termId)
      .maybeSingle();
    if (termErr) return { ok: false, count: 0, max: maxSetting, error: termErr.message };
    const tc = term?.term_categories as { jedan_klijent_po_terminu?: boolean } | { jedan_klijent_po_terminu?: boolean }[] | null;
    const effectiveMax = jedanKlijentIzJoina(tc) ? 1 : maxSetting;
    const { count, error } = await admin
      .from('predavanja')
      .select('*', { count: 'exact', head: true })
      .eq('term_id', termId);
    if (error) return { ok: false, count: 0, max: effectiveMax, error: error.message };
    const n = count ?? 0;
    return { ok: n < effectiveMax, count: n, max: effectiveMax };
  } catch {
    const supabase = await createClient();
    const { data: term } = await supabase
      .from('terms')
      .select('id, term_categories(jedan_klijent_po_terminu)')
      .eq('id', termId)
      .maybeSingle();
    const tc = term?.term_categories as { jedan_klijent_po_terminu?: boolean } | { jedan_klijent_po_terminu?: boolean }[] | null;
    const effectiveMax = jedanKlijentIzJoina(tc) ? 1 : maxSetting;
    const { count, error } = await supabase
      .from('predavanja')
      .select('*', { count: 'exact', head: true })
      .eq('term_id', termId);
    if (error) return { ok: false, count: 0, max: effectiveMax, error: error.message };
    const n = count ?? 0;
    return { ok: n < effectiveMax, count: n, max: effectiveMax };
  }
}
