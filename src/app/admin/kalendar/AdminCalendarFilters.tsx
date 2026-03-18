'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Option = { id: string; ime?: string; prezime?: string; naziv?: string };

export default function AdminCalendarFilters({
  instructors,
  classrooms,
  clients,
  filterInstructorId,
  filterClassroomId,
  filterClientId,
  currentView,
  currentParams,
  base,
}: {
  instructors: Option[];
  classrooms: Option[];
  clients: Option[];
  filterInstructorId: string | null;
  filterClassroomId: string | null;
  filterClientId: string | null;
  currentView: string;
  currentParams: { week?: string; day?: string; month?: string; view?: string };
  base: string;
}) {
  const router = useRouter();

  const buildParams = (overrides: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    if (currentParams.view) p.set('view', currentParams.view);
    if (currentParams.week) p.set('week', currentParams.week);
    if (currentParams.day) p.set('day', currentParams.day);
    if (currentParams.month) p.set('month', currentParams.month);
    if (overrides.instructor !== undefined && overrides.instructor) p.set('instructor', overrides.instructor);
    if (overrides.classroom !== undefined && overrides.classroom) p.set('classroom', overrides.classroom);
    if (overrides.client !== undefined && overrides.client) p.set('client', overrides.client);
    return p.toString();
  };

  const handleInstructorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value || null;
    const q = buildParams({ instructor: v, classroom: filterClassroomId ?? undefined, client: filterClientId ?? undefined });
    router.push(q ? `${base}?${q}` : base);
  };
  const handleClassroomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value || null;
    const q = buildParams({ instructor: filterInstructorId ?? undefined, classroom: v, client: filterClientId ?? undefined });
    router.push(q ? `${base}?${q}` : base);
  };
  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value || null;
    const q = buildParams({ instructor: filterInstructorId ?? undefined, classroom: filterClassroomId ?? undefined, client: v });
    router.push(q ? `${base}?${q}` : base);
  };

  const filterQs = [
    filterInstructorId ? `instructor=${filterInstructorId}` : '',
    filterClassroomId ? `classroom=${filterClassroomId}` : '',
    filterClientId ? `client=${filterClientId}` : '',
  ].filter(Boolean).join('&');
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const getMonday = (d: Date) => {
    const x = new Date(d);
    const dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return x.toISOString().slice(0, 10);
  };
  const weekStart = currentParams.week || getMonday(new Date());
  const dayParam = currentParams.day || today;
  const monthParam = currentParams.month || month;
  const q = (extra: string) => (filterQs ? (extra ? `${extra}&${filterQs}` : filterQs) : extra);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        <Link href={`${base}?${q(`view=dan&day=${dayParam}`)}`} className={`px-3 py-1.5 rounded-md ${currentView === 'dan' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Dan</Link>
        <Link href={`${base}${q(`week=${weekStart}`) ? '?' + q(`week=${weekStart}`) : ''}`} className={`px-3 py-1.5 rounded-md ${currentView === 'nedelja' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Nedelja</Link>
        <Link href={`${base}?${q(`view=mesec&month=${monthParam}`)}`} className={`px-3 py-1.5 rounded-md ${currentView === 'mesec' ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100'}`}>Mesec</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-stone-500">Predavač:</label>
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
        <label className="text-stone-500 ml-1">Dete (klijent):</label>
        <select value={filterClientId ?? ''} onChange={handleClientChange} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-800 min-w-[140px]">
          <option value="">Svi</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.ime} {c.prezime}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
