import { createClient } from '@/lib/supabase/server';
import { jedanKlijentIzJoinaPouzdano } from '@/lib/term-categories';
import type { SupabaseClient } from '@supabase/supabase-js';

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

/** true = u terminu najviše jedno dete (individualni); false = grupni do max_casova. */
export async function jedanDeteMaksimalnoPoTerminu(
  // Server i admin klijent – isti .from() API
  admin: Pick<SupabaseClient, 'from'>,
  term: {
    term_category_id?: string | null;
    term_categories?: unknown;
  } | null
): Promise<boolean> {
  if (!term) return true;
  const tc = term.term_categories;
  const fromJoin = jedanKlijentIzJoinaPouzdano(
    tc as Parameters<typeof jedanKlijentIzJoinaPouzdano>[0]
  );
  if (fromJoin !== null) return fromJoin;
  const cid = term.term_category_id;
  if (cid) {
    const { data: cat } = await admin
      .from('term_categories')
      .select('jedan_klijent_po_terminu')
      .eq('id', cid)
      .maybeSingle();
    if (cat && typeof cat.jedan_klijent_po_terminu === 'boolean') {
      return Boolean(cat.jedan_klijent_po_terminu);
    }
  }
  return true;
}

/** Da li termin sme da primi još jedno predavanje. Individualni termin = max 1 dete; grupni = max iz podešavanja. */
export async function termMozeNovoPredavanje(termId: string): Promise<{ ok: boolean; count: number; max: number; error?: string }> {
  const maxSetting = await getMaxCasovaPoTerminu();
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data: term, error: termErr } = await admin
      .from('terms')
      .select('id, term_category_id, term_categories(jedan_klijent_po_terminu)')
      .eq('id', termId)
      .maybeSingle();
    if (termErr) return { ok: false, count: 0, max: maxSetting, error: termErr.message };
    const onlyOne = await jedanDeteMaksimalnoPoTerminu(admin, term);
    const effectiveMax = onlyOne ? 1 : maxSetting;
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
      .select('id, term_category_id, term_categories(jedan_klijent_po_terminu)')
      .eq('id', termId)
      .maybeSingle();
    const onlyOne = await jedanDeteMaksimalnoPoTerminu(supabase, term);
    const effectiveMax = onlyOne ? 1 : maxSetting;
    const { count, error } = await supabase
      .from('predavanja')
      .select('*', { count: 'exact', head: true })
      .eq('term_id', termId);
    if (error) return { ok: false, count: 0, max: effectiveMax, error: error.message };
    const n = count ?? 0;
    return { ok: n < effectiveMax, count: n, max: effectiveMax };
  }
}
