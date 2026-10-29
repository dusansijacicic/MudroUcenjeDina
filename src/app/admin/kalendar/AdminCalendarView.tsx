'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useKalendarRealtime } from '@/lib/use-kalendar-realtime';
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
  createBulkTermsAsAdmin,
  assignInstructorToTermsAsAdmin,
  assignClassroomToTermsAsAdmin,
  assignInstructorToZahteviAsAdmin,
  assignClassroomToZahteviAsAdmin,
  assignTermTypeToTermsAsAdmin,
  assignTermTypeToZahteviAsAdmin,
  blockSlotsAsAdmin,
  unblockSlotAsAdmin,
  type BlokiranTermin,
} from '@/app/admin/actions';
import SingleKlijentPicker from '@/components/SingleKlijentPicker';
import GrupniKlijentiPicker from '@/components/GrupniKlijentiPicker';
import StickyBar from '@/components/StickyBar';
import useStickyThead from '@/components/useStickyThead';

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
  /** [x, y] – i čas zakazan bez instruktora ima svoj redni broj od plaćenih (migracija 047). */
  redni?: [number, number] | null;
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
    /** [x, y] – x-ti čas deteta te vrste od y plaćenih (migracija 047); null ako nije poznato. */
    redni?: [number, number] | null;
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
  blockMode: boolean;
  isBlockSelected: (date: string, slot: number) => boolean;
  onToggleBlockSlot: (date: string, slot: number) => void;
  getBlocked: (date: string, slot: number) => BlokiranTermin | undefined;
  onUnblock: (id: string) => void;
  assignMode: boolean;
  isMarkedForAssign: (termId: string) => boolean;
  onToggleAssignSelect: (termId: string) => void;
  isZahtevMarkedForAssign: (zahtevId: string) => boolean;
  onToggleAssignZahtevSelect: (zahtevId: string) => void;
  /** Sve učionice (za "Zakaži više časova" – da svaki slot pokaže koje su još slobodne u njemu). */
  classroomsList: { id: string; naziv: string }[];
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
  bulkMode: false,
  isBulkSelected: () => false,
  onToggleBulkSlot: () => {},
  blockMode: false,
  isBlockSelected: () => false,
  onToggleBlockSlot: () => {},
  getBlocked: () => undefined,
  onUnblock: () => {},
  assignMode: false,
  isMarkedForAssign: () => false,
  onToggleAssignSelect: () => {},
  isZahtevMarkedForAssign: () => false,
  onToggleAssignZahtevSelect: () => {},
  classroomsList: [],
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

