'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { updateOtkazaniTerminPlaceno, deleteOtkazaniTermin, postaviRazlogOtkazivanjaAsAdmin } from '@/app/admin/actions';
import type { OtkazaniTerminRow } from '@/app/admin/actions';
import { TIME_SLOTS } from '@/lib/constants';

/**
 * Otkazani časovi deteta: jasno „otkazan · naplaćen“ ili „otkazan · nije naplaćen“, razlog otkazivanja
 * (upis/izmena) i, za naplaćene, koji je to čas po redu od plaćenih (računa se u paket, migracija 059).
 */
export default function OtkazaniTerminiSection({
  otkazani,
  clientId,
  redni = {},
}: {
  otkazani: OtkazaniTerminRow[];
  clientId: string;
  /** [x, y] po id-u – naplaćen otkazan čas je x-ti od y plaćenih. */
  redni?: Record<string, [number, number]>;
}) {
  const [items, setItems] = useState(otkazani);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [menjaRazlog, setMenjaRazlog] = useState<string | null>(null);
  const [razlogTekst, setRazlogTekst] = useState('');

  const handleTogglePlaceno = async (id: string, current: boolean) => {
    setLoadingId(id);
    const res = await updateOtkazaniTerminPlaceno(id, !current, clientId);
    if (res.error) toast.error(res.error);
    else setItems((prev) => prev.map((x) => (x.id === id ? { ...x, placeno: !current } : x)));
    setLoadingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Obrisati iz istorije otkazanih termina?')) return;
    setLoadingId(id);
    const res = await deleteOtkazaniTermin(id, clientId);
    if (res.error) toast.error(res.error);
    else setItems((prev) => prev.filter((x) => x.id !== id));
    setLoadingId(null);
  };

  const pocniRazlog = (ot: OtkazaniTerminRow) => {
    setMenjaRazlog(ot.id);
    setRazlogTekst(ot.razlog ?? '');
  };

  const sacuvajRazlog = async (id: string) => {
    setLoadingId(id);
    const res = await postaviRazlogOtkazivanjaAsAdmin(id, razlogTekst, clientId);
    setLoadingId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, razlog: res.razlog ?? null } : x)));
    setMenjaRazlog(null);
  };

  if (items.length === 0) {
    return <p className="text-sm text-stone-500">Nema otkazanih termina.</p>;
  }

  const naplaceno = items.filter((x) => x.placeno).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Ukupno otkazano: <strong className="tabular-nums">{items.length}</strong> · naplaćeno:{' '}
        <strong className="tabular-nums text-indigo-700">{naplaceno}</strong> · nije naplaćeno:{' '}
        <strong className="tabular-nums">{items.length - naplaceno}</strong>
      </p>
      <ul className="space-y-2">
        {items.map((ot) => {
          const dateStr = new Date(ot.term_date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
          });
          const timeStr = TIME_SLOTS[ot.slot_index] ?? '—';
          const loading = loadingId === ot.id;
          const r = ot.placeno ? redni[ot.id] : undefined;
          return (
            <li
              key={ot.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
                ot.placeno ? 'border-indigo-200 bg-indigo-50/70' : 'border-stone-200 bg-stone-50'
              }`}
              style={ot.placeno ? { borderLeft: '4px solid #6366f1' } : undefined}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${ot.placeno ? 'text-indigo-950' : 'text-stone-600 line-through'}`}>{dateStr}</span>
                  <span className="text-stone-500 text-sm">{timeStr}</span>
                  {ot.term_type_naziv && <span className="text-xs text-stone-500">· {ot.term_type_naziv}</span>}
                  {ot.placeno ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                      Otkazan · naplaćen{r ? ` · ${r[0]}/${r[1]}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">Otkazan · nije naplaćen</span>
                  )}
                </div>
                {(ot.instructor_ime || ot.instructor_prezime) && (
                  <p className="text-sm text-stone-500 mt-0.5">
                    {ot.instructor_ime} {ot.instructor_prezime ?? ''}
                  </p>
                )}
                {menjaRazlog === ot.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label htmlFor={`razlog-${ot.id}`} className="sr-only">
                      Razlog otkazivanja
                    </label>
                    <input
                      id={`razlog-${ot.id}`}
                      type="text"
                      value={razlogTekst}
                      maxLength={300}
                      autoFocus
                      onChange={(e) => setRazlogTekst(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sacuvajRazlog(ot.id);
                        if (e.key === 'Escape') setMenjaRazlog(null);
                      }}
                      placeholder="Razlog otkazivanja"
                      className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => sacuvajRazlog(ot.id)}
                      disabled={loading}
                      className="rounded-md bg-stone-800 px-3 py-1 text-xs font-medium text-white hover:bg-stone-900 disabled:opacity-50"
                    >
                      Sačuvaj
                    </button>
                    <button type="button" onClick={() => setMenjaRazlog(null)} className="text-xs text-stone-500 hover:text-stone-800">
                      Odustani
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-stone-700">
                    <span className="text-stone-500">Razlog:</span> {ot.razlog ? <span className="italic">{ot.razlog}</span> : <span className="text-stone-400">nije upisan</span>}{' '}
                    <button type="button" onClick={() => pocniRazlog(ot)} className="ml-1 text-xs font-medium text-amber-700 hover:text-amber-800">
                      {ot.razlog ? 'Izmeni' : 'Upiši razlog'}
                    </button>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTogglePlaceno(ot.id, ot.placeno)}
                  disabled={loading}
                  className={`text-xs rounded-lg border px-3 py-1 transition-colors ${
                    ot.placeno
                      ? 'border-stone-300 text-stone-600 hover:bg-stone-100'
                      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                  } disabled:opacity-50`}
                >
                  {ot.placeno ? 'Označi kao nenaplaćen' : 'Označi kao naplaćen'}
                </button>
                <button
                  type="button"
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
    </div>
  );
}
