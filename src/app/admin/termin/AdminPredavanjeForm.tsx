'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  createPredavanjeAsAdmin,
  updatePredavanjeAsAdmin,
  deletePredavanjeAsAdmin,
  updateTermClassroomAsAdmin,
  updateTermMetaAsAdmin,
  reassignPredavanjeInstructorAsAdmin,
} from '@/app/admin/actions';
import SingleKlijentPicker from '@/components/SingleKlijentPicker';
import type { TermCategoryRow } from '@/lib/term-categories';
import { findDefaultCitanjeTermTypeId } from '@/lib/term-types';

type ClientOption = { id: string; ime: string; prezime: string; godiste?: number | null; datumTestiranja?: string | null };
type TermTypeOption = { id: string; naziv: string; opis: string | null; program_id?: string | null };
type ClassroomOption = { id: string; naziv: string; color: string | null };
type InstructorOption = { id: string; ime: string; prezime: string };
type StanjeItem = { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number };

interface AdminPredavanjeFormProps {
  termId: string;
  termDate: string;
  slotIndex: number;
  slotLabel: string;
  clients: ClientOption[];
  termTypes?: TermTypeOption[];
  classrooms?: ClassroomOption[];
  initialClassroomId?: string | null;
  takenClassroomIds?: string[];
  predavanje?: { id: string; client_id: string; odrzano: boolean; placeno: boolean; komentar: string | null; term_type_id?: string | null } | null;
  maxCasova?: number;
  currentCount?: number;
  clientStanjeList?: { clientId: string; stanje: StanjeItem[] }[];
  /** Za izmenu: lista svih instruktora */
  instructors?: InstructorOption[];
  /** Za izmenu: trenutni instruktor (iz terms.instructor_id) */
  initialInstructorId?: string;
  /** Kategorije termina */
  termCategories?: TermCategoryRow[];
  initialTermCategoryId?: string;
  initialTermNapomena?: string | null;
  /** client_id -> program_id[] (koje je programe klijent završio) – za sakrivanje u pretrazi. */
  completedProgramIdsByClient?: Record<string, string[]>;
}

