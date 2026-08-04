'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_SLOTS, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { moveTermAsInstructor } from '@/app/dashboard/termin/actions';

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

export type RawTerm = {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
  classroom?: { id: string; naziv: string; color?: string } | null;
  term_category?: { id: string; naziv: string; is_testing: boolean } | null;
  predavanja?: Array<{
    id: string;
    term_id: string;
    client_id: string;
    odrzano: boolean;
    placeno: boolean;
    komentar: string | null;
    client?: { id: string; ime: string; prezime: string } | null;
    term_type?: { naziv: string } | { naziv: string }[] | null;
  }>;
  potential_clients?: Array<{
    id: string;
    ime: string;
    prezime?: string | null;
    ime_roditelja?: string | null;
    mobilni_roditelja?: string | null;
    status: string;
  }>;
  /** Napomena termina – koristi se i za prepoznavanje automatski kreiranog "dvočas" bloka. */
  napomena?: string | null;
  /** Ako je setovan, ovo je nastavak (ručni ili automatski blok) roditeljskog termina. */
  nastavak_of_term_id?: string | null;
};

/** Automatski kreiran "blokirajući" termin za dvočas – prazan, samo zauzima sledeći slot. */
function isAutoSpillover(term: RawTerm): boolean {
  return !!term.nastavak_of_term_id && term.napomena === AUTO_SPILLOVER_NAPOMENA && (term.predavanja ?? []).length === 0;
}

/** Tuđi termin (samo prikaz, bez linka) – boja instruktora i učionice za color coding */
export type OtherTerm = RawTerm & {
  instructor?: { ime: string; prezime: string; color?: string } | null;
  classroom?: { id: string; naziv: string; color?: string } | null;
};

function getWeekDates(start: string) {
  const dates: string[] = [];
  const d = new Date(start + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    dates.push(x.toISOString().slice(0, 10));
  }
  return dates;
}

