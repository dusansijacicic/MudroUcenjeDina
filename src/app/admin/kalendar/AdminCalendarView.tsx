'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { TIME_SLOTS, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import Link from 'next/link';
import { moveTermAsAdmin, swapTermsAsAdmin } from '@/app/admin/actions';

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

/** Kontekst za "Swap" mod – prosleđen direktno od AdminCalendarView do AdminCellContent, bez
 * prljanja potpisa AdminWeekView/AdminDayView koji swap stanje ne koriste, samo ga prenose dalje. */
type SwapContextValue = {
  swapMode: boolean;
  isSelected: (termId: string) => 'first' | 'second' | null;
  onSelectTerm: (term: AdminTerm) => void;
};
const SwapContext = createContext<SwapContextValue>({
  swapMode: false,
  isSelected: () => null,
  onSelectTerm: () => {},
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

function swapTermLabel(term: AdminTerm): string {
  const d = new Date(term.date + 'T12:00:00');
  const dateLabel = `${d.getDate()}.${d.getMonth() + 1}.`;
  const time = TIME_SLOTS[term.slot_index] ?? `slot ${term.slot_index}`;
  const instructorName = term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—';
  const classroomName = term.classroom?.naziv ?? 'bez učionice';
  return `${dateLabel} ${time} · ${instructorName} · ${classroomName}`;
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

function termsByKey(terms: AdminTerm[], date: string, slot: number): AdminTerm[] {
  return terms.filter((t) => t.date === date && t.slot_index === slot);
}

const DEFAULT_COLOR = '#0d9488';

const DEFAULT_MAX_TERMINA_PO_SLOTU = 4;

export default function AdminCalendarView({
  terms: termsProp,
  otkazaniTermini = [],
  startOfWeek,
  singleDay,
  monthStart,
  view,
  maxTerminaPoSlotu = DEFAULT_MAX_TERMINA_PO_SLOTU,
}: {
  terms: AdminTerm[];
  otkazaniTermini?: OtkazaniTerminCalendar[];
  startOfWeek: string;
  singleDay?: string;
  monthStart?: string;
  view: string;
  /** Iz Admin → Podešavanja; koliko paralelnih termina u istom vremenu */
  maxTerminaPoSlotu?: number;
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

  const [swapMode, setSwapMode] = useState(false);
  const [swapFields, setSwapFields] = useState({ termin: false, instruktor: false, ucionica: false, klijent: false });
  const [swapFirst, setSwapFirst] = useState<{ termId: string; label: string } | null>(null);
  const [swapSecond, setSwapSecond] = useState<{ termId: string; label: string } | null>(null);

  const resetSwapSelection = () => {
    setSwapFirst(null);
    setSwapSecond(null);
  };

  const toggleSwapMode = () => {
    setSwapMode((v) => !v);
    resetSwapSelection();
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
    <SwapContext.Provider value={{ swapMode, isSelected, onSelectTerm }}>
      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={toggleSwapMode}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              swapMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {swapMode ? 'Swap: uključen' : 'Swap'}
          </button>
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
      </div>
      {body}
    </SwapContext.Provider>
  );
}

function AdminCellContent({
  termsInSlot,
  otkazaniInSlot,
  emptyDate,
  emptySlot,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  termsInSlot: AdminTerm[];
  otkazaniInSlot: OtkazaniTerminCalendar[];
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

  const CancelledEntries = otkazaniInSlot.length > 0 ? (
    <div className="mt-1 space-y-1">
      {otkazaniInSlot.map((ot) => (
        <div key={ot.id} className="rounded-lg border border-stone-200 bg-stone-50 p-1.5 text-xs text-stone-400 opacity-70">
          <span className="line-through block">
            {ot.client_ime}{ot.client_prezime ? ` ${ot.client_prezime}` : ''}
          </span>
          {ot.instructor_ime && (
            <span className="block text-[11px]">{ot.instructor_ime} {ot.instructor_prezime ?? ''}</span>
          )}
          <span className="text-[10px] uppercase tracking-wide">otkazano{ot.placeno ? ' · naplaćeno' : ''}</span>
        </div>
      ))}
    </div>
  ) : null;

  if (termsInSlot.length === 0) {
    return (
      <div className="space-y-1">
        <Link
          href={newTermHref}
          className="block rounded-lg border border-dashed border-stone-200 p-2 text-stone-400 hover:border-amber-400 hover:bg-amber-50/50 min-h-[52px]"
          onDragOver={(e) => {
            if (draggedTermId) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggedTermId) onDropCell(emptyDate, emptySlot);
          }}
        >
          +
        </Link>
        <Link
          href={newTestHref}
          className="block rounded-lg border border-dashed border-stone-200 p-1 text-[11px] text-center text-stone-400 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-800"
        >
          + Testiranje
        </Link>
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
        const classroomName = term.classroom?.naziv ?? 'Učionica';
        const tcRaw = term.term_category;
        const isTesting = Array.isArray(tcRaw) ? (tcRaw as {is_testing: boolean}[])[0]?.is_testing === true : tcRaw?.is_testing === true;
        const potentialClients = term.potential_clients ?? [];
        const swapSelected = swap.isSelected(term.id);

        return (
          <Link
            key={term.id}
            href={`/admin/termin/${term.id}`}
            className={`block rounded-lg border-2 p-2 text-sm transition-opacity hover:opacity-90${
              swapSelected ? ' ring-2 ring-offset-1 ring-amber-500' : ''
            }`}
            style={{ borderColor: classroomColor, backgroundColor: bg, color: instructorColor }}
            draggable={!swap.swapMode}
            onDragStart={() => !swap.swapMode && setDraggedTermId(term.id)}
            onDragEnd={() => setDraggedTermId(null)}
            onClick={(e) => {
              if (swap.swapMode) {
                e.preventDefault();
                swap.onSelectTerm(term);
              }
            }}
          >
            <span className="font-medium">{instructorName}</span>
            <span className="ml-1 text-[0.7rem] uppercase tracking-wide opacity-80">
              ({classroomName})
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
            className="block rounded-lg border border-dashed border-stone-200 p-1.5 text-stone-500 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-800 text-xs text-center"
          >
            + Dodaj još termin u ovom slotu ({slotCount}/{maxTerminaPoSlotu})
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
      {CancelledEntries}
    </div>
  );
}

function AdminWeekView({
  startOfWeek,
  terms,
  otkazaniTermini,
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
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1400px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/60">
              <th className="w-16 p-2" rowSpan={2} />
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
          <tbody>
            {TIME_SLOTS.map((time, slotIndex) => (
              <tr key={slotIndex} className="border-b border-stone-100">
                <td className="p-2 text-stone-500 font-medium w-16">{time}</td>
                {allDates.map((date, idx) => {
                  const termsInSlot = termsByKey(terms, date, slotIndex);
                  const otkazaniInSlot = otkazaniTermini.filter((ot) => ot.term_date === date && ot.slot_index === slotIndex);
                  return (
                    <td key={date} className={`p-1 align-top${idx === 7 ? ' border-l-2 border-stone-300' : ''}`}>
                      <AdminCellContent
                        termsInSlot={termsInSlot}
                        otkazaniInSlot={otkazaniInSlot}
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
        </table>
      </div>
    </div>
  );
}

function AdminDayView({
  date,
  terms,
  otkazaniTermini,
  linkSuffix,
  base,
  draggedTermId,
  onDropCell,
  maxTerminaPoSlotu,
}: {
  date: string;
  terms: AdminTerm[];
  otkazaniTermini: OtkazaniTerminCalendar[];
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {TIME_SLOTS.map((time, slotIndex) => {
          const termsInSlot = termsByKey(terms, date, slotIndex);
          const otkazaniInSlot = otkazaniTermini.filter((ot) => ot.term_date === date && ot.slot_index === slotIndex);
          return (
            <div key={slotIndex} className="flex items-stretch gap-4 p-3">
              <div className="w-16 shrink-0 text-stone-500 font-medium">{time}</div>
              <div className="flex-1 min-w-0">
                <AdminCellContent
                  termsInSlot={termsInSlot}
                  otkazaniInSlot={otkazaniInSlot}
                  emptyDate={date}
                  emptySlot={slotIndex}
                  draggedTermId={draggedTermId}
                  setDraggedTermId={() => {}}
                  onDropCell={onDropCell}
                  maxTerminaPoSlotu={maxTerminaPoSlotu}
                />
              </div>
            </div>
          );
        })}
      </div>
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
