'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createPredavanjeAsAdmin, updatePredavanjeAsAdmin, deletePredavanjeAsAdmin } from '@/app/admin/actions';

type ClientOption = { id: string; ime: string; prezime: string };

type TermTypeOption = { id: string; naziv: string; opis: string | null };

interface AdminPredavanjeFormProps {
  termId: string;
  termDate: string;
  slotLabel: string;
  clients: ClientOption[];
  termTypes?: TermTypeOption[];
  predavanje?: { id: string; client_id: string; odrzano: boolean; placeno: boolean; komentar: string | null; term_type_id?: string | null } | null;
  maxCasova?: number;
  currentCount?: number;
}

export default function AdminPredavanjeForm({
  termId,
  termDate,
  slotLabel,
  clients,
  termTypes = [],
  predavanje,
  maxCasova = 4,
  currentCount = 0,
}: AdminPredavanjeFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(predavanje?.client_id ?? '');
  const [termTypeId, setTermTypeId] = useState(predavanje?.term_type_id ?? '');
  const [odrzano, setOdrzano] = useState(predavanje?.odrzano ?? false);
  const [placeno, setPlaceno] = useState(predavanje?.placeno ?? false);
  const [komentar, setKomentar] = useState(predavanje?.komentar ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isNew = !predavanje;
  const atLimit = isNew && currentCount >= maxCasova;
  const backHref = `/admin/termin/${termId}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (atLimit) return;
    setLoading(true);
    try {
      if (predavanje) {
        const result = await updatePredavanjeAsAdmin(
          predavanje.id,
          termId,
          clientId,
          odrzano,
          placeno,
          komentar.trim() || null,
          termTypeId || null
        );
        if (result.error) throw new Error(result.error);
        toast.success('Predavanje sačuvano.');
      } else {
        const result = await createPredavanjeAsAdmin(
          termId,
          clientId,
          odrzano,
          placeno,
          komentar.trim() || null,
          termTypeId || null
        );
        if (result.error) throw new Error(result.error);
        toast.success('Predavanje dodato.');
      }
      router.push(backHref);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!predavanje || !confirm('Obrisati ovo predavanje?')) return;
    setLoading(true);
    try {
      const result = await deletePredavanjeAsAdmin(predavanje.id, termId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Predavanje obrisano.');
      router.push(backHref);
      router.refresh();
    } catch {
      setError('Greška pri brisanju.');
      toast.error('Greška pri brisanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-stone-500">
        {termDate} • {slotLabel}
        {isNew && (
          <span className="ml-2 text-stone-400">
            ({currentCount} / {maxCasova} časova u terminu)
          </span>
        )}
      </div>
      {atLimit && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Maksimalan broj časova u ovom terminu je {maxCasova}.
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Klijent</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">Izaberite klijenta</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ime} {c.prezime}
            </option>
          ))}
        </select>
      </div>
      {termTypes.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Vrsta termina</label>
          <select
            value={termTypeId}
            onChange={(e) => setTermTypeId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            <option value="">—</option>
            {termTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>{tt.naziv}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={odrzano} onChange={(e) => setOdrzano(e.target.checked)} className="rounded border-stone-300 text-amber-600" />
          <span className="text-sm text-stone-700">Održano</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={placeno} onChange={(e) => setPlaceno(e.target.checked)} className="rounded border-stone-300 text-amber-600" />
          <span className="text-sm text-stone-700">Plaćeno</span>
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Komentar (šta je rađeno)</label>
        <textarea
          value={komentar}
          onChange={(e) => setKomentar(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          placeholder="Opis rada na času..."
        />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || atLimit}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : predavanje ? 'Sačuvaj' : 'Dodaj predavanje'}
        </button>
        <Link href={backHref} className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100">
          Odustani
        </Link>
        {predavanje && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="ml-auto rounded-lg border border-red-200 text-red-600 px-4 py-2 hover:bg-red-50"
          >
            Obriši
          </button>
        )}
      </div>
    </form>
  );
}
