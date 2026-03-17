'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { INSTRUCTOR_COLORS, DEFAULT_INSTRUCTOR_COLOR } from '@/lib/constants';
import type { Instructor } from '@/types/database';

export default function PodesavanjaForm({ instructor }: { instructor: Instructor }) {
  const router = useRouter();
  const [ime, setIme] = useState(instructor.ime);
  const [prezime, setPrezime] = useState(instructor.prezime);
  const [telefon, setTelefon] = useState(instructor.telefon ?? '');
  const [color, setColor] = useState(instructor.color ?? DEFAULT_INSTRUCTOR_COLOR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('instructors')
        .update({
          ime: ime.trim(),
          prezime: prezime.trim(),
          telefon: telefon.trim() || null,
          color: color.trim() || null,
        })
        .eq('id', instructor.id);
      if (updateError) throw updateError;
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Greška pri čuvanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Ime
        </label>
        <input
          type="text"
          value={ime}
          onChange={(e) => setIme(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Prezime
        </label>
        <input
          type="text"
          value={prezime}
          onChange={(e) => setPrezime(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Telefon
        </label>
        <input
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Boja u kalendaru
        </label>
        <p className="text-xs text-stone-500 mb-2">
          Tvoji termini će se u kalendaru prikazivati ovom bojom.
        </p>
        <div className="flex flex-wrap gap-2">
          {INSTRUCTOR_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                color === c.value
                  ? 'border-stone-800 scale-110'
                  : 'border-stone-200 hover:border-stone-400'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
            />
          ))}
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : 'Sačuvaj'}
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Nazad
        </Link>
      </div>
    </form>
  );
}
