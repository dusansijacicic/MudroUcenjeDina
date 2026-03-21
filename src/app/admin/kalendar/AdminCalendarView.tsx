'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_SLOTS } from '@/lib/constants';
import Link from 'next/link';
import { moveTermAsAdmin } from '@/app/admin/actions';

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

export type AdminTerm = {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
  classroom?: { id: string; naziv: string; color?: string | null } | null;
  instructor?: { id: string; ime: string; prezime: string; color?: string | null } | null;
  predavanja?: Array<{
    id: string;
    client?: { id: string; ime: string; prezime: string } | null;
  }>;
};

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

export default function AdminCalendarView({
  terms,
  startOfWeek,
  singleDay,
  monthStart,
  view,
}: {
  terms: AdminTerm[];
  startOfWeek: string;
  singleDay?: string;
  monthStart?: string;
  view: string;
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
    const res = await moveTermAsAdmin(draggedTermId, date, slot);
    setDraggedTermId(null);
    if (!res.error) {
      router.refresh();
    }
  };
  const base = '/admin/kalendar';
  const linkSuffix = '';

  if (view === 'dan' && singleDay) {
    return (
      <AdminDayView
        date={singleDay}
        terms={terms}
        linkSuffix={linkSuffix}
        base={base}
        draggedTermId={draggedTermId}
        onDropCell={handleDrop}
      />
    );
  }
  if (view === 'mesec' && monthStart) {
    return (
      <AdminMonthView
        monthStart={monthStart}
        terms={terms}
        linkSuffix={linkSuffix}
        base={base}
      />
    );
  }
  return (
    <AdminWeekView
      startOfWeek={startOfWeek}
      terms={terms}
      linkSuffix={linkSuffix}
      base={base}
      draggedTermId={draggedTermId}
      setDraggedTermId={setDraggedTermId}
      onDropCell={handleDrop}
    />
  );
}

function AdminCellContent({
  termsInSlot,
  emptyDate,
  emptySlot,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
}: {
  termsInSlot: AdminTerm[];
  emptyDate: string;
  emptySlot: number;
  draggedTermId: string | null;
  setDraggedTermId: (id: string | null) => void;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
}) {
  const newTermHref = `/admin/termin/novi?date=${emptyDate}&slot=${emptySlot}`;
  if (termsInSlot.length === 0) {
    return (
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
    );
  }
  return (
    <div className="space-y-1.5 min-h-[52px]">
      {termsInSlot.map((term) => {
        const instructorColor = term.instructor?.color ?? DEFAULT_COLOR;
        const classroomColor = term.classroom?.color ?? '#64748b'; // fallback siva
        const bg = `${classroomColor}20`;
        const predavanja = term.predavanja ?? [];
        const instructorName = term.instructor
          ? `${term.instructor.ime} ${term.instructor.prezime}`
          : '—';
        const classroomName = term.classroom?.naziv ?? 'Učionica';
        return (
          <Link
            key={term.id}
            href={`/admin/termin/${term.id}`}
            className="block rounded-lg border-2 p-2 text-sm transition-opacity hover:opacity-90"
            style={{ borderColor: classroomColor, backgroundColor: bg, color: instructorColor }}
            draggable
            onDragStart={() => setDraggedTermId(term.id)}
            onDragEnd={() => setDraggedTermId(null)}
          >
            <span className="font-medium">
              {instructorName}
            </span>
            <span className="ml-1 text-[0.7rem] uppercase tracking-wide opacity-80">
              ({classroomName})
            </span>
            {predavanja.length > 0 && (
              <ul className="mt-1.5 space-y-1 pl-0 list-none border-t border-stone-200/80 pt-1.5">
                {predavanja.map((p) => (
                  <li
                    key={p.id}
                    className="text-[13px] sm:text-sm leading-snug font-semibold text-stone-900 break-words antialiased"
                  >
                    {p.client
                      ? `${p.client.ime ?? ''} ${p.client.prezime ?? ''}`.trim() || '—'
                      : '—'}
                  </li>
                ))}
              </ul>
            )}
            {predavanja.length === 0 && (
              <span className="text-stone-500 text-xs">+ radionica</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function AdminWeekView({
  startOfWeek,
  terms,
  linkSuffix,
  base,
  draggedTermId,
  setDraggedTermId,
  onDropCell,
}: {
  startOfWeek: string;
  terms: AdminTerm[];
  linkSuffix: string;
  base: string;
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
        <span className="font-medium text-stone-700">{formatWeekLabel(startOfWeek)}</span>
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
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="w-16 p-2 text-left text-stone-500 font-medium">Termin</th>
              {dates.map((date) => {
                const d = new Date(date + 'T12:00:00');
                return (
                  <th key={date} className="p-2 text-center text-stone-600 font-medium min-w-[120px]">
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
                <td className="p-2 text-stone-500 font-medium">{time}</td>
                {dates.map((date) => {
                  const termsInSlot = termsByKey(terms, date, slotIndex);
                  return (
                    <td key={date} className="p-1 align-top">
                      <AdminCellContent
                        termsInSlot={termsInSlot}
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

function AdminDayView({
  date,
  terms,
  linkSuffix,
  base,
  draggedTermId,
  onDropCell,
}: {
  date: string;
  terms: AdminTerm[];
  linkSuffix: string;
  base: string;
  draggedTermId: string | null;
  onDropCell: (date: string, slot: number) => void | Promise<void>;
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
          return (
            <div key={slotIndex} className="flex items-stretch gap-4 p-3">
              <div className="w-16 shrink-0 text-stone-500 font-medium">{time}</div>
              <div className="flex-1 min-w-0">
                <AdminCellContent
                  termsInSlot={termsInSlot}
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
