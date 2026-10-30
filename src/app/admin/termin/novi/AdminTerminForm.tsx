'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { createTermAsAdmin, createPredavanjeAsAdmin, repeatTermAsAdmin, addPotentialClientsAsAdmin, getTakenForSlot, getTermsForNastavak, createBulkZahteviAsAdmin } from '../../actions';
import type { TermForNastavak } from '../../actions';
import GrupniKlijentiPicker from '@/components/GrupniKlijentiPicker';
import SingleKlijentPicker from '@/components/SingleKlijentPicker';
import PotentialClientRowsInput, { emptyPotentialClientDraft, draftsToPayload, type PotentialClientDraft } from '../PotentialClientRowsInput';
import { TIME_SLOTS } from '@/lib/constants';
import { findDefaultCitanjeTermTypeId } from '@/lib/term-types';

type Instructor = { id: string; ime: string; prezime: string };
type Client = { id: string; ime: string; prezime: string; godiste?: number | null; datumTestiranja?: string | null };
type Classroom = { id: string; naziv: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null; program_id?: string | null };
type TermCategoryOption = { id: string; naziv: string; jedan_klijent_po_terminu: boolean; is_testing?: boolean; is_nastavak?: boolean };

function getMonday(d: Date): string {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x.toISOString().slice(0, 10);
}

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
  initialBlockedInstructorIds = [],
  initialTakenClassroomIds = [],
  maxTerminaPoSlotu = 4,
  initialCategoryIsTesting = false,
  completedProgramIdsByClient = {},
  initialBlocked = null,
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
  /** Instruktori blokirani samo za sebe u ovom slotu (za datum ili stalna nedeljna blokada). */
  initialBlockedInstructorIds?: string[];
  initialTakenClassroomIds?: string[];
  maxTerminaPoSlotu?: number;
  /** Ako je true, default kategorija je "Testiranje" (prečica sa prazne ćelije kalendara). */
  initialCategoryIsTesting?: boolean;
  /** client_id -> program_id[] (koje je programe klijent završio) – za sakrivanje u pretrazi. */
  completedProgramIdsByClient?: Record<string, string[]>;
  /** Ako je početni slot blokiran (Admin → Blokiraj termin(e)). */
  initialBlocked?: { napomena: string | null } | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [slotIndex, setSlotIndex] = useState(defaultSlotIndex);
  const [takenInstructorIds, setTakenInstructorIds] = useState<string[]>(initialTakenInstructorIds);
  const [blockedInstructorIds, setBlockedInstructorIds] = useState<string[]>(initialBlockedInstructorIds);
  const [takenClassroomIds, setTakenClassroomIds] = useState<string[]>(initialTakenClassroomIds);
  const [blocked, setBlocked] = useState<{ napomena: string | null } | null>(initialBlocked);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Difolt bez instruktora i bez učionice – admin ih bira svesno, umesto da se neko unapred bira.
  const [instructorId, setInstructorId] = useState('');
  const [clientId, setClientId] = useState('');
  const [termCategoryId, setTermCategoryId] = useState(() => {
    if (initialCategoryIsTesting) {
      const testing = termCategories.find((c) => c.is_testing);
      if (testing) return testing.id;
    }
    return termCategories.find((c) => c.jedan_klijent_po_terminu && !c.is_testing && !c.is_nastavak)?.id ?? termCategories[0]?.id ?? '';
  });
  const [termNapomena, setTermNapomena] = useState('');
  const [grupniIds, setGrupniIds] = useState<string[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [termTypeId, setTermTypeId] = useState(() => findDefaultCitanjeTermTypeId(termTypes) ?? termTypes[0]?.id ?? '');
  /** 0 = samo za danas (default). Ponavlja se svaki naredni kalendarski dan (ne isti dan u nedelji). */
  const [repeatDays, setRepeatDays] = useState(0);
  /** Za kategoriju Testiranje: deca za upis direktno pri kreiranju termina (umesto naknadno). */
  const [potentialRows, setPotentialRows] = useState<PotentialClientDraft[]>([emptyPotentialClientDraft()]);
  const selectedProgramId = termTypes.find((tt) => tt.id === termTypeId)?.program_id ?? null;
  const completedIds = useMemo(() => {
    if (!selectedProgramId) return new Set<string>();
    const set = new Set<string>();
    for (const [cid, programIds] of Object.entries(completedProgramIdsByClient)) {
      if (programIds.includes(selectedProgramId)) set.add(cid);
    }
    return set;
  }, [selectedProgramId, completedProgramIdsByClient]);

  // NASTAVAK state
  const [nastavakTerms, setNastavakTerms] = useState<TermForNastavak[]>([]);
  const [nastavakLoading, setNastavakLoading] = useState(false);
  const [nastavakOfTermId, setNastavakOfTermId] = useState('');

  const selectedCat = termCategories.find((c) => c.id === termCategoryId);
  const isTestingCat = selectedCat?.is_testing === true;
  const isNastavakCat = selectedCat?.is_nastavak === true;
  const allowsMultipleClients = !isTestingCat && !isNastavakCat && selectedCat ? !selectedCat.jedan_klijent_po_terminu : false;

  const selectedParentTerm = nastavakTerms.find((t) => t.id === nastavakOfTermId) ?? null;

  useEffect(() => {
    let cancelled = false;
    getTakenForSlot(date, slotIndex).then(({ takenInstructorIds: ti, takenClassroomIds: tc, blocked: b, blockedInstructorIds: bi }) => {
      if (!cancelled) {
        setTakenInstructorIds(ti);
        setTakenClassroomIds(tc);
        setBlocked(b);
        setBlockedInstructorIds(bi);
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
  // Izabrani (ili iz roditeljskog termina preuzeti) instruktor ne radi u to vreme – blokada za datum ili stalna nedeljna.
  const instructorBlocked = !!instructorId && blockedInstructorIds.includes(instructorId);
  const cannotSubmit = !!blocked || slotFull || nastavakInstructorBusy || nastavakClassroomBusy || instructorBlocked;

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

      const monday = getMonday(new Date(date + 'T12:00:00'));

      // Bez instruktora → zahtev (isti mehanizam kao "Zakaži više časova"): bilo koji predavač ga
      // preuzima, a na kalendaru se vidi u listi termina bez instruktora/učionice.
      if (!isNastavakCat && !instructorId) {
        if (isTestingCat) { setError('Za termin testiranja izaberite instruktora.'); return; }
        if (allowsMultipleClients) { setError('Za grupni termin izaberite instruktora.'); return; }
        const effectiveDays = Math.max(0, repeatDays);
        const slots = Array.from({ length: effectiveDays + 1 }, (_, offset) => {
          const d = new Date(date + 'T12:00:00');
          d.setDate(d.getDate() + offset);
          return { date: d.toISOString().slice(0, 10), slotIndex };
        });
        const { failed } = await createBulkZahteviAsAdmin(clientId, termTypeId || null, slots, classroomId || null);
        if (failed.length === slots.length) {
          setError(failed.map((f) => `${f.date}: ${f.error}`).join('; '));
          return;
        }
        if (failed.length > 0) {
          toast.error(`Nije kreirano za: ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
        } else {
          toast.success(`Kreirano ${slots.length} zahtev(a) bez instruktora.`);
        }
        router.push(`/admin/kalendar?view=nedelja&week=${monday}&fokus=${date}&slot=${slotIndex}`);
        router.refresh();
        return;
      }

      const termResult = await createTermAsAdmin(
        instructorId,
        date,
        slotIndex,
        classroomId || null,
        termCategoryId,
        termNapomena.trim() || null,
        isNastavakCat ? nastavakOfTermId : null
      );
      if (termResult.error || !termResult.termId) {
        setError(termResult.error ?? 'Greška pri kreiranju termina.');
        return;
      }

      const idsToAdd = (isNastavakCat || allowsMultipleClients) ? grupniIds : [clientId];
      if (!isTestingCat) {
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
      } else {
        const potentialPayload = draftsToPayload(potentialRows);
        if (potentialPayload.length > 0) {
          const pcResult = await addPotentialClientsAsAdmin(termResult.termId, potentialPayload);
          if (pcResult.error) { setError(pcResult.error); return; }
        }
      }

      // "Zakaži isti termin i narednih N dana" – samo za obične (ne testiranje/nastavak) termine.
      // Jedan poziv serveru koji sam iznutra paralelizuje dane, umesto N poziva sa klijenta (svaki
      // pun HTTP round-trip) – to je ono što je prethodno pravilo "visi na Kreiranje…".
      const effectiveRepeatDays = !isTestingCat && !isNastavakCat ? repeatDays : 0;
      if (effectiveRepeatDays > 0) {
        const { failed } = await repeatTermAsAdmin(
          instructorId,
          date,
          slotIndex,
          classroomId || null,
          termCategoryId,
          termNapomena.trim() || null,
          idsToAdd,
          termTypeId || null,
          effectiveRepeatDays
        );
        if (failed.length > 0) {
          toast.error(`Nije zakazano za: ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
        } else {
          toast.success(`Zakazano i za narednih ${effectiveRepeatDays} dana.`);
        }
      }

      router.push(`/admin/kalendar?view=nedelja&week=${monday}&fokus=${date}&slot=${slotIndex}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (instructors.length === 0) {
    return <p className="text-stone-500 text-sm">Nema instruktora. Prvo dodajte instruktora preko „Novi instruktor“.</p>;
  }
  if (clients.length === 0 && !isTestingCat && !isNastavakCat) {
    return <p className="text-stone-500 text-sm">Nema klijenata. Prvo dodajte klijenta.</p>;
  }
  if (classrooms.length === 0) {
    return <p className="text-stone-500 text-sm">Nema učionica. Dodajte učionice u sekciji „Učionice“, pa se vratite na zakazivanje.</p>;
  }
  if (termTypes.length === 0 && !isTestingCat && !isNastavakCat) {
    return <p className="text-stone-500 text-sm">Nema vrsta termina. Dodajte bar jednu vrstu u Admin → Vrste termina, pa se vratite na zakazivanje.</p>;
  }
  if (termCategories.length === 0) {
    return <p className="text-stone-500 text-sm">Nema kategorija termina. Dodajte bar jednu u Admin → Kategorije termina, pa se vratite na zakazivanje.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-end">
        <a
          href="/admin/uputstvo#zakazivanje-termina"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-amber-700 hover:underline"
        >
          Uputstvo za zakazivanje →
        </a>
      </div>
      {blocked && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">⛔ Ovaj termin je blokiran — u njemu niko ne može da zakaže.</p>
          {blocked.napomena && <p className="mt-0.5 text-red-700">Razlog: {blocked.napomena}</p>}
          <p className="mt-0.5 text-red-700">Izaberite drugi datum ili vreme.</p>
        </div>
      )}
      {slotFull && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Maksimalan broj termina u ovom slotu je dostignut ({maxTerminaPoSlotu}).</p>
          <p className="mt-0.5 text-amber-700">Promenite datum ili vreme, ili povećajte limit u Admin → Podešavanja.</p>
        </div>
      )}
      {instructorBlocked && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          Izabrani instruktor je blokiran u ovo vreme (ne radi tada). Izaberite drugog instruktora, drugo vreme, ili „Bez instruktora“.
        </div>
      )}
      {(nastavakInstructorBusy || nastavakClassroomBusy) && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {nastavakInstructorBusy && <p className="font-medium">Instruktor iz roditeljskog termina već ima drugi termin u ovom slotu.</p>}
          {nastavakClassroomBusy && <p className="font-medium mt-1">Učionica iz roditeljskog termina je zauzeta u ovom slotu.</p>}
          <p className="mt-1 text-red-700">Promenite datum ili vreme za nastavak.</p>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
        {/* Izbor dece/klijenta – desna polovina na računaru. */}
        <div className="lg:order-2 rounded-xl border-2 border-amber-200 bg-amber-50/30 p-4">
          {isNastavakCat ? (
            <div>
              <p className="text-sm font-medium text-stone-800 mb-3">Klijenti u nastavku</p>
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
              <p className="text-sm font-medium text-stone-800 mb-3">Deca / klijent</p>
              {allowsMultipleClients ? (
                <GrupniKlijentiPicker
                  clients={clients}
                  selectedIds={grupniIds}
                  onSelectionChange={setGrupniIds}
                  disabled={loading}
                  inputId="admin-termin-grupni-search"
                  completedIds={completedIds}
                />
              ) : (
                <SingleKlijentPicker
                  clients={clients}
                  value={clientId}
                  onChange={setClientId}
                  disabled={loading}
                  inputId="admin-termin-klijent-search"
                  completedIds={completedIds}
                />
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-stone-800 mb-3">Deca za testiranje</p>
              <PotentialClientRowsInput rows={potentialRows} onChange={setPotentialRows} disabled={loading} />
            </div>
          )}
        </div>

        {/* Leva polovina na računaru: datum/vreme, kategorija, vrsta, instruktor/učionica, ponavljanje. */}
        <div className="lg:order-1 space-y-4">
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

          {isNastavakCat && selectedParentTerm ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Instruktor</label>
                <div className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-stone-700 text-sm">
                  {[selectedParentTerm.instructor_ime, selectedParentTerm.instructor_prezime].filter(Boolean).join(' ') || '—'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
                <div className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-stone-700 text-sm">
                  {selectedParentTerm.classroom_naziv || '—'}
                </div>
              </div>
            </div>
          ) : !isNastavakCat ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Instruktor</label>
                <select
                  value={instructorId}
                  onChange={(e) => setInstructorId(e.target.value)}
                  disabled={slotFull}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 disabled:bg-stone-100 disabled:cursor-not-allowed"
                >
                  <option value="">Bez instruktora</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id} disabled={takenInstructorIds.includes(i.id) || blockedInstructorIds.includes(i.id)}>
                      {i.ime} {i.prezime}
                      {takenInstructorIds.includes(i.id) ? ' (zauzeto)' : blockedInstructorIds.includes(i.id) ? ' (blokiran – ne radi tada)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
                <select
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  disabled={slotFull}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 disabled:bg-stone-100 disabled:cursor-not-allowed"
                >
                  <option value="">Bez učionice</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id} disabled={takenClassroomIds.includes(c.id)}>
                      {c.naziv}{takenClassroomIds.includes(c.id) ? ' (zauzeto)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {!isTestingCat && !isNastavakCat && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Zakaži isti termin i narednih
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={repeatDays}
                  onChange={(e) => setRepeatDays(Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)))}
                  className="w-20 rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
                />
                <span className="text-sm text-stone-600">dana</span>
              </div>
            </div>
          )}
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
        {loading
          ? 'Kreiranje...'
          : blocked
          ? 'Termin je blokiran'
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
