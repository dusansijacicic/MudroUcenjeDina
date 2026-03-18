'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createUplata } from '@/app/admin/actions';

type Option = { id: string; ime?: string; prezime?: string; naziv?: string };

export default function UplataForm({
  instructors,
  clients,
  termTypes,
}: {
  instructors: Option[];
  clients: Option[];
  termTypes: Option[];
}) {
  const router = useRouter();
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? '');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [iznos, setIznos] = useState('');
  const [termTypeId, setTermTypeId] = useState('');
  const [brojCasova, setBrojCasova] = useState(1);
  const [popustPercent, setPopustPercent] = useState('');
  const [napomena, setNapomena] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!instructorId || !clientId) {
      setError('Izaberite predavača i klijenta.');
      return;
    }
    setLoading(true);
    const iznosNum = iznos.trim() ? parseFloat(iznos.replace(',', '.')) : null;
    if (iznos.trim() && (iznosNum === undefined || !Number.isFinite(iznosNum))) {
      setError('Iznos mora biti broj.');
      setLoading(false);
      return;
    }
    const popustNum = popustPercent.trim() ? parseFloat(popustPercent.replace(',', '.')) : null;
    if (popustPercent.trim() && (popustNum === undefined || !Number.isFinite(popustNum) || popustNum < 0 || popustNum > 100)) {
      setError('Popust mora biti broj 0–100.');
      setLoading(false);
      return;
    }
    const result = await createUplata(
      instructorId,
      clientId,
      iznosNum,
      termTypeId || null,
      brojCasova,
      popustNum,
      napomena.trim() || null
    );
    setLoading(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success('Uplata uneta.');
    router.push('/admin/uplate');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Ko je primio (predavač) *</label>
        <select
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">—</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Klijent *</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.ime} {c.prezime}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Iznos (RSD)</label>
        <input
          type="text"
          value={iznos}
          onChange={(e) => setIznos(e.target.value)}
          placeholder="npr. 5000"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Vrsta časa</label>
        <select
          value={termTypeId}
          onChange={(e) => setTermTypeId(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">—</option>
          {termTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.naziv}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Broj časova</label>
        <input
          type="number"
          min={0}
          value={brojCasova}
          onChange={(e) => setBrojCasova(parseInt(e.target.value, 10) || 0)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[120px]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Popust za ovu uplatu (%)</label>
        <input
          type="text"
          value={popustPercent}
          onChange={(e) => setPopustPercent(e.target.value)}
          placeholder="npr. 10"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[100px]"
        />
        <p className="mt-1 text-xs text-stone-500">0–100. Opciono za ovu jednu uplatu (može biti drugačije od popusta na nivou klijenta).</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Napomena</label>
        <input
          type="text"
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Unos...' : 'Unesi uplatu'}
        </button>
        <Link href="/admin/uplate" className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100">
          Nazad
        </Link>
      </div>
    </form>
  );
}
