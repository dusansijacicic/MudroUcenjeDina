'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { updateAppSetting } from '@/app/admin/actions';

export default function PodesavanjaForm({
  maxCasovaPoTerminu,
  maxTerminaPoSlotu,
}: {
  maxCasovaPoTerminu: string;
  maxTerminaPoSlotu: string;
}) {
  const router = useRouter();
  const [maxCasova, setMaxCasova] = useState(maxCasovaPoTerminu);
  const [maxTermina, setMaxTermina] = useState(maxTerminaPoSlotu);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const casova = parseInt(maxCasova, 10);
    const termina = parseInt(maxTermina, 10);
    if (!Number.isFinite(casova) || casova < 1 || casova > 20) {
      setError('Maks. časova po terminu mora biti broj između 1 i 20.');
      return;
    }
    if (!Number.isFinite(termina) || termina < 1 || termina > 20) {
      setError('Maks. termina po slotu mora biti broj između 1 i 20.');
      return;
    }
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        updateAppSetting('max_casova_po_terminu', String(casova)),
        updateAppSetting('max_termina_po_slotu', String(termina)),
      ]);
      if (r1.error || r2.error) {
        setError(r1.error ?? r2.error ?? 'Greška pri čuvanju.');
        toast.error(r1.error ?? r2.error);
        return;
      }
      toast.success('Podešavanja sačuvana.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri čuvanju.');
      toast.error('Greška pri čuvanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Maksimalan broj časova (predavanja) u jednom terminu
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={maxCasova}
          onChange={(e) => setMaxCasova(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
        <p className="text-xs text-stone-500 mt-0.5">Koliko učenika/časova može biti u jednom terminu (npr. 4).</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Maksimalan broj termina u jednom vremenskom slotu
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={maxTermina}
          onChange={(e) => setMaxTermina(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
        <p className="text-xs text-stone-500 mt-0.5">Npr. u 10:00 može biti najviše toliko termina (različitih predavača u različitim učionicama).</p>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Čuvanje...' : 'Sačuvaj podešavanja'}
      </button>
    </form>
  );
}