/** Skraćeno ime učionice (npr. "1-Buzan" → "1") za uske ekrane. Bez crtice vraća naziv nepromenjen. */
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

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Prikazani period + Prethodna/Sledeća – stoji u zamrznutoj traci alata, da ostane vidljivo dok se skroluje. */
function PeriodNav({
  view,
  startOfWeek,
  singleDay,
  monthStart,
  base,
  linkSuffix,
}: {
  view: string;
  startOfWeek: string;
  singleDay?: string;
  monthStart?: string;
  base: string;
  linkSuffix: string;
}) {
  let label: string;
  let prevHref: string;
  let nextHref: string;
  let prevText = '← Prethodni';
  let nextText = 'Sledeći →';
  if (view === 'dan' && singleDay) {
    label = new Date(singleDay + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    prevHref = `${base}?view=dan&day=${shiftDays(singleDay, -1)}${linkSuffix}`;
    nextHref = `${base}?view=dan&day=${shiftDays(singleDay, 1)}${linkSuffix}`;
  } else if (view === 'mesec' && monthStart) {
    const first = new Date(monthStart + 'T12:00:00');
    const shiftMonth = (n: number) => {
      const d = new Date(first);
      d.setMonth(d.getMonth() + n);
      return d.toISOString().slice(0, 7);
    };
    label = first.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' });
    prevHref = `${base}?view=mesec&month=${shiftMonth(-1)}${linkSuffix}`;
    nextHref = `${base}?view=mesec&month=${shiftMonth(1)}${linkSuffix}`;
  } else {
    // Nedeljni prikaz pokazuje dve nedelje (ova + sledeća).
    const d1 = new Date(startOfWeek + 'T12:00:00');
    const end = new Date(shiftDays(startOfWeek, 13) + 'T12:00:00');
    label = `${d1.getDate()}.${d1.getMonth() + 1}. – ${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
    prevHref = `${base}?view=nedelja&week=${shiftDays(startOfWeek, -7)}${linkSuffix}`;
    nextHref = `${base}?view=nedelja&week=${shiftDays(startOfWeek, 7)}${linkSuffix}`;
    prevText = '← Prethodna';
    nextText = 'Sledeća →';
  }
  const btn = 'px-3 py-1.5 min-h-[44px] md:min-h-0 inline-flex items-center rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300';
  return (
    // Dan na telefonu ima svoju traku dana ispod, pa se ovde krije da se ne duplira.
    <div className={`${view === 'dan' ? 'hidden md:flex' : 'flex'} items-center gap-2`}>
      <span className="font-medium text-stone-700 text-sm capitalize tabular-nums mr-1">{label}</span>
      <Link href={prevHref} className={btn}>{prevText}</Link>
      <Link href={nextHref} className={btn}>{nextText}</Link>
    </div>
  );
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

/** Abecedno sortira po imenu+prezimenu ("sr-Latn-RS") – koristi se svuda gde se prikazuje raspored dece. */
function sortByFullName<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => getName(a).localeCompare(getName(b), 'sr-Latn-RS'));
}

/** Abecedno sortirana lista imena u termin-kartici na kalendaru – ako ima više od `threshold` polaznika,
 * prikazuje se samo prvih `threshold` + dugme "+ N ostalih" (klik proširuje, bez napuštanja kartice). */
function TruncatedNameList({
  items,
  threshold = 3,
  itemClassName,
}: {
  items: { key: string; content: React.ReactNode }[];
  threshold?: number;
  itemClassName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, threshold);
  const restCount = items.length - visible.length;
  return (
    <>
      {visible.map((it) => (
        <li key={it.key} className={itemClassName}>
          {it.content}
        </li>
      ))}
      {restCount > 0 && (
        <li>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(true);
            }}
            className="px-2 py-0.5 text-[11px] font-medium text-stone-500 underline decoration-dotted hover:text-stone-800"
          >
            + {restCount} ostalih
          </button>
        </li>
      )}
      {expanded && items.length > threshold && (
        <li>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(false);
            }}
            className="px-2 py-0.5 text-[11px] font-medium text-stone-500 underline decoration-dotted hover:text-stone-800"
          >
            Prikaži manje
          </button>
        </li>
      )}
    </>
  );
}

const DEFAULT_COLOR = '#0d9488';

const DEFAULT_MAX_TERMINA_PO_SLOTU = 4;

const NO_BLOCKED_SLOTS: BlokiranTermin[] = [];

// Traži se prvi VIDLJIV element – desktop i tablet tabela su obe u DOM-u.
function firstVisible(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.offsetParent !== null) ?? null;
}

/** Klik na datum u traci "termini bez instruktora/učionice" vodi tačno do tog zahteva (bez animacije). */
function scrollToZahtev(d: string): boolean {
  const visible = firstVisible(`[data-zahtev-date="${d}"]`);
  if (!visible) return false;
  visible.scrollIntoView({ behavior: 'auto', block: 'center' });
  return true;
}

/** Povratak posle "Zakaži termin" (?fokus=datum&slot=N): glatko do te ćelije + kratak ljubičasti
 * bljesak (iste boje kao hover), da se odmah vidi gde je termin upisan. */
function scrollToCell(d: string, slot: number): boolean {
  const cell = firstVisible(`td[data-date="${d}"][data-slot="${slot}"]`);
  if (!cell) return false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cell.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  if (!reduceMotion) {
    const on = { boxShadow: 'inset 0 0 0 4px #7e22ce', backgroundColor: 'rgb(147 51 234 / 0.28)' };
    cell.animate(
      [on, { ...on, offset: 0.6 }, { boxShadow: 'inset 0 0 0 4px rgb(126 34 206 / 0)', backgroundColor: 'rgb(147 51 234 / 0)' }],
      { duration: 3000, delay: 350, easing: 'ease-out' }
    );
  }
  return true;
}

export default function AdminCalendarView({
  headerContent,
  terms: termsProp,
  otkazaniTermini: otkazaniTerminiProp = [],
  startOfWeek,
  singleDay,
  monthStart,
  view,
  maxTerminaPoSlotu = DEFAULT_MAX_TERMINA_PO_SLOTU,
  clients = [],
  termTypes = [],
  termCategories = [],
  instructorsList = [],
  classroomsList = [],
  pendingZahtevi: pendingZahteviProp = [],
  allPendingZahteviDates = [],
  focusDate,
  focusSlot,
  blockedSlots: blockedSlotsProp = NO_BLOCKED_SLOTS,
  filterQuery = '',
  filterClientId = null,
}: {
  /** Naslov/filteri/legenda iznad kalendara (server-renderovani deo iz page.tsx). */
  headerContent?: React.ReactNode;
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
  /** Za "Zakaži više časova" u grupnom modu – da se izabere odgovarajuća (grupna) kategorija termina. */
  termCategories?: { id: string; naziv: string; jedan_klijent_po_terminu: boolean; is_testing?: boolean; is_nastavak?: boolean }[];
  /** Za "Dodeli instruktora"/"Dodeli učionicu" module. */
  instructorsList?: { id: string; ime: string; prezime: string }[];
  classroomsList?: { id: string; naziv: string }[];
  /** Zahtevi na čekanju (bez instruktora) – informativni prikaz na kalendaru. */
  pendingZahtevi?: PendingZahtevCalendar[];
  /** SVI zahtevi na čekanju (bez obzira na trenutno prikazanu nedelju) – za notifikaciju gore. */
  allPendingZahteviDates?: string[];
  /** ?fokus=YYYY-MM-DD – posle klika na datum u traci zahteva, skroluje se do tog zahteva. */
  focusDate?: string;
  /** ?slot=N uz ?fokus – posle "Zakaži termin" glatko skroluje do te ćelije (datum + vreme) i kratko je istakne. */
  focusSlot?: number;
  /** Blokirani slotovi u prikazanom opsegu (Admin → Blokiraj termin(e)). */
  blockedSlots?: BlokiranTermin[];
  /** Aktivni filteri kao "&instructor=…&client=…" – dodaju se na svaki link perioda da filter ostane uključen. */
  filterQuery?: string;
  /** Filter po detetu – mesečni prikaz tada ispisuje sve termine tog deteta (bez skraćivanja). */
  filterClientId?: string | null;
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

  // Posle navigacije na drugu nedelju (?fokus=datum) lokalni pendingZahtevi/termini se osveže tek u
  // narednom renderu – zato se pokušava i kad se oni promene, ali samo jednom po cilju.
  const focusedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusDate) return;
    const key = `${focusDate}|${focusSlot ?? ''}`;
    if (focusedForRef.current === key) return;
    const ok = focusSlot != null ? scrollToCell(focusDate, focusSlot) : scrollToZahtev(focusDate);
    if (ok) focusedForRef.current = key;
  }, [focusDate, focusSlot, pendingZahtevi, terms]);

  const openZahtevDate = (d: string) => {
    const weekEnd = new Date(startOfWeek + 'T12:00:00');
    weekEnd.setDate(weekEnd.getDate() + 13);
    const inView = view === 'nedelja' && d >= startOfWeek && d <= weekEnd.toISOString().slice(0, 10);
    if (inView && scrollToZahtev(d)) return;
    focusedForRef.current = null;
    router.push(`/admin/kalendar?view=nedelja&week=${getMonday(d)}&fokus=${d}${filterQuery}`);
  };

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
  // Grupni mod: više dece odjednom u istim slotovima (npr. grupa odraslih koja ima čas svaki dan) –
  // zahteva instruktora (zahtevi_za_cas ne podržavaju grupu, samo jedno dete po zahtevu).
  const [bulkGroupMode, setBulkGroupMode] = useState(false);
  const [bulkClientId, setBulkClientId] = useState('');
  const [bulkGroupClientIds, setBulkGroupClientIds] = useState<string[]>([]);
  const [bulkTermCategoryId, setBulkTermCategoryId] = useState('');
  const [bulkTermTypeId, setBulkTermTypeId] = useState('');
  // Prazno = bez instruktora/učionice – pravi se zahtev (kao do sad). Ako se izabere instruktor,
  // pravi se pravi termin (učionica ostaje opciona i u tom slučaju).
  const [bulkInstructorChoice, setBulkInstructorChoice] = useState('');
  const [bulkClassroomChoice, setBulkClassroomChoice] = useState('');
  const [bulkSlots, setBulkSlots] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  // "Zakaži više časova" ne radi optimistički update (kao swap) – nakon potvrde čeka se pravi
  // router.refresh() da bi se novi termini uopšte pojavili. Bez ovoga, "Zakazujem…" nestaje čim
  // server odgovori, ali PRE nego što svež termsProp stigne – admin u međuvremenu otvori mod za
  // sledeće dete i vidi te sveže zakazane termine kao da ih nema (dok se refresh ne završi).
  const bulkRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (bulkRefreshTimeoutRef.current) {
      clearTimeout(bulkRefreshTimeoutRef.current);
      bulkRefreshTimeoutRef.current = null;
      setBulkLoading(false);
    }
  }, [termsProp]);

  const grupneKategorije = termCategories.filter((c) => !c.jedan_klijent_po_terminu && !c.is_testing && !c.is_nastavak);

  const [assignMode, setAssignMode] = useState(false);
  const [assignSelection, setAssignSelection] = useState<Set<string>>(new Set());
  const [assignZahteviSelection, setAssignZahteviSelection] = useState<Set<string>>(new Set());
  // Prazno = "bez instruktora"/"bez učionice"/"ne menjaj vrstu" – ne menja se to polje, menja se
  // samo ono što jeste izabrano.
  const [assignInstructorChoice, setAssignInstructorChoice] = useState('');
  const [assignClassroomChoice, setAssignClassroomChoice] = useState('');
  const [assignTermTypeChoice, setAssignTermTypeChoice] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Blokiranje termina: izabrani slotovi (date|slot) + zajednička napomena ZAŠTO.
  const [blockMode, setBlockMode] = useState(false);
  const [blockSlots, setBlockSlots] = useState<Set<string>>(new Set());
  const [blockNapomena, setBlockNapomena] = useState('');
  const [blockLoading, setBlockLoading] = useState(false);
  const [blokirani, setBlokirani] = useState(blockedSlotsProp);
  useEffect(() => {
    setBlokirani(blockedSlotsProp);
  }, [blockedSlotsProp]);
  const blokiraniByKey = useMemo(() => new Map(blokirani.map((b) => [`${b.date}|${b.slot_index}`, b])), [blokirani]);

  useKalendarRealtime(swapMode || copyMode || deleteMode || bulkMode || assignMode || blockMode || draggedTermId !== null);

  // Swap/Copy/Delete/Bulk/Assign/Block su međusobno isključivi – uključivanje jednog gasi ostale da
  // klikovi na kalendaru ne budu dvosmisleni.
  const resetOtherModes = (keep: 'swap' | 'copy' | 'delete' | 'bulk' | 'assign' | 'block') => {
    if (keep !== 'block') {
      setBlockMode(false);
      setBlockSlots(new Set());
    }
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
    setBulkClientId('');
    setBulkGroupMode(false);
    setBulkGroupClientIds([]);
    setBulkTermCategoryId('');
    setBulkInstructorChoice('');
    setBulkClassroomChoice('');
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
    if (bulkGroupMode) {
      if (bulkGroupClientIds.length === 0 || !bulkInstructorChoice || !bulkTermCategoryId || bulkSlots.size === 0) return;
    } else if (!bulkClientId || bulkSlots.size === 0) {
      return;
    }
    const slots = [...bulkSlots].map((key) => {
      const [date, slotStr] = key.split('|');
      return { date, slotIndex: Number(slotStr) };
    });
    const instructorId = bulkInstructorChoice;
    const classroomId = bulkClassroomChoice || null;
    const groupClientIds = bulkGroupClientIds;
    const groupCategoryId = bulkTermCategoryId;
    const isGroup = bulkGroupMode;
    setBulkSlots(new Set());
    setBulkMode(false);
    setBulkClientId('');
    setBulkGroupMode(false);
    setBulkGroupClientIds([]);
    setBulkTermCategoryId('');
    setBulkInstructorChoice('');
    setBulkClassroomChoice('');
    setBulkLoading(true);
    if (isGroup) {
      const { failed } = await createBulkTermsAsAdmin(groupClientIds, instructorId, classroomId, bulkTermTypeId || null, slots, groupCategoryId);
      if (failed.length > 0) {
        toast.error(`Nije zakazano ${failed.length}/${slots.length} – ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
      } else {
        toast.success(`Zakazano ${slots.length} termin(a) za grupu od ${groupClientIds.length}.`);
      }
    } else if (instructorId) {
      const { failed } = await createBulkTermsAsAdmin([bulkClientId], instructorId, classroomId, bulkTermTypeId || null, slots);
      if (failed.length > 0) {
        toast.error(`Nije zakazano ${failed.length}/${slots.length} – ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
      } else {
        toast.success(`Zakazano ${slots.length} termin(a).`);
      }
    } else {
      const { failed } = await createBulkZahteviAsAdmin(bulkClientId, bulkTermTypeId || null, slots, classroomId);
      if (failed.length > 0) {
        toast.error(`Nije zakazano ${failed.length}/${slots.length} – ${failed.map((f) => `${f.date} (${f.error})`).join('; ')}`);
      } else {
        toast.success(`Kreirano ${slots.length} zahtev(a) – predavači ih vide na svom Dashboard → Zahtevi.`);
      }
    }
    // "Zakazujem…" ostaje vidljivo (i dugme za novo zakazivanje ostaje zaključano) dok sveži
    // termini stvarno ne stignu kroz termsProp – vidi efekat gore. 4s je samo sigurnosna kočnica
    // ako iz nekog razloga refresh ne donese nov niz (da spinner ne ostane zauvek).
    if (bulkRefreshTimeoutRef.current) clearTimeout(bulkRefreshTimeoutRef.current);
    bulkRefreshTimeoutRef.current = setTimeout(() => {
      bulkRefreshTimeoutRef.current = null;
      setBulkLoading(false);
    }, 4000);
    router.refresh();
  };

  const toggleBlockMode = () => {
    setBlockMode((v) => {
      const next = !v;
      if (next) resetOtherModes('block');
      return next;
    });
    setBlockSlots(new Set());
    setBlockNapomena('');
  };

  const onToggleBlockSlot = (date: string, slot: number) => {
    const key = `${date}|${slot}`;
    setBlockSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Već zakazani termini/zahtevi u izabranim slotovima – ostaju posle blokiranja, treba ih premestiti. */
  const blockConflicts = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    for (const key of blockSlots) {
      const [date, slotStr] = key.split('|');
      const slot = Number(slotStr);
      for (const t of terms) {
        if (t.date !== date || t.slot_index !== slot || isAutoSpillover(t)) continue;
        const deca = (t.predavanja ?? [])
          .map((p) => (p.client ? `${p.client.ime} ${p.client.prezime}` : ''))
          .filter(Boolean)
          .join(', ');
        list.push({ key: `t-${t.id}`, label: `${swapTermLabel(t)}${deca ? ` – ${deca}` : ''}` });
      }
      for (const z of pendingZahtevi) {
        if (z.date !== date || z.slot_index !== slot) continue;
        list.push({
          key: `z-${z.id}`,
          label: `${formatShortDate(z.date)} ${TIME_SLOTS[z.slot_index] ?? ''} · zahtev – ${z.client_ime}${z.client_prezime ? ` ${z.client_prezime}` : ''}`,
        });
      }
    }
    return list;
  }, [blockSlots, terms, pendingZahtevi]);

  const confirmBlock = async () => {
    if (blockSlots.size === 0) return;
    if (blockConflicts.length > 0) {
      const ok = window.confirm(
        `U izabranim terminima već je zakazano (${blockConflicts.length}):\n\n` +
          blockConflicts.map((c) => `• ${c.label}`).join('\n') +
          '\n\nAko ipak blokirate, ovi termini OSTAJU i treba ih premestiti (spisak je u Admin → Blokirani termini).\n\nBlokirati ipak?'
      );
      if (!ok) return;
    }
    const slots = [...blockSlots].map((key) => {
      const [date, slotStr] = key.split('|');
      return { date, slotIndex: Number(slotStr) };
    });
    setBlockLoading(true);
    const res = await blockSlotsAsAdmin(slots, blockNapomena);
    setBlockLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Blokirano ${slots.length} termin(a).`);
    setBlockSlots(new Set());
    setBlockNapomena('');
    setBlockMode(false);
    router.refresh();
  };

  const handleUnblock = async (id: string) => {
    if (!confirm('Odblokirati ovaj termin? Ponovo će moći da se zakazuje.')) return;
    const prev = blokirani;
    setBlokirani((list) => list.filter((b) => b.id !== id));
    const res = await unblockSlotAsAdmin(id);
    if (res.error) {
      setBlokirani(prev);
      toast.error(res.error);
      return;
    }
    router.refresh();
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
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };
  const base = '/admin/kalendar';
  const linkSuffix = filterQuery;

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
        pendingZahtevi={pendingZahtevi}
        showAll={!!filterClientId}
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
        draggedTermId={draggedTermId}
        setDraggedTermId={setDraggedTermId}
        onDropCell={handleDrop}
        maxTerminaPoSlotu={maxTerminaPoSlotu}
      />
    );
  }

  // Potvrda aktivnog moda stoji i u zamrznutoj traci pored "Print / PDF" – posle klikanja po
  // kalendaru ne mora da se skroluje nazad do panela. Isti uslovi kao dugme u panelu ispod.
  const deleteCount = deleteSelection.size + deleteOtkazaniSelection.size + deleteZahteviSelection.size;
  const deleteDisabled = deleteCount === 0 || deleteLoading;
  const assignCount = assignSelection.size + assignZahteviSelection.size;
  const assignDisabled = (!assignInstructorChoice && !assignClassroomChoice && !assignTermTypeChoice) || assignCount === 0 || assignLoading;
  const swapDisabled = !swapFirst || !swapSecond || !anyFieldChecked;
  const copyDisabled = copyTargets.size === 0 || !copyFieldsAnyChecked || copyLoading;
  const bulkDisabled =
    (bulkGroupMode
      ? bulkGroupClientIds.length === 0 || !bulkInstructorChoice || !bulkTermCategoryId || bulkSlots.size === 0
      : !bulkClientId || bulkSlots.size === 0) || bulkLoading;
  const blockDisabled = blockSlots.size === 0 || blockLoading;
  const activeConfirm = blockMode
    ? { label: `Blokiraj (${blockSlots.size})`, disabled: blockDisabled, color: 'bg-stone-800 hover:bg-stone-900' }
    : deleteMode
      ? { label: `Potvrdi brisanje (${deleteCount})`, disabled: deleteDisabled, color: 'bg-red-600 hover:bg-red-700' }
      : assignMode
        ? { label: `Potvrdi dodelu (${assignCount})`, disabled: assignDisabled, color: 'bg-emerald-600 hover:bg-emerald-700' }
        : swapMode
          ? { label: 'Potvrdi zamenu', disabled: swapDisabled, color: 'bg-emerald-600 hover:bg-emerald-700' }
          : copyMode
            ? { label: `Potvrdi kopiranje (${copyTargets.size})`, disabled: copyDisabled, color: 'bg-emerald-600 hover:bg-emerald-700' }
            : bulkMode
              ? { label: `Potvrdi zakazivanje (${bulkSlots.size})`, disabled: bulkDisabled, color: 'bg-emerald-600 hover:bg-emerald-700' }
              : null;
  const runActiveConfirm = () => {
    if (blockMode) confirmBlock();
    else if (deleteMode) confirmDelete();
    else if (assignMode) confirmAssign();
    else if (swapMode) confirmSwap();
    else if (copyMode) confirmCopy();
    else if (bulkMode) confirmBulk();
  };

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
        blockMode,
        isBlockSelected: (date: string, slot: number) => blockSlots.has(`${date}|${slot}`),
        onToggleBlockSlot,
        getBlocked: (date: string, slot: number) => blokiraniByKey.get(`${date}|${slot}`),
        onUnblock: handleUnblock,
        assignMode,
        isMarkedForAssign: (termId: string) => assignSelection.has(termId),
        onToggleAssignSelect,
        isZahtevMarkedForAssign: (zahtevId: string) => assignZahteviSelection.has(zahtevId),
        onToggleAssignZahtevSelect,
        classroomsList,
      }}
    >
      {headerContent}
      {allPendingZahteviDates.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="font-semibold">
            ⚠ {allPendingZahteviDates.length} {allPendingZahteviDates.length === 1 ? 'termin' : 'termina'} bez instruktora/učionice:
          </span>
          <span className="flex flex-wrap gap-1.5">
            {allPendingZahteviDates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => openZahtevDate(d)}
                className="rounded-full bg-amber-200 px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-300"
              >
                {formatShortDate(d)}
              </button>
            ))}
          </span>
        </div>
      )}
      {/* Zamrznuta (sticky) je ISKLJUČIVO ova traka: dugmići modova, period sa Prethodna/Sledeća,
          potvrda aktivnog moda i Print. Polja i čipovi modova nisu ovde, da ne bi zauzeli ekran dok se skroluje. */}
      <StickyBar enabled topOffset={0} className="mb-4 rounded-xl border border-stone-200 bg-white p-3">
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
          {deleteLoading && <span className="text-sm text-stone-500">Brišem…</span>}
          <button
            type="button"
            onClick={toggleBulkMode}
            disabled={bulkLoading}
            title={bulkLoading ? 'Sačekajte da se prethodno zakazivanje završi i prikaže na kalendaru…' : undefined}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              bulkMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {bulkMode ? 'Zakaži više časova: uključeno' : 'Zakaži više časova'}
          </button>
          {bulkLoading && <span className="text-sm text-stone-500">Zakazujem… (sačekajte da se prikaže na kalendaru)</span>}
          <button
            type="button"
            onClick={toggleAssignMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              assignMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {assignMode ? 'Dodeli instruktora/učionicu/vrstu: uključeno' : 'Dodeli instruktora/učionicu/vrstu'}
          </button>
          {assignLoading && <span className="text-sm text-stone-500">Dodeljujem…</span>}
          <button
            type="button"
            onClick={toggleBlockMode}
            className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium ${
              blockMode ? 'bg-stone-800 text-white hover:bg-stone-900' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {blockMode ? 'Blokiraj termin(e): uključeno' : 'Blokiraj termin(e)'}
          </button>
          {blockLoading && <span className="text-sm text-stone-500">Blokiram…</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <PeriodNav
              view={view}
              startOfWeek={startOfWeek}
              singleDay={singleDay}
              monthStart={monthStart}
              base={base}
              linkSuffix={linkSuffix}
            />
            {activeConfirm && (
              <button
                type="button"
                onClick={runActiveConfirm}
                disabled={activeConfirm.disabled}
                className={`px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-sm font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${activeConfirm.color}`}
              >
                ✓ {activeConfirm.label}
              </button>
            )}
            <Link
              href={`/admin/kalendar/print?week=${startOfWeek}`}
              className="hidden md:inline-flex px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-600 hover:bg-stone-200"
            >
              🖨 Print / PDF
            </Link>
          </div>
        </div>
      </StickyBar>
      {/* Polja/potvrde/čipovi aktivnog moda – NIJE zamrznuto, ide normalno u toku stranice, iznad kalendara. */}
      {(swapMode || copyMode || deleteMode || bulkMode || assignMode || blockMode) && (
        <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3 space-y-3">
          {blockMode && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1 max-w-xl">
                  <label className="block text-xs font-medium text-stone-700 mb-1">Napomena – zašto se blokira</label>
                  <input
                    type="text"
                    value={blockNapomena}
                    onChange={(e) => setBlockNapomena(e.target.value)}
                    placeholder="npr. praznik, sređivanje učionica, sastanak…"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
                  />
                </div>
                <button
                  type="button"
                  onClick={confirmBlock}
                  disabled={blockDisabled}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Blokiraj ({blockSlots.size})
                </button>
                <span className="text-stone-400 text-xs">kliknite termine na kalendaru koje blokirate</span>
              </div>
              {blockConflicts.length > 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800">
                  <p className="font-medium">U izabranim terminima već je zakazano ({blockConflicts.length}) – ako blokirate, treba ih premestiti:</p>
                  <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                    {blockConflicts.map((c) => (
                      <li key={c.key}>{c.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {deleteMode && (
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteDisabled}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Potvrdi brisanje ({deleteCount})
              </button>
              <span className="text-sm text-stone-400">
                kliknite termine (i sive otkazane/zahteve) da ih označite, klik ponovo za deselekciju – ovo je trajno brisanje BEZ TRAGA, ne otkazivanje
              </span>
            </div>
          )}
          {assignMode && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-3 flex-wrap">
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
                  disabled={assignDisabled}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Potvrdi dodelu ({assignCount})
                </button>
                <span className="text-sm text-stone-400">
                  izaberite instruktora i/ili učionicu i/ili vrstu časa (može bilo koja kombinacija), pa kliknite termine na kalendaru da ih označite
                </span>
              </div>
              {(assignSelection.size > 0 || assignZahteviSelection.size > 0) && (
                <div className="flex flex-wrap gap-1.5">
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
          )}
          {swapMode && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-3 flex-wrap text-stone-700">
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
                <button
                  type="button"
                  onClick={confirmSwap}
                  disabled={swapDisabled}
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
              </div>
              <div className="flex flex-wrap items-center gap-3">
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
            </div>
          )}
          {copyMode && (
            <div className="flex flex-col gap-2 text-sm">
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
                    disabled={copyDisabled}
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
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-center gap-1.5 text-stone-700">
                <input
                  type="checkbox"
                  checked={bulkGroupMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setBulkGroupMode(checked);
                    // Grupa zahteva instruktora (zahtevi_za_cas ne podržavaju grupu) – ako nema
                    // izabranog, uzmi prvog da forma odmah bude ispravna.
                    if (checked && !bulkInstructorChoice) setBulkInstructorChoice(instructorsList[0]?.id ?? '');
                    if (checked && !bulkTermCategoryId) setBulkTermCategoryId(grupneKategorije[0]?.id ?? '');
                  }}
                />
                Grupa (više dece odjednom u istim terminima)
              </label>
              <div className="flex flex-wrap items-end gap-3">
                {bulkGroupMode ? (
                  <div className="min-w-[260px]">
                    <label className="block text-xs font-medium text-stone-700 mb-1">Deca (grupa)</label>
                    <GrupniKlijentiPicker
                      clients={clients}
                      selectedIds={bulkGroupClientIds}
                      onSelectionChange={setBulkGroupClientIds}
                      inputId="admin-bulk-grupni-klijenti-search"
                      listMaxHeightClassName="max-h-20"
                    />
                  </div>
                ) : (
                  <div className="min-w-[220px]">
                    <label className="block text-xs font-medium text-stone-700 mb-1">Dete</label>
                    <SingleKlijentPicker
                      clients={clients}
                      value={bulkClientId}
                      onChange={setBulkClientId}
                      inputId="admin-bulk-klijent-search"
                      listMaxHeightClassName="max-h-20"
                    />
                  </div>
                )}
                {bulkGroupMode && (
                  <div className="min-w-[200px]">
                    <label className="block text-xs font-medium text-stone-700 mb-1">Kategorija termina</label>
                    <select
                      value={bulkTermCategoryId}
                      onChange={(e) => setBulkTermCategoryId(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
                    >
                      {grupneKategorije.length === 0 && <option value="">— nema grupnih kategorija —</option>}
                      {grupneKategorije.map((c) => (
                        <option key={c.id} value={c.id}>{c.naziv}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                <div className="min-w-[180px]">
                  <label className="block text-xs font-medium text-stone-700 mb-1">Instruktor</label>
                  <select
                    value={bulkInstructorChoice}
                    onChange={(e) => setBulkInstructorChoice(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
                  >
                    {!bulkGroupMode && <option value="">bez instruktora (zahtev)</option>}
                    {bulkGroupMode && !bulkInstructorChoice && <option value="">— izaberite instruktora —</option>}
                    {instructorsList.map((i) => (
                      <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[160px]">
                  <label className="block text-xs font-medium text-stone-700 mb-1">Učionica</label>
                  <select
                    value={bulkClassroomChoice}
                    onChange={(e) => setBulkClassroomChoice(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
                  >
                    <option value="">bez učionice</option>
                    {classroomsList.map((c) => (
                      <option key={c.id} value={c.id}>{c.naziv}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={confirmBulk}
                  disabled={bulkDisabled}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Potvrdi ({bulkSlots.size})
                </button>
              </div>
              <span className="text-stone-400 text-xs max-w-md">
                {bulkGroupMode
                  ? 'Izaberite grupu dece, kategoriju termina (grupna), instruktora i kliknite termine na kalendaru – ista grupa/instruktor/učionica/vrsta časa za sve izabrane slotove.'
                  : 'Izaberite dete, pa kliknite termine na kalendaru (bilo prazne ili zauzete). Bez instruktora – pravi se zahtev (učionica, ako je izabrana, ide uz zahtev) koji bilo koji predavač preuzima na svom Dashboard → Zahtevi. Sa izabranim instruktorom – odmah se zakazuju pravi termini, isti instruktor/učionica/vrsta časa za sve izabrane slotove.'}
              </span>
            </div>
          )}
        </div>
      )}
      {body}
    </SwapContext.Provider>
  );
}

/** Boje redova za decu u jednom terminu (slotu): 1. dete prva boja, 2. druga… – po redosledu u slotu,
 * ne po učionici, da se na prvi pogled vidi koliko dece je u isto vreme. */
const CHILD_ROW_COLORS = [
  { bg: '#fef3c7', bar: '#f59e0b' }, // žuta
  { bg: '#dbeafe', bar: '#3b82f6' }, // plava
  { bg: '#dcfce7', bar: '#22c55e' }, // zelena
  { bg: '#fce7f3', bar: '#ec4899' }, // roze
  { bg: '#ccfbf1', bar: '#14b8a6' }, // tirkizna (ljubičasta je rezervisana za hover)
  { bg: '#ffedd5', bar: '#f97316' }, // narandžasta
];

/** Red deteta čiji čas nije plaćen (x > y) – jače crvena od roze reda, uz "!" oznaku. */
const UNPAID_ROW_STYLE = { backgroundColor: '#fecaca', borderLeft: '4px solid #dc2626' };

function isUnpaid(redni: [number, number] | null | undefined): boolean {
  return !!redni && redni[0] > redni[1];
}

/** "x/y · još N" uz ime deteta (N = koliko plaćenih ostaje posle ovog časa): crveno sa "!" kad čas
 * nije plaćen, narandžasto "poslednji" za poslednji plaćeni. ml-auto: kad nema mesta pored imena,
 * prelama se u sledeći red umesto da sabije ime. */
function RedniBroj({ redni }: { redni: [number, number] }) {
  const [x, y] = redni;
  if (x > y) {
    return <span className="ml-auto shrink-0 rounded bg-red-600 px-1 text-[11px] font-bold tabular-nums text-white">! {x}/{y}</span>;
  }
  return (
    <span className={`ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums ${x === y ? 'font-bold text-amber-700' : 'font-medium text-stone-500'}`}>
      {x}/{y} · {x === y ? 'poslednji' : `još ${y - x}`}
    </span>
  );
}

function redniTitle(redni: [number, number] | null | undefined): string | undefined {
  if (!redni) return undefined;
  const [x, y] = redni;
  if (x > y) return `Nije plaćeno: ${x}. čas, a plaćeno je ${y}.`;
  return x === y
    ? `${x}. čas od ${y} plaćenih – poslednji plaćeni.`
    : `${x}. čas od ${y} plaćenih – posle njega ostaje još ${y - x} plaćenih.`;
}

function isTestingTerm(term: AdminTerm): boolean {
  const tcRaw = term.term_category;
  return Array.isArray(tcRaw) ? (tcRaw as { is_testing: boolean }[])[0]?.is_testing === true : tcRaw?.is_testing === true;
}

/** Koliko redova (dece) termin zauzima u ćeliji – za nastavak boja kroz sve termine u istom slotu. */
function childRowCount(term: AdminTerm): number {
  if (isAutoSpillover(term)) return 0;
  return isTestingTerm(term) ? (term.potential_clients ?? []).length : (term.predavanja ?? []).length;
}

/** Pomak boje za svaki termin u slotu: drugi termin nastavlja boje tamo gde je prvi stao. */
function childRowOffsets(terms: AdminTerm[]): number[] {
  let acc = 0;
  return terms.map((t) => {
    const start = acc;
    acc += childRowCount(t);
    return start;
  });
}

/** Vizuelni sadržaj termin-kartice (instruktor/vrsta + deca u redovima naizmeničnih boja) – bez
 * klika/href-a, da se može koristiti i u modovima (blokiranje, više časova) i u normalnom prikazu.
 * rowOffset = koliko je dece već prikazano iznad u istom slotu (da boje idu redom kroz ceo slot). */
function TermCardVisual({ term, rowOffset = 0 }: { term: AdminTerm; rowOffset?: number }) {
  if (isAutoSpillover(term)) {
    const instructorName = term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—';
    return (
      <div className="rounded-lg border-2 border-dashed border-stone-300 p-2 text-xs text-stone-500 bg-stone-50">
        <span className="font-medium">↳ Nastavak dužeg časa</span>
        <span className="block text-[11px] mt-0.5">{instructorName}</span>
      </div>
    );
  }
  const instructorColor = term.instructor?.color ?? DEFAULT_COLOR;
  const predavanja = term.predavanja ?? [];
  const instructorName = term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—';
  const classroomName = term.classroom?.naziv ?? null;
  const isTesting = isTestingTerm(term);
  const potentialClients = term.potential_clients ?? [];
  const tt = predavanja[0]?.term_type;
  const vrsta = Array.isArray(tt) ? tt[0]?.naziv : tt?.naziv;
  const rowStyle = (i: number) => {
    const c = CHILD_ROW_COLORS[(rowOffset + i) % CHILD_ROW_COLORS.length];
    return { backgroundColor: c.bg, borderLeft: `4px solid ${c.bar}` };
  };

  const anyUnpaid = !isTesting && predavanja.some((p) => isUnpaid(p.redni));

  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden text-sm ${anyUnpaid ? 'border-red-500 ring-1 ring-red-500' : 'border-stone-200'}`}
      title={`${instructorName} · ${classroomName ? `učionica ${classroomName}` : 'bez učionice'}`}
    >
      <div className="flex items-baseline justify-between gap-1 px-2 py-0.5 text-[11px] leading-tight">
        <span className="font-semibold truncate" style={{ color: instructorColor }}>
          <span className="lg:hidden">
            {term.instructor ? shortInstructorLabel(term.instructor.ime, term.instructor.prezime) : '—'}
          </span>
          <span className="hidden lg:inline">{instructorName}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-1">
          {isTesting ? (
            <span className="shrink-0 font-bold uppercase tracking-wide text-red-600">Testiranje</span>
          ) : (
            vrsta && <span className="truncate text-stone-500">{vrsta}</span>
          )}
          {classroomName && (
            <span className="shrink-0 rounded bg-stone-100 px-1 font-medium text-stone-600">
              <span className="lg:hidden">{shortClassroomLabel(classroomName)}</span>
              <span className="hidden lg:inline">{classroomName}</span>
            </span>
          )}
        </span>
      </div>
      {isTesting ? (
        potentialClients.length === 0 ? (
          <span className="block px-2 pb-1 text-xs text-stone-400">Nema prijavljenih</span>
        ) : (
          <ul className="pl-0 list-none">
            <TruncatedNameList
              itemClassName=""
              items={sortByFullName(potentialClients, (pc) => `${pc.ime ?? ''} ${pc.prezime ?? ''}`.trim()).map((pc, i) => ({
                key: pc.id,
                content: (
                  <div style={rowStyle(i)} className="px-2 py-1 text-[12px] leading-snug text-stone-900">
                    <span className="font-semibold">{pc.ime}{pc.prezime ? ` ${pc.prezime}` : ''}</span>
                    {pc.ime_roditelja && <span className="block text-stone-600">rod: {pc.ime_roditelja}</span>}
                    {pc.mobilni_roditelja && <span className="block text-stone-600">{pc.mobilni_roditelja}</span>}
                  </div>
                ),
              }))}
            />
          </ul>
        )
      ) : predavanja.length > 0 ? (
        <ul className="pl-0 list-none">
          <TruncatedNameList
            itemClassName=""
            items={sortByFullName(predavanja, (p) => (p.client ? `${p.client.ime ?? ''} ${p.client.prezime ?? ''}`.trim() : '')).map((p, i) => ({
              key: p.id,
              content: (
                <div
                  style={isUnpaid(p.redni) ? UNPAID_ROW_STYLE : rowStyle(i)}
                  title={redniTitle(p.redni)}
                  className="flex flex-wrap items-baseline gap-x-1 px-2 py-1 text-[13px] sm:text-sm leading-snug font-semibold text-stone-900 antialiased"
                >
                  <span className="min-w-0 break-words">
                    {p.client ? `${p.client.ime ?? ''} ${p.client.prezime ?? ''}`.trim() || '—' : '—'}
                  </span>
                  {p.redni && <RedniBroj redni={p.redni} />}
                </div>
              ),
            }))}
          />
        </ul>
      ) : (
        <span className="block px-2 pb-1 text-xs text-stone-500">+ radionica</span>
      )}
    </div>
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
  const blocked = swap.getBlocked(emptyDate, emptySlot);
  const canAddParallelTerm = slotCount < maxTerminaPoSlotu && !blocked;

  const BlockedBadge = blocked ? (
    <div className="rounded-lg border-2 border-stone-400 bg-[repeating-linear-gradient(45deg,#e7e5e4,#e7e5e4_6px,#f5f5f4_6px,#f5f5f4_12px)] p-2 text-xs text-stone-700">
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold">⛔ Blokirano</span>
        {!swap.blockMode && (
          <button
            type="button"
            title="Odblokiraj termin"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              swap.onUnblock(blocked.id);
            }}
            className="shrink-0 rounded px-1 text-[11px] font-medium text-stone-500 underline decoration-dotted hover:text-red-700"
          >
            Odblokiraj
          </button>
        )}
      </div>
      {blocked.napomena && <span className="block mt-0.5 break-words">{blocked.napomena}</span>}
      {slotCount > 0 && <span className="block mt-1 font-medium text-red-700">Zakazano ovde – treba premestiti</span>}
    </div>
  ) : null;

  const rowOffsets = childRowOffsets(termsInSlot);

  if (swap.bulkMode && blocked) {
    return (
      <div className="space-y-1.5 min-h-[52px] cursor-not-allowed">
        {BlockedBadge}
        {termsInSlot.map((term, ti) => <TermCardVisual key={term.id} term={term} rowOffset={rowOffsets[ti]} />)}
      </div>
    );
  }

  if (swap.bulkMode) {
    const bulkSelected = swap.isBulkSelected(emptyDate, emptySlot);
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => swap.onToggleBulkSlot(emptyDate, emptySlot)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            swap.onToggleBulkSlot(emptyDate, emptySlot);
          }
        }}
        className={`w-full min-h-[52px] rounded-lg border-2 p-2 text-left text-xs transition-colors cursor-pointer space-y-1.5 ${
          bulkSelected
            ? 'border-emerald-600 bg-emerald-50 ring-2 ring-offset-1 ring-emerald-500'
            : 'border-dashed border-stone-200 hover:border-emerald-400 hover:bg-emerald-50/50'
        }`}
      >
        {slotCount === 0 ? (
          <span className="block text-stone-400">prazno</span>
        ) : (
          termsInSlot.map((term, ti) => <TermCardVisual key={term.id} term={term} rowOffset={rowOffsets[ti]} />)
        )}
        {bulkSelected && <span className="block font-semibold text-emerald-700 mt-0.5">✓ izabrano</span>}
      </div>
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
        const zahtevUnpaid = isUnpaid(z.redni);
        return (
          <div
            key={z.id}
            role={zahtevClickable ? 'button' : undefined}
            onClick={() => {
              if (swap.deleteMode) swap.onToggleZahtevDeleteSelect(z.id);
              else if (zahtevAssignClickable) swap.onToggleAssignZahtevSelect(z.id);
            }}
            data-zahtev-date={z.date}
            title={redniTitle(z.redni)}
            className={`rounded-lg border border-dashed p-1.5 text-xs text-amber-900${
              zahtevClickable ? ' cursor-pointer' : ''
            }${
              zahtevDeleteSelected
                ? ' border-red-600 ring-2 ring-offset-1 ring-red-500 bg-red-50'
                : zahtevAssignSelected
                ? ' border-blue-600 ring-2 ring-offset-1 ring-blue-500 bg-blue-50'
                : zahtevUnpaid
                ? ' border-red-600 bg-red-200'
                : ' border-amber-500 bg-amber-100'
            }`}
          >
            <span className="flex flex-wrap items-baseline gap-x-1 font-medium text-amber-950">
              <span className="min-w-0 break-words">
                {z.client_ime}{z.client_prezime ? ` ${z.client_prezime}` : ''}
              </span>
              {z.redni && <RedniBroj redni={z.redni} />}
            </span>
            {z.term_type_naziv && <span className="block text-[11px]">{z.term_type_naziv}</span>}
            {z.classroom_naziv && <span className="block text-[11px]">🏫 {z.classroom_naziv}</span>}
            <span className="text-[10px] uppercase tracking-wide">zahtev · čeka predavača</span>
          </div>
        );
      })}
    </div>
  ) : null;

  if (swap.blockMode) {
    const blockSelected = swap.isBlockSelected(emptyDate, emptySlot);
    // Termini iz slota se mogu i u ovom modu otvoriti (klik) ili prevući u drugi, neblokirani slot –
    // da se ono što smeta blokiranju odmah premesti bez izlaska iz moda.
    const canDropHere = !blocked && slotCount < maxTerminaPoSlotu;
    const isEmpty = slotCount === 0 && pendingZahteviInSlot.length === 0;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => swap.onToggleBlockSlot(emptyDate, emptySlot)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            swap.onToggleBlockSlot(emptyDate, emptySlot);
          }
        }}
        onDragOver={(e) => {
          if (draggedTermId && canDropHere) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedTermId && canDropHere) onDropCell(emptyDate, emptySlot);
        }}
        className={`w-full min-h-[52px] rounded-lg border-2 p-2 text-left text-xs transition-colors cursor-pointer space-y-1.5 ${
          blockSelected
            ? 'border-stone-800 bg-stone-100 ring-2 ring-offset-1 ring-stone-700'
            : 'border-dashed border-stone-200 hover:border-stone-500 hover:bg-stone-50'
        }`}
      >
        {BlockedBadge}
        {termsInSlot.map((term, ti) =>
          isAutoSpillover(term) ? (
            <TermCardVisual key={term.id} term={term} />
          ) : (
            <Link
              key={term.id}
              href={`/admin/termin/${term.id}`}
              title="Otvori termin (izmena) – ili ga prevuci u drugi termin"
              className="block rounded-lg hover:opacity-90"
              draggable
              onClick={(e) => e.stopPropagation()}
              onDragStart={() => setDraggedTermId(term.id)}
              onDragEnd={() => setDraggedTermId(null)}
            >
              <TermCardVisual term={term} rowOffset={rowOffsets[ti]} />
            </Link>
          )
        )}
        {PendingZahteviEntries}
        {isEmpty && !blocked && <span className="block text-stone-400">prazno</span>}
        {blockSelected && <span className="block font-semibold text-stone-800 mt-0.5">⛔ izabrano za blokiranje</span>}
      </div>
    );
  }

  if (termsInSlot.length === 0 && blocked) {
    return (
      <div className="space-y-1 min-h-[52px]">
        {BlockedBadge}
        {PendingZahteviEntries}
        {CancelledEntries}
      </div>
    );
  }

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
      {BlockedBadge}
      {termsInSlot.map((term, ti) => {
        if (isAutoSpillover(term)) {
          return (
            <Link key={term.id} href={`/admin/termin/${term.nastavak_of_term_id}`} className="block rounded-lg hover:opacity-90">
              <TermCardVisual term={term} />
            </Link>
          );
        }
        const swapSelected = swap.isSelected(term.id);
        const copySelected = swap.copySourceId === term.id;
        const deleteSelected = swap.isMarkedForDelete(term.id);
        const assignSelected = swap.isMarkedForAssign(term.id);
        const anyModeActive = swap.swapMode || swap.copyMode || swap.deleteMode || swap.assignMode;

        return (
          <Link
            key={term.id}
            href={`/admin/termin/${term.id}`}
            className={`block rounded-lg transition-opacity hover:opacity-90${
              swapSelected || copySelected ? ' ring-2 ring-offset-1 ring-amber-500' : ''
            }${deleteSelected ? ' ring-2 ring-offset-1 ring-red-600' : ''}${
              assignSelected ? ' ring-2 ring-offset-1 ring-blue-600' : ''
            }`}
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
            <TermCardVisual term={term} rowOffset={rowOffsets[ti]} />
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
      ) : blocked ? null : (
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
  draggedTermId,
  setDraggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  startOfWeek: string;
  terms: AdminTerm[];
  otkazaniTermini: OtkazaniTerminCalendar[];
  pendingZahtevi: PendingZahtevCalendar[];
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
  maxTerminaPoSlotu: number;
}) {
  // Na računaru (>= 1024px) red sa danima i datumima ostaje zamrznut ispod trake alata dok se skroluje
  const desktopTabelaRef = useStickyThead();
  const gridRef = useRef<HTMLDivElement>(null);
  const week1Dates = getWeekDates(startOfWeek);
  const week2Start = (() => {
    const d = new Date(startOfWeek + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const week2Dates = getWeekDates(week2Start);
  const allDates = [...week1Dates, ...week2Dates];

  // Deljeno telo tabele (redovi po vremenu) – zove se i za 14 dana (desktop, obe nedelje) i za 7
  // (tablet, samo ova nedelja) sa istim AdminCellContent po ćeliji.
  const renderBody = (dates: string[]) => (
    <tbody>
      {TIME_SLOTS.map((time, slotIndex) => (
        <tr key={slotIndex} data-row={slotIndex} className="border-b border-stone-100">
          <td data-slot-label={slotIndex} className="sticky left-0 z-10 bg-white p-2 text-stone-500 font-medium w-16">{time}</td>
          {dates.map((date, idx) => {
            const termsInSlot = termsByKey(terms, date, slotIndex);
            const otkazaniInSlot = otkazaniTermini.filter((ot) => ot.term_date === date && ot.slot_index === slotIndex);
            const pendingZahteviInSlot = pendingZahtevi.filter((z) => z.date === date && z.slot_index === slotIndex);
            return (
              <td key={date} data-date={date} data-slot={slotIndex} className={`p-1 align-top${idx === 7 ? ' border-l-2 border-stone-300' : ''}`}>
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
      <div ref={gridRef} data-hover-grid="" className="space-y-4">
      <GridHoverHighlight containerRef={gridRef} />
      {/* Desktop (lg+): obe nedelje, netaknuto. */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table ref={desktopTabelaRef} className="w-full min-w-[1400px] text-sm">
          {/* relative + z-20 + neprovidna pozadina: zamrznuto zaglavlje (useStickyThead) prekriva termine ispod sebe */}
          <thead className="relative z-20 bg-white shadow-[0_1px_0_0_#e7e5e4]">
            <tr className="border-b border-stone-100 bg-stone-50">
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
                    data-date={date}
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
                  <th key={date} data-date={date} className="sticky top-0 z-20 bg-stone-50 p-2 text-center text-stone-600 font-medium min-w-[90px]">
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
    </div>
  );
}

/**
 * Prelazak mišem preko ćelije kalendara boji ceo red (vreme) i celu kolonu (dan) + uokviruje samu ćeliju.
 * Sopstveno stanje i <style> umesto stanja u AdminWeekView – pomeranje miša tako ne iscrtava ponovo
 * celu tabelu sa svim terminima, menja se samo ovaj mali <style>.
 */
function GridHoverHighlight({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [hover, setHover] = useState<{ date: string; slot: string } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onOver = (e: MouseEvent) => {
      const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-date]');
      if (!td) return;
      const date = td.dataset.date ?? '';
      const slot = td.dataset.slot ?? '';
      setHover((h) => (h && h.date === date && h.slot === slot ? h : { date, slot }));
    };
    const onLeave = () => setHover(null);
    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [containerRef]);
  if (!hover) return null;
  const g = '[data-hover-grid]';
  const { date, slot } = hover;
  return (
    // Jaka ljubičasta – nema je među bojama redova dece (žuta, plava, zelena, roze, tirkizna, narandžasta).
    <style>{`
      ${g} td[data-date="${date}"], ${g} tr[data-row="${slot}"] > td { background-color: rgb(147 51 234 / 0.22); }
      ${g} th[data-date="${date}"], ${g} th[data-date="${date}"] * { background-color: #6b21a8; color: #ffffff; }
      ${g} td[data-slot-label="${slot}"] { background-color: #6b21a8; color: #ffffff; font-weight: 700; }
      ${g} td[data-date="${date}"][data-slot="${slot}"] { box-shadow: inset 0 0 0 3px #7e22ce; }
    `}</style>
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
  const weekStart = getMonday(date);
  const weekDates = getWeekDates(weekStart);

  return (
    <div className="space-y-4">
      {/* Desktop/tablet (md+): datum i strelice su u zamrznutoj traci alata (PeriodNav). */}
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

/** Mesečni prikaz bez filtera po detetu: koliko termina se ispisuje po danu (ostalo je "+N još"). */
const MONTH_DAY_MAX = 4;

function shortPersonName(ime?: string | null, prezime?: string | null): string {
  return `${ime ?? ''}${prezime ? ` ${prezime[0]}.` : ''}`.trim();
}

type MonthEntry = {
  key: string;
  slot: number;
  href: string;
  text: string;
  title: string;
  color: string;
  zahtev: boolean;
  /** Bar jedno dete u terminu ima čas koji nije plaćen (x > y). */
  unpaid: boolean;
};

function AdminMonthView({
  monthStart,
  terms,
  pendingZahtevi,
  showAll,
  linkSuffix,
  base,
}: {
  monthStart: string;
  terms: AdminTerm[];
  pendingZahtevi: PendingZahtevCalendar[];
  /** Filter po detetu: ispisuju se svi termini dana i umesto imena deteta piše instruktor + vrsta časa. */
  showAll: boolean;
  linkSuffix: string;
  base: string;
}) {
  const first = new Date(monthStart + 'T12:00:00');
  const year = first.getFullYear();
  const month = first.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const startOffset = startDow === 0 ? 6 : startDow - 1;

  const days: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const entriesByDate = new Map<string, MonthEntry[]>();
  const push = (date: string, e: MonthEntry) => {
    const list = entriesByDate.get(date);
    if (list) list.push(e);
    else entriesByDate.set(date, [e]);
  };
  for (const t of terms) {
    if (isAutoSpillover(t)) continue;
    const time = TIME_SLOTS[t.slot_index] ?? '';
    const testing = isTestingTerm(t);
    const people = testing
      ? (t.potential_clients ?? []).map((pc) => ({ ime: pc.ime, prezime: pc.prezime }))
      : (t.predavanja ?? []).map((p) => ({ ime: p.client?.ime, prezime: p.client?.prezime }));
    const tt = t.predavanja?.[0]?.term_type;
    const vrsta = testing ? 'Testiranje' : ((Array.isArray(tt) ? tt[0]?.naziv : tt?.naziv) ?? null);
    const instr = t.instructor ? `${t.instructor.ime} ${t.instructor.prezime}` : 'bez instruktora';
    const text = showAll
      ? [t.instructor?.ime ?? 'bez instr.', vrsta].filter(Boolean).join(' · ')
      : people.map((x) => shortPersonName(x.ime, x.prezime)).join(', ') || (vrsta ?? 'termin');
    push(t.date, {
      key: t.id,
      slot: t.slot_index,
      href: `/admin/termin/${t.id}`,
      text,
      title: [
        (t.predavanja ?? []).some((p) => isUnpaid(p.redni)) && !testing ? 'NIJE PLAĆENO' : null,
        time,
        people.map((x) => `${x.ime ?? ''} ${x.prezime ?? ''}`.trim()).join(', '),
        instr,
        t.classroom?.naziv,
        vrsta,
      ]
        .filter(Boolean)
        .join(' · '),
      color: t.instructor?.color ?? '#a8a29e',
      zahtev: false,
      unpaid: !testing && (t.predavanja ?? []).some((p) => isUnpaid(p.redni)),
    });
  }
  for (const z of pendingZahtevi) {
    const time = TIME_SLOTS[z.slot_index] ?? '';
    push(z.date, {
      key: `z-${z.id}`,
      slot: z.slot_index,
      href: `${base}?view=nedelja&week=${getMonday(z.date)}&fokus=${z.date}${linkSuffix}`,
      text: showAll ? ['bez instruktora', z.term_type_naziv].filter(Boolean).join(' · ') : shortPersonName(z.client_ime, z.client_prezime),
      title: [time, `${z.client_ime} ${z.client_prezime ?? ''}`.trim(), 'bez instruktora – čeka preuzimanje', z.classroom_naziv, z.term_type_naziv]
        .filter(Boolean)
        .join(' · '),
      color: '#f59e0b',
      zahtev: true,
      unpaid: isUnpaid(z.redni),
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
          {DAY_NAMES.map((d) => (
            <div key={d} className="p-2 text-center text-sm font-medium text-stone-600">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date, i) => {
            if (!date) {
              return <div key={`e-${i}`} className="min-h-[96px] border-b border-r border-stone-100 bg-stone-50/50" />;
            }
            const entries = (entriesByDate.get(date) ?? []).sort((a, b) => a.slot - b.slot);
            const shown = showAll ? entries : entries.slice(0, MONTH_DAY_MAX);
            const dayHref = `${base}?view=dan&day=${date}${linkSuffix}`;
            return (
              <div key={date} className="min-h-[96px] min-w-0 border-b border-r border-stone-100 p-1 flex flex-col gap-0.5">
                <Link href={dayHref} className="self-start rounded px-1 text-xs text-stone-500 hover:bg-amber-50 hover:text-amber-800">
                  {new Date(date + 'T12:00:00').getDate()}.
                </Link>
                {shown.map((e) => (
                  <Link
                    key={e.key}
                    href={e.href}
                    title={e.title}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight text-stone-800 hover:brightness-95 ${
                      e.zahtev
                        ? e.unpaid
                          ? 'border border-dashed border-red-500 bg-red-100 text-red-900'
                          : 'border border-dashed border-amber-400 bg-amber-50'
                        : e.unpaid
                          ? 'bg-red-100 text-red-900'
                          : 'bg-stone-50'
                    }`}
                    style={e.zahtev ? undefined : { borderLeft: `3px solid ${e.unpaid ? '#dc2626' : e.color}` }}
                  >
                    {e.unpaid && <span className="mr-0.5 font-bold text-red-700">!</span>}
                    <span className="font-semibold tabular-nums">{TIME_SLOTS[e.slot]}</span> {e.text}
                  </Link>
                ))}
                {entries.length > shown.length && (
                  <Link href={dayHref} className="px-1 text-[11px] font-medium text-amber-700 hover:underline">
                    +{entries.length - shown.length} još →
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
