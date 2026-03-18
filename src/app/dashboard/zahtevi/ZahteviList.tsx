'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  preuzmiZahtev,
  potvrdiZahtev,
  promeniTerminZahtev,
  odbijZahtev,
} from './actions';

export type Zahtev = {
  id: string;
  client_id: string;
  instructor_id: string | null;
  requested_date: string;
  requested_slot_index: number;
  status: string;
  note_from_instructor: string | null;
  created_at: string;
  client?: { ime: string; prezime: string } | null;
};

export default function ZahteviList({
  zahtevi,
  instructorId,
  slotLabels,
  isPending,
}: {
  zahtevi: Zahtev[];
  instructorId: string;
  slotLabels: readonly string[];
  isPending: boolean;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [promeniId, setPromeniId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newSlot, setNewSlot] = useState(0);
  const [note, setNote] = useState('');

  const run = async (id: string, fn: () => Promise<{ error?: string }>) => {
    setError('');
    setLoadingId(id);
    console.log('[ZahteviList] run action for', id);
    const result = await fn();
    setLoadingId(null);
    if (result.error) {
      console.error('[ZahteviList] action error', result.error);
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success('Uspešno.');
      router.refresh();
    }
  };

  const handlePotvrdi = (z: Zahtev) => run(z.id, () => potvrdiZahtev(z.id));
  const handlePreuzmi = (z: Zahtev) => run(z.id, () => preuzmiZahtev(z.id));
  const handlePromeni = async (z: Zahtev) => {
    if (!newDate) return;
    setError('');
    setLoadingId(z.id);
    console.log('[ZahteviList] promeniTermin', z.id);
    const result = await promeniTerminZahtev(z.id, newDate, newSlot, note || undefined);
    setLoadingId(null);
    if (result.error) {
      console.error('[ZahteviList] promeni error', result.error);
      setError(result.error);
      toast.error(result.error);
    } else {
      setPromeniId(null);
      setNewDate('');
      setNote('');
      toast.success('Termin promenjen.');
      router.refresh();
    }
  };
  const handleOdbij = (z: Zahtev) => run(z.id, () => odbijZahtev(z.id, note || undefined));

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden">
        {zahtevi.map((z) => {
          const clientName = z.client ? `${z.client.ime} ${z.client.prezime}` : '—';
          const dateStr = String(z.requested_date).slice(0, 10);
          const timeStr = slotLabels[z.requested_slot_index] ?? '—';
          const isAny = z.instructor_id == null;
          const isMine = z.instructor_id === instructorId;

          return (
            <li key={z.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-stone-800">{clientName}</p>
                  <p className="text-sm text-stone-600">
                    Želi termin: {dateStr} • {timeStr}
                    {isAny && <span className="text-amber-600"> (bilo koji predavač)</span>}
                  </p>
                  {z.status !== 'pending' && (
                    <p className="text-xs text-stone-500 mt-1">Status: {z.status}</p>
                  )}
                  {z.note_from_instructor && (
                    <p className="text-sm text-stone-500 mt-1">Napomena: {z.note_from_instructor}</p>
                  )}
                </div>
                {isPending && (
                  <div className="flex flex-wrap gap-2">
                    {isAny && (
                      <button
                        type="button"
                        onClick={() => handlePreuzmi(z)}
                        disabled={!!loadingId}
                        className="text-sm rounded-lg bg-stone-600 text-white px-3 py-1.5 hover:bg-stone-700 disabled:opacity-50"
                      >
                        Preuzmi
                      </button>
                    )}
                    {(isMine || isAny) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePotvrdi(z)}
                          disabled={!!loadingId}
                          className="text-sm rounded-lg bg-green-600 text-white px-3 py-1.5 hover:bg-green-700 disabled:opacity-50"
                        >
                          Potvrdi
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPromeniId(promeniId === z.id ? null : z.id);
                            if (promeniId !== z.id) {
                              setNewDate(String(z.requested_date).slice(0, 10));
                              setNewSlot(z.requested_slot_index);
                              setNote('');
                            }
                          }}
                          disabled={!!loadingId}
                          className="text-sm rounded-lg bg-amber-600 text-white px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50"
                        >
                          Promeni termin
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOdbij(z)}
                          disabled={!!loadingId}
                          className="text-sm rounded-lg border border-stone-300 text-stone-600 px-3 py-1.5 hover:bg-stone-50 disabled:opacity-50"
                        >
                          Odbij
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {promeniId === z.id && (
                <div className="mt-4 p-4 bg-stone-50 rounded-lg border border-stone-200 space-y-3">
                  <p className="text-sm font-medium text-stone-700">Novi termin (i opciono napomena)</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">Datum</label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="rounded border border-stone-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">Vreme</label>
                      <select
                        value={newSlot}
                        onChange={(e) => setNewSlot(parseInt(e.target.value, 10))}
                        className="rounded border border-stone-300 px-2 py-1.5 text-sm"
                      >
                        {slotLabels.map((l, i) => (
                          <option key={i} value={i}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-stone-500 mb-0.5">Napomena (npr. pozvao sam, dogovoreno)</label>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Opciono"
                        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePromeni(z)}
                      disabled={!newDate || loadingId === z.id}
                      className="rounded-lg bg-amber-600 text-white px-3 py-1.5 text-sm hover:bg-amber-700 disabled:opacity-50"
                    >
                      Sačuvaj novi termin
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromeniId(null)}
                      className="text-sm text-stone-500 hover:text-stone-700"
                    >
                      Odustani
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
