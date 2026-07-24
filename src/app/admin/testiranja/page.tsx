import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import type { PotentialClientStatus } from '@/app/admin/actions';

const STATUS_LABEL: Record<PotentialClientStatus, string> = {
  zakazan: 'Zakazan',
  pojavio_se: 'Pojavio se',
  nije_se_pojavio: 'Nije se pojavio',
  prebacen_u_klijenta: 'Prebačen u klijenta',
};
const STATUS_COLOR: Record<PotentialClientStatus, string> = {
  zakazan: 'bg-stone-100 text-stone-600',
  pojavio_se: 'bg-blue-100 text-blue-700',
  nije_se_pojavio: 'bg-red-100 text-red-700',
  prebacen_u_klijenta: 'bg-emerald-100 text-emerald-700',
};

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

  const list = (rows ?? []) as Array<{
    id: string; term_id: string | null; ime: string; prezime: string | null; ime_roditelja: string | null;
    mobilni_roditelja: string | null; razred: string | null; status: string;
    komentar: string | null; converted_client_id: string | null; created_at: string;
    term: { id: string; date: string; slot_index: number } | { id: string; date: string; slot_index: number }[] | null;
  }>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Istorija testiranja</h1>
          <p className="text-stone-500 text-sm mt-0.5">Svi potencijalni klijenti koji su bili zakazani na testiranju.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100 shadow-sm overflow-hidden">
        {list.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            Nema evidentiranih testiranja. Kreiraj termin sa kategorijom „Testiranje" i dodaj klijente.
          </div>
        ) : (
          list.map((pc) => {
            const term = Array.isArray(pc.term) ? pc.term[0] : pc.term;
            const dateStr = term
              ? new Date(term.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—';
            return (
              <div key={pc.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-stone-800">{pc.ime}{pc.prezime ? ` ${pc.prezime}` : ''}</span>
                    {pc.razred && <span className="text-xs text-stone-500">{pc.razred}. razred</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[pc.status as PotentialClientStatus]}`}>
                      {STATUS_LABEL[pc.status as PotentialClientStatus] ?? pc.status}
                    </span>
                    {pc.converted_client_id && (
                      <Link href={`/admin/klijenti/${pc.converted_client_id}`} className="text-xs text-amber-600 hover:underline">
                        → Profil klijenta
                      </Link>
                    )}
                  </div>
                  {pc.ime_roditelja && (
                    <p className="text-sm text-stone-500 mt-0.5">
                      {pc.ime_roditelja}{pc.mobilni_roditelja ? ` · ${pc.mobilni_roditelja}` : ''}
                    </p>
                  )}
                  {pc.komentar && (
                    <p className="mt-1 text-sm text-stone-600 italic">{pc.komentar}</p>
                  )}
                  <p className="text-xs text-stone-400 mt-1">
                    {dateStr}
                    {term && (
                      <Link href={`/admin/termin/${term.id}`} className="ml-1 hover:underline">→ termin</Link>
                    )}
                  </p>
                </div>
                {pc.term_id && (
                  <Link
                    href={`/admin/termin/${pc.term_id}/testiranje/${pc.id}`}
                    className="text-sm text-amber-600 hover:text-amber-700 shrink-0"
                  >
                    Izmeni
                  </Link>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
