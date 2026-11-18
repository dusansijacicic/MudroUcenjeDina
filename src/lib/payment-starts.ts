import type { SupabaseClient } from '@supabase/supabase-js';

export type PaymentStart = { client_id: string; date: string; slot_index: number };

/** Samo Delete bez traga uklanja oznaku sa obrisanog časa. Otkaži i premeštanje je zadržavaju. */
export async function deletePaymentStarts(admin: SupabaseClient, starts: PaymentStart[]): Promise<string | null> {
  const unique = [...new Map(starts.filter((s) => s.client_id).map((s) => [`${s.client_id}|${s.date}|${s.slot_index}`, s])).values()];
  for (let from = 0; from < unique.length; from += 50) {
    const filter = unique.slice(from, from + 50).map((s) => `and(client_id.eq.${s.client_id},od_datum.eq.${s.date.slice(0, 10)},od_slot.eq.${s.slot_index})`).join(',');
    const { error } = await admin.from('placeni_paketi').delete().or(filter);
    if (error && error.code !== 'PGRST205' && error.code !== '42P01') return error.message;
  }
  return null;
}
