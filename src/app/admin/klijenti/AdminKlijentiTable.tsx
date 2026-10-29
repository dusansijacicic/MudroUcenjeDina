'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { searchVariants, variantsMatch } from '@/lib/search';

/** Koliko redova se crta odjednom; sledeća grupa se dodaje kad se skroluje do dna (ili odmah, ako stane na ekran). */
const PAGE_SIZE = 50;

export type AdminKlijentRow = {
  id: string;
  ime: string;
  prezime: string;
  godiste: number | null;
  razred: string | null;
  skola: string | null;
  kontaktTelefon: string | null;
  datumTestiranja: string | null;
  instructors: { id: string; ime: string; prezime: string }[];
  problemTypes: string[];
  stanje: { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number }[];
};

export default function AdminKlijentiTable({ rows }: { rows: AdminKlijentRow[] }) {
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () => rows.map((r) => searchVariants(`${r.ime} ${r.prezime} ${r.prezime} ${r.ime} ${r.skola ?? ''} ${r.kontaktTelefon ?? ''}`)),
    [rows]
  );
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    return rows.filter((_, i) => variantsMatch(index[i], search));
  }, [rows, index, search]);
  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  // Ponovo se kači posle svake dodate grupe: ako je dno i dalje vidljivo, odmah se dodaje sledeća.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: '800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visible]);

  return (
    <div>
      <div className="mb-3">
        <input
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Pretraga po imenu, prezimenu, školi ili telefonu…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE_SIZE);
          }}
          className="w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
        />
        <p className="mt-1 text-xs text-stone-500 tabular-nums">
          {search.trim() ? `${filtered.length} od ${rows.length} klijenata` : `${rows.length} klijenata`}
        </p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3 font-medium text-stone-600">Ime i prezime</th>
              <th className="text-left p-3 font-medium text-stone-600">Datum testiranja</th>
              <th className="text-left p-3 font-medium text-stone-600">Godište / Razred</th>
              <th className="text-left p-3 font-medium text-stone-600">Škola</th>
              <th className="text-left p-3 font-medium text-stone-600">Kontakt telefon</th>
              <th className="text-left p-3 font-medium text-stone-600">Održano do danas / kupljeno / preostalo, po vrsti časa</th>
              <th className="text-left p-3 font-medium text-stone-600">Instruktori</th>
              <th className="text-right p-3 font-medium text-stone-600">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
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
                  <td className="p-3 text-stone-600 whitespace-nowrap">
                    {r.datumTestiranja
                      ? new Date(r.datumTestiranja + 'T12:00:00').toLocaleDateString('sr-Latn-RS')
                      : '—'}
                  </td>
                  <td className="p-3 text-stone-600">
                    {r.godiste ?? '—'} {r.razred ? ` / ${r.razred}` : ''}
                  </td>
                  <td className="p-3 text-stone-600">{r.skola ?? '—'}</td>
                  <td className="p-3 text-stone-600 whitespace-nowrap">{r.kontaktTelefon ?? '—'}</td>
                  <td className="p-3 text-stone-600">
                    {r.stanje.length === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {r.stanje.map((s) => {
                          const duguje = s.odrzano - s.uplaceno;
                          return (
                            <span key={s.term_type_id ?? 'bez'} className="whitespace-nowrap tabular-nums">
                              <span className="font-medium text-stone-800">{s.term_type_naziv}:</span>{' '}
                              <span className="text-stone-800">
                                održano <strong>{s.odrzano}</strong>
                              </span>
                              <span className="text-stone-400 mx-1">·</span>
                              <span className="text-stone-600">kupljeno {s.uplaceno}</span>
                              <span className="text-stone-400 mx-1">·</span>
                              {duguje > 0 ? (
                                <span className="rounded bg-red-100 px-1 font-semibold text-red-700">nije plaćeno {duguje}</span>
                              ) : (
                                <span className="font-medium text-amber-700">preostalo {s.ostalo}</span>
                              )}
                            </span>
                          );
                        })}
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
        {hasMore && (
          <div ref={sentinelRef} className="p-4 text-center text-xs text-stone-400">
            Učitavam još… ({shown.length} od {filtered.length})
          </div>
        )}
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
