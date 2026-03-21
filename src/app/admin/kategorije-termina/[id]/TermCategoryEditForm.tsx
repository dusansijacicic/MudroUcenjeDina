'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { updateTermCategoryAsAdmin } from '@/app/admin/actions';

export default function TermCategoryEditForm({
  id,
  initialNaziv,
  initialOpis,
  initialJedanKlijent,
}: {
  id: string;
  initialNaziv: string;
  initialOpis: string;
  initialJedanKlijent: boolean;
}) {
  const router = useRouter();
  const [naziv, setNaziv] = useState(initialNaziv);
  const [opis, setOpis] = useState(initialOpis);
  const [jedanKlijent, setJedanKlijent] = useState(initialJedanKlijent);
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
    const result = await updateTermCategoryAsAdmin(id, naziv.trim(), opis.trim() || null, jedanKlijent);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success('Kategorija sačuvana.');
    router.push('/admin/kategorije-termina');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Naziv</label>
        <input
          type="text"
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Opis (opciono)</label>
        <input
          type="text"
          value={opis}
          onChange={(e) => setOpis(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={jedanKlijent}
          onChange={(e) => setJedanKlijent(e.target.checked)}
          className="rounded border-stone-300 text-amber-600"
        />
        <span className="text-sm text-stone-800">Samo jedno dete u terminu</span>
      </label>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : 'Sačuvaj'}
        </button>
        <Link
          href="/admin/kategorije-termina"
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Odustani
        </Link>
      </div>
    </form>
  );
}