function formatWeekLabel(start: string) {
  const d = new Date(start + 'T12:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.getDate()}.${d.getMonth() + 1}. – ${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
}

function termByKey(terms: RawTerm[], date: string, slot: number) {
  return terms.find((t) => t.date === date && t.slot_index === slot);
}

/** Isti redosled učionica u svakom slotu (npr. uvek 1-Buzan pa 2-Sperry) – bez učionice na kraju. */
function sortByClassroom(terms: OtherTerm[]): OtherTerm[] {
  return [...terms].sort((a, b) => {
    const an = a.classroom?.naziv;
    const bn = b.classroom?.naziv;
    if (!an && !bn) return 0;
    if (!an) return 1;
    if (!bn) return -1;
    return an.localeCompare(bn, 'sr-Latn-RS');
  });
}

function otherTermsByKey(terms: OtherTerm[], date: string, slot: number): OtherTerm[] {
  return sortByClassroom(terms.filter((t) => t.date === date && t.slot_index === slot));
}

function hexWithAlpha(hex: string, alpha: number) {
  const n = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${n}`;
}

/** Ponedeljak nedelje kojoj pripada dati datum. */
function getMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Skraćeno ime instruktora (inicijali) za tablet/telefon kartice. */
function shortInstructorLabel(ime: string, prezime: string): string {
  const a = (ime ?? '').trim().charAt(0).toUpperCase();
  const b = (prezime ?? '').trim().charAt(0).toUpperCase();
  return `${a}${b}` || '—';
}

/** Skraćeno ime učionice (npr. "1-Buzan" → "1") za tablet/telefon. */
function shortClassroomLabel(naziv: string): string {
  const idx = naziv.indexOf('-');
  return idx > 0 ? naziv.slice(0, idx) : naziv;
}

export default function CalendarView({
  view,
  terms,
  instructorId,
  instructorColor,
  startOfWeek,
  singleDay,
  monthStart,
  clientFilterId,
  otherTerms = [],
}: {
  view: string;
  terms: RawTerm[];
  instructorId: string;
  instructorColor: string;
  startOfWeek: string;
  singleDay?: string;
  monthStart?: string;
  clientFilterId?: string | null;
  /** Tuđi termini (drugi instruktori) – samo prikaz, bez linka */
  otherTerms?: OtherTerm[];
}) {
  const router = useRouter();
  const [draggedTermId, setDraggedTermId] = useState<string | null>(null);

  const handleDrop = async (date: string, slot: number) => {
    if (!draggedTermId) return;
    const ok = window.confirm('Da li ste sigurni da želite da premestite ovaj termin na novi datum/vreme?');
    if (!ok) {
      setDraggedTermId(null);
      return;
    }
    const res = await moveTermAsInstructor(draggedTermId, date, slot);
    setDraggedTermId(null);
    if (res.error) {
      toast.error(res.error);
    } else {
      router.refresh();
    }
  };

  const linkSuffix = clientFilterId ? `&client=${clientFilterId}` : '';
  if (view === 'dan' && singleDay) {
    return (
      <CalendarDay
        date={singleDay}
        terms={terms}
        otherTerms={otherTerms}
        instructorId={instructorId}
        instructorColor={instructorColor}
        linkSuffix={linkSuffix}
        draggedTermId={draggedTermId}
        onDropCell={handleDrop}
      />
    );
  }
  if (view === 'mesec' && monthStart) {
    return (
      <CalendarMonth
        monthStart={monthStart}
        terms={terms}
        otherTerms={otherTerms}
        instructorId={instructorId}
        instructorColor={instructorColor}
        linkSuffix={linkSuffix}
      />
    );
  }
  return (
    <CalendarWeek
      startOfWeek={startOfWeek}
      terms={terms}
      otherTerms={otherTerms}
      instructorId={instructorId}
      instructorColor={instructorColor}
      linkSuffix={linkSuffix}
      draggedTermId={draggedTermId}
      setDraggedTermId={setDraggedTermId}
      onDropCell={handleDrop}
    />
  );
}

function CellContent({
  term,
  otherTermsInSlot,
  instructorId,
  instructorColor,
  emptyDate,
  emptySlot,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
}: {
  term: RawTerm | undefined;
  otherTermsInSlot: OtherTerm[];
  instructorId: string;
  instructorColor: string;
  emptyDate: string;
  emptySlot: number;
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
}) {
  const borderColor = term?.classroom?.color ?? instructorColor;
  const textColor = instructorColor;
  const bgLight = hexWithAlpha(term?.classroom?.color ?? instructorColor, 0.08);
  if (!term) {
    return (
      <div className="space-y-1.5 min-h-[52px]">
        <Link
          href={`/dashboard/termin/novi?date=${emptyDate}&slot=${emptySlot}`}
          className="block rounded-lg border border-dashed border-stone-200 p-2 text-stone-400 hover:border-stone-400 hover:bg-stone-50/50"
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
        {otherTermsInSlot.map((ot) => {
          if (isAutoSpillover(ot)) {
            return (
              <div key={ot.id} className="rounded-lg border-2 border-dashed p-2 text-xs text-stone-400 bg-stone-50">
                <span className="font-medium">↳ Nastavak dužeg časa</span>
                {ot.classroom && <span className="block text-[11px] mt-0.5">{ot.classroom.naziv}</span>}
              </div>
            );
          }
          const iname = ot.instructor ? `${ot.instructor.ime} ${ot.instructor.prezime}` : '—';
          const preds = ot.predavanja ?? [];
          const otBorder = ot.classroom?.color ?? '#e5e7eb';
          const otTextColor = ot.instructor?.color ?? '#475569';
          const otBg = ot.classroom?.color ? hexWithAlpha(ot.classroom.color, 0.08) : 'rgba(0,0,0,0.03)';
          return (
            <div
              key={ot.id}
              className="rounded-lg border-2 p-2 text-xs"
              style={{ borderColor: otBorder, backgroundColor: otBg, color: otTextColor }}
            >
              {ot.classroom && (
                <span className="block text-stone-500 font-medium">{ot.classroom.naziv}</span>
              )}
              <span className="font-medium">{iname}</span>
              {preds.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-0 list-none">
                  {preds.map((p) => (
                    <li
                      key={p.id}
                      className="text-[13px] leading-snug text-stone-900 font-medium break-words antialiased"
                    >
                      {p.client ? `${p.client.ime} ${p.client.prezime}`.trim() || '—' : '—'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (isAutoSpillover(term)) {
    return (
      <div className="space-y-1.5 min-h-[52px]">
        <Link
          href={`/dashboard/termin/${term.nastavak_of_term_id}`}
          className="block rounded-lg border-2 border-dashed p-2 text-xs text-stone-500 bg-stone-50 hover:bg-stone-100"
          style={{ borderColor: term.classroom?.color ?? '#94a3b8' }}
        >
          <span className="font-medium">↳ Nastavak dužeg časa</span>
          {term.classroom && <span className="block text-[11px] mt-0.5">{term.classroom.naziv}</span>}
        </Link>
      </div>
    );
  }
  const tcRaw = term?.term_category;
  const isTesting = Array.isArray(tcRaw) ? (tcRaw as {is_testing: boolean}[])[0]?.is_testing === true : tcRaw?.is_testing === true;
  const potentialClients = term?.potential_clients ?? [];

  return (
    <div className="space-y-1.5 min-h-[52px]">
      {term && (
        <Link
          href={`/dashboard/termin/${term.id}`}
          className="block rounded-lg border-2 p-2 transition-opacity hover:opacity-90"
          style={{ borderColor, backgroundColor: bgLight }}
          draggable
          onDragStart={() => setDraggedTermId(term.id)}
          onDragEnd={() => setDraggedTermId(null)}
        >
          {term.classroom && (
            <span className="text-xs block mb-0.5 text-stone-500">
              <span className="lg:hidden">{shortClassroomLabel(term.classroom.naziv)}</span>
              <span className="hidden lg:inline">{term.classroom.naziv}</span>
            </span>
          )}
          {isTesting ? (
            <div>
              <span className="text-xs block mb-1 font-bold uppercase tracking-wide" style={{ color: textColor }}>
                Testiranje
              </span>
              {potentialClients.length === 0 ? (
                <span className="text-xs text-stone-400">Nema prijavljenih</span>
              ) : (
                <div className="space-y-1">
                  {potentialClients.map((pc) => (
                    <div key={pc.id} className="rounded-md bg-white/40 px-1 py-0.5">
                      <span className="block text-[13px] font-semibold leading-snug text-stone-900" style={{ borderLeft: `3px solid ${textColor}`, paddingLeft: '6px' }}>
                        {pc.ime}{pc.prezime ? ` ${pc.prezime}` : ''}
                      </span>
                      {pc.ime_roditelja && (
                        <span className="block text-xs text-stone-500 pl-2">rod: {pc.ime_roditelja}</span>
                      )}
                      {pc.mobilni_roditelja && (
                        <span className="block text-xs text-stone-500 pl-2">{pc.mobilni_roditelja}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {(() => {
                const tt = term.predavanja?.[0]?.term_type;
                const naziv = Array.isArray(tt) ? tt[0]?.naziv : tt?.naziv;
                return naziv ? <span className="text-xs block mb-1 font-semibold" style={{ color: textColor }}>{naziv}</span> : null;
              })()}
              {(term.predavanja ?? []).length === 0 ? (
                <span className="text-sm" style={{ color: textColor }}>+ Dodaj radionicu</span>
              ) : (
                <div className="space-y-1.5">
                  {(term.predavanja ?? []).map((p) => (
                    <div key={p.id} className="rounded-md bg-white/40 px-1 py-0.5">
                      <span
                        className="block text-[13px] sm:text-sm font-semibold leading-snug text-stone-900 break-words antialiased"
                        style={{ borderLeft: `3px solid ${textColor}`, paddingLeft: '6px' }}
                      >
                        {p.client ? `${p.client.ime} ${p.client.prezime}`.trim() || '—' : '—'}
                      </span>
                      <div className="flex gap-1 mt-0.5 flex-wrap pl-2">
                        {p.odrzano && <span className="text-xs bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">Održano</span>}
                        {p.placeno && <span className="text-xs bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-medium">Plaćeno</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Link>
      )}
      {otherTermsInSlot.map((ot) => {
        const iname = ot.instructor ? `${ot.instructor.ime} ${ot.instructor.prezime}` : '—';
        const preds = ot.predavanja ?? [];
        const otBorder = ot.classroom?.color ?? '#e5e7eb';
        const otTextColor = ot.instructor?.color ?? '#475569';
        const otBg = ot.classroom?.color ? hexWithAlpha(ot.classroom.color, 0.08) : 'rgba(0,0,0,0.03)';
        return (
          <div
            key={ot.id}
            className="rounded-lg border-2 p-2 text-xs"
            style={{ borderColor: otBorder, backgroundColor: otBg, color: otTextColor }}
          >
            {ot.classroom && (
              <span className="block text-stone-500 font-medium">
                <span className="lg:hidden">{shortClassroomLabel(ot.classroom.naziv)}</span>
                <span className="hidden lg:inline">{ot.classroom.naziv}</span>
              </span>
            )}
            <span className="font-medium">
              <span className="lg:hidden">{ot.instructor ? shortInstructorLabel(ot.instructor.ime, ot.instructor.prezime) : '—'}</span>
              <span className="hidden lg:inline">{iname}</span>
            </span>
            {preds.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-0 list-none">
                {preds.map((p) => (
                  <li
                    key={p.id}
                    className="text-[13px] leading-snug text-stone-900 font-medium break-words antialiased"
                  >
                    {p.client ? `${p.client.ime} ${p.client.prezime}`.trim() || '—' : '—'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CalendarWeek({
  startOfWeek,
  terms,
  otherTerms,
  instructorId,
  instructorColor,
  linkSuffix,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
}: {
  startOfWeek: string;
  terms: RawTerm[];
  otherTerms: OtherTerm[];
  instructorId: string;
  instructorColor: string;
  linkSuffix: string;
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
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

  // Deljeno telo tabele – zove se i za 14 dana (desktop, obe nedelje) i za 7 (tablet, samo ova nedelja).
  const renderBody = (dates: string[]) => (
    <tbody>
      {TIME_SLOTS.map((time, slotIndex) => (
        <tr key={slotIndex} className="border-b border-stone-200 last:border-b-0">
          <td className="p-2 text-stone-600 font-semibold bg-stone-50/70 w-16">{time}</td>
          {dates.map((date, idx) => {
            const term = termByKey(terms, date, slotIndex);
            const otherTermsInSlot = otherTermsByKey(otherTerms, date, slotIndex);
            return (
              <td key={date} className={`p-1 align-top${idx === 7 ? ' border-l-2 border-stone-300' : ''}`}>
                <CellContent
                  term={term}
                  otherTermsInSlot={otherTermsInSlot}
                  instructorId={instructorId}
                  instructorColor={instructorColor}
                  emptyDate={date}
                  emptySlot={slotIndex}
                  draggedTermId={draggedTermId}
                  setDraggedTermId={setDraggedTermId}
                  onDropCell={onDropCell}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );

  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return allDates.includes(today) ? today : week1Dates[0];
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700">{rangeLabel}</span>
        <div className="flex gap-2">
          <Link
            href={`/dashboard?week=${prevWeek}${linkSuffix}`}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300"
          >
            ← Prethodna
          </Link>
          <Link
            href={`/dashboard?week=${nextWeek}${linkSuffix}`}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300"
          >
            Sledeća →
          </Link>
        </div>
      </div>

      {/* Desktop (lg+): obe nedelje, netaknuto. */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-stone-200 bg-white">
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
          {renderBody(allDates)}
        </table>
      </div>

      {/* Tablet (md do lg): samo ova nedelja, 7 kolona. */}
      <div className="hidden md:block lg:hidden overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/60">
              <th className="w-16 p-2" />
              {week1Dates.map((date) => {
                const d = new Date(date + 'T12:00:00');
                return (
                  <th key={date} className="p-2 text-center text-stone-600 font-medium">
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

      {/* Telefon (<md): traka dana + jedan dan ispod. */}
      <div className="md:hidden">
        <DateStrip dates={week1Dates} selectedDate={selectedDay} onSelect={setSelectedDay} />
        <DayAgenda
          date={selectedDay}
          terms={terms}
          otherTerms={otherTerms}
          instructorId={instructorId}
          instructorColor={instructorColor}
          draggedTermId={draggedTermId}
          setDraggedTermId={setDraggedTermId}
          onDropCell={onDropCell}
        />
      </div>
    </div>
  );
}

function CalendarDay({
  date,
  terms,
  otherTerms,
  instructorId,
  instructorColor,
  linkSuffix,
  draggedTermId,
  onDropCell,
}: {
  date: string;
  terms: RawTerm[];
  otherTerms: OtherTerm[];
  instructorId: string;
  instructorColor: string;
  linkSuffix: string;
  draggedTermId: string | null;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
}) {
  const d = new Date(date + 'T12:00:00');
  const label = d.toLocaleDateString('sr-Latn-RS', {
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
          <Link
            href={`/dashboard?view=dan&day=${prevDay}${linkSuffix}`}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300"
          >
            ← Prethodni
          </Link>
          <Link
            href={`/dashboard?view=dan&day=${nextDay}${linkSuffix}`}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300"
          >
            Sledeći →
          </Link>
        </div>
      </div>
      {/* Telefon (<md): traka dana cele nedelje – tap = prava navigacija (samo taj dan je učitan). */}
      <div className="md:hidden space-y-2">
        <span className="font-medium text-stone-700 capitalize text-sm">{label}</span>
        <DateStrip
          dates={weekDates}
          selectedDate={date}
          makeHref={(d) => `/dashboard?view=dan&day=${d}${linkSuffix}`}
        />
      </div>
      <DayAgenda
        date={date}
        terms={terms}
        otherTerms={otherTerms}
        instructorId={instructorId}
        instructorColor={instructorColor}
        draggedTermId={draggedTermId}
        setDraggedTermId={() => {}}
        onDropCell={onDropCell}
      />
    </div>
  );
}

function DayAgenda({
  date, terms, otherTerms, instructorId, instructorColor, draggedTermId, setDraggedTermId, onDropCell,
}: {
  date: string;
  terms: RawTerm[];
  otherTerms: OtherTerm[];
  instructorId: string;
  instructorColor: string;
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white divide-y-2 divide-stone-200">
      {TIME_SLOTS.map((time, slotIndex) => {
        const term = termByKey(terms, date, slotIndex);
        const otherTermsInSlot = otherTermsByKey(otherTerms, date, slotIndex);
        return (
          <div key={slotIndex} className="flex items-stretch gap-4 p-3">
            <div className="w-16 shrink-0 text-stone-500 font-medium">{time}</div>
            <div className="flex-1 min-w-0">
              <CellContent
                term={term}
                otherTermsInSlot={otherTermsInSlot}
                instructorId={instructorId}
                instructorColor={instructorColor}
                emptyDate={date}
                emptySlot={slotIndex}
                draggedTermId={draggedTermId}
                setDraggedTermId={setDraggedTermId}
                onDropCell={onDropCell}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DateStrip({
  dates, selectedDate, onSelect, makeHref,
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
          return <Link key={d} href={makeHref(d)} className={className}>{label}</Link>;
        }
        return <button key={d} type="button" onClick={() => onSelect?.(d)} className={className}>{label}</button>;
      })}
    </div>
  );
}

function CalendarMonth({
  monthStart,
  terms,
  otherTerms,
  instructorId,
  instructorColor,
  linkSuffix,
}: {
  monthStart: string;
  terms: RawTerm[];
  otherTerms: OtherTerm[];
  instructorId: string;
  instructorColor: string;
  linkSuffix: string;
}) {
  const first = new Date(monthStart + 'T12:00:00');
  const year = first.getFullYear();
  const month = first.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const startOffset = startDow === 0 ? 6 : startDow - 1; // ponedeljak = 0
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
  const monthLabel = first.toLocaleDateString('sr-Latn-RS', {
    month: 'long',
    year: 'numeric',
  });

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
          <Link
            href={`/dashboard?view=mesec&month=${prevMonth}${linkSuffix}`}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300"
          >
            ← Prethodni
          </Link>
          <Link
            href={`/dashboard?view=mesec&month=${nextMonth}${linkSuffix}`}
            className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-sm hover:bg-stone-300"
          >
            Sledeći →
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
          {DAY_NAMES.map((d) => (
            <div key={d} className="p-2 text-center text-sm font-medium text-stone-600">
              {d}
            </div>
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
              <div
                key={date}
                className="min-h-[80px] border-b border-r border-stone-100 p-1"
              >
                <div className="text-xs text-stone-400 mb-1">
                  {new Date(date + 'T12:00:00').getDate()}.
                </div>
                {slotCount > 0 ? (
                  <Link
                    href={`/dashboard?view=dan&day=${date}${linkSuffix}`}
                    className="text-xs hover:underline"
                    style={{ color: instructorColor }}
                  >
                    {slotCount} termin(a)
                  </Link>
                ) : (
                  <Link
                    href={`/dashboard?view=dan&day=${date}${linkSuffix}`}
                    className="text-xs text-stone-400 hover:opacity-70"
                  >
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
