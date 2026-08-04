'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PotentialClientStatus } from '@/app/admin/actions';
import PotentialClientQuickActions from '@/app/admin/termin/PotentialClientQuickActions';

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

/** Skida srpsku dijakritiku za labavo poređenje pretrage. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/đ/g, 'dj')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z');
}

export type TestiranjeRow = {
  id: string;
  term_id: string | null;
  ime: string;
  prezime: string | null;
  ime_roditelja: string | null;
  mobilni_roditelja: string | null;
  razred: string | null;
  status: PotentialClientStatus;
  komentar: string | null;
  converted_client_id: string | null;
  dateStr: string;
  termId: string | null;
};

export default function TestiranjaList({ list }: { list: TestiranjeRow[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return list;
    return list.filter((pc) => {
      const fullName = normalize(`${pc.ime} ${pc.prezime ?? ''}`);
      const roditelj = normalize(pc.ime_roditelja ?? '');
      return fullName.includes(q) || roditelj.includes(q);
    });
  }, [list, search]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pretraga po imenu deteta ili roditelja…"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
        />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            {list.length === 0
              ? 'Nema evidentiranih testiranja. Kreiraj termin sa kategorijom „Testiranje" i dodaj klijente.'
              : 'Nema rezultata za tu pretragu.'}
          </div>
        ) : (
          filtered.map((pc) => (
            <div key={pc.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-stone-800">{pc.ime}{pc.prezime ? ` ${pc.prezime}` : ''}</span>
                  {pc.razred && <span className="text-xs text-stone-500">{pc.razred}. razred</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[pc.status]}`}>
                    {STATUS_LABEL[pc.status] ?? pc.status}
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
                  {pc.dateStr}
                  {pc.termId && (
                    <Link href={`/admin/termin/${pc.termId}`} className="ml-1 hover:underline">→ termin</Link>
                  )}
                </p>
              </div>
              {pc.term_id && (
                <div className="flex items-center gap-3 shrink-0">
                  <PotentialClientQuickActions
                    id={pc.id}
                    ime={pc.ime}
                    status={pc.status}
                    convertedClientId={pc.converted_client_id}
                  />
                  <Link
                    href={`/admin/termin/${pc.term_id}/testiranje/${pc.id}`}
                    className="text-sm text-amber-600 hover:text-amber-700"
                  >
                    Izmeni
                  </Link>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
