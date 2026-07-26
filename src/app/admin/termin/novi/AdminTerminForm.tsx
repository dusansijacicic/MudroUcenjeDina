'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createTermAsAdmin, createPredavanjeAsAdmin, getTakenForSlot, getTermsForNastavak } from '../../actions';
import type { TermForNastavak } from '../../actions';
import GrupniKlijentiPicker from '@/components/GrupniKlijentiPicker';
import SingleKlijentPicker from '@/components/SingleKlijentPicker';
import { TIME_SLOTS } from '@/lib/constants';

type Instructor = { id: string; ime: string; prezime: string };
type Client = { id: string; ime: string; prezime: string };
type Classroom = { id: string; naziv: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null };
type TermCategoryOption = { id: string; naziv: string; jedan_klijent_po_terminu: boolean; is_testing?: boolean; is_nastavak?: boolean };

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

  const [instructorId, setInstructorId] = useState(
    () => instructors.filter((i) => !initialTakenInstructorIds.includes(i.id))[0]?.id ?? ''
  );
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [termCategoryId, setTermCategoryId] = useState(
    () => termCategories.find((c) => c.jedan_klijent_po_terminu && !c.is_testing && !c.is_nastavak)?.id ?? termCategories[0]?.id ?? ''
  );
  const [termNapomena, setTermNapomena] = useState('');
  const [grupniIds, setGrupniIds] = useState<string[]>([]);
  const [classroomId, setClassroomId] = useState(
    () => classrooms.filter((c) => !initialTakenClassroomIds.includes(c.id))[0]?.id ?? ''
  );
  const [termTypeId, setTermTypeId] = useState(termTypes[0]?.id ?? '');

  // NASTAVAK state
  const [nastavakTerms, setNastavakTerms] = useState<TermForNastavak[]>([]);
  const [nastavakLoading, setNastavakLoading] = useState(false);
  const [nastavakOfTermId, setNastavakOfTermId] = useState('');

  const selectedCat = termCategories.find((c) => c.id === termCategoryId);
  const isTestingCat = selectedCat?.is_testing === true;
  const isNastavakCat = selectedCat?.is_nastavak === true;
  const allowsMultipleClients = !isTestingCat && !isNastavakCat && selectedCat ? !selectedCat.jedan_klijent_po_terminu : false;

  const selectedParentTerm = nastavakTerms.find((t) => t.id === nastavakOfTermId) ?? null;

  const availableInstructors = useMemo(
    () => instructors.filter((i) => !takenInstructorIds.includes(i.id)),
    [instructors, takenInstructorIds]
  );
  const availableClassrooms = useMemo(
    () => classrooms.filter((c) => !takenClassroomIds.includes(c.id)),
    [classrooms, takenClassroomIds]
  );

  // When NOT nastavak: sync instructor/classroom dropdowns when slot changes
  useEffect(() => {
    if (isNastavakCat) return;
    if (availableInstructors.length && !availableInstructors.some((i) => i.id === instructorId)) {
      setInstructorId(availableInstructors[0]?.id ?? '');
    } else if (!availableInstructors.length) {
      setInstructorId('');
    }
  }, [availableInstructors, instructorId, isNastavakCat]);

  useEffect(() => {
    if (isNastavakCat) return;
    if (availableClassrooms.length && !availableClassrooms.some((c) => c.id === classroomId)) {
      setClassroomId(availableClassrooms[0]?.id ?? '');
    } else if (!availableClassrooms.length) {
      setClassroomId('');
    }
  }, [availableClassrooms, classroomId, isNastavakCat]);

  useEffect(() => {
    let cancelled = false;
    getTakenForSlot(date, slotIndex).then(({ takenInstructorIds: ti, takenClassroomIds: tc }) => {
      if (!cancelled) {
        setTakenInstructorIds(ti);
        setTakenClassroomIds(tc);
      }
    });
    return () => { cancelled = true; };
  }, [date, slotIndex]);

  // Load nastavak terms when NASTAVAK category is selected or date/slot changes
  useEffect(() => {
    if (!isNastavakCat) {
      setNastavakOfTermId('');
      setGrupniIds([]);
      setNastavakTerms([]);
      return;
    }
    setNastavakOfTermId('');
    setGrupniIds([]);
    setNastavakLoading(true);
    getTermsForNastavak(date, slotIndex).then((terms) => {
      setNastavakTerms(terms);
      setNastavakLoading(false);
    });
  }, [isNastavakCat, date, slotIndex]);

  // When parent term is selected: lock instructor+classroom, pre-populate clients
  useEffect(() => {
    if (!selectedParentTerm) return;
    if (selectedParentTerm.instructor_id) setInstructorId(selectedParentTerm.instructor_id);
    if (selectedParentTerm.classroom_id) setClassroomId(selectedParentTerm.classroom_id);
    setGrupniIds(selectedParentTerm.client_ids);
  }, [selectedParentTerm]);

  const nastavakInstructorBusy = isNastavakCat && !!selectedParentTerm && takenInstructorIds.includes(selectedParentTerm.instructor_id ?? '');
  const nastavakClassroomBusy = isNastavakCat && !!selectedParentTerm && takenClassroomIds.includes(selectedParentTerm.classroom_id ?? '');

  const slotFull = takenInstructorIds.length >= maxTerminaPoSlotu;
  const noInstructorsAvailable = !isNastavakCat && !slotFull && availableInstructors.length === 0;
  const noClassroomsAvailable = !isNastavakCat && !slotFull && availableClassrooms.length === 0;
  const cannotSubmit = slotFull || noInstructorsAvailable || noClassroomsAvailable || nastavakInstructorBusy || nastavakClassroomBusy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (termCategories.length === 0) { setError('Nema kategorija termina. Dodajte ih u Admin → Kategorije termina.'); return; }
      if (!termCategoryId) { setError('Izaberite kategoriju termina.'); return; }

      if (isNastavakCat) {
        if (!nastavakOfTermId) { setError('Izaberite termin čiji je ovo nastavak.'); return; }
        if (grupniIds.length === 0) { setError('Dodajte bar jednog klijenta u nastavak.'); return; }
        if (!instructorId) { setError('Izaberite roditeljski termin — instruktor nije pronađen.'); return; }
      } else if (!isTestingCat) {
        if (!allowsMultipleClients && !clientId) { setError('Izaberite klijenta.'); return; }
        if (allowsMultipleClients && grupniIds.length === 0) { setError('Za grupni termin označite bar jedno dete.'); return; }
        if (termTypes.length === 0) { setError('Prvo dodajte bar jednu vrstu termina u Admin → Vrste termina.'); return; }
        if (!termTypeId) { setError('Izaberite vrstu termina.'); return; }
      }

      if (!classroomId) { setError('Izaberite učionicu.'); return; }

      const termResult = await createTermAsAdmin(
        instructorId,
        date,
        slotIndex,
        classroomId,
        termCategoryId,
        termNapomena.trim() || null,
        isNastavakCat ? nastavakOfTermId : null
      );
      if (termResult.error || !termResult.termId) {
        setError(termResult.error ?? 'Greška pri kreiranju termina.');
        return;
      }

      if (!isTestingCat) {
        const idsToAdd = (isNastavakCat || allowsMultipleClients) ? grupniIds : [clientId];
        for (const cid of idsToAdd) {
          const predavanjeResult = await createPredavanjeAsAdmin(
            termResult.termId,
            cid,
            false,
            false,
            null,
            (!isNastavakCat && termTypeId) ? termTypeId : null
          );
          if (predavanjeResult.error) { setError(predavanjeResult.error); return; }
        }
      }

      router.push(`/admin/termin/${termResult.termId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (instructors.length === 0) {
    return <p className="text-stone-500 text-sm">Nema instruktora. Prvo dodajte instruktora preko „Novi instruktor".</p>;
  }
  if (clients.length === 0 && !isTestingCat && !isNastavakCat) {
    return <p className="text-stone-500 text-sm">Nema klijenata. Prvo dodajte klijenta.</p>;
  }
  if (classrooms.length === 0) {
    return <p className="text-stone-500 text-sm">Nema učionica. Dodajte učionice u sekciji „Učionice", pa se vratite na zakazivanje.</p>;
  }
  if (termTypes.length === 0 && !isTestingCat && !isNastavakCat) {
    return <p className="text-stone-500 text-sm">Nema vrsta termina. Dodajte bar jednu vrstu u Admin → Vrste termina, pa se vratite na zakazivanje.</p>;
  }
  if (termCategories.length === 0) {
    return <p className="text-stone-500 text-sm">Nema kategorija termina. Dodajte bar jednu u Admin → Kategorije termina, pa se vratite na zakazivanje.</p>;
  }

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
              <p className="mt-0.5 text-amber-700">Svi instruktori već imaju termin u izabranom datumu i vremenu.</p>
            </>
          )}
          {noClassroomsAvailable && (
            <>
              <p className="font-medium mt-2">Nema slobodnih učionica u ovom terminu.</p>
              <p className="mt-0.5 text-amber-700">Sve učionice su zauzete u izabranom terminu.</p>
            </>
          )}
        </div>
      )}
      {(nastavakInstructorBusy || nastavakClassroomBusy) && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {nastavakInstructorBusy && <p className="font-medium">Instruktor iz roditeljskog termina već ima drugi termin u ovom slotu.</p>}
          {nastavakClassroomBusy && <p className="font-medium mt-1">Učionica iz roditeljskog termina je zauzeta u ovom slotu.</p>}
          <p className="mt-1 text-red-700">Promenite datum ili vreme za nastavak.</p>
        </div>
      )}

      {/* Datum i slot */}
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
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Kategorija termina */}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/80 p-3">
        <p className="text-sm font-medium text-stone-800">Kategorija termina</p>
        <div>
          <select
            value={termCategoryId}
            onChange={(e) => setTermCategoryId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
          >
            {termCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}{(c.is_testing || c.is_nastavak) ? '' : c.jedan_klijent_po_terminu ? ' (jedno dete)' : ' (grupa)'}
              </option>
            ))}
          </select>
        </div>

        {/* NASTAVAK: parent term picker */}
        {isNastavakCat && (
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Roditeljski termin (čiji je ovo nastavak)</label>
            {nastavakLoading ? (
              <p className="text-xs text-stone-500">Učitavanje termina...</p>
            ) : slotIndex === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                Izabrani slot je prvi u danu — nema prethodnog slota.
              </p>
            ) : nastavakTerms.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                Nema termina sa zakazanim klijentima u prethodnom slotu ({TIME_SLOTS[slotIndex - 1]}) na izabrani datum.
              </p>
            ) : (
              <select
                value={nastavakOfTermId}
                onChange={(e) => setNastavakOfTermId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
              >
                <option value="">— Izaberite roditeljski termin —</option>
                {nastavakTerms.map((t) => {
                  const dateStr = new Date(t.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
                    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
                  });
                  const timeStr = TIME_SLOTS[t.slot_index] ?? '?';
                  const instrName = [t.instructor_ime, t.instructor_prezime].filter(Boolean).join(' ');
                  const clientNames = t.client_names.join(', ');
                  return (
                    <option key={t.id} value={t.id}>
                      {dateStr} · {timeStr} — {instrName}{t.classroom_naziv ? ` (${t.classroom_naziv})` : ''} — {clientNames}
                    </option>
                  );
                })}
              </select>
            )}
            {selectedParentTerm && (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-0.5">
                <p><span className="font-medium">Instruktor:</span> {[selectedParentTerm.instructor_ime, selectedParentTerm.instructor_prezime].filter(Boolean).join(' ') || '—'}</p>
                <p><span className="font-medium">Učionica:</span> {selectedParentTerm.classroom_naziv || '—'}</p>
                <p><span className="font-medium">Klijenti:</span> {selectedParentTerm.client_names.join(', ') || '—'}</p>
              </div>
            )}
          </div>
        )}

        {isTestingCat && (
          <p className="text-xs text-stone-500">
            Termin testiranja — posle kreiranja dodajte potencijalne klijente na stranici termina.
          </p>
        )}
        {isNastavakCat && (
          <p className="text-xs text-stone-500">
            Nastavak — koristi istog instruktora i učionicu kao roditeljski termin. Ne računa se u naplaćene časove.
          </p>
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

      {/* Vrsta termina — samo za obične termine */}
      {!isTestingCat && !isNastavakCat && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Vrsta termina <span className="text-stone-500 font-normal">(tip časa, cena)</span>
          </label>
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
      )}

      {/* Instruktor i učionica */}
      {isNastavakCat && selectedParentTerm ? (
        // NASTAVAK: prikaži locked instruktora i učionicu iz roditeljskog termina
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Instruktor</label>
            <div className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-stone-700 text-sm">
              {[selectedParentTerm.instructor_ime, selectedParentTerm.instructor_prezime].filter(Boolean).join(' ') || '—'}
              <span className="ml-2 text-xs text-stone-400">(preuzeto iz roditeljskog termina)</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
            <div className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-stone-700 text-sm">
              {selectedParentTerm.classroom_naziv || '—'}
              <span className="ml-2 text-xs text-stone-400">(preuzeto iz roditeljskog termina)</span>
            </div>
          </div>
        </div>
      ) : !isNastavakCat ? (
        // Normalni i testiranje: dropdown za instruktora i učionicu
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
                <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
              ))}
            </select>
            {takenInstructorIds.length > 0 && availableInstructors.length > 0 && (
              <p className="text-xs text-stone-500 mt-0.5">{takenInstructorIds.length} instruktor(a) već ima termin u ovom slotu.</p>
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
                <option key={c.id} value={c.id}>{c.naziv}</option>
              ))}
            </select>
            {takenClassroomIds.length > 0 && availableClassrooms.length > 0 && (
              <p className="text-xs text-stone-500 mt-0.5">{takenClassroomIds.length} učionica je zauzeta u ovom slotu.</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Klijenti */}
      {isNastavakCat ? (
        <div>
          <p className="text-sm font-medium text-stone-800 mb-1">Klijenti u nastavku</p>
          <p className="text-xs text-stone-500 mb-3">Pre-popunjeno iz roditeljskog termina. Možete ukloniti ili dodati.</p>
          <GrupniKlijentiPicker
            clients={clients}
            selectedIds={grupniIds}
            onSelectionChange={setGrupniIds}
            disabled={loading}
            inputId="admin-nastavak-klijenti-search"
          />
        </div>
      ) : !isTestingCat ? (
        <div>
          <p className="text-sm font-medium text-stone-800 mb-1">Deca / klijent</p>
          {allowsMultipleClients ? (
            <div>
              <p className="text-xs text-stone-500 mb-3">Pretraga i checkbox — označite jedno ili više dece.</p>
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
              <label className="block text-xs font-medium text-stone-700 mb-1">Klijent</label>
              <SingleKlijentPicker
                clients={clients}
                value={clientId}
                onChange={setClientId}
                disabled={loading}
                inputId="admin-termin-klijent-search"
              />
            </div>
          )}
        </div>
      ) : null}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || cannotSubmit}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? 'Kreiranje...'
          : slotFull
          ? `Slot pun (max ${maxTerminaPoSlotu})`
          : cannotSubmit
          ? 'Nije moguće zakazati u ovom slotu'
          : isTestingCat
          ? 'Zakaži termin testiranja'
          : isNastavakCat
          ? 'Zakaži nastavak'
          : 'Zakaži termin i radionicu'}
      </button>
    </form>
  );
}
