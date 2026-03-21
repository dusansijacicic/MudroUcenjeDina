'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createTermAsAdmin, createPredavanjeAsAdmin, getTakenForSlot } from '../../actions';
import GrupniKlijentiPicker from '@/components/GrupniKlijentiPicker';

type Instructor = { id: string; ime: string; prezime: string };
type Client = { id: string; ime: string; prezime: string };
type Classroom = { id: string; naziv: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null };
type TermCategoryOption = { id: string; naziv: string; jedan_klijent_po_terminu: boolean };

export default function AdminTerminForm({
  instructors,
  clients,
  classrooms,
  termTypes = [],
  termCategories = [],
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
  termCategories?: TermCategoryOption[];
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
  const [termCategoryId, setTermCategoryId] = useState(
    () =>
      termCategories.find((c) => c.jedan_klijent_po_terminu)?.id ?? termCategories[0]?.id ?? ''
  );
  const [termNapomena, setTermNapomena] = useState('');
  const [grupniIds, setGrupniIds] = useState<string[]>([]);
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

  const selectedCat = termCategories.find((c) => c.id === termCategoryId);
  const allowsMultipleClients = selectedCat ? !selectedCat.jedan_klijent_po_terminu : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (termCategories.length === 0) {
        setError('Nema kategorija termina. Dodajte ih u Admin → Kategorije termina.');
        return;
      }
      if (!termCategoryId) {
        setError('Izaberite kategoriju termina.');
        return;
      }
      if (!allowsMultipleClients && !clientId) {
        setError('Izaberite klijenta.');
        return;
      }
      if (allowsMultipleClients && grupniIds.length === 0) {
        setError('Za grupni termin označite bar jedno dete.');
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

      const termResult = await createTermAsAdmin(
        instructorId,
        date,
        slotIndex,
        classroomId,
        termCategoryId,
        termNapomena.trim() || null
      );
      if (termResult.error || !termResult.termId) {
        setError(termResult.error ?? 'Greška pri kreiranju termina.');
        return;
      }

      const idsToAdd = allowsMultipleClients ? grupniIds : [clientId];
      for (const cid of idsToAdd) {
        const predavanjeResult = await createPredavanjeAsAdmin(
          termResult.termId,
          cid,
          false,
          false,
          null,
          termTypeId || null
        );
        if (predavanjeResult.error) {
          setError(predavanjeResult.error);
          return;
        }
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
        Nema instruktora. Prvo dodajte instruktora preko „Novi instruktor”.
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

  if (termCategories.length === 0) {
    return (
      <p className="text-stone-500 text-sm">
        Nema kategorija termina. Dodajte bar jednu u Admin → Kategorije termina, pa se vratite na zakazivanje.
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
              <p className="font-medium">Nema slobodnih instruktora u ovom terminu.</p>
              <p className="mt-0.5 text-amber-700">Svi instruktori već imaju termin u izabranom datumu i vremenu. Promenite datum ili vreme (slot) da biste videli slobodne instruktore.</p>
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
          <label className="block text-sm font-medium text-stone-700 mb-1">Instruktor</label>
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            required
            disabled={noInstructorsAvailable || slotFull}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 disabled:bg-stone-100 disabled:cursor-not-allowed"
          >
            <option value="">Izaberite instruktora</option>
            {availableInstructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ime} {i.prezime}
              </option>
            ))}
          </select>
          {takenInstructorIds.length > 0 && availableInstructors.length > 0 && (
            <p className="text-xs text-stone-500 mt-0.5">{takenInstructorIds.length} instruktor(a) već ima termin u ovom slotu.</p>
          )}
        </div>
        <div className="sm:col-span-2 space-y-3 rounded-lg border border-stone-200 bg-stone-50/80 p-3">
          <p className="text-sm font-medium text-stone-800">Kategorija termina</p>
          {termCategories.length === 0 ? (
            <p className="text-sm text-amber-700">Dodajte kategorije u Admin → Kategorije termina.</p>
          ) : (
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Kategorija</label>
              <select
                value={termCategoryId}
                onChange={(e) => setTermCategoryId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
              >
                {termCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.naziv}
                    {c.jedan_klijent_po_terminu ? ' (jedno dete)' : ' (grupa)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Napomena za termin (opciono)</label>
            <textarea
              value={termNapomena}
              onChange={(e) => setTermNapomena(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            />
          </div>
        </div>
        {allowsMultipleClients ? (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-stone-700 mb-2">Deca u grupnom terminu</label>
            <p className="text-xs text-stone-500 mb-3">
              Pretraga i checkbox – označite jedno ili više dece.
            </p>
            <GrupniKlijentiPicker
              clients={clients}
              selectedIds={grupniIds}
              onSelectionChange={setGrupniIds}
              disabled={loading}
              inputId="admin-termin-grupni-search"
            />
          </div>
        ) : (
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
        )}
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
        <label className="block text-sm font-medium text-stone-700 mb-1">Vrsta termina (tip časa, cena)</label>
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
        <p className="text-xs text-stone-500 mt-1">Kategorija = jedno dete ili grupa; vrsta = koja obuka i cena.</p>
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
        {loading ? 'Kreiranje...' : slotFull ? `Slot pun (max ${maxTerminaPoSlotu})` : cannotSubmit ? 'Nema slobodnih instruktora ili učionica' : 'Zakaži termin i radionicu'}
      </button>
    </form>
  );
}
