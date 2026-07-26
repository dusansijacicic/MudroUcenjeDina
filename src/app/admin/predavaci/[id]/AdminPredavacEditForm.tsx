'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { INSTRUCTOR_COLORS, DEFAULT_INSTRUCTOR_COLOR } from '@/lib/constants';
import { updateInstructorAsAdmin } from '@/app/admin/actions';

type Instructor = { id: string; ime: string; prezime: string; telefon: string | null; color: string | null };

export default function AdminPredavacEditForm({ instructor }: { instructor: Instructor }) {
  const router = useRouter();
  const [ime, setIme] = useState(instructor.ime);
  const [prezime, setPrezime] = useState(instructor.prezime);
  const [telefon, setTelefon] = useState(instructor.telefon ?? '');
  const [color, setColor] = useState(instructor.color ?? DEFAULT_INSTRUCTOR_COLOR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await updateInstructorAsAdmin(instructor.id, {
        ime: ime.trim(),
        prezime: prezime.trim(),
        telefon: telefon.trim() || null,
        color: color.trim() || null,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Instruktor sačuvan.');
      router.push('/admin/predavaci');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ime</label>
          <input
            type="text"
            value={ime}
            onChange={(e) => setIme(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Prezime</label>
          <input
            type="text"
            value={prezime}
            onChange={(e) => setPrezime(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Telefon</label>
        <input
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Boja u kalendaru</label>
        <p className="text-xs text-stone-500 mb-3">
          Termini ovog instruktora prikazuju se ovom bojom. Svaki instruktor treba da ima jedinstvenu boju.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-stone-300"
          />
          <span className="text-sm font-mono text-stone-600">{color}</span>
          <span className="text-stone-300">|</span>
          {INSTRUCTOR_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              title={c.label}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                color === c.value
                  ? 'border-stone-800 scale-110'
                  : 'border-stone-200 hover:border-stone-400'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div
          className="mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white w-fit"
          style={{ backgroundColor: color }}
        >
          Primer: {ime || 'Instruktor'} {prezime}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : 'Sačuvaj'}
        </button>
        <Link
          href="/admin/predavaci"
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Odustani
        </Link>
      </div>
    </form>
  );
}
