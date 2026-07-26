'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export type AdminKlijentRow = {
  id: string;
  ime: string;
  prezime: string;
  pol: string | null;
  polLabel: string;
  loginEmail: string | null;
  godiste: number | null;
  razred: string | null;
  datumTestiranja: string | null;
  instructors: { id: string; ime: string; prezime: string }[];
  problemTypes: string[];
  stanje: { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number }[];
};

export default function AdminKlijentiTable({ rows }: { rows: AdminKlijentRow[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.ime} ${r.prezime}`.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div>
      <div className="mb-3">
        <input
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Pretraga po imenu ili prezimenu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
        />
        {search.trim() && (
          <p className="mt-1 text-xs text-stone-500">
            {filtered.length} od {rows.length} klijenata
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Pol</th>
              <th className="text-left p-3 font-medium text-stone-600">Datum testiranja</th>
              <th className="text-left p-3 font-medium text-stone-600">Email za prijavu</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište / Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Kupljeno / Održano / Preostalo po vrsti</th>
              <th className="text-left p-3 font-medium text-stone-600">Instruktori</th>
              <th className="text-right p-3 font-medium text-stone-600">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const hasWarning = r.problemTypes.length > 0;
              return (
                <tr key={r.id} className="border-b border-stone-100 hover:bg-amber-50/50 ui-transition">
                  <td className="p-3 font-medium text-stone-800">
                    {r.ime} {r.prezime}
                    {hasWarning && (
                      <span
                        className="ml-2 inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        title={`Nema dovoljno kupljenih časova za: ${r.problemTypes.join(', ')}`}
                      >
                        Nema kupljenih časova ({r.problemTypes.join(', ')})
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-stone-600 whitespace-nowrap">{r.polLabel}</td>
                  <td className="p-3 text-stone-600 whitespace-nowrap">
                    {r.datumTestiranja
                      ? new Date(r.datumTestiranja + 'T12:00:00').toLocaleDateString('sr-Latn-RS')
                      : '—'}
                  </td>
                  <td className="p-3 text-stone-600">{r.loginEmail ?? '—'}</td>
                  <td className="p-3 text-stone-600">
                    {r.godiste ?? '—'} {r.razred ? ` / ${r.razred}` : ''}
                  </td>
                  <td className="p-3 text-stone-600">
                    {r.stanje.length === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {r.stanje.map((s) => (
                          <span key={s.term_type_id ?? 'bez'} className="whitespace-nowrap">
                            <span className="font-medium text-stone-700">{s.term_type_naziv}:</span>{' '}
                            <span className="text-stone-600">{s.uplaceno} kupljeno</span>
                            <span className="text-stone-400 mx-0.5">/</span>
                            <span className="text-stone-600">{s.odrzano} održano</span>
                            <span className="text-stone-400 mx-0.5">/</span>
                            <span className="text-amber-700 font-medium">{s.ostalo} preostalo</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-stone-600">
                    {r.instructors.map((i) => (
                      <span key={i.id} className="inline-block mr-2">
                        {i.ime} {i.prezime}
                      </span>
                    ))}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/klijenti/${r.id}`} className="text-amber-600 hover:text-amber-700 font-medium">
                      Izmeni
                    </Link>
                    {r.instructors.length > 0 && <span className="text-stone-400 mx-1">|</span>}
                    {r.instructors.length > 0 && (
                      <Link
                        href={`/admin/view/${r.instructors[0].id}/klijenti/${r.id}`}
                        className="text-stone-500 hover:text-stone-700 text-sm"
                      >
                        Kod instruktora
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-stone-500">
            {rows.length === 0
              ? 'Nema klijenata. Dodajte instruktora, pa „Novi klijent” ili unesite klijenta kod instruktora (Instruktori → + Klijent).'
              : 'Nema rezultata za ovu pretragu.'}
          </div>
        )}
      </div>
    </div>
  );
}
