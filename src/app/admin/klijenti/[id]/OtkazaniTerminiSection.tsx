'use client';

import { useState } from 'react';
import { updateOtkazaniTerminPlaceno, deleteOtkazaniTermin } from '@/app/admin/actions';
import type { OtkazaniTerminRow } from '@/app/admin/actions';
import { TIME_SLOTS } from '@/lib/constants';

export default function OtkazaniTerminiSection({
  otkazani,
  clientId,
}: {
  otkazani: OtkazaniTerminRow[];
  clientId: string;
}) {
  const [items, setItems] = useState(otkazani);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleTogglePlaceno = async (id: string, current: boolean) => {
    setLoadingId(id);
    const res = await updateOtkazaniTerminPlaceno(id, !current, clientId);
    if (!res.error) {
      setItems((prev) => prev.map((x) => x.id === id ? { ...x, placeno: !current } : x));
    }
    setLoadingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Obrisati iz istorije otkazanih termina?')) return;
    setLoadingId(id);
    const res = await deleteOtkazaniTermin(id, clientId);
    if (!res.error) {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }
    setLoadingId(null);
  };

  if (items.length === 0) {
    return <p className="text-sm text-stone-500">Nema otkazanih termina.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((ot) => {
        const dateStr = new Date(ot.term_date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
          weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        });
        const timeStr = TIME_SLOTS[ot.slot_index] ?? '—';
        const loading = loadingId === ot.id;
        return (
          <li
            key={ot.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 opacity-80"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-stone-700 line-through">{dateStr}</span>
                <span className="text-stone-500 text-sm">{timeStr}</span>
                {ot.term_type_naziv && (
                  <span className="text-xs text-stone-500">· {ot.term_type_naziv}</span>
                )}
                {ot.placeno && (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">Naplaćeno</span>
                )}
              </div>
              {(ot.instructor_ime || ot.instructor_prezime) && (
                <p className="text-sm text-stone-500 mt-0.5">
                  {ot.instructor_ime} {ot.instructor_prezime ?? ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTogglePlaceno(ot.id, ot.placeno)}
                disabled={loading}
                className={`text-xs rounded-lg border px-3 py-1 transition-colors ${
                  ot.placeno
                    ? 'border-stone-300 text-stone-500 hover:bg-stone-100'
                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                } disabled:opacity-50`}
              >
                {ot.placeno ? 'Označi kao nenaplaćeno' : 'Označi kao naplaćeno'}
              </button>
              <button
                onClick={() => handleDelete(ot.id)}
                disabled={loading}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Obriši
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
