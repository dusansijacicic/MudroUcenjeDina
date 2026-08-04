'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { TIME_SLOTS, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import Link from 'next/link';
import {
  moveTermAsAdmin,
  swapTermsAsAdmin,
  copyTermToSlotsAsAdmin,
  deleteTermsAsAdmin,
  deleteOtkazaniTermin,
  createBulkZahteviAsAdmin,
  assignInstructorToTermsAsAdmin,
  assignClassroomToTermsAsAdmin,
  assignInstructorToZahteviAsAdmin,
  assignClassroomToZahteviAsAdmin,
  assignTermTypeToTermsAsAdmin,
  assignTermTypeToZahteviAsAdmin,
} from '@/app/admin/actions';
import SingleKlijentPicker from '@/components/SingleKlijentPicker';

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

export type OtkazaniTerminCalendar = {
  id: string;
  client_ime: string;
  client_prezime?: string | null;
  instructor_ime?: string | null;
  instructor_prezime?: string | null;
  term_date: string;
  slot_index: number;
  term_type_naziv?: string | null;
  placeno: boolean;
};

/** Zahtev (zahtevi_za_cas) na čekanju, bez instruktora – prikazan na kalendaru samo informativno
 * ("Više termina" mod ih pravi umesto pravih termina); preuzima ih predavač na Dashboard → Zahtevi. */
export type PendingZahtevCalendar = {
  id: string;
  date: string;
  slot_index: number;
  client_ime: string;
  client_prezime?: string | null;
  term_type_naziv?: string | null;
  classroom_naziv?: string | null;
};

export type PotentialClientCalendar = {
  id: string;
  ime: string;
  prezime?: string | null;
  ime_roditelja?: string | null;
  mobilni_roditelja?: string | null;
  status: string;
};

export type AdminTerm = {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
  classroom?: { id: string; naziv: string; color?: string | null } | null;
  instructor?: { id: string; ime: string; prezime: string; color?: string | null } | null;
  term_category?: { id: string; naziv: string; is_testing: boolean } | null;
  predavanja?: Array<{
    id: string;
    client?: { id: string; ime: string; prezime: string } | null;
    term_type?: { naziv: string } | { naziv: string }[] | null;
  }>;
  potential_clients?: PotentialClientCalendar[];
  /** Napomena termina – koristi se i za prepoznavanje automatski kreiranog "dvočas" bloka. */
  napomena?: string | null;
  /** Ako je setovan, ovo je nastavak (ručni ili automatski blok) roditeljskog termina. */
  nastavak_of_term_id?: string | null;
};

/** Automatski kreiran "blokirajući" termin za dvočas – prazan, samo zauzima sledeći slot. */
function isAutoSpillover(term: AdminTerm): boolean {
  return !!term.nastavak_of_term_id && term.napomena === AUTO_SPILLOVER_NAPOMENA && (term.predavanja ?? []).length === 0;
}

/** Kontekst za "Swap"/"Copy"/"Delete" mod i akcije nad otkazanim terminima – prosleđen direktno od
 * AdminCalendarView do AdminCellContent, bez prljanja potpisa AdminWeekView/AdminDayView koji ovo
 * stanje ne koriste, samo ga prenose dalje. */
type SwapContextValue = {
  swapMode: boolean;
  isSelected: (termId: string) => 'first' | 'second' | null;
  onSelectTerm: (term: AdminTerm) => void;
  onDeleteOtkazani: (id: string) => void;
  copyMode: boolean;
  copySourceId: string | null;
  onSelectCopySource: (term: AdminTerm) => void;
  isCopyTargetSelected: (date: string, slot: number) => boolean;
  onToggleCopyTarget: (date: string, slot: number) => void;
  deleteMode: boolean;
  isMarkedForDelete: (termId: string) => boolean;
  onToggleDeleteSelect: (termId: string) => void;
  isOtkazaniMarkedForDelete: (id: string) => boolean;
  onToggleOtkazaniDeleteSelect: (id: string) => void;
  isZahtevMarkedForDelete: (zahtevId: string) => boolean;
  onToggleZahtevDeleteSelect: (zahtevId: string) => void;
  bulkMode: boolean;
  isBulkSelected: (date: string, slot: number) => boolean;
  onToggleBulkSlot: (date: string, slot: number) => void;
  assignMode: boolean;
  isMarkedForAssign: (termId: string) => boolean;
  onToggleAssignSelect: (termId: string) => void;
  isZahtevMarkedForAssign: (zahtevId: string) => boolean;
  onToggleAssignZahtevSelect: (zahtevId: string) => void;
  highlightPendingZahtevi: boolean;
};
const SwapContext = createContext<SwapContextValue>({
  swapMode: false,
  isSelected: () => null,
  onSelectTerm: () => {},
  onDeleteOtkazani: () => {},
  copyMode: false,
  copySourceId: null,
  onSelectCopySource: () => {},
  isCopyTargetSelected: () => false,
  onToggleCopyTarget: () => {},
  deleteMode: false,
  isMarkedForDelete: () => false,
  onToggleDeleteSelect: () => {},
  isOtkazaniMarkedForDelete: () => false,
  onToggleOtkazaniDeleteSelect: () => {},
  isZahtevMarkedForDelete: () => false,
  onToggleZahtevDeleteSelect: () => {},
  highlightPendingZahtevi: false,
  bulkMode: false,
  isBulkSelected: () => false,
  onToggleBulkSlot: () => {},
  assignMode: false,
  isMarkedForAssign: () => false,
  onToggleAssignSelect: () => {},
  isZahtevMarkedForAssign: () => false,
  onToggleAssignZahtevSelect: () => {},
});

type SwapFields = { termin: boolean; instruktor: boolean; ucionica: boolean; klijent: boolean };

/** Optimistička primena zamene na lokalnu listu termina – ekran se ažurira odmah, pre nego što
 * server potvrdi. Ogledalo swap_terms() SQL funkcije za polja koja ova komponenta uopšte renderuje
 * (datum/slot/instruktor/učionica/radionice); server ostaje jedini izvor istine za sudare i dvočas
 * spillover, pa router.refresh() posle uspeha uskladi sve što optimistička verzija nije mogla znati. */
function applySwapOptimistically(terms: AdminTerm[], aId: string, bId: string, fields: SwapFields): AdminTerm[] {
  const a = terms.find((t) => t.id === aId);
  const b = terms.find((t) => t.id === bId);
  if (!a || !b) return terms;
  const canSwapKlijent = fields.klijent && (a.predavanja ?? []).length === 1 && (b.predavanja ?? []).length === 1;
  const newA: AdminTerm = {
    ...a,
    date: fields.termin ? b.date : a.date,
    slot_index: fields.termin ? b.slot_index : a.slot_index,
    instructor_id: fields.instruktor ? b.instructor_id : a.instructor_id,
    instructor: fields.instruktor ? b.instructor : a.instructor,
    classroom: fields.ucionica ? b.classroom : a.classroom,
    predavanja: canSwapKlijent ? b.predavanja : a.predavanja,
  };
  const newB: AdminTerm = {
    ...b,
    date: fields.termin ? a.date : b.date,
    slot_index: fields.termin ? a.slot_index : b.slot_index,
    instructor_id: fields.instruktor ? a.instructor_id : b.instructor_id,
    instructor: fields.instruktor ? a.instructor : b.instructor,
    classroom: fields.ucionica ? a.classroom : b.classroom,
    predavanja: canSwapKlijent ? a.predavanja : b.predavanja,
  };
  return terms.map((t) => (t.id === aId ? newA : t.id === bId ? newB : t));
}

/** Skraćeno ime instruktora (inicijali) za tablet/telefon kartice – isti obrazac kao print/PDF. */
function shortInstructorLabel(ime: string, prezime: string): string {
  const a = (ime ?? '').trim().charAt(0).toUpperCase();
  const b = (prezime ?? '').trim().charAt(0).toUpperCase();
  return `${a}${b}` || '—';
}

