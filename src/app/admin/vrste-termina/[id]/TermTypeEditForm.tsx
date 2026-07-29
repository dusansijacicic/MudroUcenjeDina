'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { updateTermTypeAsAdmin, type ProgramRow } from '@/app/admin/actions';

export default function TermTypeEditForm({
  id,
  initialNaziv,
  initialOpis,
  initialCenaPoCasu,
  initialProgramId,
  initialTrajanjeMinuta,
  programs = [],
}: {
  id: string;
  initialNaziv: string;
  initialOpis: string;
  initialCenaPoCasu: string;
  initialProgramId?: string;
  initialTrajanjeMinuta?: number;
  programs?: ProgramRow[];
}) {
  const router = useRouter();
  const [naziv, setNaziv] = useState(initialNaziv);
  const [opis, setOpis] = useState(initialOpis);
  const [cenaPoCasu, setCenaPoCasu] = useState(initialCenaPoCasu);
  const [programId, setProgramId] = useState(initialProgramId ?? '');
  const [trajanjeMinuta, setTrajanjeMinuta] = useState(String(initialTrajanjeMinuta ?? 45));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!naziv.trim()) {
      setError('Unesite naziv.');
      return;
    }
    if (!programId) {
      setError('Izaberite program.');
      return;
    }
    const trajanje = parseInt(trajanjeMinuta, 10);
    if (!Number.isFinite(trajanje) || trajanje <= 0) {
      setError('Trajanje mora biti pozitivan broj minuta.');
      return;
    }
    const cena = cenaPoCasu.trim() ? parseFloat(cenaPoCasu.replace(',', '.')) : null;
    const cenaInvalid = cenaPoCasu.trim() && (cena == null || !Number.isFinite(cena) || Number(cena) < 0);
    if (cenaInvalid) {
      setError('Cena mora biti nenegativan broj.');
      return;
    }
    setLoading(true);
    const result = await updateTermTypeAsAdmin(id, naziv.trim(), opis.trim() || null, cena, programId || null, trajanje);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success('Vrsta termina sačuvana.');
    router.push('/admin/vrste-termina');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Naziv</label>
        <input type="text" value={naziv} onChange={(e) => setNaziv(e.target.value)} required className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Opis (opciono)</label>
        <input type="text" value={opis} onChange={(e) => setOpis(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Cena po času (RSD)</label>
        <input type="text" value={cenaPoCasu} onChange={(e) => setCenaPoCasu(e.target.value)} placeholder="npr. 1500" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[140px]" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Trajanje (min)</label>
        <input
          type="number"
          min="1"
          value={trajanjeMinuta}
          onChange={(e) => setTrajanjeMinuta(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[100px]"
        />
        <p className="text-xs text-stone-500 mt-1">Preko 45 min = zauzima i sledeći slot (npr. 55 min → 2 slota).</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Program *</label>
        <select
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          required
          className="w-full max-w-xs rounded-lg border border-stone-300 px-3 py-2 text-stone-800 bg-white"
        >
          <option value="">— izaberite —</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.naziv}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50">
          {loading ? 'Čuvanje...' : 'Sačuvaj'}
        </button>
        <Link href="/admin/vrste-termina" className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100">Odustani</Link>
      </div>
    </form>
  );
}
