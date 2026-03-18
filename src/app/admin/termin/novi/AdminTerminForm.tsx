'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createTermAsAdmin, createPredavanjeAsAdmin, getTakenForSlot } from '../../actions';

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
  initialTakenInstructorIds = [],
  initialTakenClassroomIds = [],
  maxTerminaPoSlotu = 4,
}: {
  instructors: Instructor[];
  clients: Client[];
  classrooms: Classroom[];
  termTypes?: TermTypeOption[];
  defaultDate: string;
  defaultSlotIndex?: number;
  slotLabels: readonly string[];
  initialTakenInstructorIds?: string[];
  initialTakenClassroomIds?: string[];
  maxTerminaPoSlotu?: number;
}) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [slotIndex, setSlotIndex] = useState(defaultSlotIndex);
  const [takenInstructorIds, setTakenInstructorIds] = useState<string[]>(initialTakenInstructorIds);
  const [takenClassroomIds, setTakenClassroomIds] = useState<string[]>(initialTakenClassroomIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableInstructors = useMemo(
    () => instructors.filter((i) => !takenInstructorIds.includes(i.id)),
    [instructors, takenInstructorIds]
  );
  const availableClassrooms = useMemo(
    () => classrooms.filter((c) => !takenClassroomIds.includes(c.id)),
    [classrooms, takenClassroomIds]
  );

  const [instructorId, setInstructorId] = useState(
    () => instructors.filter((i) => !initialTakenInstructorIds.includes(i.id))[0]?.id ?? ''
  );
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [classroomId, setClassroomId] = useState(
    () => classrooms.filter((c) => !initialTakenClassroomIds.includes(c.id))[0]?.id ?? ''
  );
  const [termTypeId, setTermTypeId] = useState(termTypes[0]?.id ?? '');

  useEffect(() => {
    if (availableInstructors.length && !availableInstructors.some((i) => i.id === instructorId)) {
      setInstructorId(availableInstructors[0]?.id ?? '');
    } else if (!availableInstructors.length) {
      setInstructorId('');
    }
  }, [availableInstructors, instructorId]);
  useEffect(() => {
    if (availableClassrooms.length && !availableClassrooms.some((c) => c.id === classroomId)) {
      setClassroomId(availableClassrooms[0]?.id ?? '');
    } else if (!availableClassrooms.length) {
      setClassroomId('');
    }
  }, [availableClassrooms, classroomId]);

  useEffect(() => {
    let cancelled = false;
    getTakenForSlot(date, slotIndex).then(({ takenInstructorIds: ti, takenClassroomIds: tc }) => {
      if (!cancelled) {
        setTakenInstructorIds(ti);
        setTakenClassroomIds(tc);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [date, slotIndex]);

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

  const slotFull = takenInstructorIds.length >= maxTerminaPoSlotu;
  const noInstructorsAvailable = !slotFull && availableInstructors.length === 0;
  const noClassroomsAvailable = !slotFull && availableClassrooms.length === 0;
  const cannotSubmit = slotFull || noInstructorsAvailable || noClassroomsAvailable;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {slotFull && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Maksimalan broj termina u ovom slotu je dostignut ({maxTerminaPoSlotu}).</p>
          <p className="mt-0.5 text-amber-700">Promenite datum ili vreme, ili povećajte limit u Admin → Podešavanja.</p>
        </div>
      )}
      {(noInstructorsAvailable || noClassroomsAvailable) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {noInstructorsAvailable && (
            <>
              <p className="font-medium">Nema slobodnih predavača u ovom terminu.</p>
              <p className="mt-0.5 text-amber-700">Svi predavači već imaju termin u izabranom datumu i vremenu. Promenite datum ili vreme (slot) da biste videli slobodne predavače.</p>
            </>
          )}
          {noClassroomsAvailable && (
            <>
              <p className="font-medium mt-2">Nema slobodnih učionica u ovom terminu.</p>
              <p className="mt-0.5 text-amber-700">Sve učionice su zauzete u izabranom terminu. Promenite datum ili vreme da biste videli slobodne učionice.</p>
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Predavač</label>
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            required
            disabled={noInstructorsAvailable || slotFull}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 disabled:bg-stone-100 disabled:cursor-not-allowed"
          >
            <option value="">Izaberite predavača</option>
            {availableInstructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ime} {i.prezime}
              </option>
            ))}
          </select>
          {takenInstructorIds.length > 0 && availableInstructors.length > 0 && (
            <p className="text-xs text-stone-500 mt-0.5">{takenInstructorIds.length} predavač(a) već ima termin u ovom slotu.</p>
          )}
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
          disabled={noClassroomsAvailable || slotFull}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 disabled:bg-stone-100 disabled:cursor-not-allowed"
        >
          <option value="">Izaberite učionicu</option>
          {availableClassrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.naziv}
            </option>
          ))}
        </select>
        {takenClassroomIds.length > 0 && availableClassrooms.length > 0 && (
          <p className="text-xs text-stone-500 mt-0.5">{takenClassroomIds.length} učionica je zauzeta u ovom slotu.</p>
        )}
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
        disabled={loading || cannotSubmit}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Kreiranje...' : slotFull ? `Slot pun (max ${maxTerminaPoSlotu})` : cannotSubmit ? 'Nema slobodnih predavača ili učionica' : 'Zakaži termin i predavanje'}
      </button>
    </form>
  );
}
