'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createPredavanje, updatePredavanje, deletePredavanje, updateTermClassroom } from '@/app/dashboard/termin/actions';
import type { Predavanje } from '@/types/database';

type ClientOption = { id: string; ime: string; prezime: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null };
type ClassroomOption = { id: string; naziv: string; color: string | null };

interface PredavanjeFormProps {
  termId: string;
  termDate: string;
  slotLabel: string;
  clients: ClientOption[];
  predavanje?: Predavanje & { term_type_id?: string | null } | null;
  termTypes?: TermTypeOption[];
  maxCasova?: number;
  currentCount?: number;
  classrooms?: ClassroomOption[];
  initialClassroomId?: string | null;
}

export default function PredavanjeForm({
  termId,
  termDate,
  slotLabel,
  clients,
  predavanje,
  termTypes = [],
  maxCasova = 4,
  currentCount = 0,
   classrooms = [],
   initialClassroomId = null,
}: PredavanjeFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(predavanje?.client_id ?? '');
  const [termTypeId, setTermTypeId] = useState<string>(predavanje?.term_type_id ?? '');
  const [odrzano, setOdrzano] = useState(predavanje?.odrzano ?? false);
  const [placeno, setPlaceno] = useState(predavanje?.placeno ?? false);
  const [komentar, setKomentar] = useState(predavanje?.komentar ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classroomId, setClassroomId] = useState<string>(initialClassroomId ?? '');

  const isNew = !predavanje;
  const atLimit = isNew && currentCount >= maxCasova;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (atLimit) return;
    setLoading(true);
    console.log('[PredavanjeForm] submit', { termId, clientId, predavanje: !!predavanje });
    try {
      if (classrooms.length > 0 && !classroomId) {
        throw new Error('Izaberite učionicu za ovaj termin.');
      }
      if (classrooms.length > 0 && classroomId) {
        const res = await updateTermClassroom(termId, classroomId);
        if (res.error) {
          throw new Error(res.error);
        }
      }
      if (predavanje) {
        const result = await updatePredavanje(
          predavanje.id,
          termId,
          clientId,
          odrzano,
          placeno,
          komentar.trim() || null,
          termTypeId || null
        );
        if (result.error) {
          console.error('[PredavanjeForm] update error', result.error);
          throw new Error(result.error);
        }
        toast.success('Predavanje sačuvano.');
      } else {
        const result = await createPredavanje(termId, clientId, odrzano, placeno, komentar.trim() || null, termTypeId || null);
        if (result.error) {
          console.error('[PredavanjeForm] createPredavanje error', result.error);
          throw new Error(result.error);
        }
        toast.success('Predavanje dodato.');
      }
      const getMonday = (d: Date) => {
        const x = new Date(d);
        const dow = x.getDay();
        x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
        return x.toISOString().slice(0, 10);
      };
      const weekStart = getMonday(new Date(termDate + 'T12:00:00'));
      router.push(`/dashboard?week=${weekStart}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      setError(msg);
      toast.error(msg);
      console.error('[PredavanjeForm] catch', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!predavanje || !confirm('Obrisati ovo predavanje?')) return;
    setLoading(true);
    try {
      const result = await deletePredavanje(predavanje.id, termId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Predavanje obrisano.');
      router.push(`/dashboard/termin/${termId}`);
      router.refresh();
    } catch (err) {
      console.error('[PredavanjeForm] delete catch', err);
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
          Maksimalan broj časova u ovom terminu je {maxCasova}. Podešavanje može da menja superadmin u Admin → Podešavanja.
        </p>
      )}
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
      {classrooms.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Učionica
          </label>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            <option value="">Izaberite učionicu</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}
              </option>
            ))}
          </select>
        </div>
      )}
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
          disabled={loading || atLimit}
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