/** Skraćeno ime učionice (npr. "1-Buzan" → "1") za tablet/telefon – učionice se ovde uglavnom
 * i pominju po broju. Bez crtice u nazivu, vraća naziv nepromenjen. */
function shortClassroomLabel(naziv: string): string {
  const idx = naziv.indexOf('-');
  return idx > 0 ? naziv.slice(0, idx) : naziv;
}

function swapTermLabel(term: AdminTerm): string {
  const d = new Date(term.date + 'T12:00:00');
  const dateLabel = `${d.getDate()}.${d.getMonth() + 1}.`;
  const time = TIME_SLOTS[term.slot_index] ?? `slot ${term.slot_index}`;
  const instructorName = term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—';
  const classroomName = term.classroom?.naziv ?? 'bez učionice';
  return `${dateLabel} ${time} · ${instructorName} · ${classroomName}`;
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function getWeekDates(start: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    dates.push(x.toISOString().slice(0, 10));
  }
  return dates;
}

function formatWeekLabel(start: string): string {
  const d = new Date(start + 'T12:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.getDate()}.${d.getMonth() + 1}. – ${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
}

/** Isti redosled učionica u svakom slotu (npr. uvek 1-Buzan pa 2-Sperry) – bez učionice na kraju. */
function sortByClassroom(terms: AdminTerm[]): AdminTerm[] {
  return [...terms].sort((a, b) => {
    const an = a.classroom?.naziv;
    const bn = b.classroom?.naziv;
    if (!an && !bn) return 0;
    if (!an) return 1;
    if (!bn) return -1;
    return an.localeCompare(bn, 'sr-Latn-RS');
  });
}

function termsByKey(terms: AdminTerm[], date: string, slot: number): AdminTerm[] {
  return sortByClassroom(terms.filter((t) => t.date === date && t.slot_index === slot));
}

const DEFAULT_COLOR = '#0d9488';

const DEFAULT_MAX_TERMINA_PO_SLOTU = 4;

export default function AdminCalendarView({
  terms: termsProp,
  otkazaniTermini: otkazaniTerminiProp = [],
  startOfWeek,
  singleDay,
  monthStart,
  view,
  maxTerminaPoSlotu = DEFAULT_MAX_TERMINA_PO_SLOTU,
  clients = [],
  termTypes = [],
  instructorsList = [],
  classroomsList = [],
  pendingZahtevi: pendingZahteviProp = [],
  allPendingZahteviDates = [],
}: {
  terms: AdminTerm[];
  otkazaniTermini?: OtkazaniTerminCalendar[];
  startOfWeek: string;
  singleDay?: string;
  monthStart?: string;
  view: string;
  /** Iz Admin → Podešavanja; koliko paralelnih termina u istom vremenu */
  maxTerminaPoSlotu?: number;
  /** Za "Više termina" mod (masovno zakazivanje bez instruktora/učionice, preko zahteva). */
  clients?: { id: string; ime: string; prezime: string; godiste?: number | null; datumTestiranja?: string | null }[];
  termTypes?: { id: string; naziv: string; opis: string | null }[];
  /** Za "Dodeli instruktora"/"Dodeli učionicu" module. */
  instructorsList?: { id: string; ime: string; prezime: string }[];
  classroomsList?: { id: string; naziv: string }[];
  /** Zahtevi na čekanju (bez instruktora) – informativni prikaz na kalendaru. */
  pendingZahtevi?: PendingZahtevCalendar[];
  /** SVI zahtevi na čekanju (bez obzira na trenutno prikazanu nedelju) – za notifikaciju gore. */
  allPendingZahteviDates?: string[];
}) {
  const router = useRouter();
  const [draggedTermId, setDraggedTermId] = useState<string | null>(null);

  // Lokalna kopija termina – omogućava optimističku primenu swap-a (ekran se menja odmah, pre nego
  // što server potvrdi). Sinhronizuje se sa serverom kad god page.tsx pošalje sveže podatke
  // (nakon router.refresh() ili promene nedelje/dana/meseca).
  const [terms, setTerms] = useState(termsProp);
  useEffect(() => {
    setTerms(termsProp);
  }, [termsProp]);

  // Isti obrazac za otkazane termine – omogućava trenutno brisanje sa kalendara.
  const [otkazaniTermini, setOtkazaniTermini] = useState(otkazaniTerminiProp);
  useEffect(() => {
    setOtkazaniTermini(otkazaniTerminiProp);
  }, [otkazaniTerminiProp]);

  const [pendingZahtevi, setPendingZahtevi] = useState(pendingZahteviProp);
  useEffect(() => {
    setPendingZahtevi(pendingZahteviProp);
  }, [pendingZahteviProp]);

  const [highlightPendingZahtevi, setHighlightPendingZahtevi] = useState(false);

  const handleDeleteOtkazani = async (id: string) => {
    if (!confirm('Trajno obrisati ovaj otkazani termin sa kalendara?')) return;
    const prev = otkazaniTermini;
    setOtkazaniTermini((list) => list.filter((ot) => ot.id !== id));
    const res = await deleteOtkazaniTermin(id);
    if (res.error) {
      setOtkazaniTermini(prev);
      toast.error(res.error);
    }
  };

  const [swapMode, setSwapMode] = useState(false);
  const [swapFields, setSwapFields] = useState({ termin: false, instruktor: false, ucionica: false, klijent: false });
  const [swapFirst, setSwapFirst] = useState<{ termId: string; label: string } | null>(null);
  const [swapSecond, setSwapSecond] = useState<{ termId: string; label: string } | null>(null);

  const resetSwapSelection = () => {
    setSwapFirst(null);
    setSwapSecond(null);
  };

  const [copyMode, setCopyMode] = useState(false);
  const [copySource, setCopySource] = useState<{ termId: string; label: string } | null>(null);
  const [copyFields, setCopyFields] = useState({ instruktor: true, ucionica: true, klijent: true });
  const [copyTermTypeId, setCopyTermTypeId] = useState('');
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [copyLoading, setCopyLoading] = useState(false);

  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState<Set<string>>(new Set());
  const [deleteOtkazaniSelection, setDeleteOtkazaniSelection] = useState<Set<string>>(new Set());
  const [deleteZahteviSelection, setDeleteZahteviSelection] = useState<Set<string>>(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkClientId, setBulkClientId] = useState('');
  const [bulkTermTypeId, setBulkTermTypeId] = useState('');
  const [bulkSlots, setBulkSlots] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [assignMode, setAssignMode] = useState(false);
  const [assignSelection, setAssignSelection] = useState<Set<string>>(new Set());
  const [assignZahteviSelection, setAssignZahteviSelection] = useState<Set<string>>(new Set());
  // Prazno = "bez instruktora"/"bez učionice"/"ne menjaj vrstu" – ne menja se to polje, menja se
  // samo ono što jeste izabrano.
  const [assignInstructorChoice, setAssignInstructorChoice] = useState('');
  const [assignClassroomChoice, setAssignClassroomChoice] = useState('');
  const [assignTermTypeChoice, setAssignTermTypeChoice] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Swap/Copy/Delete/Bulk/Assign su međusobno isključivi – uključivanje jednog gasi ostale da
  // klikovi na kalendaru ne budu dvosmisleni.
  const resetOtherModes = (keep: 'swap' | 'copy' | 'delete' | 'bulk' | 'assign') => {
    if (keep !== 'swap') {
      setSwapMode(false);
      resetSwapSelection();
    }
    if (keep !== 'copy') {
      setCopyMode(false);
      setCopySource(null);
      setCopyTargets(new Set());
    }
    if (keep !== 'delete') {
      setDeleteMode(false);
      setDeleteSelection(new Set());
      setDeleteOtkazaniSelection(new Set());
      setDeleteZahteviSelection(new Set());
    }
    if (keep !== 'bulk') {
      setBulkMode(false);
      setBulkSlots(new Set());
    }
    if (keep !== 'assign') {
      setAssignMode(false);
      setAssignSelection(new Set());
      setAssignZahteviSelection(new Set());
      setAssignInstructorChoice('');
      setAssignClassroomChoice('');
      setAssignTermTypeChoice('');
    }
  };

  const toggleSwapMode = () => {
    setSwapMode((v) => {
      const next = !v;
      if (next) resetOtherModes('swap');
      return next;
    });
    resetSwapSelection();
  };

  const toggleCopyMode = () => {
    setCopyMode((v) => {
      const next = !v;
      if (next) resetOtherModes('copy');
      return next;
    });
    setCopySource(null);
    setCopyTargets(new Set());
  };

  const toggleDeleteMode = () => {
    setDeleteMode((v) => {
      const next = !v;
      if (next) resetOtherModes('delete');
      return next;
    });
    setDeleteSelection(new Set());
    setDeleteOtkazaniSelection(new Set());
    setDeleteZahteviSelection(new Set());
  };

  const toggleBulkMode = () => {
    setBulkMode((v) => {
      const next = !v;
      if (next) resetOtherModes('bulk');
      return next;
    });
    setBulkSlots(new Set());
  };

  const onToggleDeleteSelect = (termId: string) => {
    setDeleteSelection((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  };

  const onToggleOtkazaniDeleteSelect = (id: string) => {
    setDeleteOtkazaniSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onToggleZahtevDeleteSelect = (id: string) => {
    setDeleteZahteviSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmDelete = async () => {
    const total = deleteSelection.size + deleteOtkazaniSelection.size + deleteZahteviSelection.size;
    if (total === 0) return;
    if (!confirm(`Trajno obrisati ${total} termin(a) BEZ TRAGA (ne otkazivanje – ništa neće ostati na kalendaru)?`)) return;
    const termIds = [...deleteSelection];
    const otkazaniIds = [...deleteOtkazaniSelection];
    const zahtevIds = [...deleteZahteviSelection];
    setTerms((list) => list.filter((t) => !deleteSelection.has(t.id)));
    setOtkazaniTermini((list) => list.filter((ot) => !deleteOtkazaniSelection.has(ot.id)));
    setPendingZahtevi((list) => list.filter((z) => !deleteZahteviSelection.has(z.id)));
    setDeleteSelection(new Set());
    setDeleteOtkazaniSelection(new Set());
    setDeleteZahteviSelection(new Set());
    setDeleteMode(false);
    setDeleteLoading(true);
    const { failed } = await deleteTermsAsAdmin(termIds, otkazaniIds, zahtevIds);
    setDeleteLoading(false);
    if (failed.length > 0) {
      toast.error(`Nije obrisano ${failed.length}/${total}.`);
    } else {
      toast.success(`Obrisano ${total}.`);
    }
    router.refresh();
  };

  const onToggleBulkSlot = (date: string, slot: number) => {
    const key = `${date}|${slot}`;
    setBulkSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmBulk = async () => {
    if (!bulkClientId || bulkSlots.size === 0) return;
    const slots = [...bulkSlots].map((key) => {
      const [date, slotStr] = key.split('|');
      return { date, slotIndex: Number(slotStr) };
    });
    setBulkSlots(new Set());
    setBulkMode(false);
    setBulkLoading(true);
    const { failed } = await createBulkZahteviAsAdmin(bulkClientId, bulkTermTypeId || null, slots);
    setBulkLoading(false);
    if (failed.length > 0) {
      toast.error(`Nije zakazano ${failed.length}/${slots.length} – ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
    } else {
      toast.success(`Kreirano ${slots.length} zahtev(a) – predavači ih vide na svom Dashboard → Zahtevi.`);
    }
  };

  const toggleAssignMode = () => {
    setAssignMode((v) => {
      const next = !v;
      if (next) resetOtherModes('assign');
      return next;
    });
    setAssignSelection(new Set());
    setAssignZahteviSelection(new Set());
    setAssignInstructorChoice('');
    setAssignClassroomChoice('');
    setAssignTermTypeChoice('');
  };

  const onToggleAssignSelect = (termId: string) => {
    setAssignSelection((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  };

  const onToggleAssignZahtevSelect = (zahtevId: string) => {
    setAssignZahteviSelection((prev) => {
      const next = new Set(prev);
      if (next.has(zahtevId)) next.delete(zahtevId);
      else next.add(zahtevId);
      return next;
    });
  };

  // "Bez instruktora"/"bez učionice" (prazno) znači da se to polje NE dira – menja se samo ono drugo
  // koje jeste izabrano. Zahtevi: učionica se šalje PRE instruktora, tako da – ako se zahtev ovim
  // potvrđuje u pravi termin (jer je instruktor izabran) – ta učionica stigne pre konverzije.
  const confirmAssign = async () => {
    const total = assignSelection.size + assignZahteviSelection.size;
    const hasInstructor = !!assignInstructorChoice;
    const hasClassroom = !!assignClassroomChoice;
    const hasTermType = !!assignTermTypeChoice;
    if (total === 0 || (!hasInstructor && !hasClassroom && !hasTermType)) return;
    const termIds = [...assignSelection];
    const zahtevIds = [...assignZahteviSelection];
    const instructorId = assignInstructorChoice;
    const classroomId = assignClassroomChoice;
    const termTypeId = assignTermTypeChoice;
    setAssignSelection(new Set());
    setAssignZahteviSelection(new Set());
    setAssignMode(false);
    setAssignInstructorChoice('');
    setAssignClassroomChoice('');
    setAssignTermTypeChoice('');
    setAssignLoading(true);

    const termCalls: Promise<{ failed: { termId: string; error: string }[] }>[] = [];
    if (termIds.length > 0) {
      if (hasInstructor) termCalls.push(assignInstructorToTermsAsAdmin(instructorId, termIds));
      if (hasClassroom) termCalls.push(assignClassroomToTermsAsAdmin(classroomId, termIds));
      if (hasTermType) termCalls.push(assignTermTypeToTermsAsAdmin(termTypeId, termIds));
    }
    let zahtevFailed: { zahtevId: string; error: string }[] = [];
    if (zahtevIds.length > 0) {
      if (hasClassroom) {
        const res = await assignClassroomToZahteviAsAdmin(classroomId, zahtevIds);
        zahtevFailed = zahtevFailed.concat(res.failed);
      }
      if (hasInstructor) {
        const res = await assignInstructorToZahteviAsAdmin(instructorId, zahtevIds);
        zahtevFailed = zahtevFailed.concat(res.failed);
      }
      if (hasTermType) {
        const res = await assignTermTypeToZahteviAsAdmin(termTypeId, zahtevIds);
        zahtevFailed = zahtevFailed.concat(res.failed);
      }
    }
    const termResults = await Promise.all(termCalls);
    setAssignLoading(false);
    const failedCount = termResults.reduce((sum, r) => sum + r.failed.length, 0) + zahtevFailed.length;
    if (failedCount > 0) {
      toast.error(`Nije dodeljeno ${failedCount}/${total}.`);
    } else {
      toast.success(`Dodeljeno ${total}.`);
    }
    router.refresh();
  };

  const onSelectCopySource = (term: AdminTerm) => {
    setCopySource({ termId: term.id, label: swapTermLabel(term) });
    setCopyTargets(new Set());
    setCopyTermTypeId('');
  };

  const onToggleCopyTarget = (date: string, slot: number) => {
    if (!copySource) return;
    const key = `${date}|${slot}`;
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyFieldsAnyChecked = copyFields.instruktor || copyFields.ucionica || copyFields.klijent;

  const confirmCopy = async () => {
    if (!copySource || copyTargets.size === 0 || !copyFieldsAnyChecked) return;
    const sourceId = copySource.termId;
    const targets = [...copyTargets].map((key) => {
      const [date, slotStr] = key.split('|');
      return { date, slotIndex: Number(slotStr) };
    });
    setCopySource(null);
    setCopyTargets(new Set());
    setCopyMode(false);
    setCopyLoading(true);
    const { failed } = await copyTermToSlotsAsAdmin(sourceId, targets, copyFields, copyTermTypeId || undefined);
    setCopyLoading(false);
    if (failed.length > 0) {
      toast.error(`Nije kopirano ${failed.length}/${targets.length} – ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
    } else {
      toast.success(`Kopirano ${targets.length}.`);
    }
    router.refresh();
  };

  const onSelectTerm = (term: AdminTerm) => {
    const label = swapTermLabel(term);
    if (!swapFirst) {
      setSwapFirst({ termId: term.id, label });
      return;
    }
    if (term.id === swapFirst.termId) return;
    if (!swapSecond) {
      setSwapSecond({ termId: term.id, label });
    }
  };

  const isSelected = (termId: string): 'first' | 'second' | null => {
    if (swapFirst?.termId === termId) return 'first';
    if (swapSecond?.termId === termId) return 'second';
    return null;
  };

  const anyFieldChecked = swapFields.termin || swapFields.instruktor || swapFields.ucionica || swapFields.klijent;

  const confirmSwap = async () => {
    if (!swapFirst || !swapSecond || !anyFieldChecked) return;
    const aId = swapFirst.termId;
    const bId = swapSecond.termId;
    const prevTerms = terms;

    // Optimistički: ekran se menja odmah, mod se gasi kao da je gotovo – server potvrđuje u
    // pozadini. Ako ipak odbije zamenu (sudar, dvočas blok...), vraćamo prethodno stanje i javljamo.
    setTerms(applySwapOptimistically(terms, aId, bId, swapFields));
    resetSwapSelection();
    setSwapMode(false);

    const res = await swapTermsAsAdmin(aId, bId, swapFields);
    if (res.error) {
      setTerms(prevTerms);
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  const handleDrop = async (date: string, slot: number) => {
    if (!draggedTermId) return;
    const ok = window.confirm('Da li ste sigurni da želite da premestite ovaj termin na novi datum/vreme?');
    if (!ok) {
      setDraggedTermId(null);
      return;
    }
    const res = await moveTermAsAdmin(draggedTermId, date, slot);
    setDraggedTermId(null);
    if (!res.error) {
      router.refresh();
    }
  };
  const base = '/admin/kalendar';
  const linkSuffix = '';

  let body: React.ReactNode;
  if (view === 'dan' && singleDay) {
    body = (
      <AdminDayView
        date={singleDay}
        terms={terms}
        otkazaniTermini={otkazaniTermini}
        pendingZahtevi={pendingZahtevi}
        linkSuffix={linkSuffix}
        base={base}
        draggedTermId={draggedTermId}
        onDropCell={handleDrop}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
      />
    );
  } else if (view === 'mesec' && monthStart) {
    body = (
      <AdminMonthView
        monthStart={monthStart}
        terms={terms}
        linkSuffix={linkSuffix}
        base={base}
      />
    );
  } else {
    body = (
      <AdminWeekView
        startOfWeek={startOfWeek}
        terms={terms}
        otkazaniTermini={otkazaniTermini}
        pendingZahtevi={pendingZahtevi}
        linkSuffix={linkSuffix}
        base={base}
        draggedTermId={draggedTermId}
        setDraggedTermId={setDraggedTermId}
        onDropCell={handleDrop}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
      />
    );
  }

  return (
    <SwapContext.Provider
      value={{
        swapMode,
        isSelected,
        onSelectTerm,
        onDeleteOtkazani: handleDeleteOtkazani,
        copyMode,
        copySourceId: copySource?.termId ?? null,
        onSelectCopySource,
        isCopyTargetSelected: (date: string, slot: number) => copyTargets.has(`${date}|${slot}`),
        onToggleCopyTarget,
        deleteMode,
        isMarkedForDelete: (termId: string) => deleteSelection.has(termId),
        onToggleDeleteSelect,
        isOtkazaniMarkedForDelete: (id: string) => deleteOtkazaniSelection.has(id),
        onToggleOtkazaniDeleteSelect,
        isZahtevMarkedForDelete: (id: string) => deleteZahteviSelection.has(id),
        onToggleZahtevDeleteSelect,
        bulkMode,
        isBulkSelected: (date: string, slot: number) => bulkSlots.has(`${date}|${slot}`),
        onToggleBulkSlot,
        assignMode,
        isMarkedForAssign: (termId: string) => assignSelection.has(termId),
        onToggleAssignSelect,
        isZahtevMarkedForAssign: (zahtevId: string) => assignZahteviSelection.has(zahtevId),
        onToggleAssignZahtevSelect,
        highlightPendingZahtevi,
      }}
    >
      {allPendingZahteviDates.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 animate-pulse">
          <button
            type="button"
            onClick={() => setHighlightPendingZahtevi((v) => !v)}
            className="font-semibold underline decoration-dotted hover:text-amber-700"
            title="Klikni da obeležiš/skloniš obeležavanje ovih na kalendaru"
          >
            ⚠ {allPendingZahteviDates.length} {allPendingZahteviDates.length === 1 ? 'termin' : 'termina'} bez instruktora/učionice
            {highlightPendingZahtevi ? ' (obeleženo – klikni da skloniš)' : ':'}
          </button>
          <span className="flex flex-wrap gap-1.5">
            {allPendingZahteviDates.map((d) => (
              <Link
                key={d}
                href={`/admin/kalendar?view=nedelja&week=${getMonday(d)}`}
                className="rounded-full bg-amber-200 px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-300"
              >
                {formatShortDate(d)}
              </Link>
            ))}
          </span>
        </div>
      )}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={toggleSwapMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              swapMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {swapMode ? 'Swap: uključen' : 'Swap'}
          </button>
          <button
            type="button"
            onClick={toggleCopyMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              copyMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {copyMode ? 'Copy: uključen' : 'Copy'}
          </button>
          {copyLoading && <span className="text-sm text-stone-500">Kopiram…</span>}
          <button
            type="button"
            onClick={toggleDeleteMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              deleteMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {deleteMode ? 'Delete: uključen' : 'Delete'}
          </button>
          {deleteMode && (
            <>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteSelection.size + deleteOtkazaniSelection.size + deleteZahteviSelection.size === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Potvrdi brisanje ({deleteSelection.size + deleteOtkazaniSelection.size + deleteZahteviSelection.size})
              </button>
              <span className="text-sm text-stone-400">
                kliknite termine (i sive otkazane/zahteve) da ih označite, klik ponovo za deselekciju – ovo je trajno brisanje BEZ TRAGA, ne otkazivanje
              </span>
            </>
          )}
          {deleteLoading && <span className="text-sm text-stone-500">Brišem…</span>}
          <button
            type="button"
            onClick={toggleBulkMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              bulkMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {bulkMode ? 'Zakaži više časova: uključeno' : 'Zakaži više časova'}
          </button>
          {bulkLoading && <span className="text-sm text-stone-500">Zakazujem…</span>}
          <button
            type="button"
            onClick={toggleAssignMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              assignMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {assignMode ? 'Dodeli instruktora/učionicu/vrstu: uključeno' : 'Dodeli instruktora/učionicu/vrstu'}
          </button>
          {assignMode && (
            <>
              <select
                value={assignInstructorChoice}
                onChange={(e) => setAssignInstructorChoice(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 bg-white"
              >
                <option value="">bez instruktora</option>
                {instructorsList.map((i) => (
                  <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
                ))}
              </select>
              <select
                value={assignClassroomChoice}
                onChange={(e) => setAssignClassroomChoice(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 bg-white"
              >
                <option value="">bez učionice</option>
                {classroomsList.map((c) => (
                  <option key={c.id} value={c.id}>{c.naziv}</option>
                ))}
              </select>
              <select
                value={assignTermTypeChoice}
                onChange={(e) => setAssignTermTypeChoice(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 bg-white"
              >
                <option value="">ne menjaj vrstu časa</option>
                {termTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.naziv}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={confirmAssign}
                disabled={
                  (!assignInstructorChoice && !assignClassroomChoice && !assignTermTypeChoice) ||
                  assignSelection.size + assignZahteviSelection.size === 0
                }
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Potvrdi dodelu ({assignSelection.size + assignZahteviSelection.size})
              </button>
              <span className="text-sm text-stone-400">
                izaberite instruktora i/ili učionicu i/ili vrstu časa (može bilo koja kombinacija), pa kliknite termine na kalendaru da ih označite
              </span>
            </>
          )}
          {assignLoading && <span className="text-sm text-stone-500">Dodeljujem…</span>}
          <Link
            href={`/admin/kalendar/print?week=${startOfWeek}`}
            className="hidden md:inline-flex ml-auto px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200"
          >
            🖨 Print / PDF
          </Link>
          {swapMode && (
            <>
              <div className="flex items-center gap-3 flex-wrap text-sm text-stone-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={swapFields.termin}
                    onChange={(e) => setSwapFields((f) => ({ ...f, termin: e.target.checked }))}
                  />
                  Termin
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={swapFields.instruktor}
                    onChange={(e) => setSwapFields((f) => ({ ...f, instruktor: e.target.checked }))}
                  />
                  Instruktor
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={swapFields.ucionica}
                    onChange={(e) => setSwapFields((f) => ({ ...f, ucionica: e.target.checked }))}
                  />
                  Učionica
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={swapFields.klijent}
                    onChange={(e) => setSwapFields((f) => ({ ...f, klijent: e.target.checked }))}
                  />
                  Klijent
                </label>
              </div>
              <button
                type="button"
                onClick={confirmSwap}
                disabled={!swapFirst || !swapSecond || !anyFieldChecked}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Potvrdi zamenu
              </button>
              <button
                type="button"
                onClick={resetSwapSelection}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200"
              >
                Otkaži izbor
              </button>
            </>
          )}
        </div>
        {swapMode && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Prvi termin:</span>
              {swapFirst ? (
                <span className="rounded-lg bg-amber-50 border border-amber-300 px-2 py-1 text-stone-800">
                  {swapFirst.label}{' '}
                  <button type="button" onClick={() => setSwapFirst(null)} className="ml-1 text-amber-700 underline">
                    Izmeni
                  </button>
                </span>
              ) : (
                <span className="text-stone-400">kliknite termin na kalendaru</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Drugi termin:</span>
              {swapSecond ? (
                <span className="rounded-lg bg-amber-50 border border-amber-300 px-2 py-1 text-stone-800">
                  {swapSecond.label}{' '}
                  <button type="button" onClick={() => setSwapSecond(null)} className="ml-1 text-amber-700 underline">
                    Izmeni
                  </button>
                </span>
              ) : (
                <span className="text-stone-400">kliknite termin na kalendaru</span>
              )}
            </div>
          </div>
        )}
        {copyMode && (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-stone-500">Kopiraj iz:</span>
              {copySource ? (
                <>
                  <span className="rounded-lg bg-amber-50 border border-amber-300 px-2 py-1 text-stone-800">
                    {copySource.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCopySource(null);
                      setCopyTargets(new Set());
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200"
                  >
                    Otkaži izbor
                  </button>
                </>
              ) : (
                <span className="text-stone-400">kliknite termin na kalendaru koji želite da kopirate</span>
              )}
            </div>
            {copySource && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-3 flex-wrap text-stone-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={copyFields.instruktor}
                      onChange={(e) => setCopyFields((f) => ({ ...f, instruktor: e.target.checked }))}
                    />
                    Instruktor
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={copyFields.ucionica}
                      onChange={(e) => setCopyFields((f) => ({ ...f, ucionica: e.target.checked }))}
                    />
                    Učionica
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={copyFields.klijent}
                      onChange={(e) => setCopyFields((f) => ({ ...f, klijent: e.target.checked }))}
                    />
                    Klijent
                  </label>
                </div>
                {copyFields.klijent && (
                  <div className="min-w-[200px]">
                    <label className="block text-xs font-medium text-stone-700 mb-1">Vrsta časa</label>
                    <select
                      value={copyTermTypeId}
                      onChange={(e) => setCopyTermTypeId(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
                    >
                      <option value="">— (zadrži originalnu) —</option>
                      {termTypes.map((tt) => (
                        <option key={tt.id} value={tt.id}>{tt.naziv}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={confirmCopy}
                  disabled={copyTargets.size === 0 || !copyFieldsAnyChecked}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Potvrdi kopiranje ({copyTargets.size})
                </button>
                <span className="text-stone-400 text-xs">kliknite jedan ili više praznih/slobodnih slotova da ih izaberete kao mete</span>
              </div>
            )}
          </div>
        )}
        {bulkMode && (
          <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
            <div className="min-w-[220px]">
              <label className="block text-xs font-medium text-stone-700 mb-1">Dete</label>
              <SingleKlijentPicker
                clients={clients}
                value={bulkClientId}
                onChange={setBulkClientId}
                inputId="admin-bulk-klijent-search"
              />
            </div>
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-stone-700 mb-1">Vrsta časa</label>
              <select
                value={bulkTermTypeId}
                onChange={(e) => setBulkTermTypeId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
              >
                <option value="">— (nije obavezno) —</option>
                {termTypes.map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.naziv}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={confirmBulk}
              disabled={!bulkClientId || bulkSlots.size === 0}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Potvrdi ({bulkSlots.size})
            </button>
            <span className="text-stone-400 text-xs max-w-md">
              Izaberite dete, pa kliknite termine na kalendaru (bilo prazne ili zauzete). Bez instruktora/učionice – pravi se zahtev koji bilo koji predavač preuzima na svom Dashboard → Zahtevi.
            </span>
          </div>
        )}
        {assignMode && (assignSelection.size > 0 || assignZahteviSelection.size > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...assignSelection].map((id) => {
              const t = terms.find((x) => x.id === id);
              if (!t) return null;
              return (
                <span key={id} className="rounded-full bg-blue-50 border border-blue-300 px-2 py-0.5 text-xs text-blue-800">
                  {swapTermLabel(t)}
                </span>
              );
            })}
            {[...assignZahteviSelection].map((id) => {
              const z = pendingZahtevi.find((x) => x.id === id);
              if (!z) return null;
              const d = new Date(z.date + 'T12:00:00');
              const time = TIME_SLOTS[z.slot_index] ?? `slot ${z.slot_index}`;
              return (
                <span key={id} className="rounded-full bg-stone-100 border border-stone-300 px-2 py-0.5 text-xs text-stone-700">
                  {d.getDate()}.{d.getMonth() + 1}. {time} · {z.client_ime}{z.client_prezime ? ` ${z.client_prezime}` : ''} (zahtev)
                </span>
              );
            })}
          </div>
        )}
      </div>
      {body}
    </SwapContext.Provider>
  );
}

function AdminCellContent({
  termsInSlot,
  otkazaniInSlot,
  pendingZahteviInSlot,
  emptyDate,
  emptySlot,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  termsInSlot: AdminTerm[];
  otkazaniInSlot: OtkazaniTerminCalendar[];
  pendingZahteviInSlot: PendingZahtevCalendar[];
  emptyDate: string;
  emptySlot: number;
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
  maxTerminaPoSlotu: number;
}) {
  const swap = useContext(SwapContext);
  const newTermHref = `/admin/termin/novi?date=${emptyDate}&slot=${emptySlot}`;
  const newTestHref = `${newTermHref}&cat=testing`;
  const slotCount = termsInSlot.length;
  const canAddParallelTerm = slotCount < maxTerminaPoSlotu;

  if (swap.bulkMode) {
    const bulkSelected = swap.isBulkSelected(emptyDate, emptySlot);
    return (
      <button
        type="button"
        onClick={() => swap.onToggleBulkSlot(emptyDate, emptySlot)}
        className={`w-full min-h-[52px] rounded-lg border-2 p-2 text-left text-xs transition-colors ${
          bulkSelected
            ? 'border-emerald-600 bg-emerald-50 ring-2 ring-offset-1 ring-emerald-500'
            : 'border-dashed border-stone-200 hover:border-emerald-400 hover:bg-emerald-50/50'
        }`}
      >
        <span className="block text-stone-500">
          {slotCount === 0 ? 'prazno' : `${slotCount} termin(a) ovde`}
        </span>
        {bulkSelected && <span className="block font-semibold text-emerald-700 mt-0.5">✓ izabrano</span>}
      </button>
    );
  }

  const CancelledEntries = otkazaniInSlot.length > 0 ? (
    <div className="mt-1 space-y-1">
      {otkazaniInSlot.map((ot) => {
        const otkazaniSelected = swap.deleteMode && swap.isOtkazaniMarkedForDelete(ot.id);
        return (
          <div
            key={ot.id}
            role={swap.deleteMode ? 'button' : undefined}
            onClick={() => {
              if (swap.deleteMode) swap.onToggleOtkazaniDeleteSelect(ot.id);
            }}
            className={`rounded-lg border p-1.5 text-xs text-stone-400 opacity-70${
              swap.deleteMode ? ' cursor-pointer' : ''
            }${
              otkazaniSelected ? ' border-red-500 ring-2 ring-offset-1 ring-red-500 bg-red-50' : ' border-stone-200 bg-stone-50'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="line-through block">
                {ot.client_ime}{ot.client_prezime ? ` ${ot.client_prezime}` : ''}
              </span>
              {!swap.deleteMode && (
                <button
                  type="button"
                  title="Trajno obriši"
                  onClick={(e) => {
                    e.preventDefault();
                    swap.onDeleteOtkazani(ot.id);
                  }}
                  className="shrink-0 leading-none text-stone-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </div>
            {ot.instructor_ime && (
              <span className="block text-[11px]">{ot.instructor_ime} {ot.instructor_prezime ?? ''}</span>
            )}
            <span className="text-[10px] uppercase tracking-wide">otkazano{ot.placeno ? ' · naplaćeno' : ''}</span>
          </div>
        );
      })}
    </div>
  ) : null;

  const zahtevAssignClickable = swap.assignMode;
  const zahtevClickable = zahtevAssignClickable || swap.deleteMode;
  const PendingZahteviEntries = pendingZahteviInSlot.length > 0 ? (
    <div className="mt-1 space-y-1">
      {pendingZahteviInSlot.map((z) => {
        const zahtevAssignSelected = zahtevAssignClickable && swap.isZahtevMarkedForAssign(z.id);
        const zahtevDeleteSelected = swap.deleteMode && swap.isZahtevMarkedForDelete(z.id);
        return (
          <div
            key={z.id}
            role={zahtevClickable ? 'button' : undefined}
            onClick={() => {
              if (swap.deleteMode) swap.onToggleZahtevDeleteSelect(z.id);
              else if (zahtevAssignClickable) swap.onToggleAssignZahtevSelect(z.id);
            }}
            className={`rounded-lg border border-dashed p-1.5 text-xs text-stone-500${
              zahtevClickable ? ' cursor-pointer' : ''
            }${
              zahtevDeleteSelected
                ? ' border-red-600 ring-2 ring-offset-1 ring-red-500 bg-red-50'
                : zahtevAssignSelected
                ? ' border-blue-600 ring-2 ring-offset-1 ring-blue-500 bg-blue-50'
                : ' border-stone-300 bg-stone-100'
            }`}
            style={swap.highlightPendingZahtevi ? { outline: '2px solid #dc2626', outlineOffset: '1px' } : undefined}
          >
            <span className="block font-medium text-stone-600">
              {z.client_ime}{z.client_prezime ? ` ${z.client_prezime}` : ''}
            </span>
            {z.term_type_naziv && <span className="block text-[11px]">{z.term_type_naziv}</span>}
            {z.classroom_naziv && <span className="block text-[11px]">🏫 {z.classroom_naziv}</span>}
            <span className="text-[10px] uppercase tracking-wide">zahtev · čeka predavača</span>
          </div>
        );
      })}
    </div>
  ) : null;

  if (termsInSlot.length === 0) {
    return (
      <div className="space-y-1">
        <Link
          href={newTermHref}
          className={`block rounded-lg border border-dashed border-stone-200 p-2 text-stone-400 hover:border-amber-400 hover:bg-amber-50/50 min-h-[52px]${
            swap.copyMode && swap.isCopyTargetSelected(emptyDate, emptySlot)
              ? ' ring-2 ring-offset-1 ring-emerald-500 border-emerald-500'
              : swap.copyMode
              ? ' ring-2 ring-offset-1 ring-amber-300'
              : ''
          }`}
          onClick={(e) => {
            if (swap.copyMode) {
              e.preventDefault();
              swap.onToggleCopyTarget(emptyDate, emptySlot);
            }
          }}
          onDragOver={(e) => {
            if (draggedTermId) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggedTermId) onDropCell(emptyDate, emptySlot);
          }}
        >
          {swap.copyMode ? (swap.isCopyTargetSelected(emptyDate, emptySlot) ? '✓ izabrano' : 'Kopiraj ovde') : '+'}
        </Link>
        <Link
          href={newTestHref}
          className="block rounded-lg border border-dashed border-stone-200 p-1 text-[11px] text-center text-stone-400 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-800"
        >
          + Testiranje
        </Link>
        {PendingZahteviEntries}
        {CancelledEntries}
      </div>
    );
  }
  return (
    <div
      className="space-y-1.5 min-h-[52px]"
      onDragOver={(e) => {
        if (draggedTermId && canAddParallelTerm) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (draggedTermId && canAddParallelTerm) onDropCell(emptyDate, emptySlot);
      }}
    >
      {termsInSlot.map((term) => {
        if (isAutoSpillover(term)) {
          const instructorName = term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—';
          return (
            <Link
              key={term.id}
              href={`/admin/termin/${term.nastavak_of_term_id}`}
              className="block rounded-lg border-2 border-dashed p-2 text-xs text-stone-500 bg-stone-50 hover:bg-stone-100"
              style={{ borderColor: term.classroom?.color ?? '#94a3b8' }}
            >
              <span className="font-medium">↳ Nastavak dužeg časa</span>
              <span className="block text-[11px] mt-0.5">{instructorName} · {term.classroom?.naziv ?? 'Učionica'}</span>
            </Link>
          );
        }
        const instructorColor = term.instructor?.color ?? DEFAULT_COLOR;
        const classroomColor = term.classroom?.color ?? '#64748b'; // fallback siva
        const bg = `${classroomColor}20`;
        const predavanja = term.predavanja ?? [];
        const instructorName = term.instructor
          ? `${term.instructor.ime} ${term.instructor.prezime}`
          : '—';
        const classroomName = term.classroom?.naziv ?? null;
        const tcRaw = term.term_category;
        const isTesting = Array.isArray(tcRaw) ? (tcRaw as {is_testing: boolean}[])[0]?.is_testing === true : tcRaw?.is_testing === true;
        const potentialClients = term.potential_clients ?? [];
        const swapSelected = swap.isSelected(term.id);
        const copySelected = swap.copySourceId === term.id;
        const deleteSelected = swap.isMarkedForDelete(term.id);
        const assignSelected = swap.isMarkedForAssign(term.id);
        const anyModeActive = swap.swapMode || swap.copyMode || swap.deleteMode || swap.assignMode;

        return (
          <Link
            key={term.id}
            href={`/admin/termin/${term.id}`}
            className={`block rounded-lg border-2 p-2 text-sm transition-opacity hover:opacity-90${
              swapSelected || copySelected ? ' ring-2 ring-offset-1 ring-amber-500' : ''
            }${deleteSelected ? ' ring-2 ring-offset-1 ring-red-600' : ''}${
              assignSelected ? ' ring-2 ring-offset-1 ring-blue-600' : ''
            }`}
            style={{ borderColor: classroomColor, backgroundColor: bg, color: instructorColor }}
            draggable={!anyModeActive}
            onDragStart={() => !anyModeActive && setDraggedTermId(term.id)}
            onDragEnd={() => setDraggedTermId(null)}
            onClick={(e) => {
              if (swap.swapMode) {
                e.preventDefault();
                swap.onSelectTerm(term);
              } else if (swap.copyMode) {
                e.preventDefault();
                swap.onSelectCopySource(term);
              } else if (swap.deleteMode) {
                e.preventDefault();
                swap.onToggleDeleteSelect(term.id);
              } else if (swap.assignMode) {
                e.preventDefault();
                swap.onToggleAssignSelect(term.id);
              }
            }}
          >
            <span className="font-medium">
              <span className="lg:hidden">
                {term.instructor ? shortInstructorLabel(term.instructor.ime, term.instructor.prezime) : '—'}
              </span>
              <span className="hidden lg:inline">{instructorName}</span>
            </span>
            <span className={`ml-1 text-[0.7rem] uppercase tracking-wide ${classroomName ? 'opacity-80' : 'italic opacity-60'}`}>
              (
              <span className="lg:hidden">{classroomName ? shortClassroomLabel(classroomName) : 'bez uč.'}</span>
              <span className="hidden lg:inline">{classroomName ?? 'bez učionice'}</span>
              )
            </span>
            {isTesting ? (
              <div className="mt-1 border-t border-stone-200/80 pt-1">
                <span className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: instructorColor }}>
                  Testiranje
                </span>
                {potentialClients.length === 0 ? (
                  <span className="text-xs text-stone-400">Nema prijavljenih</span>
                ) : (
                  <ul className="space-y-1 pl-0 list-none">
                    {potentialClients.map((pc) => (
                      <li key={pc.id} className="text-[12px] leading-snug text-stone-900">
                        <span className="font-semibold">{pc.ime}{pc.prezime ? ` ${pc.prezime}` : ''}</span>
                        {pc.ime_roditelja && (
                          <span className="block text-stone-500">rod: {pc.ime_roditelja}</span>
                        )}
                        {pc.mobilni_roditelja && (
                          <span className="block text-stone-500">{pc.mobilni_roditelja}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                {(() => {
                  const tt = predavanja[0]?.term_type;
                  const naziv = Array.isArray(tt) ? tt[0]?.naziv : tt?.naziv;
                  return naziv ? <span className="block text-[11px] font-semibold mt-0.5 opacity-90">{naziv}</span> : null;
                })()}
                {predavanja.length > 0 && (
                  <ul className="mt-1.5 space-y-1 pl-0 list-none border-t border-stone-200/80 pt-1.5">
                    {predavanja.map((p) => (
                      <li key={p.id} className="text-[13px] sm:text-sm leading-snug font-semibold text-stone-900 break-words antialiased">
                        {p.client ? `${p.client.ime ?? ''} ${p.client.prezime ?? ''}`.trim() || '—' : '—'}
                      </li>
                    ))}
                  </ul>
                )}
                {predavanja.length === 0 && (
                  <span className="text-stone-500 text-xs">+ radionica</span>
                )}
              </>
            )}
          </Link>
        );
      })}
      {canAddParallelTerm ? (
        <>
          <Link
            href={newTermHref}
            className={`block rounded-lg border border-dashed border-stone-200 p-1.5 text-stone-500 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-800 text-xs text-center${
              swap.copyMode && swap.isCopyTargetSelected(emptyDate, emptySlot)
                ? ' ring-2 ring-offset-1 ring-emerald-500 border-emerald-500'
                : swap.copyMode
                ? ' ring-2 ring-offset-1 ring-amber-300'
                : ''
            }`}
            onClick={(e) => {
              if (swap.copyMode) {
                e.preventDefault();
                swap.onToggleCopyTarget(emptyDate, emptySlot);
              }
            }}
          >
            {swap.copyMode
              ? swap.isCopyTargetSelected(emptyDate, emptySlot)
                ? '✓ izabrano'
                : 'Kopiraj ovde'
              : `+ Dodaj još termin u ovom slotu (${slotCount}/${maxTerminaPoSlotu})`}
          </Link>
          <Link
            href={newTestHref}
            className="block rounded-lg border border-dashed border-stone-200 p-1 text-[11px] text-center text-stone-400 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-800"
          >
            + Testiranje
          </Link>
        </>
      ) : (
        <p className="text-[0.7rem] text-stone-400 px-1">
          Slot pun ({maxTerminaPoSlotu} termina). Povećajte limit u Admin → Podešavanja ili izaberite drugo vreme.
        </p>
      )}
      {PendingZahteviEntries}
      {CancelledEntries}
    </div>
  );
}

function AdminWeekView({
  startOfWeek,
  terms,
  otkazaniTermini,
  pendingZahtevi,
  linkSuffix,
  base,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  startOfWeek: string;
  terms: AdminTerm[];
  otkazaniTermini: OtkazaniTerminCalendar[];
  pendingZahtevi: PendingZahtevCalendar[];
  linkSuffix: string;
  base: string;
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
  maxTerminaPoSlotu: number;
}) {
  const week1Dates = getWeekDates(startOfWeek);
  const week2Start = (() => {
    const d = new Date(startOfWeek + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const week2Dates = getWeekDates(week2Start);
  const allDates = [...week1Dates, ...week2Dates];
  const prevWeek = (() => {
    const d = new Date(startOfWeek + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const nextWeek = (() => {
    const d = new Date(startOfWeek + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const rangeLabel = (() => {
    const d1 = new Date(startOfWeek + 'T12:00:00');
    const d2 = new Date(week2Start + 'T12:00:00');
    const end2 = new Date(d2);
    end2.setDate(d2.getDate() + 6);
    return `${d1.getDate()}.${d1.getMonth() + 1}. – ${end2.getDate()}.${end2.getMonth() + 1}.${end2.getFullYear()}`;
  })();

  // Deljeno telo tabele (redovi po vremenu) – zove se i za 14 dana (desktop, obe nedelje) i za 7
  // (tablet, samo ova nedelja) sa istim AdminCellContent po ćeliji.
  const renderBody = (dates: string[]) => (
    <tbody>
      {TIME_SLOTS.map((time, slotIndex) => (
        <tr key={slotIndex} className="border-b border-stone-100">
          <td className="sticky left-0 z-10 bg-white p-2 text-stone-500 font-medium w-16">{time}</td>
          {dates.map((date, idx) => {
            const termsInSlot = termsByKey(terms, date, slotIndex);
            const otkazaniInSlot = otkazaniTermini.filter((ot) => ot.term_date === date && ot.slot_index === slotIndex);
            const pendingZahteviInSlot = pendingZahtevi.filter((z) => z.date === date && z.slot_index === slotIndex);
            return (
              <td key={date} className={`p-1 align-top${idx === 7 ? ' border-l-2 border-stone-300' : ''}`}>
                <AdminCellContent
                  termsInSlot={termsInSlot}
                  otkazaniInSlot={otkazaniInSlot}
                  pendingZahteviInSlot={pendingZahteviInSlot}
                  emptyDate={date}
                  emptySlot={slotIndex}
                  draggedTermId={draggedTermId}
                  setDraggedTermId={setDraggedTermId}
                  onDropCell={onDropCell}
                  maxTerminaPoSlotu={maxTerminaPoSlotu}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700">{rangeLabel}</span>
        <div className="flex gap-2">
          <Link href={`${base}?view=nedelja&week=${prevWeek}${linkSuffix}`} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300">
            ← Prethodna
          </Link>
          <Link href={`${base}?view=nedelja&week=${nextWeek}${linkSuffix}`} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300">
            Sledeća →
          </Link>
        </div>
      </div>

      {/* Desktop (lg+): obe nedelje, netaknuto. */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1400px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/60">
              <th className="sticky left-0 z-20 bg-stone-50 w-16 p-2" rowSpan={2} />
              <th colSpan={7} className="px-2 py-1.5 text-center text-xs font-semibold text-stone-500 uppercase tracking-wide border-r border-stone-200">
                Ova nedelja — {formatWeekLabel(startOfWeek)}
              </th>
              <th colSpan={7} className="px-2 py-1.5 text-center text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Sledeća nedelja — {formatWeekLabel(week2Start)}
              </th>
            </tr>
            <tr className="border-b border-stone-200">
              {allDates.map((date, idx) => {
                const d = new Date(date + 'T12:00:00');
                return (
                  <th
                    key={date}
                    className={`p-2 text-center text-stone-600 font-medium min-w-[90px]${idx === 7 ? ' border-l-2 border-stone-300' : ''}`}
                  >
                    <div>{DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                    <div className="text-stone-400">{d.getDate()}.{d.getMonth() + 1}.</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          {renderBody(allDates)}
        </table>
      </div>

      {/* Tablet + telefon (<lg): cela nedelja, 7 kolona, horizontalni skrol po potrebi –
          da se svi dani vide odjednom i Copy/Delete/itd. mogu preko dana. Sopstveni
          vertikalni skrol (max-h + overflow-y) da bi "sticky top" lepio zaglavlje za
          VRH OVOG OKVIRA, nezavisno od sticky admin navigacije iznad. */}
      <div className="lg:hidden overflow-auto max-h-[70vh] rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/60">
              <th className="sticky left-0 top-0 z-30 bg-stone-50 w-16 p-2" />
              {week1Dates.map((date) => {
                const d = new Date(date + 'T12:00:00');
                return (
                  <th key={date} className="sticky top-0 z-20 bg-stone-50 p-2 text-center text-stone-600 font-medium min-w-[90px]">
                    <div>{DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                    <div className="text-stone-400">{d.getDate()}.{d.getMonth() + 1}.</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          {renderBody(week1Dates)}
        </table>
      </div>
    </div>
  );
}

function AdminDayView({
  date,
  terms,
  otkazaniTermini,
  pendingZahtevi,
  linkSuffix,
  base,
  draggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  date: string;
  terms: AdminTerm[];
  otkazaniTermini: OtkazaniTerminCalendar[];
  pendingZahtevi: PendingZahtevCalendar[];
  linkSuffix: string;
  base: string;
  draggedTermId: string | null;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
  maxTerminaPoSlotu: number;
}) {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const prevDay = (() => {
    const x = new Date(date + 'T12:00:00');
    x.setDate(x.getDate() - 1);
    return x.toISOString().slice(0, 10);
  })();
  const nextDay = (() => {
    const x = new Date(date + 'T12:00:00');
    x.setDate(x.getDate() + 1);
    return x.toISOString().slice(0, 10);
  })();
  const weekStart = getMonday(date);
  const weekDates = getWeekDates(weekStart);

  return (
    <div className="space-y-4">
      {/* Desktop/tablet (md+): strelice napred/nazad. */}
      <div className="hidden md:flex items-center justify-between">
        <span className="font-medium text-stone-700 capitalize">{label}</span>
        <div className="flex gap-2">
          <Link href={`${base}?view=dan&day=${prevDay}${linkSuffix}`} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300">
            ← Prethodni
          </Link>
          <Link href={`${base}?view=dan&day=${nextDay}${linkSuffix}`} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300">
            Sledeći →
          </Link>
        </div>
      </div>
      {/* Telefon (<md): traka dana cele nedelje – tap = prava navigacija (samo taj dan je učitan). */}
      <div className="md:hidden space-y-2">
        <span className="font-medium text-stone-700 capitalize text-sm">{label}</span>
        <AdminDateStrip
          dates={weekDates}
          selectedDate={date}
          makeHref={(d) => `${base}?view=dan&day=${d}${linkSuffix}`}
        />
      </div>
      <AdminDayAgenda
        date={date}
        terms={terms}
        otkazaniTermini={otkazaniTermini}
        pendingZahtevi={pendingZahtevi}
        draggedTermId={draggedTermId}
        setDraggedTermId={() => {}}
        onDropCell={onDropCell}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
      />
    </div>
  );
}

function AdminDayAgenda({
  date,
  terms,
  otkazaniTermini,
  pendingZahtevi,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  date: string;
  terms: AdminTerm[];
  otkazaniTermini: OtkazaniTerminCalendar[];
  pendingZahtevi: PendingZahtevCalendar[];
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
  maxTerminaPoSlotu: number;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
      {TIME_SLOTS.map((time, slotIndex) => {
        const termsInSlot = termsByKey(terms, date, slotIndex);
        const otkazaniInSlot = otkazaniTermini.filter((ot) => ot.term_date === date && ot.slot_index === slotIndex);
        const pendingZahteviInSlot = pendingZahtevi.filter((z) => z.date === date && z.slot_index === slotIndex);
        return (
          <div key={slotIndex} className="flex items-stretch gap-4 p-3">
            <div className="w-16 shrink-0 text-stone-500 font-medium">{time}</div>
            <div className="flex-1 min-w-0">
              <AdminCellContent
                termsInSlot={termsInSlot}
                otkazaniInSlot={otkazaniInSlot}
                pendingZahteviInSlot={pendingZahteviInSlot}
                emptyDate={date}
                emptySlot={slotIndex}
                draggedTermId={draggedTermId}
                setDraggedTermId={setDraggedTermId}
                onDropCell={onDropCell}
                maxTerminaPoSlotu={maxTerminaPoSlotu}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontalna "traka" dana – tap menja izabrani dan. Dva moda: onSelect (podaci već učitani,
 * samo se menja lokalni state, npr. u AdminWeekView) ili makeHref (prava navigacija, npr. u
 * AdminDayView gde je učitan samo trenutni dan). */
function AdminDateStrip({
  dates,
  selectedDate,
  onSelect,
  makeHref,
}: {
  dates: string[];
  selectedDate: string;
  onSelect?: (date: string) => void;
  makeHref?: (date: string) => string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
      {dates.map((d) => {
        const dt = new Date(d + 'T12:00:00');
        const dayName = DAY_NAMES[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
        const label = `${dayName} ${dt.getDate()}.${dt.getMonth() + 1}.`;
        const selected = d === selectedDate;
        const className = `shrink-0 snap-center rounded-lg px-3 min-h-[44px] flex items-center justify-center text-sm font-medium ${
          selected ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
        }`;
        if (makeHref) {
          return (
            <Link key={d} href={makeHref(d)} className={className}>
              {label}
            </Link>
          );
        }
        return (
          <button key={d} type="button" onClick={() => onSelect?.(d)} className={className}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function AdminMonthView({
  monthStart,
  terms,
  linkSuffix,
  base,
}: {
  monthStart: string;
  terms: AdminTerm[];
  linkSuffix: string;
  base: string;
}) {
  const first = new Date(monthStart + 'T12:00:00');
  const year = first.getFullYear();
  const month = first.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const startOffset = startDow === 0 ? 6 : startDow - 1;
  const prevMonth = (() => {
    const d = new Date(first);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const nextMonth = (() => {
    const d = new Date(first);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  })();
  const monthLabel = first.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' });

  const days: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700 capitalize">{monthLabel}</span>
        <div className="flex gap-2">
          <Link href={`${base}?view=mesec&month=${prevMonth}${linkSuffix}`} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300">
            ← Prethodni
          </Link>
          <Link href={`${base}?view=mesec&month=${nextMonth}${linkSuffix}`} className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300">
            Sledeći →
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
          {DAY_NAMES.map((d) => (
            <div key={d} className="p-2 text-center text-sm font-medium text-stone-600">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date, i) => {
            if (!date) {
              return <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-stone-100 bg-stone-50/50" />;
            }
            const dayTerms = terms.filter((t) => t.date === date);
            const slotCount = dayTerms.length;
            return (
              <div key={date} className="min-h-[80px] border-b border-r border-stone-100 p-1">
                <div className="text-xs text-stone-400 mb-1">{new Date(date + 'T12:00:00').getDate()}.</div>
                {slotCount > 0 ? (
                  <Link href={`${base}?view=dan&day=${date}${linkSuffix}`} className="text-xs hover:underline text-amber-700">
                    {slotCount} termin(a)
                  </Link>
                ) : (
                  <Link href={`${base}?view=dan&day=${date}${linkSuffix}`} className="text-xs text-stone-400 hover:opacity-70">
                    +
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
