'use client';

import Link from 'next/link';
import { useMemo, useState, useOptimistic, useTransition } from 'react';
import CalendarProgress from '@/components/CalendarProgress';
import { useRouter } from 'next/navigation';
import { searchVariants, variantsMatch } from '@/lib/search';
import { VRSTA_BEZ, VRSTA_TESTIRANJE } from '@/lib/kalendar-filter';

type Option = { id: string; ime?: string; prezime?: string; naziv?: string };

/** Polje gde se kuca ime deteta; izbor iz padajuće liste odmah filtrira kalendar. */
function KlijentFilter({
  clients,
  value,
  onSelect,
}: {
  clients: Option[];
  value: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const index = useMemo(
    () =>
      clients.map((c) => ({
        c,
        hay: [...searchVariants(`${c.ime ?? ''} ${c.prezime ?? ''}`), ...searchVariants(`${c.prezime ?? ''} ${c.ime ?? ''}`)],
      })),
    [clients]
  );
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return index.filter(({ hay }) => variantsMatch(hay, query)).slice(0, 12).map(({ c }) => c);
  }, [index, query]);

  const selected = value ? clients.find((c) => c.id === value) : null;
  if (selected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 py-1 pl-3 pr-1 text-violet-900">
        <span className="font-medium">
          {selected.ime} {selected.prezime}
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Ukloni filter po detetu"
          className="rounded-md px-1.5 py-0.5 text-violet-700 hover:bg-violet-100"
        >
          ✕
        </button>
      </span>
    );
  }

  const choose = (id: string) => {
    setQuery('');
    setOpen(false);
    onSelect(id);
  };

  return (
    <div className="relative">
      <input
        type="search"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="kalendar-klijent-lista"
        aria-label="Filter po detetu"
        autoComplete="off"
        spellCheck={false}
        placeholder="Kucaj ime deteta…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && matches[active]) {
            e.preventDefault();
            choose(matches[active].id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-48 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-800 placeholder:text-stone-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
      />
      {open && query.trim() !== '' && (
        <ul
          id="kalendar-klijent-lista"
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-stone-500">Nema deteta sa tim imenom.</li>
          ) : (
            matches.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // mousedown umesto click: inače blur na polju zatvori listu pre nego što se klik registruje
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c.id);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`block w-full px-3 py-1.5 text-left ${i === active ? 'bg-violet-50 text-violet-900' : 'text-stone-800'}`}
                >
                  {c.ime} {c.prezime}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

type Filteri = { instructor: string | null; classroom: string | null; client: string | null; vrsta: string | null };

export default function AdminCalendarFilters({
  instructors,
  classrooms,
  clients,
  termTypes,
  filterInstructorId,
  filterClassroomId,
  filterClientId,
  filterVrsta,
  currentView,
  currentParams,
  shownStartOfWeek,
  shownDay,
  shownMonth,
  base,
}: {
  instructors: Option[];
  classrooms: Option[];
  clients: Option[];
  /** Vrste časa za filter „Vrsta“. */
  termTypes: Option[];
  filterInstructorId: string | null;
  filterClassroomId: string | null;
  filterClientId: string | null;
  /** id vrste časa, VRSTA_TESTIRANJE ili VRSTA_BEZ. */
  filterVrsta: string | null;
  currentView: string;
  currentParams: { week?: string; day?: string; month?: string; view?: string };
  /** Trenutno prikazani period – prelazak Dan/Nedelja/Mesec ostaje na njemu umesto da skoči na danas. */
  shownStartOfWeek: string;
  shownDay?: string;
  shownMonth?: string;
  base: string;
}) {
  const router = useRouter();

  const trenutni: Filteri = { instructor: filterInstructorId, classroom: filterClassroomId, client: filterClientId, vrsta: filterVrsta };
  const [optimisticFilters, setOptimisticFilters] = useOptimistic(trenutni);
  const [navigating, startNavigation] = useTransition();
  // Menja se jedan filter, ostali (i prikazani period) ostaju.
  const promeni = (izmena: Partial<Filteri>) => {
    const p = new URLSearchParams();
    if (currentParams.view) p.set('view', currentParams.view);
    if (currentParams.week) p.set('week', currentParams.week);
    if (currentParams.day) p.set('day', currentParams.day);
    if (currentParams.month) p.set('month', currentParams.month);
    for (const [k, v] of Object.entries({ ...trenutni, ...izmena })) if (v) p.set(k, v);
    const q = p.toString();
    startNavigation(() => {
      setOptimisticFilters({ ...trenutni, ...izmena });
      router.push(q ? `${base}?${q}` : base);
    });
  };

  const handleInstructorChange = (e: React.ChangeEvent<HTMLSelectElement>) => promeni({ instructor: e.target.value || null });
  const handleClassroomChange = (e: React.ChangeEvent<HTMLSelectElement>) => promeni({ classroom: e.target.value || null });
  const handleVrstaChange = (e: React.ChangeEvent<HTMLSelectElement>) => promeni({ vrsta: e.target.value || null });
  const handleClientSelect = (v: string | null) => promeni({ client: v });

  const filterQs = Object.entries(trenutni)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  const getMonday = (iso: string) => {
    const x = new Date(iso + 'T12:00:00');
    const dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return x.toISOString().slice(0, 10);
  };
  const weekStart = shownDay ? getMonday(shownDay) : shownMonth ? getMonday(`${shownMonth}-01`) : shownStartOfWeek;
  const dayParam = shownDay ?? (shownMonth ? `${shownMonth}-01` : shownStartOfWeek);
  const monthParam = shownMonth ?? (shownDay ?? shownStartOfWeek).slice(0, 7);
  const q = (extra: string) => (filterQs ? (extra ? `${extra}&${filterQs}` : filterQs) : extra);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CalendarProgress active={navigating} />
      <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        <Link prefetch={false} href={`${base}?${q(`view=dan&day=${dayParam}`)}`} className={`px-3 py-1.5 rounded-md ${currentView === 'dan' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Dan</Link>
        <Link prefetch={false} href={`${base}?${q(`view=nedelja&week=${weekStart}`)}`} className={`px-3 py-1.5 rounded-md ${currentView === 'nedelja' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Nedelja</Link>
        <Link prefetch={false} href={`${base}?${q(`view=mesec&month=${monthParam}`)}`} className={`px-3 py-1.5 rounded-md ${currentView === 'mesec' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Mesec</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-stone-500">Dete:</label>
        <KlijentFilter clients={clients} value={optimisticFilters.client} onSelect={handleClientSelect} />
        <label className="text-stone-500 ml-1">Instruktor:</label>
        <select value={filterInstructorId ?? ''} onChange={handleInstructorChange} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-800 min-w-[140px]">
          <option value="">Svi</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
          ))}
        </select>
        <label className="text-stone-500 ml-1">Učionica:</label>
        <select value={filterClassroomId ?? ''} onChange={handleClassroomChange} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-800 min-w-[120px]">
          <option value="">Sve</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>{c.naziv ?? c.ime}</option>
          ))}
        </select>
        <label className="text-stone-500 ml-1">Vrsta:</label>
        <select
          value={filterVrsta ?? ''}
          onChange={handleVrstaChange}
          className={`rounded-lg border px-3 py-1.5 min-w-[140px] ${
            filterVrsta ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-stone-200 bg-white text-stone-800'
          }`}
        >
          <option value="">Sve</option>
          {termTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.naziv}</option>
          ))}
          <option value={VRSTA_TESTIRANJE}>Testiranje</option>
          <option value={VRSTA_BEZ}>Bez vrste</option>
        </select>
      </div>
    </div>
  );
}
