'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { INSTRUCTOR_COLORS, DEFAULT_INSTRUCTOR_COLOR, TIME_SLOTS } from '@/lib/constants';
import { saveInstructorSettings } from './actions';
import type { Instructor } from '@/types/database';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 7] as const;

export default function PodesavanjaForm({
  instructor,
  dayNames,
  initialAvailability,
}: {
  instructor: Instructor;
  dayNames: Record<number, string>;
  initialAvailability: Record<number, number[]>;
}) {
  const router = useRouter();
  const [ime, setIme] = useState(instructor.ime);
  const [prezime, setPrezime] = useState(instructor.prezime);
  const [telefon, setTelefon] = useState(instructor.telefon ?? '');
  const [color, setColor] = useState(instructor.color ?? DEFAULT_INSTRUCTOR_COLOR);
  const [availability, setAvailability] = useState<Record<number, number[]>>(() => {
    const next: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    for (const d of DAY_ORDER) next[d] = [...(initialAvailability[d] ?? [])];
    return next;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleSlot = (day: number, slotIndex: number) => {
    setAvailability((prev) => {
      const list = prev[day] ?? [];
      const has = list.includes(slotIndex);
      return {
        ...prev,
        [day]: has ? list.filter((s) => s !== slotIndex) : [...list, slotIndex].sort((a, b) => a - b),
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log('[PodesavanjaForm] submit start', { instructorId: instructor.id });
    try {
      const availabilityRows: Array<{ day_of_week: number; slot_index: number }> = [];
      for (const d of DAY_ORDER) {
        for (const slotIndex of availability[d] ?? []) {
          availabilityRows.push({ day_of_week: d, slot_index: slotIndex });
        }
      }
      const result = await saveInstructorSettings(instructor.id, {
        ime: ime.trim(),
        prezime: prezime.trim(),
        telefon: telefon.trim() || null,
        color: color.trim() || null,
        availability: availabilityRows,
      });
      if (result.error) {
        console.error('[PodesavanjaForm] save failed', result.error);
        setError(result.error);
        toast.error(result.error);
        return;
      }
      console.log('[PodesavanjaForm] save success');
      toast.success('Podešavanja sačuvana.');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      console.error('[PodesavanjaForm] catch', err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Ime
        </label>
        <input
          type="text"
          value={ime}
          onChange={(e) => setIme(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Prezime
        </label>
        <input
          type="text"
          value={prezime}
          onChange={(e) => setPrezime(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Telefon
        </label>
        <input
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Boja u kalendaru
        </label>
        <p className="text-xs text-stone-500 mb-2">
          Tvoji termini će se u kalendaru prikazivati ovom bojom.
        </p>
        <div className="flex flex-wrap gap-2">
          {INSTRUCTOR_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                color === c.value
                  ? 'border-stone-800 scale-110'
                  : 'border-stone-200 hover:border-stone-400'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-stone-200 pt-6">
        <h2 className="text-base font-medium text-stone-800 mb-1">Dostupnost (nedeljni raspored)</h2>
        <p className="text-xs text-stone-500 mb-4">
          Označi u kojim terminima si dostupan tokom nedelje. Klijenti će pri zakazivanju videti samo ove slotove. Ako ništa ne označiš, za taj dan se neće nuditi nijedan termin.
        </p>
        <div className="space-y-3">
          {DAY_ORDER.map((day) => (
            <div key={day} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm font-medium text-stone-700">{dayNames[day] ?? day}</span>
              <div className="flex flex-wrap gap-1">
                {TIME_SLOTS.map((label, slotIndex) => {
                  const checked = (availability[day] ?? []).includes(slotIndex);
                  return (
                    <label
                      key={slotIndex}
                      className={`inline-flex items-center rounded px-2 py-1 text-xs cursor-pointer border ${
                        checked ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-stone-50 border-stone-200 text-stone-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSlot(day, slotIndex)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : 'Sačuvaj'}
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Nazad
        </Link>
      </div>
    </form>
  );
}
