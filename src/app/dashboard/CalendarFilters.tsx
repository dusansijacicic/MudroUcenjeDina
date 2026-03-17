'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

type ClientOption = { id: string; ime: string; prezime: string };

export default function CalendarFilters({
  clients,
  clientFilterId,
  currentView,
  currentParams,
}: {
  clients: ClientOption[];
  clientFilterId: string | null;
  currentView: string;
  currentParams: {
    week?: string;
    day?: string;
    month?: string;
    view?: string;
    client?: string;
    instructor?: string;
  };
}) {
  const router = useRouter();

  const base = '/dashboard';
  const q = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (overrides.view) p.set('view', overrides.view);
    if (overrides.day) p.set('day', overrides.day);
    if (overrides.week) p.set('week', overrides.week);
    if (overrides.month) p.set('month', overrides.month);
    if (clientFilterId && overrides.client !== undefined) p.set('client', clientFilterId);
    if (currentParams.instructor && overrides.instructor !== undefined) p.set('instructor', currentParams.instructor);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const getMonday = () => {
    const d = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().slice(0, 10);
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    const params = new URLSearchParams();
    if (currentParams.view) params.set('view', currentParams.view);
    if (currentParams.week) params.set('week', currentParams.week);
    if (currentParams.day) params.set('day', currentParams.day);
    if (currentParams.month) params.set('month', currentParams.month);
    if (currentParams.instructor) params.set('instructor', currentParams.instructor);
    if (v) params.set('client', v);
    router.push(`${base}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        <Link
          href={`${base}?view=dan&day=${today}${clientFilterId ? `&client=${clientFilterId}` : ''}${currentParams.instructor ? `&instructor=${currentParams.instructor}` : ''}`}
          className={`px-3 py-1.5 rounded-md ${currentView === 'dan' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}
        >
          Dan
        </Link>
        <Link
          href={`${base}${clientFilterId ? `?client=${clientFilterId}` : ''}${currentParams.instructor ? `${clientFilterId ? '&' : '?'}instructor=${currentParams.instructor}` : ''}`}
          className={`px-3 py-1.5 rounded-md ${currentView === 'nedelja' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}
        >
          Nedelja
        </Link>
        <Link
          href={`${base}?view=mesec&month=${month}${clientFilterId ? `&client=${clientFilterId}` : ''}${currentParams.instructor ? `&instructor=${currentParams.instructor}` : ''}`}
          className={`px-3 py-1.5 rounded-md ${currentView === 'mesec' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}
        >
          Mesec
        </Link>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="text-stone-500">Klijent:</label>
        <select
          value={clientFilterId ?? ''}
          onChange={handleClientChange}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-800 min-w-[140px]"
        >
          <option value="">Svi</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ime} {c.prezime}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
