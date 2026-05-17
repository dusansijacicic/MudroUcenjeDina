'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { addPotentialClient } from '@/app/admin/actions';

export default function NoviPotencijalniKlijentPage() {
  const params = useParams();
  const termId = params.id as string;
  const router = useRouter();

  const [ime, setIme] = useState('');
  const [prezime, setPrezime] = useState('');
  const [imeRoditelja, setImeRoditelja] = useState('');
  const [mobilni, setMobilni] = useState('');
  const [razred, setRazred] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!ime.trim()) { setError('Ime deteta je obavezno.'); return; }
    setLoading(true);
    try {
      const result = await addPotentialClient(termId, {
        ime: ime.trim(),
        prezime: prezime.trim() || null,
        ime_roditelja: imeRoditelja.trim() || null,
        mobilni_roditelja: mobilni.trim() || null,
        razred: razred.trim() || null,
      });
      if (result.error) { setError(result.error); toast.error(result.error); return; }
      toast.success('Dodat potencijalni klijent.');
      router.push(`/admin/termin/${termId}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Greška.';
      setError(msg); toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md">
      <Link href={`/admin/termin/${termId}`} className="text-sm text-stone-500 hover:text-amber-600 inline-block mb-4">
        ← Nazad na termin
      </Link>
      <h1 className="text-xl font-semibold text-stone-800 mb-1">Novi potencijalni klijent</h1>
      <p className="text-stone-500 text-sm mb-6">Osnovni podaci za termin testiranja.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Ime deteta <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={ime}
              onChange={(e) => setIme(e.target.value)}
              required
              placeholder="npr. Marko"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Prezime deteta</label>
            <input
              type="text"
              value={prezime}
              onChange={(e) => setPrezime(e.target.value)}
              placeholder="npr. Petrović"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ime roditelja</label>
          <input
            type="text"
            value={imeRoditelja}
            onChange={(e) => setImeRoditelja(e.target.value)}
            placeholder="npr. Ana Petrović"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Mobilni roditelja</label>
          <input
            type="tel"
            value={mobilni}
            onChange={(e) => setMobilni(e.target.value)}
            placeholder="npr. 065 123 4567"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Razred</label>
          <input
            type="text"
            value={razred}
            onChange={(e) => setRazred(e.target.value)}
            placeholder="npr. 5"
            className="w-full max-w-[100px] rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? 'Dodavanje...' : 'Dodaj'}
          </button>
          <Link
            href={`/admin/termin/${termId}`}
            className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            Odustani
          </Link>
        </div>
      </form>
    </div>
  );
}
