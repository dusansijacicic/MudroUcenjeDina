'use client';

import Link from 'next/link';
import { TIME_SLOTS } from '@/lib/constants';
import type { UcenikTerm } from './page';

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

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

function termByKey(terms: UcenikTerm[], date: string, slot: number): UcenikTerm | null {
  const t = terms.find((x) => x.date === date && x.slot_index === slot);
  return t ?? null;
}

export default function UcenikCalendarView({
  terms,
  startOfWeek,
  singleDay,
  view,
}: {
  terms: UcenikTerm[];
  startOfWeek: string;
  singleDay?: string;
  view: string;
}) {
  const base = '/ucenik/kalendar';

  if (view === 'dan' && singleDay) {
    const label = new Date(singleDay + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const prevDay = (() => {
      const x = new Date(singleDay + 'T12:00:00');
      x.setDate(x.getDate() - 1);
      return x.toISOString().slice(0, 10);
    })();
    const nextDay = (() => {
      const x = new Date(singleDay + 'T12:00:00');
      x.setDate(x.getDate() + 1);
      return x.toISOString().slice(0, 10);
    })();

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--kid-text)] capitalize">{label}</span>
          <div className="flex gap-2">
            <Link href={`${base}?view=dan&day=${prevDay}`} className="px-3 py-1.5 rounded-lg bg-[var(--kid-sky)]/50 text-[var(--kid-text)] text-sm hover:bg-[var(--kid-sky)]">
              ← Prethodni
            </Link>
            <Link href={`${base}?view=dan&day=${nextDay}`} className="px-3 py-1.5 rounded-lg bg-[var(--kid-sky)]/50 text-[var(--kid-text)] text-sm hover:bg-[var(--kid-sky)]">
              Sledeći →
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-[var(--kid-sky)]/50 bg-white/90 divide-y divide-[var(--kid-sky)]/30 overflow-hidden">
          {TIME_SLOTS.map((time, slotIndex) => {
            const term = termByKey(terms, singleDay, slotIndex);
            return (
              <div key={slotIndex} className="flex items-stretch gap-4 p-3 min-h-[56px]">
                <div className="w-16 shrink-0 text-[var(--kid-text-muted)] font-medium">{time}</div>
                <div className="flex-1 min-w-0">
                  {term ? (
                    <div
                      className="rounded-xl border-2 p-3 text-sm"
                      style={{
                        borderColor: term.classroom?.color ?? '#64748b',
                        backgroundColor: `${term.classroom?.color ?? '#64748b'}20`,
                        color: term.instructor?.color ?? '#0d9488',
                      }}
                    >
                      <span className="font-semibold">
                        {term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—'}
                      </span>
                      {term.classroom?.naziv && (
                        <span className="ml-2 text-xs opacity-90">({term.classroom.naziv})</span>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--kid-sky)]/40 p-3 text-[var(--kid-text-muted)] text-sm">
                      Nema časa
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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
        <span className="font-medium text-[var(--kid-text)]">{formatWeekLabel(startOfWeek)}</span>
        <div className="flex gap-2">
          <Link href={`${base}?view=nedelja&week=${prevWeek}`} className="px-3 py-1.5 rounded-lg bg-[var(--kid-sky)]/50 text-[var(--kid-text)] text-sm hover:bg-[var(--kid-sky)]">
            ← Prethodna
          </Link>
          <Link href={`${base}?view=nedelja&week=${nextWeek}`} className="px-3 py-1.5 rounded-lg bg-[var(--kid-sky)]/50 text-[var(--kid-text)] text-sm hover:bg-[var(--kid-sky)]">
            Sledeća →
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--kid-sky)]/50 bg-white/90">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--kid-sky)]/40 bg-[var(--kid-sky)]/20">
              <th className="w-16 p-2 text-left text-[var(--kid-text-muted)] font-medium">Termin</th>
              {dates.map((date) => {
                const d = new Date(date + 'T12:00:00');
                return (
                  <th key={date} className="p-2 text-center text-[var(--kid-text)] font-medium min-w-[120px]">
                    <div>{DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                    <div className="text-[var(--kid-text-muted)] text-xs">{d.getDate()}.{d.getMonth() + 1}.</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((time, slotIndex) => (
              <tr key={slotIndex} className="border-b border-[var(--kid-sky)]/20">
                <td className="p-2 text-[var(--kid-text-muted)] font-medium">{time}</td>
                {dates.map((date) => {
                  const term = termByKey(terms, date, slotIndex);
                  return (
                    <td key={date} className="p-1 align-top">
                      {term ? (
                        <div
                          className="rounded-xl border-2 p-2 text-sm transition-smooth hover:shadow-md"
                          style={{
                            borderColor: term.classroom?.color ?? '#64748b',
                            backgroundColor: `${term.classroom?.color ?? '#64748b'}20`,
                            color: term.instructor?.color ?? '#0d9488',
                          }}
                        >
                          <span className="font-semibold">
                            {term.instructor ? `${term.instructor.ime} ${term.instructor.prezime}` : '—'}
                          </span>
                          {term.classroom?.naziv && (
                            <span className="block text-xs opacity-90 mt-0.5">{term.classroom.naziv}</span>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[var(--kid-sky)]/30 p-2 min-h-[52px] text-[var(--kid-text-muted)] text-xs">
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--kid-text-muted)]">
        Klik na „Dan” ispod za pregled po danu; u navigaciji možeš izabrati „Nedelja” ili „Dan”.
      </p>
      <div className="flex gap-2">
        <Link href={`${base}?view=nedelja&week=${startOfWeek}`} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view !== 'dan' ? 'bg-[var(--kid-teal)]/40 text-[#0d5c52]' : 'bg-[var(--kid-sky)]/30 text-[var(--kid-text)]'}`}>
          Nedelja
        </Link>
        <Link href={`${base}?view=dan&day=${singleDay ?? startOfWeek}`} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === 'dan' ? 'bg-[var(--kid-teal)]/40 text-[#0d5c52]' : 'bg-[var(--kid-sky)]/30 text-[var(--kid-text)]'}`}>
          Dan
        </Link>
      </div>
    </div>
  );
}
