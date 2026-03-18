'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createZahtevAsClient, getOccupiedSlotsServer, getInstructorAvailableSlotsServer } from './actions';

function consecutiveBlocks(slots: number[]): number[][] {
  if (slots.length === 0) return [];
  const sorted = [...slots].sort((a, b) => a - b);
  const blocks: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) current.push(sorted[i]);
    else {
      blocks.push(current);
      current = [sorted[i]];
    }
  }
  blocks.push(current);
  return blocks;
}

export default function ZahtevForm({
  clientId,
  instructors,
  defaultDate,
  slotLabels,
  initialOccupiedSlots = [],
}: {
  clientId: string;
  instructors: { id: string; ime: string; prezime: string }[];
  defaultDate: string;
  slotLabels: readonly string[];
  initialOccupiedSlots?: number[];
}) {
  const router = useRouter();
  const [instructorId, setInstructorId] = useState<string>('');
  const [date, setDate] = useState(defaultDate);
  const [slotIndex, setSlotIndex] = useState(0);
  const [occupiedSlots, setOccupiedSlots] = useState<number[]>(initialOccupiedSlots);
  const [instructorAvailableSlots, setInstructorAvailableSlots] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOccupiedSlots(initialOccupiedSlots);
  }, [initialOccupiedSlots]);

  useEffect(() => {
    if (!date) return;
    getOccupiedSlotsServer(date).then((next) => {
      setOccupiedSlots(next);
      if (next.includes(slotIndex)) {
        const firstFree = slotLabels.findIndex((_, i) => !next.includes(i));
        setSlotIndex(firstFree >= 0 ? firstFree : 0);
      }
    });
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps -- slotIndex/slotLabels intentionally not in deps

  useEffect(() => {
    if (!instructorId || !date) {
      setInstructorAvailableSlots(null);
      return;
    }
    getInstructorAvailableSlotsServer(instructorId, date).then(setInstructorAvailableSlots);
  }, [instructorId, date]);

  const allSlotIndices = useMemo(() => slotLabels.map((_, i) => i), [slotLabels.length]);
  const allowedByInstructor = instructorAvailableSlots ?? allSlotIndices;
  const freeSlots = useMemo(
    () => allowedByInstructor.filter((i) => !occupiedSlots.includes(i)),
    [allowedByInstructor, occupiedSlots]
  );
  const blocks = useMemo(() => consecutiveBlocks(freeSlots), [freeSlots]);
  const preferredSlots = useMemo(
    () => (blocks.flatMap((b) => (b.length >= 2 ? b : []))),
    [blocks]
  );
  const offerableSlots = preferredSlots.length > 0 ? preferredSlots : freeSlots;

  useEffect(() => {
    if (offerableSlots.length > 0 && !offerableSlots.includes(slotIndex)) {
      setSlotIndex(offerableSlots[0]);
    }
  }, [offerableSlots.join(','), slotIndex]);

  const canSubmit = !instructorId || offerableSlots.length > 0;
  const effectiveSlotIndex = offerableSlots.includes(slotIndex) ? slotIndex : (offerableSlots[0] ?? 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    const result = await createZahtevAsClient(
      clientId,
      instructorId || null,
      date.slice(0, 10),
      effectiveSlotIndex
    );
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push('/ucenik');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">Predavač</label>
        <select
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 bg-white px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
        >
          <option value="">Bilo koji predavač</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">Datum</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          min={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 bg-white px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">Vreme</label>
        {instructorId && offerableSlots.length === 0 ? (
          <p className="text-sm text-[#b7950b] bg-[var(--kid-butter)] rounded-xl px-3 py-2 border border-[var(--kid-butter-dark)]/50">
            Ovaj predavač nema dostupnih termina za izabrani dan (proverite njegovu dostupnost u podešavanjima) ili su svi slobodni slotovi zauzeti. Izaberite drugi datum ili drugog predavača.
          </p>
        ) : (
          <select
            value={effectiveSlotIndex}
            onChange={(e) => setSlotIndex(parseInt(e.target.value, 10))}
            className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 bg-white px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
          >
            {offerableSlots.map((i) => {
              const zajeto = occupiedSlots.includes(i);
              const label = slotLabels[i] ?? `Slot ${i}`;
              return (
                <option key={i} value={i} disabled={zajeto}>
                  {label}{zajeto ? ' (zauzeto)' : ''}
                </option>
              );
            })}
          </select>
        )}
        <p className="mt-1 text-xs text-[var(--kid-text-muted)]">
          {instructorId
            ? 'Prikazani su samo slotovi u kojima je predavač dostupan (spojeni blokovi, bez velikih pauza). Zauzeto = termin je već popunjen.'
            : 'Izaberite predavača da biste videli samo njegove dostupne termine (spojene blokove). Zauzeto = termin je već popunjen.'}
        </p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="w-full rounded-xl bg-[#0d9488] px-4 py-3 text-white font-semibold hover:bg-[#0f766e] disabled:opacity-50 transition-smooth hover-lift active:translate-y-0"
      >
        {loading ? 'Šaljem...' : !canSubmit ? 'Izaberite drugi datum ili predavača' : 'Pošalji zahtev'}
      </button>
    </form>
  );
}
