'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAdminInstructorsList } from '../../actions';

export default function AdminNoviKlijentPage() {
  const router = useRouter();
  const [instructors, setInstructors] = useState<{ id: string; ime: string; prezime: string }[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminInstructorsList().then((data) => {
      setInstructors(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      setLoading(false);
    });
  }, []);

  const handleGo = () => {
    if (selectedId) router.push(`/admin/view/${selectedId}/klijenti/novi`);
  };

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Novi klijent</h1>
      <p className="text-stone-500 text-sm mb-6">
        Izaberite predavača kojem dodajete učenika; zatim popunite podatke.
      </p>
      {loading ? (
        <p className="text-stone-500">Učitavanje...</p>
      ) : instructors.length === 0 ? (
        <p className="text-stone-600 mb-4">
          Nema predavača u bazi. Prvo dodajte predavača na{' '}
          <Link href="/admin/predavaci/novi" className="text-amber-600 hover:underline">
            Novi predavač
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Predavač</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            >
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ime} {i.prezime}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleGo}
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700"
            >
              Nastavi i unesi podatke
            </button>
            <Link
              href="/admin/klijenti"
              className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
            >
              Odustani
            </Link>
          </div>
        </div>
      )}
      <p className="mt-6">
        <Link href="/admin/klijenti" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve klijente
        </Link>
      </p>
    </div>
  );
}
