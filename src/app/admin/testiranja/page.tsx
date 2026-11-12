import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { TIME_SLOTS } from '@/lib/constants';
import type { PotentialClientStatus } from '@/app/admin/actions';
import TestiranjaList, { type TestiranjeRow } from './TestiranjaList';

export default async function TestiranjaPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('potential_clients')
    .select('*, term:terms(id, date, slot_index)')
    .order('created_at', { ascending: false });

  const raw = (rows ?? []) as Array<{
    id: string; term_id: string | null; ime: string; prezime: string | null; ime_roditelja: string | null;
    mobilni_roditelja: string | null; razred: string | null; status: string;
    komentar: string | null; converted_client_id: string | null; created_at: string;
    datum_termina?: string | null; slot_termina?: number | null;
    term: { id: string; date: string; slot_index: number } | { id: string; date: string; slot_index: number }[] | null;
  }>;

  const list: TestiranjeRow[] = raw.map((pc) => {
    const term = Array.isArray(pc.term) ? pc.term[0] : pc.term;
    // Otkazano dete ili obrisan termin: datum/vreme zapamćeni na detetu (migracija 052).
    const datum = term?.date ?? pc.datum_termina ?? null;
    const slot = term?.slot_index ?? pc.slot_termina ?? null;
    const dateStr = datum
      ? new Date(String(datum).slice(0, 10) + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { day: '2-digit', month: 'short', year: 'numeric' }) +
        (slot != null && TIME_SLOTS[slot] ? ` · ${TIME_SLOTS[slot]}` : '')
      : '—';
    return {
      id: pc.id,
      term_id: pc.term_id,
      ime: pc.ime,
      prezime: pc.prezime,
      ime_roditelja: pc.ime_roditelja,
      mobilni_roditelja: pc.mobilni_roditelja,
      razred: pc.razred,
      status: pc.status as PotentialClientStatus,
      komentar: pc.komentar,
      converted_client_id: pc.converted_client_id,
      dateStr,
      termId: term?.id ?? null,
    };
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Istorija testiranja</h1>
          <p className="text-stone-500 text-sm mt-0.5">Svi potencijalni klijenti koji su bili zakazani na testiranju.</p>
        </div>
      </div>

      <TestiranjaList list={list} />
    </div>
  );
}
