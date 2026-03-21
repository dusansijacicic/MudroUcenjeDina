'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createPredavanjeAsAdmin, updatePredavanjeAsAdmin, deletePredavanjeAsAdmin, updateTermClassroomAsAdmin } from '@/app/admin/actions';

type ClientOption = { id: string; ime: string; prezime: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null };
type ClassroomOption = { id: string; naziv: string; color: string | null };
type StanjeItem = { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number };

interface AdminPredavanjeFormProps {
  termId: string;
  termDate: string;
  slotLabel: string;
  clients: ClientOption[];
  termTypes?: TermTypeOption[];
  classrooms?: ClassroomOption[];
  initialClassroomId?: string | null;
  predavanje?: { id: string; client_id: string; odrzano: boolean; placeno: boolean; komentar: string | null; term_type_id?: string | null } | null;
  maxCasova?: number;
  currentCount?: number;
  /** Stanje po vrstama za svakog klijenta (kod ovog instruktora), da se prikaže ostalo pri izboru klijenta */
  clientStanjeList?: { clientId: string; stanje: StanjeItem[] }[];
}

export default function AdminPredavanjeForm({
  termId,
  termDate,
  slotLabel,
  clients,
  termTypes = [],
  classrooms = [],
  initialClassroomId = null,
  predavanje,
  maxCasova = 4,
  currentCount = 0,
  clientStanjeList = [],
}: AdminPredavanjeFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(predavanje?.client_id ?? '');
  const selectedStanje = clientStanjeList.find((s) => s.clientId === clientId)?.stanje ?? [];
  const [termTypeId, setTermTypeId] = useState(predavanje?.term_type_id ?? '');
  const [classroomId, setClassroomId] = useState(initialClassroomId ?? '');
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
    if (termTypes.length === 0) {
      setError('Prvo dodajte bar jednu vrstu termina u Admin → Vrste termina.');
      return;
    }
    if (!termTypeId) {
      setError('Izaberite vrstu termina.');
      return;
    }
    setLoading(true);
    try {
      if (classrooms.length > 0 && classroomId) {
        const res = await updateTermClassroomAsAdmin(termId, classroomId);
        if (res.error) throw new Error(res.error);
      }
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
        toast.success('Radionica sačuvana.');
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
        toast.success('Radionica dodata.');
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
    if (!predavanje || !confirm('Obrisati ovu radionicu?')) return;
    setLoading(true);
    try {
      const result = await deletePredavanjeAsAdmin(predavanje.id, termId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Radionica obrisana.');
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
            ({currentCount} / {maxCasova} radionica u terminu)
          </span>
        )}
      </div>
      {atLimit && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Maksimalan broj radionica u ovom terminu je {maxCasova}.
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
        {clientId && selectedStanje.length > 0 && (
          <div className="mt-2 rounded-lg bg-stone-50 border border-stone-200 px-3 py-2 text-sm">
            <span className="font-medium text-stone-600">Ostalo časova kod ovog instruktora: </span>
            {selectedStanje.map((s) => (
              <span key={s.term_type_id ?? 'bez'} className="mr-2">
                {s.term_type_naziv} <strong>{s.ostalo}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      {classrooms.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            <option value="">Izaberite učionicu</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.naziv}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Vrsta termina <span className="text-red-600">*</span></label>
        <select
          value={termTypeId}
          onChange={(e) => setTermTypeId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">Izaberite vrstu termina</option>
          {termTypes.map((tt) => (
            <option key={tt.id} value={tt.id}>{tt.naziv}</option>
          ))}
        </select>
        {termTypes.length === 0 && (
          <p className="text-xs text-amber-600 mt-0.5">Dodajte bar jednu vrstu u Admin → Vrste termina.</p>
        )}
        <p className="text-xs text-stone-500 mt-1.5">
          Za grupni čas dodajte više radionica u istom terminu (po jednu po detetu), do maksimuma. Vrsta termina (npr. Grupni) već definiše kategoriju.
        </p>
      </div>
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
          {loading ? 'Čuvanje...' : predavanje ? 'Sačuvaj' : 'Dodaj radionicu'}
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
