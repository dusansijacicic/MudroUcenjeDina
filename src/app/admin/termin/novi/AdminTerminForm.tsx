'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTermAsAdmin, createPredavanjeAsAdmin } from '../../actions';

type Instructor = { id: string; ime: string; prezime: string };
type Client = { id: string; ime: string; prezime: string };
type Classroom = { id: string; naziv: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null };

export default function AdminTerminForm({
  instructors,
  clients,
  classrooms,
  termTypes = [],
  defaultDate,
  defaultSlotIndex = 0,
  slotLabels,
}: {
  instructors: Instructor[];
  clients: Client[];
  classrooms: Classroom[];
  termTypes?: TermTypeOption[];
  defaultDate: string;
  defaultSlotIndex?: number;
  slotLabels: readonly string[];
}) {
  const router = useRouter();
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? '');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate);
  const [slotIndex, setSlotIndex] = useState(defaultSlotIndex);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '');
  const [termTypeId, setTermTypeId] = useState(termTypes[0]?.id ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!clientId) {
        setError('Izaberite klijenta.');
        return;
      }
      if (!classroomId) {
        setError('Izaberite učionicu.');
        return;
      }
      if (termTypes.length > 0 && !termTypeId) {
        setError('Izaberite vrstu termina.');
        return;
      }
      if (termTypes.length === 0) {
        setError('Prvo dodajte bar jednu vrstu termina u Admin → Vrste termina.');
        return;
      }

      const termResult = await createTermAsAdmin(instructorId, date, slotIndex, classroomId);
      if (termResult.error || !termResult.termId) {
        setError(termResult.error ?? 'Greška pri kreiranju termina.');
        return;
      }

      const predavanjeResult = await createPredavanjeAsAdmin(
        termResult.termId,
        clientId,
        false,
        false,
        null,
        termTypeId || null
      );
      if (predavanjeResult.error) {
        setError(predavanjeResult.error);
        return;
      }

      router.push(`/admin/termin/${termResult.termId}`);
      router.refresh();
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

  if (clients.length === 0) {
    return (
      <p className="text-stone-500 text-sm">
        Nema klijenata. Prvo dodajte klijenta preko „Novi klijent”.
      </p>
    );
  }

  if (classrooms.length === 0) {
    return (
      <p className="text-stone-500 text-sm">
        Nema učionica. Dodajte učionice u sekciji „Učionice”, pa se vratite na zakazivanje.
      </p>
    );
  }

  if (termTypes.length === 0) {
    return (
      <p className="text-stone-500 text-sm">
        Nema vrsta termina. Dodajte bar jednu vrstu u Admin → Vrste termina, pa se vratite na zakazivanje.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Predavač</label>
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ime} {i.prezime}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Klijent</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ime} {c.prezime}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
        <select
          value={classroomId}
          onChange={(e) => setClassroomId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.naziv}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Vrsta termina</label>
        <select
          value={termTypeId}
          onChange={(e) => setTermTypeId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">Izaberite vrstu termina</option>
          {termTypes.map((tt) => (
            <option key={tt.id} value={tt.id}>{tt.naziv}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Kreiranje...' : 'Zakaži termin i predavanje'}
      </button>
    </form>
  );
}
