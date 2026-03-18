'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upsertClassroom } from '@/app/admin/actions';

type Classroom = { id: string; naziv: string; color: string | null };

export default function ClassroomForm({ existing }: { existing?: Classroom | null }) {
  const router = useRouter();
  const [naziv, setNaziv] = useState(existing?.naziv ?? '');
  const [color, setColor] = useState(existing?.color ?? '#0ea5e9');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!naziv.trim()) {
      setError('Unesite naziv učionice.');
      return;
    }
    setLoading(true);
    const res = await upsertClassroom(existing?.id ?? null, naziv, color);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Naziv učionice
        </label>
        <input
          type="text"
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-stone-800 w-56"
          placeholder="npr. Učionica 1"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Boja u kalendaru
        </label>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-16 cursor-pointer rounded border border-stone-300"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Čuvanje...' : existing ? 'Sačuvaj učionicu' : 'Dodaj učionicu'}
      </button>
      {error && (
        <p className="text-sm text-red-600 w-full">
          {error}
        </p>
      )}
    </form>
  );
}