export default function AdminPredavanjeForm({
  termId,
  termDate,
  slotIndex,
  slotLabel,
  clients,
  termTypes = [],
  classrooms = [],
  initialClassroomId = null,
  takenClassroomIds = [],
  predavanje,
  maxCasova = 4,
  currentCount = 0,
  clientStanjeList = [],
  instructors = [],
  initialInstructorId = '',
  termCategories = [],
  initialTermCategoryId = '',
  initialTermNapomena = null,
  completedProgramIdsByClient = {},
}: AdminPredavanjeFormProps) {
  const router = useRouter();

  const [clientId, setClientId] = useState(predavanje?.client_id ?? '');
  const selectedStanje = clientStanjeList.find((s) => s.clientId === clientId)?.stanje ?? [];
  const [termTypeId, setTermTypeId] = useState(
    predavanje?.term_type_id ?? findDefaultCitanjeTermTypeId(termTypes) ?? ''
  );
  const selectedProgramId = termTypes.find((tt) => tt.id === termTypeId)?.program_id ?? null;
  const completedIds = useMemo(() => {
    if (!selectedProgramId) return new Set<string>();
    const set = new Set<string>();
    for (const [cid, programIds] of Object.entries(completedProgramIdsByClient)) {
      if (programIds.includes(selectedProgramId)) set.add(cid);
    }
    return set;
  }, [selectedProgramId, completedProgramIdsByClient]);
  const [classroomId, setClassroomId] = useState(initialClassroomId ?? '');
  const [odrzano, setOdrzano] = useState(predavanje?.odrzano ?? false);
  const [placeno, setPlaceno] = useState(predavanje?.placeno ?? false);
  const [komentar, setKomentar] = useState(predavanje?.komentar ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [instructorId, setInstructorId] = useState(initialInstructorId);
  const [termCategoryId, setTermCategoryId] = useState(() => {
    if (initialTermCategoryId && termCategories.some((c) => c.id === initialTermCategoryId)) {
      return initialTermCategoryId;
    }
    return termCategories[0]?.id ?? '';
  });
  const [termNapomena, setTermNapomena] = useState(initialTermNapomena ?? '');

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
      // Promena instruktora (samo pri izmeni)
      if (!isNew && instructorId && instructorId !== initialInstructorId) {
        const res = await reassignPredavanjeInstructorAsAdmin(
          predavanje!.id,
          termId,
          instructorId,
          termDate,
          slotIndex
        );
        if (res.error) throw new Error(res.error);
        // Termin se promenio – redirect na termin novog instruktora
        toast.success('Instruktor je promenjen. Radionica je prebačena.');
        router.push(`/admin/termin/${res.newTermId ?? termId}`);
        router.refresh();
        return;
      }

      // Promena kategorije i napomene termina
      if (termCategories.length > 0 && termCategoryId) {
        const metaRes = await updateTermMetaAsAdmin(termId, {
          term_category_id: termCategoryId,
          napomena: termNapomena.trim() || null,
        });
        if (metaRes.error) throw new Error(metaRes.error);
      }

      // Učionica
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
        if (!clientId) throw new Error('Izaberite klijenta.');
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

      {/* Instruktor – samo u izmeni */}
      {!isNew && instructors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <label className="block text-sm font-semibold text-stone-800">
            Instruktor
          </label>
          <p className="text-xs text-stone-500">
            Promena instruktora premešta ovu radionicu u termin izabranog instruktora (isti datum i vreme).
          </p>
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 bg-white"
          >
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ime} {i.prezime}
                {i.id === initialInstructorId ? ' (trenutni)' : ''}
              </option>
            ))}
          </select>
          {instructorId !== initialInstructorId && (
            <p className="text-xs text-amber-800 font-medium">
              Čuvanjem forme radionica će biti prebačena novom instruktoru.
            </p>
          )}
        </div>
      )}

      {/* Vrsta termina */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Vrsta termina <span className="text-red-600">*</span>
        </label>
        <select
          value={termTypeId}
          onChange={(e) => setTermTypeId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">Izaberite vrstu termina</option>
          {termTypes.map((tt) => (
            <option key={tt.id} value={tt.id}>
              {tt.naziv}
            </option>
          ))}
        </select>
        {termTypes.length === 0 && (
          <p className="text-xs text-amber-600 mt-0.5">
            Dodajte bar jednu vrstu u Admin → Vrste termina.
          </p>
        )}
      </div>

      {/* Kategorija i napomena termina */}
      {termCategories.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 space-y-3">
          <h3 className="text-sm font-semibold text-stone-800">Kategorija termina</h3>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Kategorija</label>
            <select
              value={termCategoryId}
              onChange={(e) => setTermCategoryId(e.target.value)}
              className="w-full max-w-md rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
            >
              {termCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naziv}
                  {c.jedan_klijent_po_terminu ? ' (jedno dete)' : ' (grupa)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Napomena za termin (opciono)
            </label>
            <textarea
              value={termNapomena}
              onChange={(e) => setTermNapomena(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
              placeholder="Interna napomena za ovaj termin..."
            />
          </div>
        </div>
      )}

      {/* Klijent */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Klijent</label>
        <SingleKlijentPicker
          clients={clients}
          value={clientId}
          onChange={setClientId}
          disabled={loading}
          inputId="admin-predavanje-klijent-search"
          completedIds={completedIds}
        />
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

      {/* Učionica */}
      {classrooms.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 bg-white"
          >
            <option value="">Izaberite učionicu</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}{takenClassroomIds.includes(c.id) && c.id !== initialClassroomId ? ' (zauzeto)' : ''}
              </option>
            ))}
          </select>
          {takenClassroomIds.some((id) => id !== initialClassroomId) && (
            <p className="text-xs text-stone-500 mt-1">
              Ako izaberete zauzetu učionicu, zamenićete mesto s terminom koji je trenutno koristi (on dobija ovu učionicu).
            </p>
          )}
        </div>
      )}

      {/* Checkboxovi */}
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

      {/* Komentar */}
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
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || atLimit}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : predavanje ? 'Sačuvaj' : 'Dodaj radionicu'}
        </button>
        <Link
          href={backHref}
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
