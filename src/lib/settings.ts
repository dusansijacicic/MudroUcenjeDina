import { createClient } from '@/lib/supabase/server';

const DEFAULT_MAX_CASOVA_PO_TERMINU = 4;

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

/** Da li termin sme da primi još jedno predavanje (broj predavanja < max). */
export async function termMozeNovoPredavanje(termId: string): Promise<{ ok: boolean; count: number; max: number; error?: string }> {
  const supabase = await createClient();
  const max = await getMaxCasovaPoTerminu();
  const { count, error } = await supabase
    .from('predavanja')
    .select('*', { count: 'exact', head: true })
    .eq('term_id', termId);
  if (error) return { ok: false, count: 0, max, error: error.message };
  const n = count ?? 0;
  return { ok: n < max, count: n, max };
}
