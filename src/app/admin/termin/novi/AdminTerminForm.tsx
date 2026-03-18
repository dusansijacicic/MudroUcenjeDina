'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTermAsAdmin } from '../../actions';

type Instructor = { id: string; ime: string; prezime: string };

export default function AdminTerminForm({
  instructors,
  defaultDate,
  defaultSlotIndex = 0,
  slotLabels,
}: {
  instructors: Instructor[];
  defaultDate: string;
  defaultSlotIndex?: number;
  slotLabels: readonly string[];
}) {
  const router = useRouter();
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate);
  const [slotIndex, setSlotIndex] = useState(defaultSlotIndex);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await createTermAsAdmin(instructorId, date, slotIndex);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.termId) {
        router.push(`/admin/termin/${result.termId}`);
        router.refresh();
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  if (instructors.length === 0) {
    return (
      <p className="text-stone-500 text-sm">
        Nema predavača. Prvo dodajte predavača preko „Novi predavač”.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Predavač</label>
        <select
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Datum</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Vreme (slot)</label>
        <select
          value={slotIndex}
          onChange={(e) => setSlotIndex(parseInt(e.target.value, 10))}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          {slotLabels.map((label, i) => (
            <option key={i} value={i}>{label}</option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Kreiranje...' : 'Zakaži termin i dodaj predavanje'}
      </button>
    </form>
  );
}
