'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { createInstructorAsAdmin } from '../../actions';

export default function NoviPredavacForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      console.log('[NoviPredavacForm] submitting');
      const result = await createInstructorAsAdmin(formData);
      console.log('[NoviPredavacForm] result', result);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      if (result?.success) {
        toast.success('Predavač je dodat.');
        router.push('/admin');
        router.refresh();
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[NoviPredavacForm] catch', err);
      if (!msg.includes('NEXT_REDIRECT')) {
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Email (za prijavu)</label>
        <input
          type="email"
          name="email"
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Lozinka (min. 6 znakova)</label>
        <input
          type="password"
          name="password"
          required
          minLength={6}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ime</label>
          <input
            type="text"
            name="ime"
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Prezime</label>
          <input
            type="text"
            name="prezime"
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Kreiranje...' : 'Kreiraj predavača'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Odustani
        </button>
      </div>
    </form>
  );
}
