'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Predavanje } from '@/types/database';

type ClientOption = { id: string; ime: string; prezime: string };

interface PredavanjeFormProps {
  termId: string;
  termDate: string;
  slotLabel: string;
  clients: ClientOption[];
  predavanje?: Predavanje | null;
}

export default function PredavanjeForm({
  termId,
  termDate,
  slotLabel,
  clients,
  predavanje,
}: PredavanjeFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(predavanje?.client_id ?? '');
  const [odrzano, setOdrzano] = useState(predavanje?.odrzano ?? false);
  const [placeno, setPlaceno] = useState(predavanje?.placeno ?? false);
  const [komentar, setKomentar] = useState(predavanje?.komentar ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        term_id: termId,
        client_id: clientId,
        odrzano,
        placeno,
        komentar: komentar.trim() || null,
      };
      if (predavanje) {
        const { error: updateError } = await supabase
          .from('predavanja')
          .update(payload)
          .eq('id', predavanje.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('predavanja')
          .insert(payload);
        if (insertError) throw insertError;
      }
      router.push(`/dashboard/termin/${termId}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Greška pri čuvanju.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!predavanje || !confirm('Obrisati ovo predavanje?')) return;
    setLoading(true);
    try {
      await supabase.from('predavanja').delete().eq('id', predavanje.id);
      router.push(`/dashboard/termin/${termId}`);
      router.refresh();
    } catch {
      setError('Greška pri brisanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-stone-500">
        {termDate} • {slotLabel}
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Klijent
        </label>
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
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={odrzano}
            onChange={(e) => setOdrzano(e.target.checked)}
            className="rounded border-stone-300 text-amber-600"
          />
          <span className="text-sm text-stone-700">Održano</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={placeno}
            onChange={(e) => setPlaceno(e.target.checked)}
            className="rounded border-stone-300 text-amber-600"
          />
          <span className="text-sm text-stone-700">Plaćeno</span>
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Komentar (šta je rađeno)
        </label>
        <textarea
          value={komentar}
          onChange={(e) => setKomentar(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          placeholder="Opis rada na času..."
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : predavanje ? 'Sačuvaj' : 'Dodaj predavanje'}
        </button>
        <Link
          href={`/dashboard/termin/${termId}`}
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
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
