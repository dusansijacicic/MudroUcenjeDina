'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_SLOTS } from '@/lib/constants';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { moveTermAsInstructor } from '@/app/dashboard/termin/actions';

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

export type RawTerm = {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
  predavanja?: Array<{
    id: string;
    term_id: string;
    client_id: string;
    odrzano: boolean;
    placeno: boolean;
    komentar: string | null;
    client?: { id: string; ime: string; prezime: string } | null;
  }>;
};

/** Tuđi termin (samo prikaz, bez linka) */
export type OtherTerm = RawTerm & { instructor?: { ime: string; prezime: string } | null };

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

function otherTermsByKey(terms: OtherTerm[], date: string, slot: number): OtherTerm[] {
  return terms.filter((t) => t.date === date && t.slot_index === slot);
}

function hexWithAlpha(hex: string, alpha: number) {
  const n = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${n}`;
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
  /** Tuđi termini (drugi predavači) – samo prikaz, bez linka */
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
  const bgLight = hexWithAlpha(instructorColor, 0.15);
  if (!term) {
    return (
      <Link
        href={`/dashboard/termin/novi?date=${emptyDate}&slot=${emptySlot}`}
        className="block rounded-lg border border-dashed border-stone-200 p-2 text-stone-400 hover:border-stone-400 hover:bg-stone-50/50 min-h-[52px]"
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
    );
  }
  return (
    <div className="space-y-1.5 min-h-[52px]">
      {term && (
        <Link
          href={`/dashboard/termin/${term.id}`}
          className="block rounded-lg border-2 p-2 transition-opacity hover:opacity-90"
          style={{ borderColor: instructorColor, backgroundColor: bgLight }}
          draggable
          onDragStart={() => setDraggedTermId(term.id)}
          onDragEnd={() => setDraggedTermId(null)}
        >
          {(term.predavanja ?? []).length === 0 ? (
            <span className="text-stone-500 text-sm">+ Dodaj predavanje</span>
          ) : (
            <>
              {(term.predavanja ?? []).map((p) => (
                <div key={p.id} className="text-sm">
                  <span className="font-medium text-stone-800">
                    {p.client ? `${p.client.ime} ${p.client.prezime}` : '—'}
                  </span>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {p.odrzano && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Održano</span>}
                    {p.placeno && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Plaćeno</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </Link>
      )}
      {otherTermsInSlot.map((ot) => {
        const iname = ot.instructor ? `${ot.instructor.ime} ${ot.instructor.prezime}` : '—';
        const preds = ot.predavanja ?? [];
        return (
          <div key={ot.id} className="rounded-lg border border-stone-200 bg-stone-50/80 p-2 text-stone-600 text-xs">
            <span className="font-medium">{iname}</span>
            {preds.length > 0 && (
              <span className="ml-1">
                {preds.map((p) => (p.client ? `${p.client.ime} ${p.client.prezime}` : '—')).join(', ')}
              </span>
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
  const dates = getWeekDates(startOfWeek);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700">
          {formatWeekLabel(startOfWeek)}
        </span>
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
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="w-16 p-2 text-left text-stone-500 font-medium">
                Termin
              </th>
              {dates.map((date) => {
                const d = new Date(date + 'T12:00:00');
                const dayNum = d.getDate();
                const month = d.getMonth() + 1;
                return (
                  <th
                    key={date}
                    className="p-2 text-center text-stone-600 font-medium min-w-[120px]"
                  >
                    <div>{DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                    <div className="text-stone-400">{dayNum}.{month}.</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((time, slotIndex) => (
              <tr
                key={slotIndex}
                className="border-b border-stone-200 last:border-b-0"
              >
                <td className="p-2 text-stone-600 font-semibold bg-stone-50/70">{time}</td>
                {dates.map((date) => {
                  const term = termByKey(terms, date, slotIndex);
                  const otherTermsInSlot = otherTermsByKey(otherTerms, date, slotIndex);
                  return (
                    <td key={date} className="p-1 align-top">
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
        </table>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
                  setDraggedTermId={() => {}}
                  onDropCell={onDropCell}
                />
              </div>
            </div>
          );
        })}
      </div>
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
