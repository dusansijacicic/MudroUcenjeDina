'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTermTypeAsAdmin } from '@/app/admin/actions';

export default function TermTypesForm() {
  const router = useRouter();
  const [naziv, setNaziv] = useState('');
  const [opis, setOpis] = useState('');
  const [cenaPoCasu, setCenaPoCasu] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!naziv.trim()) {
      setError('Unesite naziv.');
      return;
    }
    setLoading(true);
    const cena = cenaPoCasu.trim() ? parseFloat(cenaPoCasu.replace(',', '.')) : null;
    const cenaInvalid = cenaPoCasu.trim() && (cena == null || !Number.isFinite(cena) || Number(cena) < 0);
    if (cenaInvalid) {
      setError('Cena mora biti nenegativan broj.');
      setLoading(false);
      return;
    }
    const result = await createTermTypeAsAdmin(naziv.trim(), opis.trim() || null, cena);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setNaziv('');
    setOpis('');
    setCenaPoCasu('');
    router.refresh();
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Naziv</label>
        <input
          type="text"
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-stone-800 w-48"
          placeholder="npr. Individualni"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Opis (opciono)</label>
        <input
          type="text"
          value={opis}
          onChange={(e) => setOpis(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-stone-800 w-64"
          placeholder="Kratak opis"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Cena po času (RSD)</label>
        <input
          type="text"
          value={cenaPoCasu}
          onChange={(e) => setCenaPoCasu(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-stone-800 w-28"
          placeholder="npr. 1500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Dodavanje...' : 'Dodaj'}
      </button>
      {error && <p className="text-sm text-red-600 w-full">{error}</p>}
    </form>
  );
}
